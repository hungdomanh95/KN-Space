import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState, Space } from '../types';
import {
  forceFlush,
  loadAppState,
  saveSnapshotNow,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
} from '../storage/supabaseStore';
import { deleteSharedSpace, getSharedSpaceVersion, loadSharedSpaces, saveSharedSpace } from '../storage/sharedSpaceStore';
import { writeLocalCurrentSpaceId } from '../storage/localCurrentSpace';
import { writeLocalLastScreen } from '../storage/localLastScreen';
import { buildUiInitialState } from '../storage/normalize';
import { defaultSettings } from './seed';
import type { AppAction } from './appReducer';
import { appReducer } from './appReducer';
import { useAuth } from '../auth/AuthContext';
import { tasksReducer } from './reducers/tasks';
import { notifyTaskAssigned, notifyTaskCompleted } from '../storage/notifySharedTaskEvent';
import { scheduleCompletedNotify, cancelCompletedNotify } from './completeNotifyDebounce';
import {
  computeTaskCreateNotifyEffect,
  computeTaskUpdateNotifyEffect,
  computeTaskToggleDoneNotifyEffect,
} from './sharedTaskNotifyEffects';

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isLoading: boolean;
  /**
   * Dispatch action + lưu ngay lập tức lên Supabase, ĐỢI kết quả thật (không debounce).
   * Dùng cho nút "Lưu" trong modal Thêm/Sửa (Task/Note/Reminder/Habit) — nơi user cần biết
   * chắc chắn dữ liệu đã lên server trước khi đóng modal (tránh mất task khi đóng app ngay
   * sau khi thêm, lúc debounce 600ms nền còn đang chờ).
   *
   * KHÔNG dùng cho các thao tác nhỏ (tick checkbox, kéo-thả, đổi theme...) — những chỗ đó
   * vẫn dùng `dispatch` thường + debounce nền như cũ để giữ cảm giác mượt.
   */
  saveNow: (action: AppAction) => Promise<{ ok: boolean; error?: string }>;
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
  const { session } = useAuth();

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

  /**
   * Thử lưu 1 shared space, tự resync + retry nếu bị conflict (version đã đổi trên DB
   * do client khác — hoặc chính tab này — vừa ghi trước đó).
   *
   * Trước đây conflict bị drop im lặng (chỉ console.warn, không retry) khiến thay đổi
   * (vd: xoá task) tưởng đã lưu ở UI nhưng thực ra KHÔNG BAO GIỜ tới được DB — client
   * khác F5 vẫn thấy data cũ vì DB chưa từng đổi. Đây là nguyên nhân chính gây mất
   * đồng bộ CRUD giữa các member của shared space.
   */
  async function attemptSaveShared(sid: string, retriesLeft = 3): Promise<boolean> {
    const data = pendingSharedSavesRef.current.get(sid);
    if (!data) return true; // không có gì pending — coi như đã lưu xong
    const version = sharedVersionsRef.current.get(sid) ?? 1;
    try {
      const result = await saveSharedSpace(sid, data, version);
      if (result.ok) {
        if (result.newVersion !== undefined) sharedVersionsRef.current.set(sid, result.newVersion);
        // Chỉ xoá pending nếu không có thay đổi mới hơn ghi đè trong lúc đang save
        if (pendingSharedSavesRef.current.get(sid) === data) {
          pendingSharedSavesRef.current.delete(sid);
        }
        return true;
      }
      if (result.conflict && retriesLeft > 0) {
        const freshVersion = await getSharedSpaceVersion(sid);
        if (freshVersion !== null) sharedVersionsRef.current.set(sid, freshVersion);
        return attemptSaveShared(sid, retriesLeft - 1);
      }
      console.warn('[KN-Space] saveSharedSpace conflict, hết lượt thử lại — thay đổi CHƯA được lưu:', sid);
      return false;
    } catch (err) {
      console.warn('[KN-Space] saveSharedSpace thất bại:', err);
      return false;
    }
  }

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
      const snapshot = JSON.stringify({ tasks: space.tasks, notes: space.notes, reminders: space.reminders, name: space.name });
      // Lần đầu thấy space này (vừa hydrate/load) → chỉ ghi nhận baseline, KHÔNG save.
      // Trước đây thiếu bước này khiến lần render đầu tiên luôn bị coi là "có thay đổi"
      // (Map rỗng nên snapshot cũ luôn undefined !== snapshot hiện tại) → tự bắn 1 save
      // thừa ngay khi mở app, dễ đụng version với client khác đang mở cùng space → conflict.
      if (!prevSharedRef.current.has(sid)) {
        prevSharedRef.current.set(sid, snapshot);
        return;
      }
      // So sánh snapshot để tránh save khi không có thay đổi
      if (prevSharedRef.current.get(sid) === snapshot) return;
      prevSharedRef.current.set(sid, snapshot);
      // Cập nhật pending data ngay — dùng để flush khi visibilitychange
      pendingSharedSavesRef.current.set(sid, { tasks: space.tasks, notes: space.notes, reminders: space.reminders, name: space.name });
      // Debounce 800ms
      const existing = sharedSaveTimersRef.current.get(sid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        sharedSaveTimersRef.current.delete(sid);
        void attemptSaveShared(sid);
      }, 800);
      sharedSaveTimersRef.current.set(sid, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces]);

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
          const pendingIds = Array.from(pendingSharedSavesRef.current.keys());
          pendingIds.forEach((sid) => void attemptSaveShared(sid));
          // Clear timers — đã flush rồi, không cần debounce nữa
          sharedSaveTimersRef.current.forEach((t) => clearTimeout(t));
          sharedSaveTimersRef.current.clear();
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
  /**
   * Ngoài việc dispatch bình thường, chặn thêm 1 số action để bắn notify sự kiện Shared Space
   * (assign/hoàn thành task — xem docs/features/shared-space-task-assign-notify.md). Tính effect
   * TRƯỚC khi gọi dispatch() thật (dựa trên state hiện tại) vì cần biết giá trị "trước đó" để
   * so sánh (assigneeIds cũ, done cũ) — sau dispatch() thì state cũ đã mất.
   */
  const smartDispatch = React.useCallback((action: AppAction) => {
    if (action.type === 'SPACE_DELETE') {
      const space = state.spaces.find((s) => s.id === action.payload.id);
      if (space?.isShared && space.sharedSpaceId) {
        void deleteSharedSpace(space.sharedSpaceId).catch((err) =>
          console.warn('[KN-Space] Xoá shared space trên DB thất bại:', err),
        );
      }
    }

    let actionToDispatch = action;
    const currentUserId = session?.user?.id;
    const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);

    if (currentSpace?.isShared && currentSpace.sharedSpaceId && currentUserId) {
      const sharedSpaceId = currentSpace.sharedSpaceId;

      if (action.type === 'TASK_CREATE') {
        // tasksReducer tự sinh id bằng crypto.randomUUID() bên trong — gọi 2 lần cho cùng 1 lượt
        // tạo (1 lần "dự đoán" ở đây để lấy assigneeIds/title thật, 1 lần thật qua dispatch() cuối
        // hàm) sẽ ra 2 id NGẪU NHIÊN KHÁC NHAU nếu không cố định trước. Sinh sẵn id ở đây, gắn vào
        // action, dùng chung cho cả 2 lượt gọi để id gửi trong notify khớp đúng id task thật.
        const actionWithId: typeof action = { ...action, payload: { ...action.payload, id: crypto.randomUUID() } };
        actionToDispatch = actionWithId;
        const nextTasks = tasksReducer(currentSpace, actionWithId).tasks;
        const prevIds = new Set(currentSpace.tasks.map((t) => t.id));
        const created = nextTasks.find((t) => !prevIds.has(t.id));
        if (created) {
          const effect = computeTaskCreateNotifyEffect(created, currentUserId);
          if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, effect.taskId, effect.taskTitle, effect.recipientUserIds);
        }
      }

      if (action.type === 'TASK_UPDATE') {
        const effect = computeTaskUpdateNotifyEffect(currentSpace, action, currentUserId);
        if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, effect.taskId, effect.taskTitle, effect.recipientUserIds);
      }

      if (action.type === 'TASK_TOGGLE_DONE') {
        const effect = computeTaskToggleDoneNotifyEffect(currentSpace, action);
        if (effect?.kind === 'completed-schedule') {
          const { taskId, taskTitle } = effect;
          scheduleCompletedNotify(taskId, () => notifyTaskCompleted(sharedSpaceId, taskId, taskTitle, currentUserId));
        } else if (effect?.kind === 'completed-cancel') {
          cancelCompletedNotify(effect.taskId);
        }
      }

      if (action.type === 'TASK_DELETE') {
        // Task bị xoá trước khi debounce 15s kịp chạy — huỷ lịch, tránh notify về task không còn tồn tại.
        cancelCompletedNotify(action.payload.id);
      }
    }

    dispatch(actionToDispatch);
  }, [state.spaces, state.currentSpaceId, session?.user?.id]);

  /**
   * Dispatch + lưu ngay lập tức, đợi kết quả thật — xem giải thích ở khai báo type phía trên.
   *
   * Tính `nextState` bằng chính `appReducer` (pure function) thay vì đọc `state.spaces` sau
   * `dispatch()`, vì `dispatch()` chỉ enqueue update — state React chưa cập nhật đồng bộ ngay
   * trong cùng lượt gọi này. Nhờ vậy không phải chờ effect debounce (vốn chỉ chạy sau khi
   * React commit re-render) mới biết chính xác dữ liệu cần lưu là gì.
   */
  const saveNow = React.useCallback(async (action: AppAction): Promise<{ ok: boolean; error?: string }> => {
    const nextState = appReducer(state, action);
    dispatch(action);

    const targetSpace = nextState.spaces.find((s) => s.id === nextState.currentSpaceId);

    if (targetSpace?.isShared && targetSpace.sharedSpaceId) {
      const sid = targetSpace.sharedSpaceId;
      const data = { tasks: targetSpace.tasks, notes: targetSpace.notes, reminders: targetSpace.reminders, name: targetSpace.name };

      // Huỷ debounce timer đang chờ của space này — data mới nhất được gửi thẳng ngay bây giờ,
      // đồng thời cập nhật baseline để effect debounce không tưởng nhầm là "còn thay đổi mới"
      // rồi bắn thêm 1 lần save trùng lặp ngay sau đó.
      const existingTimer = sharedSaveTimersRef.current.get(sid);
      if (existingTimer) {
        clearTimeout(existingTimer);
        sharedSaveTimersRef.current.delete(sid);
      }
      pendingSharedSavesRef.current.set(sid, data);
      prevSharedRef.current.set(sid, JSON.stringify(data));
      if (!sharedVersionsRef.current.has(sid) && targetSpace._sharedVersion !== undefined) {
        sharedVersionsRef.current.set(sid, targetSpace._sharedVersion);
      }

      const ok = await attemptSaveShared(sid);
      return ok
        ? { ok: true }
        : { ok: false, error: 'Không lưu được lên Space chung — kiểm tra kết nối mạng và thử lại.' };
    }

    const privateSpaces = nextState.spaces.filter((s) => !s.isShared);
    const result = await saveSnapshotNow({
      spaces: privateSpaces,
      currentSpaceId: nextState.currentSpaceId,
      settings: nextState.settings,
    });
    return result.ok
      ? { ok: true }
      : { ok: false, error: result.error ?? 'Không lưu được dữ liệu — kiểm tra kết nối mạng và thử lại.' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <AppStateContext.Provider value={{ state, dispatch: smartDispatch, isLoading, saveNow }}>
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
