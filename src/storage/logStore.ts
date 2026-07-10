// =============================================================================
// logStore.ts — item-level storage cho Nhật ký nhanh (Log), Bước 1 của kế hoạch
// tách bảng theo entity (docs/features/item-level-entity-tables.md).
// =============================================================================
// Đọc/ghi 2 bảng MỚI `kn_private_logs`/`kn_shared_logs` (xem
// docs/features/item-level-log-schema.sql — đã chạy thật trên Supabase, dữ
// liệu cũ đã migrate). Các hàm GHI (`createLog`/`updateLogExpense`/`deleteLog`/
// `deleteLogs`) đang được gọi thật từ `state/itemPersist.ts` (cờ
// `LOG_ITEM_PERSIST_ENABLED = true`, "Giai đoạn A" — dual-write). Các hàm ĐỌC
// (`loadPrivateLogs`/`loadSharedLogs`) VẪN CHƯA được gọi ở đâu ngoài chính
// chúng — nguồn đọc Nhật ký nhanh THẬT vẫn là cột `logs jsonb` trong
// `kn_private_spaces`/`kn_shared_spaces` cho tới khi "Giai đoạn B" (cutover
// đọc, xem -progress.md câu hỏi mở #2) được duyệt và triển khai riêng.
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `privateSpaceStore.ts`/`sharedSpaceStore.ts`:
//   - KHÔNG version-check/retry — ghi thẳng blind write (`WHERE id = logId`),
//     last-write-wins (docs/features/conflict-handling-simplification.md mục
//     4.3 — áp dụng luôn cho thiết kế item-level, không mirror version-check
//     cũ). Cột `version`/trigger vẫn giữ trên DB (miễn phí `updated_at`), tầng
//     app không đọc/dùng để chặn ghi.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem `state/reducers/logs.ts`).
//   - `created_at` LUÔN gửi tường minh từ `LogEntry.createdAt` — KHÔNG dựa vào
//     default DB `now()` (bắt buộc cho migration giữ đúng mốc thời gian gốc,
//     xem item-level-entity-tables.md mục 3.4 câu hỏi #6 đã chốt).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import type { LogEntry } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/** Log thuộc Space cá nhân (`kn_private_logs`) hay Shared Space (`kn_shared_logs`) — 2 bảng tách
 * riêng hoàn toàn (Phương án B, không polymorphic FK), xem item-level-entity-tables.md mục 10 #1. */
export type LogScope = 'private' | 'shared';

/** Định danh Space cha khi tạo mới 1 Log — cần biết cả scope (chọn bảng) lẫn spaceId (giá trị FK). */
export interface LogSpaceRef {
  scope: LogScope;
  spaceId: string; // = kn_private_spaces.id (private) hoặc kn_shared_spaces.id (shared)
}

function tableFor(scope: LogScope): 'kn_private_logs' | 'kn_shared_logs' {
  return scope === 'private' ? 'kn_private_logs' : 'kn_shared_logs';
}

interface LogRow {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  expense_date: string | null;
  category_override: string | null;
  excluded: boolean | null;
}

const LOG_SELECT_COLUMNS = 'id,content,created_by,created_at,expense_date,category_override,excluded';

/** Map 1 hàng DB -> `LogEntry` (frontend type) — field optional absent khi null/falsy, đúng ngữ
 * nghĩa `normalizeLogEntries()` (`storage/normalize.ts`) đang áp dụng cho dữ liệu jsonb cũ. */
function rowToLog(row: LogRow): LogEntry {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.expense_date ? { expenseDate: row.expense_date } : {}),
    ...(row.category_override ? { categoryOverride: row.category_override } : {}),
    ...(row.excluded ? { excluded: true } : {}),
  };
}

/** Map `LogEntry` (FE) -> object cột DB cho INSERT. `userId` chỉ set (không null) khi `scope === 'private'`. */
function toInsertRow(scope: LogScope, spaceId: string, log: LogEntry, userId: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: log.id,
    space_id: spaceId,
    content: log.content,
    // Set tường minh — xem giải thích ở header file.
    created_at: log.createdAt,
  };
  if (log.createdBy) row.created_by = log.createdBy;
  if (log.expenseDate !== undefined) row.expense_date = log.expenseDate;
  if (log.categoryOverride !== undefined) row.category_override = log.categoryOverride;
  if (log.excluded !== undefined) row.excluded = log.excluded;
  if (scope === 'private') row.user_id = userId;
  return row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Log của 1 Space cá nhân, sort theo `created_at` (cũ nhất trước, khớp hành vi hiện
 * tại của `space.logs` mảng jsonb). */
export async function loadPrivateLogs(spaceId: string): Promise<LogEntry[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_logs')
    .select(LOG_SELECT_COLUMNS)
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadPrivateLogs lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as LogRow[]).map(rowToLog);
}

/** Load toàn bộ Log của 1 Shared Space — RLS (`is_space_member`) tự giới hạn đúng phạm vi. */
export async function loadSharedLogs(sharedSpaceId: string): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('kn_shared_logs')
    .select(LOG_SELECT_COLUMNS)
    .eq('space_id', sharedSpaceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadSharedLogs lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as LogRow[]).map(rowToLog);
}

/** Tạo mới 1 Log (INSERT) — dùng cho action `LOG_CREATE` qua `itemPersist.ts`. */
export async function createLog(ref: LogSpaceRef, log: LogEntry): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = ref.scope === 'private' ? await getCurrentUserId() : null;
    const row = toInsertRow(ref.scope, ref.spaceId, log, userId);
    const { error } = await supabase.from(tableFor(ref.scope)).insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] createLog (${ref.scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * INSERT hàng loạt (dùng cho migration, `migrateLegacyLogs.ts`) — 1 network call cho N log thay vì
 * N call riêng lẻ (mục 4.3, item-level-entity-tables.md).
 */
export async function insertLogsBulk(
  scope: LogScope,
  rows: { spaceId: string; log: LogEntry }[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  try {
    const userId = scope === 'private' ? await getCurrentUserId() : null;
    const payload = rows.map(({ spaceId, log }) => toInsertRow(scope, spaceId, log, userId));
    const { error } = await supabase.from(tableFor(scope)).insert(payload);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] insertLogsBulk (${scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Sửa 3 field expense (`LOG_PATCH_EXPENSE`) — ghi thẳng blind write, KHÔNG version-check. Log
 * KHÔNG có action sửa `content`/`created_by`/`created_at` (bất biến, xem `types.ts`).
 * `categoryOverride: null` = xoá override (quay lại auto-detect) — khác `undefined` (không đổi field
 * này), đúng ngữ nghĩa `LOG_PATCH_EXPENSE` hiện có (`state/reducers/logs.ts`).
 */
export async function updateLogExpense(
  scope: LogScope,
  logId: string,
  patch: { expenseDate?: string; categoryOverride?: string | null; excluded?: boolean },
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.expenseDate !== undefined) updatePayload.expense_date = patch.expenseDate;
  if (patch.categoryOverride !== undefined) updatePayload.category_override = patch.categoryOverride;
  if (patch.excluded !== undefined) updatePayload.excluded = patch.excluded;
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabase.from(tableFor(scope)).update(updatePayload).eq('id', logId);
  if (error) {
    console.warn(`[KN-Space] updateLogExpense (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** Xoá 1 Log (`LOG_DELETE`). */
export async function deleteLog(scope: LogScope, logId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('id', logId);
  if (error) {
    console.warn(`[KN-Space] deleteLog (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** Xoá nhiều Log trong 1 lần gọi (`LOG_DELETE_MANY`) — 1 network call, không phải N call riêng. */
export async function deleteLogs(scope: LogScope, logIds: string[]): Promise<void> {
  if (logIds.length === 0) return;
  const { error } = await supabase.from(tableFor(scope)).delete().in('id', logIds);
  if (error) {
    console.warn(`[KN-Space] deleteLogs (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** id của mọi Log hiện có trên bảng mới (theo scope) — dùng để phát hiện Log NÀO trong `logs[]`
 * jsonb cũ CHƯA được migrate (xem `migrateLegacyLogs.ts`). RLS tự giới hạn đúng phạm vi user/space
 * hiện tại, không cần filter thêm (private thêm `.eq('user_id', ...)` để nhất quán với
 * `listExistingPrivateSpaceIds()`, phòng thủ 2 lớp). */
export async function listExistingLogIds(scope: LogScope): Promise<Set<string>> {
  let query = supabase.from(tableFor(scope)).select('id');
  if (scope === 'private') {
    const userId = await getCurrentUserId();
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`[KN-Space] listExistingLogIds (${scope}) lỗi:`, error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id));
}
