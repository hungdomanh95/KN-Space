// =============================================================================
// itemPersist.ts — action-level persist item-level, docs/features/
// item-level-entity-tables.md mục 4.2 (quyết định đã chốt #2, -progress.md).
// =============================================================================
// Khác hẳn cơ chế debounce Space-level hiện có trong `AppStateContext.tsx`
// (1 `useEffect` DIFF snapshot `state.spaces` để ĐOÁN "cái gì vừa đổi"): module
// này được gọi TRỰC TIẾP từ `smartDispatch` tại đúng thời điểm dispatch, khi
// app đã biết CHÍNH XÁC 100% ý nghĩa action — không cần diff/đoán lại. Debounce
// vẫn có (600ms, gộp nhiều sửa liên tiếp CÙNG 1 item), nhưng đơn vị theo dõi là
// `itemId` (Map), không phải `spaceId`.
//
// File này gộp CẢ 4 entity đã làm tới nay theo đúng kế hoạch cuốn chiếu (mục 7
// tài liệu trên, Log → Habit → Reminder → Task → Note):
//   - Log (Bước 1, xong, Giai đoạn A+B đã bật) — phần đầu file.
//   - Habit (Bước 2, Giai đoạn A+B đã bật 2026-07-11) — phần giữa file, xem
//     `HABIT_ITEM_PERSIST_ENABLED` bên dưới. Habit KHÔNG có bản Shared (chỉ có
//     `kn_private_habits`), khác Log — mọi hàm Habit không có tham số `scope`.
//   - Reminder (Bước 3, Giai đoạn A+B đã bật 2026-07-11) — phần giữa file. Xem
//     `REMINDER_ITEM_PERSIST_ENABLED` bên dưới. Reminder CÓ bản Shared (mirror
//     Log, không phải Habit) — mọi hàm có tham số `scope`. Khác Log ở chỗ
//     `REMINDER_UPDATE` luôn thay NGUYÊN item (không phải patch hẹp từng
//     field) vì `ReminderFormModal.tsx` cho phép đổi cả `type` (once <->
//     recurring) khi sửa — xem `reminderStore.ts`.
//   - Task (Bước 4, CHỈ mới chuẩn bị — `TASK_ITEM_PERSIST_ENABLED = false`) —
//     phần cuối file. Task CÓ bản Shared (mirror Log/Reminder). Khác Reminder:
//     có 3 action UPDATE tách biệt (`TASK_UPDATE`/`TASK_TOGGLE_DONE`/
//     `TASK_REORDER`), mỗi action patch 1 nhóm field hẹp — mirror cách Habit
//     dùng patch hẹp (`HABIT_UPDATE`/`HABIT_TOGGLE_TODAY`), KHÔNG mirror cách
//     Reminder thay nguyên item. `TASK_REORDER` dùng fractional-index
//     (`src/state/fractionalOrder.ts`, đã tích hợp vào `state/reducers/tasks.ts`)
//     — chỉ patch `order` của ĐÚNG 1 task, không đụng task khác. **Điểm khác
//     biệt quan trọng khi gọi `handleTaskActionForPersist()` từ
//     `AppStateContext.tsx`:** PHẢI truyền `actionToDispatch` (không phải
//     `action` gốc) — khối notify Shared Space (assign/hoàn thành task, chạy
//     TRƯỚC trong `smartDispatch`) có thể đã gắn sẵn `payload.id` cho
//     `TASK_CREATE` (đảm bảo id gửi trong notify khớp đúng id task thật) —
//     dùng lại `action` gốc sẽ khiến hàm này tự sinh 1 id THỨ HAI khác hẳn.
//
// CỜ BẬT/TẮT — `LOG_ITEM_PERSIST_ENABLED`:
// Bảng `kn_private_logs`/`kn_shared_logs` (docs/features/item-level-log-schema.sql)
// đã tạo thật trên Supabase và dữ liệu cũ đã migrate xong (`window.knMigrateLogs.run()`).
// Cờ đang BẬT (`true`) — mọi action `LOG_*` GHI SONG SONG (dual-write) vào bảng
// mới. "Giai đoạn B" (2026-07-11, -progress.md câu hỏi mở #2) đã nối phần ĐỌC:
// `AppStateContext.tsx` (bootstrap + `refreshStaleSpaces()`) gọi `loadPrivateLogs`/
// `loadSharedLogs` (`logStore.ts`) cho từng Space rồi GÁN ĐÈ `space.logs` — nguồn
// đọc THẬT của Nhật ký nhanh giờ là bảng item-level, KHÔNG còn là cột `logs` jsonb
// nữa (dù nhánh ghi jsonb VẪN CHẠY SONG SONG làm lưới an toàn, chưa tắt). Hàm
// `hasPendingLogsForSpace()` bên dưới là điểm nối quan trọng nhất: cho
// `refreshStaleSpaces()` biết Space nào đang có Log "chưa ghi xong" (còn debounce
// hoặc network đang bay) để KHÔNG gán đè `space.logs` cho Space đó trong lượt
// refresh hiện tại (tránh đè mất log vừa tạo/sửa/xoá cục bộ).
// =============================================================================

import type { Habit, ReminderDefinition, Space, Task } from '../types';
import type { LogAction } from './reducers/logs';
import { logsReducer } from './reducers/logs';
import type { HabitAction } from './reducers/habits';
import { habitsReducer } from './reducers/habits';
import type { ReminderAction } from './reducers/reminders';
import { remindersReducer } from './reducers/reminders';
import type { TaskAction } from './reducers/tasks';
import { tasksReducer } from './reducers/tasks';
import type { LogEntry } from '../types';
import { setPrivateFallbackActive, setSharedFallbackActive } from '../storage/supabaseStore';
import {
  createLog,
  deleteLog,
  deleteLogs,
  updateLogExpense,
  type LogScope,
} from '../storage/logStore';
import { createHabit, deleteHabit, updateHabit } from '../storage/habitStore';
import {
  createReminder,
  deleteReminder,
  updateReminder,
  type ReminderScope,
} from '../storage/reminderStore';
import {
  createTask,
  deleteTask,
  updateTask,
  type TaskScope,
} from '../storage/taskStore';

export const LOG_ITEM_PERSIST_ENABLED = true;

const LOG_ACTION_TYPES = new Set(['LOG_CREATE', 'LOG_DELETE', 'LOG_DELETE_MANY', 'LOG_PATCH_EXPENSE']);

/** Type guard — action có phải 1 trong 4 action CRUD của Log không (dùng ở `smartDispatch`). */
export function isLogAction(action: { type: string }): action is LogAction {
  return LOG_ACTION_TYPES.has(action.type);
}

type LogExpensePatch = { expenseDate?: string; categoryOverride?: string | null; excluded?: boolean };

/** 1 thao tác đang chờ ghi cho 1 log — tương đương "descriptor" mục 4.2 tài liệu trên. */
export type LogPendingOp =
  | { kind: 'insert'; log: LogEntry }
  | { kind: 'update'; patch: LogExpensePatch }
  | { kind: 'delete' };

/** Áp patch expense vào 1 `LogEntry` cục bộ (KHÔNG gọi DB) — dùng khi gộp 1 UPDATE tới trong lúc 1
 * INSERT của CÙNG item còn đang chờ (item chưa từng lên server để có gì mà UPDATE) — mirror đúng
 * ngữ nghĩa `LOG_PATCH_EXPENSE` trong `reducers/logs.ts`. */
function applyExpensePatch(log: LogEntry, patch: LogExpensePatch): LogEntry {
  const next: LogEntry = { ...log };
  if (patch.expenseDate !== undefined) next.expenseDate = patch.expenseDate;
  if (patch.categoryOverride !== undefined) {
    if (patch.categoryOverride === null) delete next.categoryOverride;
    else next.categoryOverride = patch.categoryOverride;
  }
  if (patch.excluded !== undefined) next.excluded = patch.excluded;
  return next;
}

/**
 * Gộp 1 thao tác MỚI vào thao tác ĐANG CHỜ (nếu có) của CÙNG 1 item, trong CÙNG cửa sổ debounce —
 * tránh gửi 2 request khi user sửa liên tiếp rất nhanh (vd đổi hạng mục chi tiêu 2 lần trong 1 giây).
 * Trả về `null` = không còn gì cần gửi lên server (huỷ hẳn, xem case insert+delete bên dưới).
 *
 * Export để test độc lập (`itemPersist.test.ts`) — logic gộp là phần dễ sai nhất của module này.
 */
export function mergeLogPendingOp(existing: LogPendingOp | undefined, incoming: LogPendingOp): LogPendingOp | null {
  if (!existing) return incoming;

  if (incoming.kind === 'delete') {
    // Item CHƯA từng lên server (còn đang chờ insert) rồi bị xoá ngay trong lúc còn chờ -> không
    // cần làm gì cả (không insert rồi lại delete, tốn 1 lượt network vô ích).
    if (existing.kind === 'insert') return null;
    return incoming;
  }

  if (incoming.kind === 'update') {
    if (existing.kind === 'insert') {
      // Item chưa lên server -> merge patch THẲNG vào log đang chờ insert, không tạo 1 UPDATE
      // riêng (không có gì trên DB để UPDATE).
      return { kind: 'insert', log: applyExpensePatch(existing.log, incoming.patch) };
    }
    if (existing.kind === 'update') {
      // Gộp nhiều patch liên tiếp — field nào có mặt ở patch SAU thì đè, field vắng giữ patch cũ.
      return { kind: 'update', patch: { ...existing.patch, ...incoming.patch } };
    }
    // existing.kind === 'delete' — đã yêu cầu xoá, 1 update tới sau (race UI hiếm) không hồi sinh
    // item, giữ nguyên delete.
    return existing;
  }

  // incoming.kind === 'insert' — không nên xảy ra thực tế (id là UUID, LOG_CREATE không tái dùng id
  // đã có) — phòng thủ: ưu tiên bản mới nhất.
  return incoming;
}

/**
 * Tính descriptor (item nào, thao tác gì) từ 1 action Log — LUÔN gọi SAU khi đã chắc chắn
 * `action.payload.id` (với LOG_CREATE) đã được gắn cố định, và `nextSpace` là kết quả CHẠY THẬT
 * `logsReducer(currentSpace, action)` (không phải suy đoán). Trả mảng rỗng nếu action bị reducer từ
 * chối (vd LOG_CREATE với content rỗng sau trim — log không xuất hiện trong `nextSpace.logs`).
 *
 * Export để test độc lập.
 */
export function computeLogPersistDescriptors(
  action: LogAction,
  nextSpace: Space,
): { itemId: string; op: LogPendingOp }[] {
  switch (action.type) {
    case 'LOG_CREATE': {
      const id = action.payload.id;
      if (!id) return []; // phòng thủ — caller (handleLogActionForPersist) luôn phải gắn id trước
      const created = nextSpace.logs.find((l) => l.id === id);
      if (!created) return []; // reducer từ chối tạo (content rỗng sau trim)
      return [{ itemId: id, op: { kind: 'insert', log: created } }];
    }
    case 'LOG_DELETE':
      return [{ itemId: action.payload.id, op: { kind: 'delete' } }];
    case 'LOG_DELETE_MANY':
      return action.payload.ids.map((id) => ({ itemId: id, op: { kind: 'delete' as const } }));
    case 'LOG_PATCH_EXPENSE': {
      const { id, expenseDate, categoryOverride, excluded } = action.payload;
      return [{ itemId: id, op: { kind: 'update', patch: { expenseDate, categoryOverride, excluded } } }];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hàng đợi debounce theo itemId + thực thi (module-level, mirror
// `completeNotifyDebounce.ts` — KHÔNG dùng React ref vì itemPersist.ts không
// phải component, cần sống xuyên suốt lifetime của tab).
// ---------------------------------------------------------------------------

interface PendingEntry {
  scope: LogScope;
  spaceId: string;
  op: LogPendingOp;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingEntry>();
// Promise đang bay của lượt flush GẦN NHẤT cho 1 itemId — dùng để CHUỖI (chain) các lượt flush kế
// tiếp của CÙNG item, tránh 2 request cho cùng 1 item bay song song rồi về KHÔNG đúng thứ tự (vd
// INSERT bay chậm, UPDATE bay sau nhưng về server TRƯỚC -> UPDATE chạy trên hàng chưa tồn tại, bị
// mất im lặng). Không loại bỏ hoàn toàn rủi ro network-level reorder, nhưng đảm bảo app không tự bắn
// 2 request chồng lấp cho cùng 1 item.
const inFlight = new Map<string, Promise<void>>();
// itemId -> {scope, spaceId} cho MỌI item hiện "chưa ghi xong" — còn chờ debounce (có mặt trong
// `pending`) HOẶC network call đang bay/đang chuỗi qua `inFlight` (không còn trong `pending` vì
// `flushLogItem` xoá khỏi `pending` NGAY khi bắt đầu await, nhưng request thực tế có thể còn chưa
// xong). Dùng riêng map này (thay vì suy ra từ `pending`) vì `flushAllPendingLogPersist()` (gọi khi
// tab chuyển `hidden`) chuyển gần như toàn bộ `pending` sang trạng thái in-flight ngay lập tức — nếu
// chỉ check `pending`, đúng lúc tab quay lại `visible` (thời điểm cần guard nhất) sẽ luôn trả về
// "không pending" dù request vẫn còn bay. Dùng ở `hasPendingLogsForSpace()` (Giai đoạn B,
// `refreshStaleSpaces()` trong AppStateContext.tsx).
const activeSpaceRefs = new Map<string, { scope: LogScope; spaceId: string }>();

function setFallback(scope: LogScope, active: boolean): void {
  if (scope === 'private') setPrivateFallbackActive(active);
  else setSharedFallbackActive(active);
}

async function flushLogItem(itemId: string): Promise<void> {
  const entry = pending.get(itemId);
  if (!entry) return; // đã bị mergeLogPendingOp huỷ (vd insert+delete) hoặc đã flush bởi lượt khác
  pending.delete(itemId);
  const { scope, spaceId, op } = entry;
  try {
    if (op.kind === 'insert') {
      const result = await createLog({ scope, spaceId }, op.log);
      if (!result.ok) throw new Error(result.error ?? 'Không rõ lỗi');
    } else if (op.kind === 'update') {
      await updateLogExpense(scope, itemId, op.patch);
    } else {
      await deleteLog(scope, itemId);
    }
    setFallback(scope, false);
  } catch (err) {
    console.warn(`[KN-Space] itemPersist: lưu Log ${itemId} thất bại:`, err);
    setFallback(scope, true);
  }
}

/**
 * Xếp lượt flush của `itemId` nối tiếp sau lượt đang bay (nếu có) — xem giải thích `inFlight` ở
 * trên.
 *
 * BUG ĐÃ SỬA (phát hiện lúc thêm `hasPendingLogsForSpace()`, Giai đoạn B, 2026-07-11): bản gốc
 * lưu `inFlight.set(itemId, next.finally(cb))` (1 Promise MỚI, do `.finally()` luôn trả về 1
 * promise khác) nhưng `cb` lại so sánh `inFlight.get(itemId) === next` — so với `next` (promise
 * TRƯỚC khi bọc `.finally()`), không phải giá trị THẬT SỰ vừa lưu vào map -> điều kiện này luôn
 * `false`, `inFlight.delete(itemId)` không bao giờ chạy được. Trước đây vô hại vì không có ai đọc
 * `inFlight.has()` để quyết định gì (chaining vẫn hoạt động đúng vì `.then()` trên 1 promise đã
 * resolve chạy ngay lập tức dù entry cũ còn "mồ côi" trong map) — nhưng giờ `hasPendingLogsForSpace()`
 * phụ thuộc vào việc dọn đúng lúc, nếu không sẽ coi 1 Space là "còn Log pending" MÃI MÃI sau lần
 * ghi Log đầu tiên. Sửa bằng cách tự tham chiếu đúng promise đã lưu (`wrapped`) thay vì `next`.
 */
function scheduleFlush(itemId: string): void {
  const prior = inFlight.get(itemId) ?? Promise.resolve();
  const chained = prior.then(() => flushLogItem(itemId));
  const wrapped: Promise<void> = chained.finally(() => {
    if (inFlight.get(itemId) === wrapped) {
      inFlight.delete(itemId);
      // Chỉ xoá "đang bận" nếu KHÔNG có thao tác mới nào vừa được queue lại cho item này trong
      // lúc lượt flush này còn bay (pending còn entry -> vẫn đang chờ 1 lượt flush kế tiếp).
      if (!pending.has(itemId)) activeSpaceRefs.delete(itemId);
    }
  });
  inFlight.set(itemId, wrapped);
}

/** Đưa 1 thao tác vào hàng đợi debounce (600ms) của `itemId`, gộp với thao tác đang chờ (nếu có). */
function queueLogPersist(scope: LogScope, spaceId: string, itemId: string, op: LogPendingOp, debounceMs = 600): void {
  const existing = pending.get(itemId);
  if (existing) clearTimeout(existing.timer);

  const merged = mergeLogPendingOp(existing?.op, op);
  if (merged === null) {
    pending.delete(itemId);
    // Không còn gì cần gửi cho item này — trừ khi 1 lượt flush TRƯỚC ĐÓ của cùng item vẫn đang bay
    // (inFlight), vẫn cần giữ "đang bận" tới khi lượt đó xong hẳn (xem finally ở scheduleFlush).
    if (!inFlight.has(itemId)) activeSpaceRefs.delete(itemId);
    return;
  }

  const timer = setTimeout(() => scheduleFlush(itemId), debounceMs);
  pending.set(itemId, { scope, spaceId, op: merged, timer });
  activeSpaceRefs.set(itemId, { scope, spaceId });
}

/** `LOG_DELETE_MANY` — 1 network call cho N id (mục 4.3 tài liệu trên), KHÔNG qua debounce/hàng đợi
 * per-item (huỷ mọi pending riêng lẻ của các id liên quan trước, tránh 1 lượt insert/update cũ bay
 * ra SAU khi đã xoá hàng loạt). */
function queueLogDeleteMany(scope: LogScope, spaceId: string, itemIds: string[]): void {
  if (itemIds.length === 0) return;
  itemIds.forEach((id) => {
    const existing = pending.get(id);
    if (existing) {
      clearTimeout(existing.timer);
      pending.delete(id);
    }
    activeSpaceRefs.set(id, { scope, spaceId });
  });
  void (async () => {
    try {
      await deleteLogs(scope, itemIds);
      setFallback(scope, false);
    } catch (err) {
      console.warn('[KN-Space] itemPersist: xoá hàng loạt Log thất bại:', err);
      setFallback(scope, true);
    } finally {
      itemIds.forEach((id) => {
        if (!pending.has(id) && !inFlight.has(id)) activeSpaceRefs.delete(id);
      });
    }
  })();
}

/**
 * `true` nếu Space (`scope`+`spaceId`) hiện có ÍT NHẤT 1 Log "chưa ghi xong" (còn chờ debounce
 * HOẶC network call đang bay) — dùng ở `refreshStaleSpaces()` (Giai đoạn B, AppStateContext.tsx)
 * để KHÔNG gán đè `space.logs` bằng dữ liệu vừa tải lại từ bảng item-level cho Space này trong
 * lượt refresh hiện tại (server có thể chưa phản ánh kịp thao tác local vừa/đang lưu — đè lúc này
 * có thể làm "mất" tạm log vừa tạo/sửa/xoá khỏi UI cho tới lượt refresh kế tiếp). Luôn trả `false`
 * khi `LOG_ITEM_PERSIST_ENABLED === false` (không có gì được queue vào `activeSpaceRefs` khi đó).
 */
export function hasPendingLogsForSpace(scope: LogScope, spaceId: string): boolean {
  for (const ref of activeSpaceRefs.values()) {
    if (ref.scope === scope && ref.spaceId === spaceId) return true;
  }
  return false;
}

/**
 * Điểm gọi DUY NHẤT từ `AppStateContext.tsx` (`smartDispatch`) cho mọi action Log. Làm 3 việc:
 *   1. Nếu `LOG_CREATE` chưa có `payload.id` -> tự sinh, trả action đã gắn id để caller dùng làm
 *      `actionToDispatch` (đảm bảo id dùng để persist == id thật sự được tạo trong state).
 *   2. Chạy `logsReducer(currentSpace, action)` để biết CHÍNH XÁC kết quả (vd log có được tạo không).
 *   3. Tính descriptor + đẩy vào hàng đợi debounce theo itemId (no-op nếu `LOG_ITEM_PERSIST_ENABLED`
 *      còn `false`).
 *
 * Trả về action ĐÃ gắn id (dùng làm `actionToDispatch`) — KHÔNG dispatch thật ở đây, việc dispatch
 * vẫn do `AppStateContext.tsx` làm như cũ.
 */
export function handleLogActionForPersist(currentSpace: Space, action: LogAction): LogAction {
  let resolvedAction = action;
  if (resolvedAction.type === 'LOG_CREATE' && resolvedAction.payload.id === undefined) {
    resolvedAction = { ...resolvedAction, payload: { ...resolvedAction.payload, id: crypto.randomUUID() } };
  }

  if (!LOG_ITEM_PERSIST_ENABLED) return resolvedAction;

  const scope: LogScope = currentSpace.isShared && currentSpace.sharedSpaceId ? 'shared' : 'private';
  const spaceId = scope === 'shared' ? currentSpace.sharedSpaceId! : currentSpace.id;

  // Space cá nhân CHƯA từng lưu lên `kn_private_spaces` (vừa tạo cục bộ, `_privateVersion`
  // undefined) -> KHÔNG persist item-level ngay (FK `kn_private_logs.space_id` sẽ vi phạm vì hàng
  // cha chưa tồn tại trên DB). Bỏ qua an toàn — cột `logs` jsonb (đường cũ) vẫn lưu bình thường,
  // không mất dữ liệu; item-level sẽ persist đúng ở lần sửa KẾ TIẾP sau khi Space đã có hàng thật.
  if (scope === 'private' && currentSpace._privateVersion === undefined) return resolvedAction;

  const nextSpace = logsReducer(currentSpace, resolvedAction);
  if (resolvedAction.type === 'LOG_DELETE_MANY') {
    queueLogDeleteMany(scope, spaceId, resolvedAction.payload.ids);
    return resolvedAction;
  }

  const descriptors = computeLogPersistDescriptors(resolvedAction, nextSpace);
  descriptors.forEach(({ itemId, op }) => queueLogPersist(scope, spaceId, itemId, op));

  return resolvedAction;
}

/**
 * Flush ngay mọi thao tác Log đang chờ debounce (mirror `pendingPrivateSavesRef`/
 * `pendingSharedSavesRef` flush-on-hidden ở `AppStateContext.tsx`) — gọi khi tab chuyển `hidden`
 * (đóng tab/chuyển app trong cửa sổ debounce 600ms). No-op nếu không có gì đang chờ (luôn đúng khi
 * `LOG_ITEM_PERSIST_ENABLED === false`, vì `queueLogPersist`/`queueLogDeleteMany` không bao giờ được
 * gọi trong trường hợp đó).
 */
export function flushAllPendingLogPersist(): void {
  const ids = Array.from(pending.keys());
  ids.forEach((id) => {
    const entry = pending.get(id);
    if (entry) clearTimeout(entry.timer);
    scheduleFlush(id);
  });
}

// =============================================================================
// Habit (Bước 2, docs/features/item-level-entity-tables.md) — mirror CHÍNH XÁC
// cấu trúc Log ở trên (descriptor/merge/debounce theo itemId), chỉ khác:
//   - KHÔNG có `scope` — Habit chỉ tồn tại ở Space cá nhân (`kn_private_habits`,
//     không có bản Shared, xem `src/storage/habitStore.ts` header).
//   - KHÔNG có action dạng "xoá hàng loạt" (không có HABIT_DELETE_MANY).
//   - `HABIT_ITEM_PERSIST_ENABLED = true` (2026-07-11) — Giai đoạn A đã bật.
//     Bảng `kn_private_habits` đã tạo thật + dữ liệu cũ đã migrate xong
//     (`window.knMigrateHabits.run()`, User B sạch rồi User A thật, 3/3 khớp).
//     `handleHabitActionForPersist()` giờ dual-write THẬT vào `kn_private_habits`
//     song song với cột `habits` jsonb cũ. Giai đoạn B (2026-07-11, cùng ngày) đã
//     nối phần ĐỌC: `AppStateContext.tsx` (bootstrap + `refreshStaleSpaces()`) gọi
//     `loadPrivateHabits` (`habitStore.ts`) cho từng Space cá nhân rồi GÁN ĐÈ
//     `space.habits` — nguồn đọc THẬT của Thói quen giờ là bảng item-level, KHÔNG
//     còn là cột `habits` jsonb nữa (dù nhánh ghi jsonb VẪN CHẠY SONG SONG làm
//     lưới an toàn, chưa tắt). `hasPendingHabitsForSpace()` bên dưới là điểm nối
//     quan trọng nhất — mirror CHÍNH XÁC `hasPendingLogsForSpace()` ở phần Log.
// =============================================================================

export const HABIT_ITEM_PERSIST_ENABLED = true;

const HABIT_ACTION_TYPES = new Set(['HABIT_CREATE', 'HABIT_UPDATE', 'HABIT_DELETE', 'HABIT_TOGGLE_TODAY']);

/** Type guard — action có phải 1 trong 4 action CRUD của Habit không (dùng ở `smartDispatch`). */
export function isHabitAction(action: { type: string }): action is HabitAction {
  return HABIT_ACTION_TYPES.has(action.type);
}

type HabitPatch = { title?: string; completedDates?: string[] };

/** 1 thao tác đang chờ ghi cho 1 habit — tương đương "descriptor" mục 4.2 tài liệu trên. */
export type HabitPendingOp =
  | { kind: 'insert'; habit: Habit }
  | { kind: 'update'; patch: HabitPatch }
  | { kind: 'delete' };

/** Áp patch (title/completedDates) vào 1 `Habit` cục bộ (KHÔNG gọi DB) — dùng khi gộp 1 UPDATE tới
 * trong lúc 1 INSERT của CÙNG item còn đang chờ (item chưa từng lên server để có gì mà UPDATE). */
function applyHabitPatch(habit: Habit, patch: HabitPatch): Habit {
  const next: Habit = { ...habit };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.completedDates !== undefined) next.completedDates = patch.completedDates;
  return next;
}

/**
 * Gộp 1 thao tác MỚI vào thao tác ĐANG CHỜ (nếu có) của CÙNG 1 item, trong CÙNG cửa sổ debounce —
 * mirror CHÍNH XÁC `mergeLogPendingOp()` ở trên (cùng bộ quy tắc insert/update/delete).
 *
 * Export để test độc lập (`itemPersist.test.ts`).
 */
export function mergeHabitPendingOp(existing: HabitPendingOp | undefined, incoming: HabitPendingOp): HabitPendingOp | null {
  if (!existing) return incoming;

  if (incoming.kind === 'delete') {
    // Item CHƯA từng lên server (còn đang chờ insert) rồi bị xoá ngay trong lúc còn chờ -> không
    // cần làm gì cả (không insert rồi lại delete, tốn 1 lượt network vô ích).
    if (existing.kind === 'insert') return null;
    return incoming;
  }

  if (incoming.kind === 'update') {
    if (existing.kind === 'insert') {
      // Item chưa lên server -> merge patch THẲNG vào habit đang chờ insert, không tạo 1 UPDATE
      // riêng (không có gì trên DB để UPDATE).
      return { kind: 'insert', habit: applyHabitPatch(existing.habit, incoming.patch) };
    }
    if (existing.kind === 'update') {
      // Gộp nhiều patch liên tiếp — field nào có mặt ở patch SAU thì đè, field vắng giữ patch cũ.
      return { kind: 'update', patch: { ...existing.patch, ...incoming.patch } };
    }
    // existing.kind === 'delete' — đã yêu cầu xoá, 1 update tới sau (race UI hiếm) không hồi sinh
    // item, giữ nguyên delete.
    return existing;
  }

  // incoming.kind === 'insert' — không nên xảy ra thực tế (id là UUID, HABIT_CREATE không tái dùng
  // id đã có) — phòng thủ: ưu tiên bản mới nhất.
  return incoming;
}

/**
 * Tính descriptor (item nào, thao tác gì) từ 1 action Habit — LUÔN gọi SAU khi đã chắc chắn
 * `action.payload.id` (với HABIT_CREATE) đã được gắn cố định, và `nextSpace` là kết quả CHẠY THẬT
 * `habitsReducer(currentSpace, action)` (không phải suy đoán).
 *
 * Export để test độc lập.
 */
export function computeHabitPersistDescriptors(
  action: HabitAction,
  nextSpace: Space,
): { itemId: string; op: HabitPendingOp }[] {
  switch (action.type) {
    case 'HABIT_CREATE': {
      const id = action.payload.id;
      if (!id) return []; // phòng thủ — caller (handleHabitActionForPersist) luôn phải gắn id trước
      const created = nextSpace.habits.find((h) => h.id === id);
      if (!created) return []; // phòng thủ — reducer không có nhánh từ chối tạo hiện tại
      return [{ itemId: id, op: { kind: 'insert', habit: created } }];
    }
    case 'HABIT_UPDATE': {
      const updated = nextSpace.habits.find((h) => h.id === action.payload.id);
      if (!updated) return []; // habit đã bị xoá trước đó (race hiếm) — không còn gì để update
      return [{ itemId: action.payload.id, op: { kind: 'update', patch: { title: updated.title } } }];
    }
    case 'HABIT_DELETE':
      return [{ itemId: action.payload.id, op: { kind: 'delete' } }];
    case 'HABIT_TOGGLE_TODAY': {
      const updated = nextSpace.habits.find((h) => h.id === action.payload.id);
      if (!updated) return [];
      return [{ itemId: action.payload.id, op: { kind: 'update', patch: { completedDates: updated.completedDates } } }];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hàng đợi debounce theo itemId + thực thi — mirror CHÍNH XÁC cơ chế Log ở
// trên (`pending`/`inFlight`), chỉ khác không có `scope` (luôn private).
// ---------------------------------------------------------------------------

interface HabitPendingEntry {
  spaceId: string;
  op: HabitPendingOp;
  timer: ReturnType<typeof setTimeout>;
}

const habitPending = new Map<string, HabitPendingEntry>();
// Promise đang bay của lượt flush GẦN NHẤT cho 1 itemId — mirror `inFlight` ở phần Log (xem giải
// thích đầy đủ ở đó). Tự tham chiếu đúng promise đã lưu (`wrapped`) khi dọn map — KHÔNG lặp lại bug
// đã phát hiện + sửa ở `scheduleFlush()` (Log, Giai đoạn B): bản gốc so sánh nhầm với promise TRƯỚC
// khi bọc `.finally()`, khiến `inFlight.delete()` không bao giờ chạy.
const habitInFlight = new Map<string, Promise<void>>();
// itemId -> spaceId cho MỌI Habit hiện "chưa ghi xong" — mirror CHÍNH XÁC `activeSpaceRefs` ở phần
// Log (xem giải thích đầy đủ ở đó vì sao cần map riêng thay vì suy ra từ `habitPending`). Không có
// `scope` (Habit chỉ ở Space cá nhân). Dùng ở `hasPendingHabitsForSpace()` (Giai đoạn B,
// `refreshStaleSpaces()` trong AppStateContext.tsx).
const activeHabitSpaceRefs = new Map<string, string>();

function setHabitFallback(active: boolean): void {
  // Habit chỉ có ở Space cá nhân — không có nhánh shared để phân biệt.
  setPrivateFallbackActive(active);
}

async function flushHabitItem(itemId: string): Promise<void> {
  const entry = habitPending.get(itemId);
  if (!entry) return; // đã bị mergeHabitPendingOp huỷ (vd insert+delete) hoặc đã flush bởi lượt khác
  habitPending.delete(itemId);
  const { spaceId, op } = entry;
  try {
    if (op.kind === 'insert') {
      const result = await createHabit(spaceId, op.habit);
      if (!result.ok) throw new Error(result.error ?? 'Không rõ lỗi');
    } else if (op.kind === 'update') {
      await updateHabit(itemId, op.patch);
    } else {
      await deleteHabit(itemId);
    }
    setHabitFallback(false);
  } catch (err) {
    console.warn(`[KN-Space] itemPersist: lưu Habit ${itemId} thất bại:`, err);
    setHabitFallback(true);
  }
}

/** Xếp lượt flush của `itemId` nối tiếp sau lượt đang bay (nếu có) — xem giải thích `habitInFlight`
 * ở trên. */
function scheduleHabitFlush(itemId: string): void {
  const prior = habitInFlight.get(itemId) ?? Promise.resolve();
  const chained = prior.then(() => flushHabitItem(itemId));
  const wrapped: Promise<void> = chained.finally(() => {
    if (habitInFlight.get(itemId) === wrapped) {
      habitInFlight.delete(itemId);
      // Chỉ xoá "đang bận" nếu KHÔNG có thao tác mới nào vừa được queue lại cho item này trong
      // lúc lượt flush này còn bay (habitPending còn entry -> vẫn đang chờ 1 lượt flush kế tiếp).
      if (!habitPending.has(itemId)) activeHabitSpaceRefs.delete(itemId);
    }
  });
  habitInFlight.set(itemId, wrapped);
}

/** Đưa 1 thao tác vào hàng đợi debounce (600ms) của `itemId`, gộp với thao tác đang chờ (nếu có). */
function queueHabitPersist(spaceId: string, itemId: string, op: HabitPendingOp, debounceMs = 600): void {
  const existing = habitPending.get(itemId);
  if (existing) clearTimeout(existing.timer);

  const merged = mergeHabitPendingOp(existing?.op, op);
  if (merged === null) {
    habitPending.delete(itemId);
    // Không còn gì cần gửi cho item này — trừ khi 1 lượt flush TRƯỚC ĐÓ của cùng item vẫn đang bay
    // (habitInFlight), vẫn cần giữ "đang bận" tới khi lượt đó xong hẳn (xem finally ở
    // scheduleHabitFlush).
    if (!habitInFlight.has(itemId)) activeHabitSpaceRefs.delete(itemId);
    return;
  }

  const timer = setTimeout(() => scheduleHabitFlush(itemId), debounceMs);
  habitPending.set(itemId, { spaceId, op: merged, timer });
  activeHabitSpaceRefs.set(itemId, spaceId);
}

/**
 * `true` nếu Space cá nhân (`spaceId`) hiện có ÍT NHẤT 1 Habit "chưa ghi xong" (còn chờ debounce
 * HOẶC network call đang bay) — dùng ở `refreshStaleSpaces()` (Giai đoạn B, AppStateContext.tsx)
 * để KHÔNG gán đè `space.habits` bằng dữ liệu vừa tải lại từ bảng item-level cho Space này trong
 * lượt refresh hiện tại. Mirror CHÍNH XÁC `hasPendingLogsForSpace()` ở phần Log (không có `scope`).
 * Luôn trả `false` khi `HABIT_ITEM_PERSIST_ENABLED === false` (không có gì được queue vào
 * `activeHabitSpaceRefs` khi đó).
 */
export function hasPendingHabitsForSpace(spaceId: string): boolean {
  for (const sid of activeHabitSpaceRefs.values()) {
    if (sid === spaceId) return true;
  }
  return false;
}

/**
 * Điểm gọi DUY NHẤT từ `AppStateContext.tsx` (`smartDispatch`) cho mọi action Habit. Làm 3 việc
 * (mirror CHÍNH XÁC `handleLogActionForPersist()`):
 *   1. Nếu `HABIT_CREATE` chưa có `payload.id` -> tự sinh, trả action đã gắn id để caller dùng làm
 *      `actionToDispatch` (đảm bảo id dùng để persist == id thật sự được tạo trong state).
 *   2. Chạy `habitsReducer(currentSpace, action)` để biết CHÍNH XÁC kết quả.
 *   3. Tính descriptor + đẩy vào hàng đợi debounce theo itemId (no-op nếu
 *      `HABIT_ITEM_PERSIST_ENABLED` còn `false`).
 *
 * Trả về action ĐÃ gắn id (dùng làm `actionToDispatch`) — KHÔNG dispatch thật ở đây.
 */
export function handleHabitActionForPersist(currentSpace: Space, action: HabitAction): HabitAction {
  let resolvedAction = action;
  if (resolvedAction.type === 'HABIT_CREATE' && resolvedAction.payload.id === undefined) {
    resolvedAction = { ...resolvedAction, payload: { ...resolvedAction.payload, id: crypto.randomUUID() } };
  }

  if (!HABIT_ITEM_PERSIST_ENABLED) return resolvedAction;

  // Habit KHÔNG tồn tại ở Shared Space (không có bảng kn_shared_habits, UI ẩn hoàn toàn, xem header
  // file) — bỏ qua an toàn nếu vì lý do nào đó action Habit vẫn dispatch khi đang ở Shared Space.
  if (currentSpace.isShared) return resolvedAction;

  // Space cá nhân CHƯA từng lưu lên `kn_private_spaces` (vừa tạo cục bộ, `_privateVersion`
  // undefined) -> KHÔNG persist item-level ngay (FK `kn_private_habits.space_id` sẽ vi phạm vì
  // hàng cha chưa tồn tại trên DB). Bỏ qua an toàn — cột `habits` jsonb (đường cũ) vẫn lưu bình
  // thường, không mất dữ liệu; item-level sẽ persist đúng ở lần sửa KẾ TIẾP.
  if (currentSpace._privateVersion === undefined) return resolvedAction;

  const nextSpace = habitsReducer(currentSpace, resolvedAction);
  const descriptors = computeHabitPersistDescriptors(resolvedAction, nextSpace);
  descriptors.forEach(({ itemId, op }) => queueHabitPersist(currentSpace.id, itemId, op));

  return resolvedAction;
}

/**
 * Flush ngay mọi thao tác Habit đang chờ debounce (mirror `flushAllPendingLogPersist()` ở trên) —
 * gọi khi tab chuyển `hidden`. No-op nếu không có gì đang chờ (luôn đúng khi
 * `HABIT_ITEM_PERSIST_ENABLED === false`).
 */
export function flushAllPendingHabitPersist(): void {
  const ids = Array.from(habitPending.keys());
  ids.forEach((id) => {
    const entry = habitPending.get(id);
    if (entry) clearTimeout(entry.timer);
    scheduleHabitFlush(id);
  });
}

// =============================================================================
// Reminder (Bước 3, docs/features/item-level-entity-tables.md) — mirror CHÍNH
// XÁC cấu trúc Log ở đầu file (descriptor/merge/debounce theo itemId, CÓ
// `scope` — khác Habit), chỉ khác:
//   - `REMINDER_UPDATE` thay NGUYÊN item (không phải patch hẹp từng field như
//     `LOG_PATCH_EXPENSE`/`HABIT_UPDATE`) — `ReminderFormModal.tsx` cho phép
//     đổi cả `type` (once <-> recurring) khi sửa, nên op 'update' mang theo cả
//     `ReminderDefinition` mới, không phải object patch hẹp.
//   - KHÔNG có action "xoá hàng loạt" (không có REMINDER_DELETE_MANY).
//   - Bảng `kn_private_reminders`/`kn_shared_reminders` (docs/features/
//     item-level-reminder-schema.sql) đã tạo thật trên Supabase, dữ liệu cũ đã
//     migrate xong (`window.knMigrateReminders.run()`, 2/2 khớp, idempotent).
//     Cờ đang BẬT (`true`) — mọi action `REMINDER_*` GHI SONG SONG (dual-write)
//     vào bảng mới. "Giai đoạn B" (2026-07-11) đã nối phần ĐỌC:
//     `AppStateContext.tsx` (bootstrap + `refreshStaleSpaces()`) gọi
//     `loadPrivateReminders`/`loadSharedReminders` (`reminderStore.ts`) cho
//     từng Space rồi GÁN ĐÈ `space.reminders` — nguồn đọc THẬT của Nhắc việc
//     giờ là bảng item-level, KHÔNG còn là cột `reminders` jsonb nữa (dù nhánh
//     ghi jsonb VẪN CHẠY SONG SONG làm lưới an toàn, chưa tắt).
//   - `hasPendingRemindersForSpace()` (viết sẵn từ Bước 3, mirror bài học rút
//     ra từ Habit) giờ là điểm nối quan trọng nhất: cho `refreshStaleSpaces()`
//     biết Space nào đang có Reminder "chưa ghi xong" để KHÔNG gán đè
//     `space.reminders` cho Space đó trong lượt refresh hiện tại.
// =============================================================================

export const REMINDER_ITEM_PERSIST_ENABLED = true;

const REMINDER_ACTION_TYPES = new Set(['REMINDER_CREATE', 'REMINDER_UPDATE', 'REMINDER_DELETE']);

/** Type guard — action có phải 1 trong 3 action CRUD của Reminder không (dùng ở `smartDispatch`). */
export function isReminderAction(action: { type: string }): action is ReminderAction {
  return REMINDER_ACTION_TYPES.has(action.type);
}

/** 1 thao tác đang chờ ghi cho 1 reminder — tương đương "descriptor" mục 4.2 tài liệu trên. Khác
 * `LogPendingOp`/`HabitPendingOp`: `update` mang theo TOÀN BỘ `ReminderDefinition` mới (không phải
 * patch hẹp) vì `REMINDER_UPDATE` luôn thay nguyên item — xem giải thích ở đầu block này. */
export type ReminderPendingOp =
  | { kind: 'insert'; reminder: ReminderDefinition }
  | { kind: 'update'; reminder: ReminderDefinition }
  | { kind: 'delete' };

/**
 * Gộp 1 thao tác MỚI vào thao tác ĐANG CHỜ (nếu có) của CÙNG 1 item, trong CÙNG cửa sổ debounce —
 * tránh gửi 2 request khi user sửa liên tiếp rất nhanh. Đơn giản hơn `mergeLogPendingOp`/
 * `mergeHabitPendingOp` vì `update`/`insert` ở đây LUÔN mang theo bản `ReminderDefinition` ĐẦY ĐỦ đã
 * được `remindersReducer` tính đúng (giữ nguyên/làm mới `createdAt` theo đúng logic chu kỳ) — không
 * cần áp patch từng field, chỉ cần lấy bản mới nhất.
 *
 * Export để test độc lập (`itemPersist.test.ts`).
 */
export function mergeReminderPendingOp(
  existing: ReminderPendingOp | undefined,
  incoming: ReminderPendingOp,
): ReminderPendingOp | null {
  if (!existing) return incoming;

  if (incoming.kind === 'delete') {
    // Item CHƯA từng lên server (còn đang chờ insert) rồi bị xoá ngay trong lúc còn chờ -> không
    // cần làm gì cả (không insert rồi lại delete, tốn 1 lượt network vô ích).
    if (existing.kind === 'insert') return null;
    return incoming;
  }

  // incoming.kind === 'insert' | 'update' — cả 2 đều mang theo TOÀN BỘ ReminderDefinition mới nhất.
  if (existing.kind === 'delete') {
    // Đã yêu cầu xoá — 1 insert/update tới sau (race UI hiếm) không hồi sinh item.
    return existing;
  }
  if (existing.kind === 'insert') {
    // Item chưa lên server -> vẫn là 1 lượt insert, chỉ đổi nội dung sang bản mới nhất.
    return { kind: 'insert', reminder: incoming.reminder };
  }
  // existing.kind === 'update' -> đổi nội dung sang bản mới nhất, vẫn là update.
  return { kind: 'update', reminder: incoming.reminder };
}

/**
 * Tính descriptor (item nào, thao tác gì) từ 1 action Reminder — LUÔN gọi SAU khi đã chắc chắn
 * `action.payload.id` (với REMINDER_CREATE) đã được gắn cố định, và `nextSpace` là kết quả CHẠY THẬT
 * `remindersReducer(currentSpace, action)` (không phải suy đoán).
 *
 * Export để test độc lập.
 */
export function computeReminderPersistDescriptors(
  action: ReminderAction,
  nextSpace: Space,
): { itemId: string; op: ReminderPendingOp }[] {
  switch (action.type) {
    case 'REMINDER_CREATE': {
      const id = action.payload.id;
      if (!id) return []; // phòng thủ — caller (handleReminderActionForPersist) luôn phải gắn id trước
      const created = nextSpace.reminders.find((r) => r.id === id);
      if (!created) return []; // phòng thủ — buildReminder hiện không có nhánh từ chối tạo
      return [{ itemId: id, op: { kind: 'insert', reminder: created } }];
    }
    case 'REMINDER_UPDATE': {
      const updated = nextSpace.reminders.find((r) => r.id === action.payload.id);
      if (!updated) return []; // reminder đã bị xoá trước đó (race hiếm) — không còn gì để update
      return [{ itemId: action.payload.id, op: { kind: 'update', reminder: updated } }];
    }
    case 'REMINDER_DELETE':
      return [{ itemId: action.payload.id, op: { kind: 'delete' } }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hàng đợi debounce theo itemId + thực thi — mirror CHÍNH XÁC cơ chế Log ở
// đầu file (`pending`/`inFlight`, CÓ `scope`), đặt tên riêng để không đụng
// tên module-level của Log/Habit.
// ---------------------------------------------------------------------------

interface ReminderPendingEntry {
  scope: ReminderScope;
  spaceId: string;
  op: ReminderPendingOp;
  timer: ReturnType<typeof setTimeout>;
}

const reminderPending = new Map<string, ReminderPendingEntry>();
// Promise đang bay của lượt flush GẦN NHẤT cho 1 itemId — mirror `inFlight` ở phần Log (xem giải
// thích đầy đủ ở đó). Tự tham chiếu đúng promise đã lưu (`wrapped`) khi dọn map — KHÔNG lặp lại bug
// đã phát hiện + sửa ở `scheduleFlush()` (Log, Giai đoạn B).
const reminderInFlight = new Map<string, Promise<void>>();
// itemId -> {scope, spaceId} cho MỌI Reminder hiện "chưa ghi xong" — mirror CHÍNH XÁC
// `activeSpaceRefs` ở phần Log. Dùng ở `hasPendingRemindersForSpace()` (Giai đoạn B, chưa nối ở lượt
// này, viết sẵn để không phải sửa lại `scheduleReminderFlush()` sau).
const activeReminderSpaceRefs = new Map<string, { scope: ReminderScope; spaceId: string }>();

function setReminderFallback(scope: ReminderScope, active: boolean): void {
  if (scope === 'private') setPrivateFallbackActive(active);
  else setSharedFallbackActive(active);
}

async function flushReminderItem(itemId: string): Promise<void> {
  const entry = reminderPending.get(itemId);
  if (!entry) return; // đã bị mergeReminderPendingOp huỷ (vd insert+delete) hoặc đã flush bởi lượt khác
  reminderPending.delete(itemId);
  const { scope, spaceId, op } = entry;
  try {
    if (op.kind === 'insert') {
      const result = await createReminder({ scope, spaceId }, op.reminder);
      if (!result.ok) throw new Error(result.error ?? 'Không rõ lỗi');
    } else if (op.kind === 'update') {
      await updateReminder(scope, itemId, op.reminder);
    } else {
      await deleteReminder(scope, itemId);
    }
    setReminderFallback(scope, false);
  } catch (err) {
    console.warn(`[KN-Space] itemPersist: lưu Reminder ${itemId} thất bại:`, err);
    setReminderFallback(scope, true);
  }
}

/** Xếp lượt flush của `itemId` nối tiếp sau lượt đang bay (nếu có) — mirror CHÍNH XÁC
 * `scheduleFlush()` ở phần Log (đã áp dụng fix bug `inFlight` ngay từ đầu, không lặp lại lỗi so
 * sánh nhầm biến `next`). */
function scheduleReminderFlush(itemId: string): void {
  const prior = reminderInFlight.get(itemId) ?? Promise.resolve();
  const chained = prior.then(() => flushReminderItem(itemId));
  const wrapped: Promise<void> = chained.finally(() => {
    if (reminderInFlight.get(itemId) === wrapped) {
      reminderInFlight.delete(itemId);
      if (!reminderPending.has(itemId)) activeReminderSpaceRefs.delete(itemId);
    }
  });
  reminderInFlight.set(itemId, wrapped);
}

/** Đưa 1 thao tác vào hàng đợi debounce (600ms) của `itemId`, gộp với thao tác đang chờ (nếu có). */
function queueReminderPersist(scope: ReminderScope, spaceId: string, itemId: string, op: ReminderPendingOp, debounceMs = 600): void {
  const existing = reminderPending.get(itemId);
  if (existing) clearTimeout(existing.timer);

  const merged = mergeReminderPendingOp(existing?.op, op);
  if (merged === null) {
    reminderPending.delete(itemId);
    if (!reminderInFlight.has(itemId)) activeReminderSpaceRefs.delete(itemId);
    return;
  }

  const timer = setTimeout(() => scheduleReminderFlush(itemId), debounceMs);
  reminderPending.set(itemId, { scope, spaceId, op: merged, timer });
  activeReminderSpaceRefs.set(itemId, { scope, spaceId });
}

/**
 * `true` nếu Space (`scope`+`spaceId`) hiện có ÍT NHẤT 1 Reminder "chưa ghi xong" (còn chờ debounce
 * HOẶC network call đang bay) — dùng ở `refreshStaleSpaces()` (Giai đoạn B, AppStateContext.tsx) để
 * KHÔNG gán đè `space.reminders` bằng dữ liệu vừa tải lại từ bảng item-level cho Space này trong lượt
 * refresh hiện tại. Mirror CHÍNH XÁC `hasPendingLogsForSpace()`.
 */
export function hasPendingRemindersForSpace(scope: ReminderScope, spaceId: string): boolean {
  for (const ref of activeReminderSpaceRefs.values()) {
    if (ref.scope === scope && ref.spaceId === spaceId) return true;
  }
  return false;
}

/**
 * Điểm gọi DUY NHẤT từ `AppStateContext.tsx` (`smartDispatch`) cho mọi action Reminder. Làm 3 việc
 * (mirror CHÍNH XÁC `handleLogActionForPersist()`):
 *   1. Nếu `REMINDER_CREATE` chưa có `payload.id` -> tự sinh, trả action đã gắn id để caller dùng
 *      làm `actionToDispatch`.
 *   2. Chạy `remindersReducer(currentSpace, action)` để biết CHÍNH XÁC kết quả.
 *   3. Tính descriptor + đẩy vào hàng đợi debounce theo itemId (no-op nếu
 *      `REMINDER_ITEM_PERSIST_ENABLED` còn `false`).
 *
 * Trả về action ĐÃ gắn id (dùng làm `actionToDispatch`) — KHÔNG dispatch thật ở đây.
 */
export function handleReminderActionForPersist(currentSpace: Space, action: ReminderAction): ReminderAction {
  let resolvedAction = action;
  if (resolvedAction.type === 'REMINDER_CREATE' && resolvedAction.payload.id === undefined) {
    resolvedAction = { ...resolvedAction, payload: { ...resolvedAction.payload, id: crypto.randomUUID() } };
  }

  if (!REMINDER_ITEM_PERSIST_ENABLED) return resolvedAction;

  const scope: ReminderScope = currentSpace.isShared && currentSpace.sharedSpaceId ? 'shared' : 'private';
  const spaceId = scope === 'shared' ? currentSpace.sharedSpaceId! : currentSpace.id;

  // Space cá nhân CHƯA từng lưu lên `kn_private_spaces` (vừa tạo cục bộ, `_privateVersion`
  // undefined) -> KHÔNG persist item-level ngay (FK `kn_private_reminders.space_id` sẽ vi phạm vì
  // hàng cha chưa tồn tại trên DB). Bỏ qua an toàn — cột `reminders` jsonb (đường cũ) vẫn lưu bình
  // thường, không mất dữ liệu; item-level sẽ persist đúng ở lần sửa KẾ TIẾP.
  if (scope === 'private' && currentSpace._privateVersion === undefined) return resolvedAction;

  const nextSpace = remindersReducer(currentSpace, resolvedAction);
  const descriptors = computeReminderPersistDescriptors(resolvedAction, nextSpace);
  descriptors.forEach(({ itemId, op }) => queueReminderPersist(scope, spaceId, itemId, op));

  return resolvedAction;
}

/**
 * Flush ngay mọi thao tác Reminder đang chờ debounce (mirror `flushAllPendingLogPersist()` ở trên) —
 * gọi khi tab chuyển `hidden`. No-op nếu không có gì đang chờ (luôn đúng khi
 * `REMINDER_ITEM_PERSIST_ENABLED === false`).
 */
export function flushAllPendingReminderPersist(): void {
  const ids = Array.from(reminderPending.keys());
  ids.forEach((id) => {
    const entry = reminderPending.get(id);
    if (entry) clearTimeout(entry.timer);
    scheduleReminderFlush(id);
  });
}

// =============================================================================
// Task (Bước 4, docs/features/item-level-entity-tables.md) — mirror CHÍNH XÁC
// cấu trúc Log/Reminder ở trên (descriptor/merge/debounce theo itemId, CÓ
// `scope` — Task CÓ bản Shared), chỉ khác:
//   - 3 action UPDATE TÁCH BIỆT (`TASK_UPDATE`/`TASK_TOGGLE_DONE`/
//     `TASK_REORDER`), mỗi action patch 1 nhóm field HẸP — mirror cách Habit
//     dùng patch hẹp (`HABIT_UPDATE`: title, `HABIT_TOGGLE_TODAY`:
//     completedDates), KHÔNG mirror cách Reminder thay NGUYÊN item (Task
//     không có action nào đổi "hình dạng" toàn bộ item như đổi type Reminder
//     once<->recurring).
//   - `TASK_REORDER` dùng fractional-index (`src/state/fractionalOrder.ts`,
//     đã tích hợp vào `state/reducers/tasks.ts` — xem `computeOrderForInsertAt`)
//     — chỉ patch field `order` của ĐÚNG 1 task vừa kéo, task khác giữ nguyên.
//   - `TASK_ITEM_PERSIST_ENABLED = false` — bảng `kn_private_tasks`/
//     `kn_shared_tasks` (docs/features/item-level-task-schema.sql) CHỈ MỚI
//     CHUẨN BỊ SQL trong repo, CHƯA chạy lên Supabase Dashboard thật, CHƯA có
//     dữ liệu migrate. `handleTaskActionForPersist()` khi cờ tắt CHỈ tự sinh
//     `id` cho `TASK_CREATE` nếu thiếu (mirror `LOG_CREATE`/`HABIT_CREATE`/
//     `REMINDER_CREATE`), KHÔNG gọi bất kỳ hàm nào trong `taskStore.ts`.
//   - Đã viết sẵn `hasPendingTasksForSpace()`/`activeTaskSpaceRefs` NGAY TỪ
//     ĐẦU dù chưa có Giai đoạn B để dùng tới ở lượt này (mirror bài học đã áp
//     dụng cho Habit/Reminder — tránh phải quay lại sửa
//     `scheduleTaskFlush()` sau). Đã áp dụng luôn fix bug `inFlight` phát
//     hiện ở Giai đoạn B của Log (tự tham chiếu đúng promise `wrapped` khi
//     dọn map, không so sánh nhầm biến `next`).
//   - **Lưu ý bắt buộc khi gọi từ `AppStateContext.tsx`:** truyền
//     `actionToDispatch` (không phải `action` gốc) — xem giải thích đầy đủ ở
//     đầu file.
// =============================================================================

export const TASK_ITEM_PERSIST_ENABLED = false;

const TASK_ACTION_TYPES = new Set([
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'TASK_TOGGLE_DONE',
  'TASK_REORDER',
]);

/** Type guard — action có phải 1 trong 5 action CRUD của Task không (dùng ở `smartDispatch`). */
export function isTaskAction(action: { type: string }): action is TaskAction {
  return TASK_ACTION_TYPES.has(action.type);
}

/** Patch hẹp — mỗi action UPDATE của Task chỉ set 1 nhóm field con (xem giải thích ở đầu block). */
type TaskPatch = {
  title?: string;
  content?: string;
  date?: string;
  time?: string;
  assigneeIds?: string[];
  done?: boolean;
  order?: number;
};

/** 1 thao tác đang chờ ghi cho 1 task — tương đương "descriptor" mục 4.2 tài liệu trên. */
export type TaskPendingOp =
  | { kind: 'insert'; task: Task }
  | { kind: 'update'; patch: TaskPatch }
  | { kind: 'delete' };

/** Áp patch vào 1 `Task` cục bộ (KHÔNG gọi DB) — dùng khi gộp 1 UPDATE tới trong lúc 1 INSERT của
 * CÙNG item còn đang chờ (item chưa từng lên server để có gì mà UPDATE). */
function applyTaskPatch(task: Task, patch: TaskPatch): Task {
  const next: Task = { ...task };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.content !== undefined) next.content = patch.content;
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.time !== undefined) next.time = patch.time;
  if (patch.assigneeIds !== undefined) next.assigneeIds = patch.assigneeIds;
  if (patch.done !== undefined) next.done = patch.done;
  if (patch.order !== undefined) next.order = patch.order;
  return next;
}

/**
 * Gộp 1 thao tác MỚI vào thao tác ĐANG CHỜ (nếu có) của CÙNG 1 item, trong CÙNG cửa sổ debounce —
 * mirror CHÍNH XÁC `mergeLogPendingOp()`/`mergeHabitPendingOp()` ở trên (cùng bộ quy tắc
 * insert/update/delete).
 *
 * Export để test độc lập (`itemPersist.test.ts`).
 */
export function mergeTaskPendingOp(existing: TaskPendingOp | undefined, incoming: TaskPendingOp): TaskPendingOp | null {
  if (!existing) return incoming;

  if (incoming.kind === 'delete') {
    // Item CHƯA từng lên server (còn đang chờ insert) rồi bị xoá ngay trong lúc còn chờ -> không
    // cần làm gì cả (không insert rồi lại delete, tốn 1 lượt network vô ích).
    if (existing.kind === 'insert') return null;
    return incoming;
  }

  if (incoming.kind === 'update') {
    if (existing.kind === 'insert') {
      // Item chưa lên server -> merge patch THẲNG vào task đang chờ insert, không tạo 1 UPDATE
      // riêng (không có gì trên DB để UPDATE).
      return { kind: 'insert', task: applyTaskPatch(existing.task, incoming.patch) };
    }
    if (existing.kind === 'update') {
      // Gộp nhiều patch liên tiếp — field nào có mặt ở patch SAU thì đè, field vắng giữ patch cũ.
      return { kind: 'update', patch: { ...existing.patch, ...incoming.patch } };
    }
    // existing.kind === 'delete' — đã yêu cầu xoá, 1 update tới sau (race UI hiếm) không hồi sinh
    // item, giữ nguyên delete.
    return existing;
  }

  // incoming.kind === 'insert' — không nên xảy ra thực tế (id là UUID, TASK_CREATE không tái dùng
  // id đã có) — phòng thủ: ưu tiên bản mới nhất.
  return incoming;
}

/**
 * Tính descriptor (item nào, thao tác gì) từ 1 action Task — LUÔN gọi SAU khi đã chắc chắn
 * `action.payload.id` (với TASK_CREATE) đã được gắn cố định, và `nextSpace` là kết quả CHẠY THẬT
 * `tasksReducer(currentSpace, action)` (không phải suy đoán). LUÔN lấy giá trị field từ `nextSpace`
 * (không phải trực tiếp từ `action.payload`) — vd `TASK_UPDATE` có thể bị `tasksReducer` trim/fallback
 * `title` rỗng thành 'Việc chưa đặt tên', dùng thẳng payload sẽ lệch với dữ liệu thật trong state.
 *
 * Export để test độc lập.
 */
export function computeTaskPersistDescriptors(
  action: TaskAction,
  nextSpace: Space,
): { itemId: string; op: TaskPendingOp }[] {
  switch (action.type) {
    case 'TASK_CREATE': {
      const id = action.payload.id;
      if (!id) return []; // phòng thủ — caller (handleTaskActionForPersist) luôn phải gắn id trước
      const created = nextSpace.tasks.find((t) => t.id === id);
      if (!created) return []; // phòng thủ — reducer không có nhánh từ chối tạo hiện tại
      return [{ itemId: id, op: { kind: 'insert', task: created } }];
    }
    case 'TASK_UPDATE': {
      const updated = nextSpace.tasks.find((t) => t.id === action.payload.id);
      if (!updated) return []; // task đã bị xoá trước đó (race hiếm) — không còn gì để update
      const { title, content, date, time, assigneeIds } = updated;
      return [{ itemId: action.payload.id, op: { kind: 'update', patch: { title, content, date, time, assigneeIds } } }];
    }
    case 'TASK_TOGGLE_DONE': {
      const updated = nextSpace.tasks.find((t) => t.id === action.payload.id);
      if (!updated) return [];
      return [{ itemId: action.payload.id, op: { kind: 'update', patch: { done: updated.done } } }];
    }
    case 'TASK_DELETE':
      return [{ itemId: action.payload.id, op: { kind: 'delete' } }];
    case 'TASK_REORDER': {
      const updated = nextSpace.tasks.find((t) => t.id === action.payload.draggedId);
      if (!updated) return []; // draggedId/targetId không hợp lệ -> reducer trả nguyên space, không đổi gì
      return [{ itemId: action.payload.draggedId, op: { kind: 'update', patch: { order: updated.order } } }];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hàng đợi debounce theo itemId + thực thi — mirror CHÍNH XÁC cơ chế Log/Reminder ở trên
// (`pending`/`inFlight`, CÓ `scope`), đặt tên riêng để không đụng tên module-level của Log/Habit/
// Reminder.
// ---------------------------------------------------------------------------

interface TaskPendingEntry {
  scope: TaskScope;
  spaceId: string;
  op: TaskPendingOp;
  timer: ReturnType<typeof setTimeout>;
}

const taskPending = new Map<string, TaskPendingEntry>();
// Promise đang bay của lượt flush GẦN NHẤT cho 1 itemId — mirror `inFlight` ở phần Log (xem giải
// thích đầy đủ ở đó). Tự tham chiếu đúng promise đã lưu (`wrapped`) khi dọn map — KHÔNG lặp lại bug
// đã phát hiện + sửa ở `scheduleFlush()` (Log, Giai đoạn B).
const taskInFlight = new Map<string, Promise<void>>();
// itemId -> {scope, spaceId} cho MỌI Task hiện "chưa ghi xong" — mirror CHÍNH XÁC `activeSpaceRefs`
// ở phần Log. Dùng ở `hasPendingTasksForSpace()` (Giai đoạn B, chưa nối ở lượt này, viết sẵn để
// không phải sửa lại `scheduleTaskFlush()` sau — mirror bài học đã áp dụng cho Habit/Reminder).
const activeTaskSpaceRefs = new Map<string, { scope: TaskScope; spaceId: string }>();

function setTaskFallback(scope: TaskScope, active: boolean): void {
  if (scope === 'private') setPrivateFallbackActive(active);
  else setSharedFallbackActive(active);
}

async function flushTaskItem(itemId: string): Promise<void> {
  const entry = taskPending.get(itemId);
  if (!entry) return; // đã bị mergeTaskPendingOp huỷ (vd insert+delete) hoặc đã flush bởi lượt khác
  taskPending.delete(itemId);
  const { scope, spaceId, op } = entry;
  try {
    if (op.kind === 'insert') {
      const result = await createTask({ scope, spaceId }, op.task);
      if (!result.ok) throw new Error(result.error ?? 'Không rõ lỗi');
    } else if (op.kind === 'update') {
      await updateTask(scope, itemId, op.patch);
    } else {
      await deleteTask(scope, itemId);
    }
    setTaskFallback(scope, false);
  } catch (err) {
    console.warn(`[KN-Space] itemPersist: lưu Task ${itemId} thất bại:`, err);
    setTaskFallback(scope, true);
  }
}

/** Xếp lượt flush của `itemId` nối tiếp sau lượt đang bay (nếu có) — mirror CHÍNH XÁC
 * `scheduleFlush()` ở phần Log (đã áp dụng fix bug `inFlight` ngay từ đầu, không lặp lại lỗi so
 * sánh nhầm biến `next`). */
function scheduleTaskFlush(itemId: string): void {
  const prior = taskInFlight.get(itemId) ?? Promise.resolve();
  const chained = prior.then(() => flushTaskItem(itemId));
  const wrapped: Promise<void> = chained.finally(() => {
    if (taskInFlight.get(itemId) === wrapped) {
      taskInFlight.delete(itemId);
      if (!taskPending.has(itemId)) activeTaskSpaceRefs.delete(itemId);
    }
  });
  taskInFlight.set(itemId, wrapped);
}

/** Đưa 1 thao tác vào hàng đợi debounce (600ms) của `itemId`, gộp với thao tác đang chờ (nếu có). */
function queueTaskPersist(scope: TaskScope, spaceId: string, itemId: string, op: TaskPendingOp, debounceMs = 600): void {
  const existing = taskPending.get(itemId);
  if (existing) clearTimeout(existing.timer);

  const merged = mergeTaskPendingOp(existing?.op, op);
  if (merged === null) {
    taskPending.delete(itemId);
    if (!taskInFlight.has(itemId)) activeTaskSpaceRefs.delete(itemId);
    return;
  }

  const timer = setTimeout(() => scheduleTaskFlush(itemId), debounceMs);
  taskPending.set(itemId, { scope, spaceId, op: merged, timer });
  activeTaskSpaceRefs.set(itemId, { scope, spaceId });
}

/**
 * `true` nếu Space (`scope`+`spaceId`) hiện có ÍT NHẤT 1 Task "chưa ghi xong" (còn chờ debounce
 * HOẶC network call đang bay) — dùng ở `refreshStaleSpaces()` (Giai đoạn B, chưa nối ở lượt này) để
 * KHÔNG gán đè `space.tasks` bằng dữ liệu vừa tải lại từ bảng item-level cho Space này trong lượt
 * refresh hiện tại. Mirror CHÍNH XÁC `hasPendingLogsForSpace()`/`hasPendingRemindersForSpace()`.
 * Luôn trả `false` khi `TASK_ITEM_PERSIST_ENABLED === false` (không có gì được queue vào
 * `activeTaskSpaceRefs` khi đó).
 */
export function hasPendingTasksForSpace(scope: TaskScope, spaceId: string): boolean {
  for (const ref of activeTaskSpaceRefs.values()) {
    if (ref.scope === scope && ref.spaceId === spaceId) return true;
  }
  return false;
}

/**
 * Điểm gọi DUY NHẤT từ `AppStateContext.tsx` (`smartDispatch`) cho mọi action Task. Làm 3 việc
 * (mirror CHÍNH XÁC `handleLogActionForPersist()`/`handleReminderActionForPersist()`):
 *   1. Nếu `TASK_CREATE` chưa có `payload.id` -> tự sinh, trả action đã gắn id để caller dùng làm
 *      `actionToDispatch` (đảm bảo id dùng để persist == id thật sự được tạo trong state). Ở
 *      Shared Space, khối notify (chạy TRƯỚC trong `smartDispatch`) có thể ĐÃ gắn sẵn id — nhánh
 *      này khi đó là no-op (payload.id đã defined).
 *   2. Chạy `tasksReducer(currentSpace, action)` để biết CHÍNH XÁC kết quả.
 *   3. Tính descriptor + đẩy vào hàng đợi debounce theo itemId (no-op nếu
 *      `TASK_ITEM_PERSIST_ENABLED` còn `false`).
 *
 * Trả về action ĐÃ gắn id (dùng làm `actionToDispatch`) — KHÔNG dispatch thật ở đây.
 *
 * **QUAN TRỌNG:** caller (`AppStateContext.tsx`) PHẢI truyền `actionToDispatch` (state hiện tại của
 * biến đó tại điểm gọi, có thể đã được khối notify Shared Space gắn id) làm tham số `action`, KHÔNG
 * phải `action` gốc nhận từ `dispatch()` — xem giải thích đầy đủ ở đầu block Task trong file này.
 */
export function handleTaskActionForPersist(currentSpace: Space, action: TaskAction): TaskAction {
  let resolvedAction = action;
  if (resolvedAction.type === 'TASK_CREATE' && resolvedAction.payload.id === undefined) {
    resolvedAction = { ...resolvedAction, payload: { ...resolvedAction.payload, id: crypto.randomUUID() } };
  }

  if (!TASK_ITEM_PERSIST_ENABLED) return resolvedAction;

  const scope: TaskScope = currentSpace.isShared && currentSpace.sharedSpaceId ? 'shared' : 'private';
  const spaceId = scope === 'shared' ? currentSpace.sharedSpaceId! : currentSpace.id;

  // Space cá nhân CHƯA từng lưu lên `kn_private_spaces` (vừa tạo cục bộ, `_privateVersion`
  // undefined) -> KHÔNG persist item-level ngay (FK `kn_private_tasks.space_id` sẽ vi phạm vì hàng
  // cha chưa tồn tại trên DB). Bỏ qua an toàn — cột `tasks` jsonb (đường cũ) vẫn lưu bình thường,
  // không mất dữ liệu; item-level sẽ persist đúng ở lần sửa KẾ TIẾP.
  if (scope === 'private' && currentSpace._privateVersion === undefined) return resolvedAction;

  const nextSpace = tasksReducer(currentSpace, resolvedAction);
  const descriptors = computeTaskPersistDescriptors(resolvedAction, nextSpace);
  descriptors.forEach(({ itemId, op }) => queueTaskPersist(scope, spaceId, itemId, op));

  return resolvedAction;
}

/**
 * Flush ngay mọi thao tác Task đang chờ debounce (mirror `flushAllPendingLogPersist()` ở trên) —
 * gọi khi tab chuyển `hidden`. No-op nếu không có gì đang chờ (luôn đúng khi
 * `TASK_ITEM_PERSIST_ENABLED === false`).
 */
export function flushAllPendingTaskPersist(): void {
  const ids = Array.from(taskPending.keys());
  ids.forEach((id) => {
    const entry = taskPending.get(id);
    if (entry) clearTimeout(entry.timer);
    scheduleTaskFlush(id);
  });
}
