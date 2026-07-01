import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState } from '../types';
import {
  forceFlush,
  hasPendingSave,
  loadAppState,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
  subscribeStorageChanges,
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
  const stateRef = useRef(state);
  stateRef.current = state;

  // Bootstrap: load từ storage hoặc seed nếu rỗng. Bắt lỗi rõ ràng (vd. chưa chạy schema.sql,
  // RLS từ chối...) — không để rơi vào "Đang tải dữ liệu..." treo vô thời hạn khi promise reject.
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

  // Lắng nghe kết quả mỗi lần flushSave debounce — bật/tắt banner theo lần lưu gần nhất
  // thành công hay lỗi (khác bản chrome.storage cũ: ở đó cờ chỉ tắt khi reload, vì còn liên
  // quan tới việc dữ liệu đã rớt hẳn xuống local; ở đây chỉ là lỗi mạng tạm thời nên tắt ngay
  // khi lần lưu kế tiếp thành công).
  useEffect(() => {
    setFallbackListener((active) => {
      dispatch({ type: 'SET_STORAGE_FALLBACK_ACTIVE', payload: { active } });
    });
  }, []);

  // Đồng bộ UI giữa các máy: khi Supabase Realtime bắn UPDATE, nhận thẳng data từ WAL payload
  // (không SELECT lại qua PostgREST) để tránh stale-read — Realtime event đến từ WAL ngay sau
  // commit, nhưng PostgREST có thể query snapshot cũ hơn nếu connection pool chưa thấy commit.
  // Đây là nguyên nhân gốc khiến note vừa thêm bị biến mất "sau một lúc": save commit → Realtime
  // bắn → SELECT cũ (không có note) → HYDRATE đè → note mất.
  useEffect(() => {
    const unsubscribe = subscribeStorageChanges((loaded) => {
      if (!hydratedRef.current) return;
      // Còn thay đổi cục bộ chưa lưu xong (đang debounce/đang gửi) — BỎ QUA sự kiện này.
      // Khi flush xong, nếu dữ liệu trên server còn khác (đổi từ máy khác) thì lần Realtime
      // kế tiếp vẫn bắt được — không mất đồng bộ.
      if (hasPendingSave()) return;
      // Callback đồng bộ hoàn toàn (không await) — không còn race condition.
      const currentSnapshot = JSON.stringify({
        spaces: stateRef.current.spaces,
        currentSpaceId: stateRef.current.currentSpaceId,
        settings: stateRef.current.settings,
      });
      const loadedSnapshot = JSON.stringify({
        spaces: loaded.spaces,
        currentSpaceId: loaded.currentSpaceId,
        settings: loaded.settings,
      });
      if (currentSnapshot === loadedSnapshot) return;
      dispatch({
        type: 'HYDRATE',
        payload: {
          spaces: loaded.spaces,
          currentSpaceId: loaded.currentSpaceId,
          settings: loaded.settings,
          storageFallbackActive: loaded.storageFallbackActive,
        },
      });
    });
    return unsubscribe;
  }, []);

  // Debounce save khi spaces/settings đổi (KHÔNG theo dõi state.ui, KHÔNG theo dõi
  // currentSpaceId — đổi Space không còn là dữ liệu cần lưu lên Supabase, xem effect riêng
  // dưới + storage/localCurrentSpace.ts. Vẫn gửi currentSpaceId trong payload vì cột server
  // NOT NULL cần 1 giá trị, nhưng việc đổi Space một mình không kích hoạt save nữa — tránh
  // ghi network + bắn Realtime vô ích tới máy khác cho 1 thay đổi giờ chỉ còn ý nghĩa cục bộ).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    scheduleSave({ spaces: state.spaces, currentSpaceId: state.currentSpaceId, settings: state.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces, state.settings]);

  // Lưu "Space đang mở" riêng cho máy này (localStorage) ngay khi đổi.
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalCurrentSpaceId(state.currentSpaceId);
  }, [state.currentSpaceId, isLoading]);

  // Lưu "màn đang mở" (home/dashboard) riêng cho máy này (localStorage). Không dùng Supabase
  // vì đây là trạng thái điều hướng per-machine — đổi màn trên máy A không được HYDRATE đè màn
  // hiện tại của máy B qua Realtime (xem loadAppState: lastScreen được lấy từ localStorage,
  // không từ server).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalLastScreen(state.settings.lastScreen);
  }, [state.settings.lastScreen, isLoading]);

  // Ghi lên Supabase qua network có độ trễ hơn chrome.storage cũ — nếu user đóng tab/chuyển
  // app đúng lúc debounce 600ms chưa bắn, bản ghi cuối có thể mất. Flush ngay khi tab ẩn đi.
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
