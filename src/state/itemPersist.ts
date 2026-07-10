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
