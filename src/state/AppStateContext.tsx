import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState, Space } from '../types';
import {
  forceFlush,
  loadAppState,
  scheduleSettingsSave,
  seedAndPersist,
  setFallbackListener,
  setPrivateFallbackActive,
  setSharedFallbackActive,
} from '../storage/supabaseStore';
import {
  createPrivateSpace,
  deletePrivateSpace,
  loadPrivateSpaces,
  savePrivateSpace,
  upsertPrivateSpaces,
} from '../storage/privateSpaceStore';
import { deleteSharedSpace, loadSharedSpaces, saveSharedSpace } from '../storage/sharedSpaceStore';
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
import {
  flushAllPendingHabitPersist,
  flushAllPendingLogPersist,
  flushAllPendingNotePersist,
  flushAllPendingReminderPersist,
  flushAllPendingTaskPersist,
  HABIT_ITEM_PERSIST_ENABLED,
  handleHabitActionForPersist,
  handleLogActionForPersist,
  handleNoteActionForPersist,
  handleReminderActionForPersist,
  handleTaskActionForPersist,
  hasPendingHabitsForSpace,
  hasPendingLogsForSpace,
  hasPendingNotesForSpace,
  hasPendingRemindersForSpace,
  hasPendingTasksForSpace,
  isHabitAction,
  isLogAction,
  isNoteAction,
  isReminderAction,
  isTaskAction,
  LOG_ITEM_PERSIST_ENABLED,
  NOTE_ITEM_PERSIST_ENABLED,
  REMINDER_ITEM_PERSIST_ENABLED,
  TASK_ITEM_PERSIST_ENABLED,
} from './itemPersist';
import { loadPrivateLogs, loadSharedLogs } from '../storage/logStore';
import { loadPrivateHabits } from '../storage/habitStore';
import { loadPrivateReminders, loadSharedReminders } from '../storage/reminderStore';
import { loadPrivateTasks, loadSharedTasks } from '../storage/taskStore';
import { loadPrivateNotes, loadSharedNotes } from '../storage/noteStore';
import { syncImportedSpaceItems } from '../storage/importSync';

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

/**
 * Các field THẬT SỰ thuộc về `kn_private_spaces` cho 1 Space cá nhân — dùng chung cho cả snapshot
 * baseline (so sánh phát hiện thay đổi) lẫn payload gửi lên `createPrivateSpace`/`savePrivateSpace`.
 * Không gồm `id`/`isShared`/`_privateVersion` (metadata, không phải dữ liệu).
 *
 * **KHÔNG còn gồm `tasks`/`reminders`/`habits`/`notes`/`logs`** (dọn dẹp 2026-07-11, xem
 * docs/features/item-level-entity-tables-progress.md câu hỏi mở #2, "Việc 1") — cả 5 entity đã
 * cutover đọc/ghi sang bảng item-level riêng (`itemPersist.ts`, `handleTaskActionForPersist()` v.v.,
 * gọi ĐỘC LẬP ở `smartDispatch` bên dưới). Diff-effect Space-level giờ CHỈ còn phản ứng khi
 * `name`/`order`/`enabledBlocks` đổi — sửa Task/Note/Habit/Reminder/Log không còn kích hoạt ghi lại
 * `kn_private_spaces` (trước đây ghi CẢ 2 nơi mỗi lần sửa, lãng phí network + phình dữ liệu trùng
 * lặp trên cột jsonb vốn không còn ai đọc).
 */
function privateSnapshot(space: Space) {
  return {
    name: space.name,
    order: space.order,
    enabledBlocks: space.enabledBlocks,
  };
}

/**
 * Mirror `privateSnapshot()` cho Shared Space (`kn_shared_spaces`) — field THẬT SỰ thuộc về
 * Space-level ở đây chỉ còn `name`/`enabledBlocks` (Shared Space không có cột `space_order` riêng,
 * thứ tự hiển thị suy từ `joined_at`, xem `sharedSpaceStore.ts`). Dùng chung cho snapshot baseline
 * (`prevSharedRef`) lẫn payload gửi `saveSharedSpace()`/`attemptSaveShared()`/`saveNow()`.
 */
function sharedSnapshot(space: Space) {
  return {
    name: space.name,
    enabledBlocks: space.enabledBlocks,
  };
}

/**
 * Giai đoạn B (docs/features/item-level-entity-tables-progress.md, câu hỏi mở #2) — tải Log của
 * TỪNG Space từ bảng item-level mới (`kn_private_logs`/`kn_shared_logs`, qua `logStore.ts`), gán
 * đè `space.logs` (thay cho mảng jsonb cũ vốn đã có sẵn trong `space` truyền vào) làm nguồn ĐỌC
 * thật. Chạy song song cho mọi Space qua `Promise.all` — lỗi tải riêng 1 Space KHÔNG throw/chặn
 * Space khác, fallback dùng đúng `space.logs` jsonb đã có sẵn cho Space đó (log cảnh báo console).
 *
 * `shouldSkip(space)` — Space nào trả `true` thì GIỮ NGUYÊN `space.logs` gốc (không gọi
 * `loadPrivateLogs`/`loadSharedLogs`, không gán đè) — dùng ở `refreshStaleSpaces()` để bỏ qua Space
 * đang có Log "chưa ghi xong" (xem `hasPendingLogsForSpace()`, tránh đè mất log vừa tạo/sửa/xoá cục
 * bộ bằng dữ liệu server có thể chưa kịp phản ánh thao tác đó).
 *
 * No-op hoàn toàn (trả về nguyên mảng đầu vào, không gọi network) khi `LOG_ITEM_PERSIST_ENABLED
 * === false` — giữ nguyên hành vi cũ 100% (đọc qua `logs` jsonb) nếu cờ tắt.
 */
async function hydrateItemLevelLogs(
  spaces: Space[],
  shouldSkip: (space: Space) => boolean = () => false,
): Promise<Space[]> {
  if (!LOG_ITEM_PERSIST_ENABLED) return spaces;
  return Promise.all(
    spaces.map(async (space) => {
      if (shouldSkip(space)) return space;
      try {
        const logs =
          space.isShared && space.sharedSpaceId
            ? await loadSharedLogs(space.sharedSpaceId)
            : await loadPrivateLogs(space.id);
        return { ...space, logs };
      } catch (err) {
        console.warn(
          `[KN-Space] Không tải được Log item-level cho Space "${space.name}" (${space.id}) — dùng tạm logs jsonb cũ:`,
          err,
        );
        return space;
      }
    }),
  );
}

/**
 * Giai đoạn B (Habit, item-level-entity-tables-progress.md, Bước 2) — mirror CHÍNH XÁC
 * `hydrateItemLevelLogs()` ở trên: tải Habit của TỪNG Space cá nhân từ bảng item-level mới
 * (`kn_private_habits`, qua `habitStore.ts`), gán đè `space.habits` (thay cho mảng jsonb cũ) làm
 * nguồn ĐỌC thật. Chạy song song cho mọi Space qua `Promise.all` — lỗi tải riêng 1 Space KHÔNG
 * throw/chặn Space khác, fallback dùng đúng `space.habits` jsonb đã có sẵn cho Space đó.
 *
 * Khác `hydrateItemLevelLogs()` ở đúng 1 điểm: Habit KHÔNG tồn tại ở Shared Space (không có bảng
 * `kn_shared_habits`) — mọi Space có `isShared === true` được bỏ qua vô điều kiện (giữ nguyên
 * `habits`/`enabledBlocks.habits` ép cứng bởi `sharedSpaceStore.ts`, không đụng).
 *
 * `shouldSkip(space)` — mirror Log — dùng ở `refreshStaleSpaces()` để bỏ qua Space đang có Habit
 * "chưa ghi xong" (xem `hasPendingHabitsForSpace()`).
 *
 * No-op hoàn toàn (trả về nguyên mảng đầu vào) khi `HABIT_ITEM_PERSIST_ENABLED === false`.
 */
async function hydrateItemLevelHabits(
  spaces: Space[],
  shouldSkip: (space: Space) => boolean = () => false,
): Promise<Space[]> {
  if (!HABIT_ITEM_PERSIST_ENABLED) return spaces;
  return Promise.all(
    spaces.map(async (space) => {
      if (space.isShared) return space; // Habit không tồn tại ở Shared Space — giữ nguyên
      if (shouldSkip(space)) return space;
      try {
        const habits = await loadPrivateHabits(space.id);
        return { ...space, habits };
      } catch (err) {
        console.warn(
          `[KN-Space] Không tải được Habit item-level cho Space "${space.name}" (${space.id}) — dùng tạm habits jsonb cũ:`,
          err,
        );
        return space;
      }
    }),
  );
}

/**
 * Giai đoạn B (Reminder, item-level-entity-tables-progress.md, Bước 3) — mirror CHÍNH XÁC
 * `hydrateItemLevelLogs()` ở trên (Reminder CÓ bản Shared, giống Log — khác Habit): tải Reminder
 * của TỪNG Space (private + shared) từ bảng item-level mới (`kn_private_reminders`/
 * `kn_shared_reminders`, qua `reminderStore.ts`), gán đè `space.reminders` (thay cho mảng jsonb cũ)
 * làm nguồn ĐỌC thật. Chạy song song cho mọi Space qua `Promise.all` — lỗi tải riêng 1 Space KHÔNG
 * throw/chặn Space khác, fallback dùng đúng `space.reminders` jsonb đã có sẵn cho Space đó.
 *
 * `shouldSkip(space)` — mirror Log/Habit — dùng ở `refreshStaleSpaces()` để bỏ qua Space đang có
 * Reminder "chưa ghi xong" (xem `hasPendingRemindersForSpace()`).
 *
 * No-op hoàn toàn (trả về nguyên mảng đầu vào, không gọi network) khi
 * `REMINDER_ITEM_PERSIST_ENABLED === false`.
 */
async function hydrateItemLevelReminders(
  spaces: Space[],
  shouldSkip: (space: Space) => boolean = () => false,
): Promise<Space[]> {
  if (!REMINDER_ITEM_PERSIST_ENABLED) return spaces;
  return Promise.all(
    spaces.map(async (space) => {
      if (shouldSkip(space)) return space;
      try {
        const reminders =
          space.isShared && space.sharedSpaceId
            ? await loadSharedReminders(space.sharedSpaceId)
            : await loadPrivateReminders(space.id);
        return { ...space, reminders };
      } catch (err) {
        console.warn(
          `[KN-Space] Không tải được Reminder item-level cho Space "${space.name}" (${space.id}) — dùng tạm reminders jsonb cũ:`,
          err,
        );
        return space;
      }
    }),
  );
}

/**
 * Giai đoạn B (Task, item-level-entity-tables-progress.md, Bước 4) — mirror CHÍNH XÁC
 * `hydrateItemLevelReminders()` ở trên (Task CÓ bản Shared, giống Log/Reminder — khác Habit): tải
 * Task của TỪNG Space (private + shared) từ bảng item-level mới (`kn_private_tasks`/
 * `kn_shared_tasks`, qua `taskStore.ts`), gán đè `space.tasks` (thay cho mảng jsonb cũ) làm nguồn
 * ĐỌC thật. Chạy song song cho mọi Space qua `Promise.all` — lỗi tải riêng 1 Space KHÔNG throw/chặn
 * Space khác, fallback dùng đúng `space.tasks` jsonb đã có sẵn cho Space đó.
 *
 * `shouldSkip(space)` — mirror Log/Habit/Reminder — dùng ở `refreshStaleSpaces()` để bỏ qua Space
 * đang có Task "chưa ghi xong" (xem `hasPendingTasksForSpace()`).
 *
 * No-op hoàn toàn (trả về nguyên mảng đầu vào, không gọi network) khi `TASK_ITEM_PERSIST_ENABLED
 * === false`.
 */
async function hydrateItemLevelTasks(
  spaces: Space[],
  shouldSkip: (space: Space) => boolean = () => false,
): Promise<Space[]> {
  if (!TASK_ITEM_PERSIST_ENABLED) return spaces;
  return Promise.all(
    spaces.map(async (space) => {
      if (shouldSkip(space)) return space;
      try {
        const tasks =
          space.isShared && space.sharedSpaceId
            ? await loadSharedTasks(space.sharedSpaceId)
            : await loadPrivateTasks(space.id);
        return { ...space, tasks };
      } catch (err) {
        console.warn(
          `[KN-Space] Không tải được Task item-level cho Space "${space.name}" (${space.id}) — dùng tạm tasks jsonb cũ:`,
          err,
        );
        return space;
      }
    }),
  );
}

/**
 * Giai đoạn B (Note, item-level-entity-tables-progress.md, Bước 5, entity CUỐI CÙNG) — mirror
 * CHÍNH XÁC `hydrateItemLevelTasks()` ở trên (Note CÓ bản Shared, giống Task/Log/Reminder — khác
 * Habit): tải Note của TỪNG Space (private + shared) từ bảng item-level mới (`kn_private_notes`/
 * `kn_shared_notes`, qua `noteStore.ts`), gán đè `space.notes` (thay cho mảng jsonb cũ) làm nguồn
 * ĐỌC thật. Chạy song song cho mọi Space qua `Promise.all` — lỗi tải riêng 1 Space KHÔNG throw/chặn
 * Space khác, fallback dùng đúng `space.notes` jsonb đã có sẵn cho Space đó.
 *
 * `shouldSkip(space)` — mirror Log/Habit/Reminder/Task — dùng ở `refreshStaleSpaces()` để bỏ qua
 * Space đang có Note "chưa ghi xong" (xem `hasPendingNotesForSpace()`).
 *
 * No-op hoàn toàn (trả về nguyên mảng đầu vào, không gọi network) khi `NOTE_ITEM_PERSIST_ENABLED
 * === false`.
 */
async function hydrateItemLevelNotes(
  spaces: Space[],
  shouldSkip: (space: Space) => boolean = () => false,
): Promise<Space[]> {
  if (!NOTE_ITEM_PERSIST_ENABLED) return spaces;
  return Promise.all(
    spaces.map(async (space) => {
      if (shouldSkip(space)) return space;
      try {
        const notes =
          space.isShared && space.sharedSpaceId
            ? await loadSharedNotes(space.sharedSpaceId)
            : await loadPrivateNotes(space.id);
        return { ...space, notes };
      } catch (err) {
        console.warn(
          `[KN-Space] Không tải được Note item-level cho Space "${space.name}" (${space.id}) — dùng tạm notes jsonb cũ:`,
          err,
        );
        return space;
      }
    }),
  );
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
        const loadedState = await loadAppState(); // { currentSpaceId, settings } | null (settings/current_space_id, kn_space_state)

        let currentSpaceId: string;
        let settings: AppState['settings'];
        let privateSpaces: Space[];
        let storageFallbackActive = false;

        if (loadedState) {
          currentSpaceId = loadedState.currentSpaceId;
          settings = loadedState.settings;
          try {
            privateSpaces = await loadPrivateSpaces();
          } catch (err) {
            // Không chặn cả app nếu riêng bảng Space cá nhân lỗi (vd mất mạng giữa chừng) — coi
            // như rỗng, để user vẫn vào được app (dù thiếu Space, còn hơn crash trắng màn hình).
            console.warn('[KN-Space] Không tải được Space cá nhân:', err);
            privateSpaces = [];
          }
        } else {
          // User mới hoàn toàn — chưa có hàng `kn_space_state` nào -> seed cả settings lẫn Space
          // cá nhân demo (INSERT cả 2 đích cùng lúc, xem `seedAndPersist()`).
          const seeded = await seedAndPersist();
          currentSpaceId = seeded.currentSpaceId;
          settings = seeded.settings;
          privateSpaces = seeded.spaces;
          storageFallbackActive = seeded.storageFallbackActive;
        }

        if (cancelled) return;

        // Load shared spaces — không block nếu lỗi (user chưa có shared space là chuyện bình thường).
        let sharedSpaces: AppState['spaces'] = [];
        try {
          sharedSpaces = await loadSharedSpaces();
        } catch (err) {
          console.warn('[KN-Space] Không tải được shared spaces:', err);
        }

        // Giai đoạn B (item-level-entity-tables-progress.md, câu hỏi mở #2) — gán đè `space.logs`
        // của MỌI Space (private + shared), `space.habits` của Space cá nhân, VÀ
        // `space.reminders`/`space.tasks`/`space.notes` của MỌI Space (private + shared) bằng dữ
        // liệu tải từ bảng item-level mới, TRƯỚC khi dispatch HYDRATE. Không cần cập nhật
        // `prevPrivateRef`/`prevSharedRef` thủ công ở đây — 2 baseline này bắt đầu rỗng, effect
        // debounce Space-level tự nhận ra "lần đầu thấy Space này" (sau khi `state.spaces` đổi do
        // HYDRATE) và chỉ ghi nhận baseline từ
        // `space.logs`/`space.habits`/`space.reminders`/`space.tasks`/`space.notes` ĐÃ được gán đè
        // ở bước này, không tự bắn save thừa.
        const rawSpaces = [...privateSpaces, ...sharedSpaces];
        const logsHydrated = await hydrateItemLevelLogs(rawSpaces);
        const habitsHydrated = await hydrateItemLevelHabits(logsHydrated);
        const remindersHydrated = await hydrateItemLevelReminders(habitsHydrated);
        const tasksHydrated = await hydrateItemLevelTasks(remindersHydrated);
        const allSpaces = await hydrateItemLevelNotes(tasksHydrated);
        // Validate sau khi có đủ cả private + shared — localId có thể là shared space
        const validCurrentSpaceId = allSpaces.some((s) => s.id === currentSpaceId)
          ? currentSpaceId
          : allSpaces[0]?.id ?? currentSpaceId;
        writeLocalCurrentSpaceId(validCurrentSpaceId);

        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: allSpaces,
            currentSpaceId: validCurrentSpaceId,
            settings,
            storageFallbackActive,
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

  // Bật/tắt banner lỗi lưu theo kết quả flushSave (kênh `settings`, kn_space_state).
  useEffect(() => {
    setFallbackListener((active) => {
      dispatch({ type: 'SET_STORAGE_FALLBACK_ACTIVE', payload: { active } });
    });
  }, []);

  // Debounce save khi settings đổi — kênh riêng (kn_space_state), KHÔNG kéo theo ghi lại Space cá
  // nhân (giờ ở bảng `kn_private_spaces` riêng, xem effect debounce-theo-Space bên dưới).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    scheduleSettingsSave({ settings: state.settings });
  }, [state.settings, isLoading]);

  // ==========================================================================================
  // Debounce save Space CÁ NHÂN — theo TỪNG HÀNG (kn_private_spaces), mirror CHÍNH XÁC cơ chế đã
  // dùng cho Shared Space bên dưới (Map theo spaceId: version/timer/pending/baseline riêng từng
  // Space — sửa Space A không kích hoạt lưu Space B). Xem docs/features/storage-architecture-fix.md
  // mục 4 Bước 3.
  // ==========================================================================================
  const privateSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevPrivateRef = useRef<Map<string, string>>(new Map()); // spaceId → JSON snapshot (baseline)
  const pendingPrivateSavesRef = useRef<Map<string, ReturnType<typeof privateSnapshot>>>(new Map());
  // spaceId đang có 1 lượt createPrivateSpace() (INSERT) bay dở — chặn effect gọi tạo trùng lặp
  // (vd re-render giữa lúc INSERT chưa kịp trả về) hoặc trong lúc IMPORT_DATA đang xử lý bất đồng bộ.
  const creatingPrivateRef = useRef<Set<string>>(new Set());

  /**
   * Thử lưu 1 Space cá nhân — ghi thẳng, KHÔNG version-check/retry (bỏ theo
   * docs/features/conflict-handling-simplification.md mục 2.1, 2026-07-10 — mirror CHÍNH XÁC
   * `attemptSaveShared` bên dưới). Lỗi thật (network/server, từ `catch`) bật banner lỗi mạng qua
   * `setPrivateFallbackActive` (mục 3 tài liệu trên — A1 thay thế); thành công thì tắt banner.
   */
  async function attemptSavePrivate(sid: string): Promise<boolean> {
    const data = pendingPrivateSavesRef.current.get(sid);
    if (!data) return true; // không có gì pending — coi như đã lưu xong
    try {
      await savePrivateSpace(sid, data);
      if (pendingPrivateSavesRef.current.get(sid) === data) {
        pendingPrivateSavesRef.current.delete(sid);
      }
      setPrivateFallbackActive(false);
      return true;
    } catch (err) {
      console.warn('[KN-Space] savePrivateSpace thất bại:', err);
      setPrivateFallbackActive(true);
      return false;
    }
  }

  // Debounce save Space cá nhân khi nội dung thay đổi + tự INSERT Space vừa tạo cục bộ chưa từng
  // lưu (`_privateVersion === undefined` — tín hiệu duy nhất phân biệt "Space mới" với "Space đã
  // có trên DB", xem comment field trong types.ts).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const privateSpaces = state.spaces.filter((s) => !s.isShared);
    privateSpaces.forEach((space) => {
      const sid = space.id;

      if (space._privateVersion === undefined) {
        if (creatingPrivateRef.current.has(sid)) return; // đã có 1 lượt INSERT đang bay, đợi nó xong
        creatingPrivateRef.current.add(sid);
        // Chụp lại đúng dữ liệu tại THỜI ĐIỂM bắn INSERT — dùng làm baseline sau khi tạo xong, để
        // nếu Space bị sửa tiếp trong lúc INSERT còn đang bay (vd đổi tên ngay sau khi tạo), lượt
        // diff kế tiếp (sau khi version về) tự phát hiện lệch baseline-vs-hiện-tại và bắn UPDATE bù
        // — không bị "nuốt" mất thay đổi đó (xem docs/features/storage-architecture-fix-progress.md,
        // mục Bước 3, quyết định xử lý race create-vs-edit).
        const snapshotAtCreate = JSON.stringify(privateSnapshot(space));
        void (async () => {
          const result = await createPrivateSpace(space);
          creatingPrivateRef.current.delete(sid);
          if (!result.ok) {
            console.warn('[KN-Space] Tạo Space cá nhân trên Supabase thất bại:', result.error);
            setPrivateFallbackActive(true);
            return; // lần render sau (nếu spaces vẫn đổi) tự retry vì _privateVersion vẫn undefined
          }
          setPrivateFallbackActive(false);
          prevPrivateRef.current.set(sid, snapshotAtCreate);
          dispatch({ type: 'SPACE_SET_PRIVATE_VERSION', payload: { id: sid, version: result.version ?? 1 } });
        })();
        return;
      }

      // Space đã có hàng trên DB — diff theo baseline, debounce update giống Shared Space.
      const snapshot = JSON.stringify(privateSnapshot(space));
      // Lần đầu thấy space này (vừa hydrate/load) → chỉ ghi nhận baseline, KHÔNG save (tránh 1 lượt
      // save thừa ngay khi mở app do Map rỗng làm snapshot cũ luôn "khác" snapshot hiện tại).
      if (!prevPrivateRef.current.has(sid)) {
        prevPrivateRef.current.set(sid, snapshot);
        return;
      }
      if (prevPrivateRef.current.get(sid) === snapshot) return;
      prevPrivateRef.current.set(sid, snapshot);
      pendingPrivateSavesRef.current.set(sid, privateSnapshot(space));
      const existing = privateSaveTimersRef.current.get(sid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        privateSaveTimersRef.current.delete(sid);
        void attemptSavePrivate(sid);
      }, 600);
      privateSaveTimersRef.current.set(sid, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces]);

  const sharedSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevSharedRef = useRef<Map<string, string>>(new Map()); // spaceId → JSON snapshot
  // Track data pending flush — cập nhật NGAY khi có thay đổi, trước debounce timer
  // Dùng để flush ngay khi tab ẩn (F5/đóng tab) tránh mất data trong cửa sổ debounce 800ms
  const pendingSharedSavesRef = useRef<Map<string, ReturnType<typeof sharedSnapshot>>>(new Map());

  /**
   * Thử lưu 1 shared space — ghi thẳng, KHÔNG version-check/retry (bỏ theo
   * docs/features/conflict-handling-simplification.md mục 2.1, 2026-07-10). Lỗi thật (network/
   * server, từ `catch`) bật banner lỗi mạng qua `setSharedFallbackActive` (mục 3 tài liệu trên — A1
   * thay thế); thành công thì tắt banner.
   */
  async function attemptSaveShared(sid: string): Promise<boolean> {
    const data = pendingSharedSavesRef.current.get(sid);
    if (!data) return true; // không có gì pending — coi như đã lưu xong
    try {
      await saveSharedSpace(sid, data);
      // Chỉ xoá pending nếu không có thay đổi mới hơn ghi đè trong lúc đang save
      if (pendingSharedSavesRef.current.get(sid) === data) {
        pendingSharedSavesRef.current.delete(sid);
      }
      setSharedFallbackActive(false);
      return true;
    } catch (err) {
      console.warn('[KN-Space] saveSharedSpace thất bại:', err);
      setSharedFallbackActive(true);
      return false;
    }
  }

  // Debounce save shared spaces khi nội dung thay đổi.
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const sharedSpaces = state.spaces.filter((s) => s.isShared && s.sharedSpaceId);
    sharedSpaces.forEach((space) => {
      const sid = space.sharedSpaceId!;
      const snapshot = JSON.stringify(sharedSnapshot(space));
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
      pendingSharedSavesRef.current.set(sid, sharedSnapshot(space));
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

  /**
   * Hướng 2 (docs/features/conflict-handling-simplification.md mục 2.2) — refresh RAM khi tab quay
   * lại `visible`, thu hẹp cửa sổ "RAM cũ" (root cause thật của sự cố mất dữ liệu, xem mục 1 tài
   * liệu trên) từ hàng giờ (thời lượng 1 phiên mở tab) xuống còn khoảng thời gian tab bị ẩn.
   *
   * Tải lại `kn_private_spaces`/`kn_shared_spaces`, rồi với TỪNG Space trong kết quả: nếu KHÔNG có
   * thay đổi đang chờ lưu (không có entry trong pending*SavesRef, không có debounce timer đang
   * chạy, riêng Space cá nhân thêm điều kiện không đang trong lượt INSERT) → gộp vào danh sách
   * refresh + cập nhật baseline (prev*Ref) để effect debounce không hiểu nhầm "vừa có thay đổi cần
   * lưu". Space đang có pending → bỏ qua nguyên vẹn, tự lưu theo đúng luồng debounce/flush hiện có
   * (không đè mất nội dung đang gõ dở).
   *
   * Lỗi network khi tải lại → bắt riêng từng nguồn (private/shared độc lập), bỏ qua im lặng, không
   * throw/crash — thử lại ở lần `visible` kế tiếp. KHÔNG phải polling (chỉ chạy khi
   * `visibilitychange` bắn `visible`, không có `setInterval`).
   *
   * Giai đoạn B (item-level-entity-tables-progress.md, câu hỏi mở #2) — với các Space QUA ĐƯỢC
   * vòng lọc pending Space-level ở trên, tải thêm Log từ bảng item-level (`hydrateItemLevelLogs`)
   * để gán đè `.logs`, NHƯNG bỏ qua riêng phần gán đè `.logs` (giữ nguyên bản jsonb vừa tải từ
   * `kn_private_spaces`/`kn_shared_spaces`) cho Space nào đang có Log "chưa ghi xong" theo
   * `hasPendingLogsForSpace()` (`itemPersist.ts`) — tránh đè mất log vừa tạo/sửa/xoá cục bộ bằng
   * dữ liệu server (cả 2 nguồn, jsonb lẫn item-level) có thể chưa kịp phản ánh thao tác đó.
   *
   * Mirror y hệt cho Habit (Bước 2) — sau khi có `refreshedPrivateLogs` (đã gán đè `.logs`), chạy
   * tiếp `hydrateItemLevelHabits` để gán đè `.habits` cho Space cá nhân, bỏ qua Space đang có Habit
   * "chưa ghi xong" theo `hasPendingHabitsForSpace()`. Không áp dụng cho Space chung (Habit không
   * tồn tại ở đó).
   *
   * Mirror y hệt cho Reminder (Bước 3, CÓ bản Shared — mirror Log, khác Habit) — sau khi có
   * `refreshedPrivateHabits` (private, đã gán đè `.habits`) và `refreshedSharedLogs` (shared, đã gán
   * đè `.logs`), chạy tiếp `hydrateItemLevelReminders` cho CẢ 2 nhánh để gán đè `.reminders`, bỏ qua
   * Space đang có Reminder "chưa ghi xong" theo `hasPendingRemindersForSpace()`.
   *
   * Mirror y hệt cho Task (Bước 4, CÓ bản Shared — mirror Reminder) — chạy tiếp
   * `hydrateItemLevelTasks` cho CẢ 2 nhánh (sau khi đã gán đè `.reminders`) để gán đè `.tasks`, bỏ
   * qua Space đang có Task "chưa ghi xong" theo `hasPendingTasksForSpace()`.
   *
   * Mirror y hệt cho Note (Bước 5, entity CUỐI CÙNG, CÓ bản Shared — mirror Task) — chạy tiếp
   * `hydrateItemLevelNotes` cho CẢ 2 nhánh (sau khi đã gán đè `.tasks`) để gán đè `.notes`, bỏ qua
   * Space đang có Note "chưa ghi xong" theo `hasPendingNotesForSpace()`.
   */
  async function refreshStaleSpaces(): Promise<void> {
    if (!hydratedRef.current) return; // bootstrap chưa xong — để bootstrap tự lo, tránh gọi trùng

    const [freshPrivate, freshShared] = await Promise.all([
      loadPrivateSpaces().catch((err) => {
        console.warn('[KN-Space] refreshStaleSpaces: tải lại Space cá nhân lỗi:', err);
        return null;
      }),
      loadSharedSpaces().catch((err) => {
        console.warn('[KN-Space] refreshStaleSpaces: tải lại Shared Space lỗi:', err);
        return null;
      }),
    ]);

    const privateCandidates = (freshPrivate ?? []).filter((space) => {
      const sid = space.id;
      return !(
        pendingPrivateSavesRef.current.has(sid) ||
        privateSaveTimersRef.current.has(sid) ||
        creatingPrivateRef.current.has(sid)
      ); // đang gõ dở/đang lưu/đang tạo — không đè
    });

    const sharedCandidates = (freshShared ?? []).filter((space) => {
      const sid = space.sharedSpaceId ?? space.id;
      return !(pendingSharedSavesRef.current.has(sid) || sharedSaveTimersRef.current.has(sid));
    });

    const [refreshedPrivateLogs, refreshedSharedLogs] = await Promise.all([
      hydrateItemLevelLogs(privateCandidates, (space) => hasPendingLogsForSpace('private', space.id)),
      hydrateItemLevelLogs(sharedCandidates, (space) =>
        hasPendingLogsForSpace('shared', space.sharedSpaceId ?? space.id),
      ),
    ]);

    const refreshedPrivateHabits = await hydrateItemLevelHabits(refreshedPrivateLogs, (space) =>
      hasPendingHabitsForSpace(space.id),
    );

    const [refreshedPrivateReminders, refreshedSharedReminders] = await Promise.all([
      hydrateItemLevelReminders(refreshedPrivateHabits, (space) =>
        hasPendingRemindersForSpace('private', space.id),
      ),
      hydrateItemLevelReminders(refreshedSharedLogs, (space) =>
        hasPendingRemindersForSpace('shared', space.sharedSpaceId ?? space.id),
      ),
    ]);

    const [refreshedPrivateTasks, refreshedSharedTasks] = await Promise.all([
      hydrateItemLevelTasks(refreshedPrivateReminders, (space) =>
        hasPendingTasksForSpace('private', space.id),
      ),
      hydrateItemLevelTasks(refreshedSharedReminders, (space) =>
        hasPendingTasksForSpace('shared', space.sharedSpaceId ?? space.id),
      ),
    ]);

    const [refreshedPrivate, refreshedShared] = await Promise.all([
      hydrateItemLevelNotes(refreshedPrivateTasks, (space) =>
        hasPendingNotesForSpace('private', space.id),
      ),
      hydrateItemLevelNotes(refreshedSharedTasks, (space) =>
        hasPendingNotesForSpace('shared', space.sharedSpaceId ?? space.id),
      ),
    ]);

    const toRefresh: Space[] = [...refreshedPrivate, ...refreshedShared];

    refreshedPrivate.forEach((space) => {
      prevPrivateRef.current.set(space.id, JSON.stringify(privateSnapshot(space)));
    });

    refreshedShared.forEach((space) => {
      const sid = space.sharedSpaceId ?? space.id;
      prevSharedRef.current.set(sid, JSON.stringify(sharedSnapshot(space)));
    });

    if (toRefresh.length > 0) {
      dispatch({ type: 'SPACE_REFRESH_FROM_SERVER', payload: { spaces: toRefresh } });
    }
  }

  // Flush ngay khi tab ẩn đi (tránh mất thay đổi cuối nếu đóng tab trong cửa sổ debounce) / refresh
  // RAM khi tab quay lại hoạt động (Hướng 2, xem `refreshStaleSpaces()` ở trên).
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        void forceFlush(); // kênh `settings` (kn_space_state)
        // Flush Space cá nhân còn pending (F5/đóng tab trong cửa sổ 600ms debounce)
        if (pendingPrivateSavesRef.current.size > 0) {
          const pendingIds = Array.from(pendingPrivateSavesRef.current.keys());
          pendingIds.forEach((sid) => void attemptSavePrivate(sid));
          privateSaveTimersRef.current.forEach((t) => clearTimeout(t));
          privateSaveTimersRef.current.clear();
        }
        // Flush shared spaces còn pending (F5/đóng tab trong cửa sổ 800ms debounce)
        if (pendingSharedSavesRef.current.size > 0) {
          const pendingIds = Array.from(pendingSharedSavesRef.current.keys());
          pendingIds.forEach((sid) => void attemptSaveShared(sid));
          // Clear timers — đã flush rồi, không cần debounce nữa
          sharedSaveTimersRef.current.forEach((t) => clearTimeout(t));
          sharedSaveTimersRef.current.clear();
        }
        // Flush Log/Habit/Reminder/Task/Note item-level còn pending (mirror các nhánh trên, xem
        // itemPersist.ts) — cả 5 cờ (LOG/HABIT/REMINDER/TASK/NOTE_ITEM_PERSIST_ENABLED) đều đang
        // BẬT (`true`), hàng đợi các nhánh này có thể có dữ liệu thật đang chờ flush.
        flushAllPendingLogPersist();
        flushAllPendingHabitPersist();
        flushAllPendingReminderPersist();
        flushAllPendingTaskPersist();
        flushAllPendingNotePersist();
      } else if (document.visibilityState === 'visible') {
        void refreshStaleSpaces();
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

  // Wrap dispatch để intercept SPACE_DELETE (Space cá nhân lẫn shared) và IMPORT_DATA: reducer xoá/
  // thay dữ liệu khỏi local state ngay, đồng thời gọi Supabase xoá/ghi lại trên DB.
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
      } else if (space && !space.isShared) {
        // Huỷ debounce/creating pending của Space này trước — tránh 1 lượt save/tạo trễ bắn ra
        // SAU khi đã xoá (vô hại về dữ liệu vì không còn ai trỏ tới id này, nhưng dễ log warning
        // thừa nếu chạy xong mới phát hiện version/id không còn khớp).
        const existingTimer = privateSaveTimersRef.current.get(space.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          privateSaveTimersRef.current.delete(space.id);
        }
        pendingPrivateSavesRef.current.delete(space.id);
        if (space._privateVersion !== undefined) {
          // Chỉ có hàng thật trên DB để xoá khi đã từng lưu thành công (_privateVersion xác định).
          // Nếu Space vừa tạo, còn đang trong lúc INSERT bay dở (creatingPrivateRef đang giữ id
          // này) — không có hàng nào để DELETE ở đây; INSERT vẫn hoàn tất sau đó (tạo ra 1 hàng
          // "mồ côi" không còn Space nào trong state trỏ tới). Rủi ro rất nhỏ (cửa sổ vài trăm ms,
          // tình huống hiếm: tạo Space rồi xoá ngay lập tức) — chấp nhận theo tinh thần dự án nhỏ,
          // ghi rõ ở đây để biết nếu cần xử lý kỹ hơn sau (vd dọn định kỳ hàng mồ côi).
          void deletePrivateSpace(space.id).catch((err) =>
            console.warn('[KN-Space] Xoá Space cá nhân trên DB thất bại:', err),
          );
        }
      }
    }

    if (action.type === 'IMPORT_DATA') {
      // Import THAY THẾ HOÀN TOÀN Space cá nhân hiện có (không merge — đúng ngữ nghĩa IMPORT_DATA
      // sẵn có ở appReducer). Tính state kế tiếp bằng appReducer thuần để biết chính xác Space cá
      // nhân nào bị xoá/còn lại/mới thêm, TRƯỚC khi dispatch() thật (giống cách saveNow() làm bên
      // dưới) — dispatch() chỉ enqueue update, chưa có state mới ngay trong lượt gọi này.
      const nextState = appReducer(state, action);
      if (nextState !== state) {
        const oldPrivateIds = state.spaces.filter((s) => !s.isShared).map((s) => s.id);
        const newPrivateSpaces = nextState.spaces.filter((s) => !s.isShared);
        const newIdSet = new Set(newPrivateSpaces.map((s) => s.id));
        const idsToDelete = oldPrivateIds.filter((id) => !newIdSet.has(id));

        // Dọn sạch mọi debounce/baseline cũ liên quan Space cá nhân — import thay thế hoàn toàn.
        privateSaveTimersRef.current.forEach((t) => clearTimeout(t));
        privateSaveTimersRef.current.clear();
        pendingPrivateSavesRef.current.clear();
        prevPrivateRef.current.clear();
        // Chặn effect debounce tự ý tạo/update các Space này trong lúc import đang xử lý bất đồng
        // bộ bên dưới — gỡ chặn ngay khi có kết quả.
        newPrivateSpaces.forEach((s) => creatingPrivateRef.current.add(s.id));

        void (async () => {
          // File export giữ NGUYÊN id gốc của Space -> re-import dữ liệu đã từng export trước đó có
          // thể trùng id với hàng đang có sẵn. Xoá trước các id KHÔNG còn trong file import, sau đó
          // upsert toàn bộ Space mới (upsert tự xử lý đúng cả 2 nhánh: id mới -> insert, id trùng ->
          // update tại chỗ) — xem giải thích đầy đủ ở `upsertPrivateSpaces()`.
          await Promise.all(
            idsToDelete.map((id) =>
              deletePrivateSpace(id).catch((err) => console.warn('[KN-Space] Xoá Space cũ khi import thất bại:', err)),
            ),
          );
          const result = await upsertPrivateSpaces(newPrivateSpaces);
          newPrivateSpaces.forEach((s) => creatingPrivateRef.current.delete(s.id));
          if (!result.ok || !result.spaces) {
            console.warn('[KN-Space] Import Space cá nhân lên Supabase thất bại:', result.error);
            setPrivateFallbackActive(true);
            return;
          }
          setPrivateFallbackActive(false);
          result.spaces.forEach((s) => {
            const version = s._privateVersion ?? 1;
            prevPrivateRef.current.set(s.id, JSON.stringify(privateSnapshot(s)));
            dispatch({ type: 'SPACE_SET_PRIVATE_VERSION', payload: { id: s.id, version } });
          });

          // Space-level (kn_private_spaces) không còn ghi tasks/notes/habits/reminders/logs (Việc
          // 1) — tự bulk-insert entity vào bảng item-level cho TỪNG Space vừa import, nếu không dữ
          // liệu import sẽ "biến mất" ở lần reload kế tiếp (xem `syncImportedSpaceItems()`,
          // `storage/importSync.ts`). `result.spaces` giữ nguyên đầy đủ tasks/notes/... từ
          // `newPrivateSpaces` (spread trong `upsertPrivateSpaces()`, chỉ thêm `_privateVersion`),
          // dùng trực tiếp được.
          const syncResults = await Promise.all(result.spaces.map((s) => syncImportedSpaceItems(s)));
          if (syncResults.some((r) => !r.ok)) setPrivateFallbackActive(true);
        })();
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
          if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, currentSpace.name, effect.taskId, effect.taskTitle, effect.recipientUserIds);
        }
      }

      if (action.type === 'TASK_UPDATE') {
        const effect = computeTaskUpdateNotifyEffect(currentSpace, action, currentUserId);
        if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, currentSpace.name, effect.taskId, effect.taskTitle, effect.recipientUserIds);
      }

      if (action.type === 'TASK_TOGGLE_DONE') {
        const effect = computeTaskToggleDoneNotifyEffect(currentSpace, action);
        if (effect?.kind === 'completed-schedule') {
          const { taskId, taskTitle } = effect;
          scheduleCompletedNotify(taskId, () => notifyTaskCompleted(sharedSpaceId, currentSpace.name, taskId, taskTitle, currentUserId));
        } else if (effect?.kind === 'completed-cancel') {
          cancelCompletedNotify(effect.taskId);
        }
      }

      if (action.type === 'TASK_DELETE') {
        // Task bị xoá trước khi debounce 15s kịp chạy — huỷ lịch, tránh notify về task không còn tồn tại.
        cancelCompletedNotify(action.payload.id);
      }
    }

    // Persist item-level cho Log (Bước 1, docs/features/item-level-entity-tables.md) — ĐỘC LẬP với
    // luồng save Space-level ở trên (bảng riêng `kn_private_logs`/`kn_shared_logs`, debounce theo
    // itemId). No-op hoàn toàn khi `LOG_ITEM_PERSIST_ENABLED === false` (xem `itemPersist.ts`) —
    // Nhật ký nhanh tiếp tục lưu qua cột `logs` jsonb như cũ, không đổi hành vi hiện tại.
    if (currentSpace && isLogAction(action)) {
      actionToDispatch = handleLogActionForPersist(currentSpace, action);
    }

    // Persist item-level cho Habit (Bước 2, docs/features/item-level-entity-tables.md) — mirror
    // CHÍNH XÁC nhánh Log ở trên (bảng riêng `kn_private_habits`, debounce theo itemId). No-op hoàn
    // toàn khi `HABIT_ITEM_PERSIST_ENABLED === false` — Thói quen tiếp tục lưu qua cột `habits`
    // jsonb như cũ, không đổi hành vi hiện tại.
    if (currentSpace && isHabitAction(action)) {
      actionToDispatch = handleHabitActionForPersist(currentSpace, action);
    }

    // Persist item-level cho Reminder (Bước 3, docs/features/item-level-entity-tables.md) — mirror
    // CHÍNH XÁC nhánh Log ở trên (bảng riêng `kn_private_reminders`/`kn_shared_reminders`, debounce
    // theo itemId, CÓ scope — khác Habit). `REMINDER_ITEM_PERSIST_ENABLED` đang BẬT (`true`) — mọi
    // action `REMINDER_*` giờ dual-write thật vào bảng item-level song song với cột `reminders`
    // jsonb cũ.
    if (currentSpace && isReminderAction(action)) {
      actionToDispatch = handleReminderActionForPersist(currentSpace, action);
    }

    // Persist item-level cho Task (Bước 4, docs/features/item-level-entity-tables.md) — mirror
    // CHÍNH XÁC nhánh Log/Reminder ở trên (bảng riêng `kn_private_tasks`/`kn_shared_tasks`, debounce
    // theo itemId, CÓ scope). `TASK_ITEM_PERSIST_ENABLED` đang BẬT (`true`) — mọi action `TASK_*`
    // giờ dual-write thật vào bảng item-level song song với cột `tasks` jsonb cũ.
    //
    // KHÁC nhánh Log/Habit/Reminder ở trên: truyền `actionToDispatch` (không phải `action` gốc) —
    // khối notify Shared Space phía trên (assign/hoàn thành task) có thể ĐÃ gắn sẵn `payload.id` cho
    // `TASK_CREATE` vào `actionToDispatch` để đảm bảo id gửi trong notify khớp đúng id task thật;
    // nếu dùng lại `action` gốc, `handleTaskActionForPersist` sẽ tự sinh 1 id KHÁC, tạo ra 2 UUID
    // khác nhau cho cùng 1 lượt tạo (xem giải thích đầy đủ ở đầu block Task trong `itemPersist.ts`).
    if (currentSpace && isTaskAction(actionToDispatch)) {
      actionToDispatch = handleTaskActionForPersist(currentSpace, actionToDispatch);
    }

    // Persist item-level cho Note (Bước 5, entity CUỐI CÙNG, docs/features/item-level-entity-tables.md)
    // — mirror CHÍNH XÁC nhánh Task ở trên (bảng riêng `kn_private_notes`/`kn_shared_notes`, debounce
    // theo itemId, CÓ scope). `NOTE_ITEM_PERSIST_ENABLED` đang BẬT (`true`) — mọi action `NOTE_*`
    // giờ dual-write thật vào bảng item-level song song với cột `notes` jsonb cũ. Đây là entity CUỐI
    // CÙNG trong kế hoạch tách bảng item-level (Log/Habit/Reminder/Task/Note đều đã Giai đoạn A+B).
    //
    // Dùng `actionToDispatch` (không phải `action` gốc) để nhất quán với nhánh Task ngay phía trên —
    // Note KHÔNG có notify Shared Space nào chạy trước gắn sẵn id (khác Task), nên tại điểm gọi này
    // `actionToDispatch` luôn TRÙNG với `action` gốc cho mọi action `NOTE_*` (khối Task chỉ biến đổi
    // action có type `TASK_*`) — xem giải thích đầy đủ ở đầu block Note trong `itemPersist.ts`.
    if (currentSpace && isNoteAction(actionToDispatch)) {
      actionToDispatch = handleNoteActionForPersist(currentSpace, actionToDispatch);
    }

    dispatch(actionToDispatch);
  }, [state.spaces, state.currentSpaceId, session?.user?.id]);

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

/**
 * Ném lỗi nếu không tìm thấy Space hiện tại. AN TOÀN dùng ở MỌI component KHÁC ngoài
 * `HomeScreen`/`AppLayout` (2 điểm entry cấp cao nhất) — toàn bộ 6 khối dữ liệu (TasksBlock,
 * NotesBlock, HabitsBlock, RemindersBlock, LogsBlock, NotificationsBlock), các modal Thêm/Sửa
 * (TaskFormModal, NoteFormModal), SettingsModal, MobileChatScreen... đều CHỈ được React mount
 * làm con của `AppLayout`, SAU khi `AppLayout` đã tự kiểm tra `useCurrentSpaceOrNull()` khác
 * `null` (xem AppLayout.tsx) — nên tại các nơi đó, "có Space hiện tại" là 1 invariant kiến trúc
 * luôn đúng, không cần lặp lại `if (!space)` ở từng file. Nếu invariant này bị vi phạm (bug ở
 * đâu đó khiến 1 trong các component trên mount ngoài cây `AppLayout`), thà throw rõ ràng ở đây
 * còn hơn âm thầm crash mơ hồ hơn ở nơi dùng `space.tasks`/`space.notes`... phía sau.
 */
export function useCurrentSpace() {
  const { state } = useAppState();
  const space = state.spaces.find((s) => s.id === state.currentSpaceId);
  if (!space) throw new Error('Current space not found');
  return space;
}

/**
 * Biến thể KHÔNG throw — trả `null` nếu `state.spaces` rỗng hoặc không có Space nào khớp
 * `currentSpaceId` (vd: user cũ có hàng `kn_space_state` nhưng chưa migrate dữ liệu sang
 * `kn_private_spaces`, hoặc user lỡ xoá hết Space của mình — xem
 * docs/features/storage-architecture-fix-progress.md mục Bước 3b). CHỈ dùng ở 2 điểm entry cấp
 * cao nhất mount trực tiếp dưới `<Shell>` (`HomeScreen`, `AppLayout`) — nơi PHẢI tự xử lý mềm
 * trường hợp chưa có Space nào thay vì để throw làm crash trắng màn hình cả app. Xem
 * `useCurrentSpace()` (throw) ở trên cho mọi nơi khác.
 */
export function useCurrentSpaceOrNull() {
  const { state } = useAppState();
  return state.spaces.find((s) => s.id === state.currentSpaceId) ?? null;
}
