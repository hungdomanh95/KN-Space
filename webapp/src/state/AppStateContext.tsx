import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState } from '../types';
import {
  forceFlush,
  loadAppState,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
} from '../storage/supabaseStore';
import { loadSharedSpaces } from '../storage/sharedSpaceStore';
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

        // Load shared spaces — không block nếu lỗi (user chưa có shared space là chuyện bình thường).
        let sharedSpaces: AppState['spaces'] = [];
        try {
          sharedSpaces = await loadSharedSpaces();
        } catch (err) {
          console.warn('[KN-Space] Không tải được shared spaces:', err);
        }

        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: [...result.spaces, ...sharedSpaces],
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
  // Chỉ save private spaces — shared spaces được quản lý qua sharedSpaceStore riêng.
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const privateSpaces = state.spaces.filter((s) => !s.isShared);
    scheduleSave({ spaces: privateSpaces, currentSpaceId: state.currentSpaceId, settings: state.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces, state.settings]);

  // TODO Phase 3b-2: save shared spaces khi thay đổi — cần optimistic locking (version tracking per space).
  // saveSharedSpace() từ sharedSpaceStore nhận expectedVersion — cần lưu version vào Space type hoặc
  // dùng useRef<Map<string, number>> để track version hiện tại của từng shared space.
  // Hiện tại skip để tránh overwrite data không kiểm soát được version conflict.

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
