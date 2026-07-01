import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState } from '../types';
import {
  forceFlush,
  loadAppState,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
} from '../storage/supabaseStore';
import { writeLocalCurrentSpaceId } from '../storage/localCurrentSpace';
import { writeLocalLastScreen } from '../storage/localLastScreen';
import { buildUiInitialState } from '../storage/normalize';
import { defaultSettings } from './seed';
import type { AppAction } from './appReducer';
import { appReducer } from './appReducer';

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isLoading: boolean;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function emptyState(): AppState {
  const settings = defaultSettings();
  return {
    spaces: [],
    currentSpaceId: '',
    settings,
    ui: buildUiInitialState(settings.lastScreen),
    storageFallbackActive: false,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, emptyState());
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Bootstrap: load từ storage hoặc seed nếu rỗng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAppState();
        const result = loaded ?? (await seedAndPersist());
        if (cancelled) return;
        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: result.spaces,
            currentSpaceId: result.currentSpaceId,
            settings: result.settings,
            storageFallbackActive: result.storageFallbackActive,
          },
        });
        hydratedRef.current = true;
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[KN-Space] Lỗi tải dữ liệu ban đầu:', err);
        setLoadError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Bật/tắt banner lỗi lưu theo kết quả flushSave.
  useEffect(() => {
    setFallbackListener((active) => {
      dispatch({ type: 'SET_STORAGE_FALLBACK_ACTIVE', payload: { active } });
    });
  }, []);

  // Debounce save khi spaces/settings đổi. Không theo dõi state.ui và currentSpaceId
  // (trạng thái per-machine, lưu riêng qua localStorage bên dưới).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    scheduleSave({ spaces: state.spaces, currentSpaceId: state.currentSpaceId, settings: state.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces, state.settings]);

  // Lưu "Space đang mở" riêng cho máy này (localStorage).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalCurrentSpaceId(state.currentSpaceId);
  }, [state.currentSpaceId, isLoading]);

  // Lưu "màn đang mở" riêng cho máy này (localStorage).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalLastScreen(state.settings.lastScreen);
  }, [state.settings.lastScreen, isLoading]);

  // Flush ngay khi tab ẩn đi — tránh mất thay đổi cuối nếu đóng tab trong 600ms debounce.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') void forceFlush();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
        Không tải được dữ liệu từ Supabase: {loadError}
        <br />
        Kiểm tra: đã chạy schema.sql tạo bảng "kn_space_state" chưa? URL/anon key trong .env.local đúng chưa?
      </div>
    );
  }

  return (
    <AppStateContext.Provider value={{ state, dispatch, isLoading }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function useCurrentSpace() {
  const { state } = useAppState();
  const space = state.spaces.find((s) => s.id === state.currentSpaceId);
  if (!space) throw new Error('Current space not found');
  return space;
}
