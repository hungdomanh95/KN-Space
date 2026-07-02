import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState, Space } from '../types';
import {
  forceFlush,
  loadAppState,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
} from '../storage/supabaseStore';
import { deleteSharedSpace, loadSharedSpaces, saveSharedSpace } from '../storage/sharedSpaceStore';
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

        const allSpaces = [...result.spaces, ...sharedSpaces];
        // Validate sau khi có đủ cả private + shared — localId có thể là shared space
        const validCurrentSpaceId = allSpaces.some((s) => s.id === result.currentSpaceId)
          ? result.currentSpaceId
          : allSpaces[0]?.id ?? result.currentSpaceId;
        writeLocalCurrentSpaceId(validCurrentSpaceId);

        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: allSpaces,
            currentSpaceId: validCurrentSpaceId,
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

  // Theo dõi version của từng shared space — cập nhật sau mỗi lần save thành công.
  const sharedVersionsRef = useRef<Map<string, number>>(new Map());
  const sharedSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevSharedRef = useRef<Map<string, string>>(new Map()); // spaceId → JSON snapshot
  // Track data pending flush — cập nhật NGAY khi có thay đổi, trước debounce timer
  // Dùng để flush ngay khi tab ẩn (F5/đóng tab) tránh mất data trong cửa sổ debounce 800ms
  const pendingSharedSavesRef = useRef<Map<string, {
    tasks: Space['tasks']; notes: Space['notes']; reminders: Space['reminders']; name: string;
  }>>(new Map());

  // Debounce save shared spaces khi nội dung thay đổi.
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const sharedSpaces = state.spaces.filter((s) => s.isShared && s.sharedSpaceId);
    sharedSpaces.forEach((space) => {
      const sid = space.sharedSpaceId!;
      // Khởi tạo version lần đầu từ _sharedVersion trong Space
      if (!sharedVersionsRef.current.has(sid) && space._sharedVersion !== undefined) {
        sharedVersionsRef.current.set(sid, space._sharedVersion);
      }
      // So sánh snapshot để tránh save khi không có thay đổi
      const snapshot = JSON.stringify({ tasks: space.tasks, notes: space.notes, reminders: space.reminders, name: space.name });
      if (prevSharedRef.current.get(sid) === snapshot) return;
      prevSharedRef.current.set(sid, snapshot);
      // Cập nhật pending data ngay — dùng để flush khi visibilitychange
      pendingSharedSavesRef.current.set(sid, { tasks: space.tasks, notes: space.notes, reminders: space.reminders, name: space.name });
      // Debounce 800ms
      const existing = sharedSaveTimersRef.current.get(sid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        sharedSaveTimersRef.current.delete(sid);
        const version = sharedVersionsRef.current.get(sid) ?? 1;
        void saveSharedSpace(sid, { tasks: space.tasks, notes: space.notes, reminders: space.reminders, name: space.name }, version)
          .then((result) => {
            if (result.ok && result.newVersion !== undefined) {
              sharedVersionsRef.current.set(sid, result.newVersion);
            }
            // Xoá khỏi pending sau khi đã save thành công
            pendingSharedSavesRef.current.delete(sid);
          })
          .catch((err) => console.warn('[KN-Space] saveSharedSpace thất bại:', err));
      }, 800);
      sharedSaveTimersRef.current.set(sid, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces]);

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
      if (document.visibilityState === 'hidden') {
        void forceFlush(); // private spaces
        // Flush shared spaces còn pending (F5/đóng tab trong cửa sổ 800ms debounce)
        if (pendingSharedSavesRef.current.size > 0) {
          pendingSharedSavesRef.current.forEach((data, sid) => {
            const version = sharedVersionsRef.current.get(sid) ?? 1;
            void saveSharedSpace(sid, data, version).then((r) => {
              if (r.ok && r.newVersion !== undefined) sharedVersionsRef.current.set(sid, r.newVersion);
            });
          });
          // Clear timers — đã flush rồi, không cần debounce nữa
          sharedSaveTimersRef.current.forEach((t) => clearTimeout(t));
          sharedSaveTimersRef.current.clear();
          pendingSharedSavesRef.current.clear();
        }
      }
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

  // Wrap dispatch để intercept SPACE_DELETE cho shared space:
  // reducer xoá khỏi local state ngay, đồng thời gọi Supabase xoá trên DB.
  const smartDispatch = React.useCallback((action: AppAction) => {
    if (action.type === 'SPACE_DELETE') {
      const space = state.spaces.find((s) => s.id === action.payload.id);
      if (space?.isShared && space.sharedSpaceId) {
        void deleteSharedSpace(space.sharedSpaceId).catch((err) =>
          console.warn('[KN-Space] Xoá shared space trên DB thất bại:', err),
        );
      }
    }
    dispatch(action);
  }, [state.spaces]);

  return (
    <AppStateContext.Provider value={{ state, dispatch: smartDispatch, isLoading }}>
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
