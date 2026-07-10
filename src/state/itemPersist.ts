// =============================================================================
// itemPersist.ts — action-level persist item-level, Bước 1 (entity Log) của
// docs/features/item-level-entity-tables.md mục 4.2 (quyết định đã chốt #2,
// -progress.md).
// =============================================================================
// Khác hẳn cơ chế debounce Space-level hiện có trong `AppStateContext.tsx`
// (1 `useEffect` DIFF snapshot `state.spaces` để ĐOÁN "cái gì vừa đổi"): module
// này được gọi TRỰC TIẾP từ `smartDispatch` tại đúng thời điểm dispatch, khi
// app đã biết CHÍNH XÁC 100% ý nghĩa action — không cần diff/đoán lại. Debounce
// vẫn có (600ms, gộp nhiều sửa liên tiếp CÙNG 1 item), nhưng đơn vị theo dõi là
// `itemId` (Map), không phải `spaceId`.
//
// CỜ BẬT/TẮT — `LOG_ITEM_PERSIST_ENABLED`:
// Bảng `kn_private_logs`/`kn_shared_logs` (docs/features/item-level-log-schema.sql)
// đã tạo thật trên Supabase và dữ liệu cũ đã migrate xong (`window.knMigrateLogs.run()`).
// Cờ đang BẬT (`true`) — đây là "Giai đoạn A" (xem -progress.md, câu hỏi mở #2,
// đề xuất đã được chủ dự án duyệt 2026-07-11): mọi action `LOG_*` giờ GHI SONG
// SONG (dual-write) vào bảng mới, NHƯNG phần ĐỌC vẫn 100% qua cột `logs` jsonb
// trong `kn_private_spaces`/`kn_shared_spaces` như cũ — `loadPrivateLogs`/
// `loadSharedLogs` (`logStore.ts`) CHƯA được nối vào bootstrap/`refreshStaleSpaces`.
// Mục đích: để bảng mới tự "đuổi kịp" log phát sinh mới, giảm rủi ro lệch dữ
// liệu trước khi cutover đọc. Rủi ro hiển thị ~0 (không đổi UI/hành vi đọc).
// "Giai đoạn B" (nối phần đọc, cutover) là bước RIÊNG, cần duyệt lại trước khi
// code — xem checklist 3 lưu ý bắt buộc ở -progress.md.
// =============================================================================

import type { Space } from '../types';
import type { LogAction } from './reducers/logs';
import { logsReducer } from './reducers/logs';
import type { LogEntry } from '../types';
import { setPrivateFallbackActive, setSharedFallbackActive } from '../storage/supabaseStore';
import {
  createLog,
  deleteLog,
  deleteLogs,
  updateLogExpense,
  type LogScope,
} from '../storage/logStore';

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

/** Xếp lượt flush của `itemId` nối tiếp sau lượt đang bay (nếu có) — xem giải thích `inFlight` ở trên. */
function scheduleFlush(itemId: string): void {
  const prior = inFlight.get(itemId) ?? Promise.resolve();
  const next = prior.then(() => flushLogItem(itemId));
  inFlight.set(
    itemId,
    next.finally(() => {
      if (inFlight.get(itemId) === next) inFlight.delete(itemId);
    }),
  );
}

/** Đưa 1 thao tác vào hàng đợi debounce (600ms) của `itemId`, gộp với thao tác đang chờ (nếu có). */
function queueLogPersist(scope: LogScope, spaceId: string, itemId: string, op: LogPendingOp, debounceMs = 600): void {
  const existing = pending.get(itemId);
  if (existing) clearTimeout(existing.timer);

  const merged = mergeLogPendingOp(existing?.op, op);
  if (merged === null) {
    pending.delete(itemId);
    return;
  }

  const timer = setTimeout(() => scheduleFlush(itemId), debounceMs);
  pending.set(itemId, { scope, spaceId, op: merged, timer });
}

/** `LOG_DELETE_MANY` — 1 network call cho N id (mục 4.3 tài liệu trên), KHÔNG qua debounce/hàng đợi
 * per-item (huỷ mọi pending riêng lẻ của các id liên quan trước, tránh 1 lượt insert/update cũ bay
 * ra SAU khi đã xoá hàng loạt). */
function queueLogDeleteMany(scope: LogScope, itemIds: string[]): void {
  if (itemIds.length === 0) return;
  itemIds.forEach((id) => {
    const existing = pending.get(id);
    if (existing) {
      clearTimeout(existing.timer);
      pending.delete(id);
    }
  });
  void (async () => {
    try {
      await deleteLogs(scope, itemIds);
      setFallback(scope, false);
    } catch (err) {
      console.warn('[KN-Space] itemPersist: xoá hàng loạt Log thất bại:', err);
      setFallback(scope, true);
    }
  })();
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
    queueLogDeleteMany(scope, resolvedAction.payload.ids);
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
