// =============================================================================
// privateSpaceStore.ts — Phần B Bước 3 (storage-architecture-fix): Space cá nhân
// =============================================================================
// Tất cả operation liên quan đến bảng `kn_private_spaces` — mỗi HÀNG là 1 Space cá nhân
// (thay cho mảng `kn_space_state.spaces[]` cũ, xem docs/features/storage-architecture-fix.md
// mục 1/3/4). Không đụng đến `kn_space_state` (giờ chỉ còn `current_space_id`/`settings`, xem
// `supabaseStore.ts`) hay `kn_shared_spaces`/`kn_space_members` (Shared Space, xem
// `sharedSpaceStore.ts`).
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `sharedSpaceStore.ts` (đã chứng minh chạy ổn):
//   - Optimistic locking: trigger `kn_private_spaces_before_update` tự tăng `version`. Client gửi
//     `WHERE id = spaceId AND version = expectedVersion`; 0 rows affected = conflict (client khác/
//     tab khác vừa ghi trước) → caller (AppStateContext) tự resync version mới + retry.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem `state/reducers/spaces.ts`) — khác
//     `kn_shared_spaces` (id do server sinh) — nên `createPrivateSpace`/`upsertPrivateSpaces` LUÔN
//     gửi kèm `id`, không dựa vào default DB.
//   - Field FE `order` <-> cột DB `space_order` (đổi tên vì `order` là từ khoá SQL) — map ở
//     `rowToSpace`/`toRow` dưới đây, đúng tinh thần `enabledBlocks` <-> `enabled_blocks` đã làm ở
//     Shared Space.
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import { normalizeSpace } from './normalize';
import type { EnabledBlocks, Space } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

interface PrivateSpaceRow {
  id: string;
  name: string;
  space_order: number;
  enabled_blocks?: unknown;
  tasks: unknown;
  reminders: unknown;
  habits: unknown;
  notes: unknown;
  logs: unknown;
  version: number;
}

/** enabledBlocks mặc định cho Space cá nhân — khớp `defaultEnabledBlocks()` (`state/reducers/spaces.ts`). */
function defaultPrivateEnabledBlocks(): EnabledBlocks {
  // `expenseTracking: true` ở ĐÂY (khác `defaultEnabledBlocks()` ở reducers/spaces.ts, nơi Space
  // MỚI mặc định `false`) vì hàm này chỉ chạy khi DB trả về `enabled_blocks` thiếu/hỏng key —
  // tức Space đã tồn tại trước khi field này ra đời, không phải Space vừa tạo.
  return { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true, expenseTracking: true };
}

function normalizePrivateEnabledBlocks(raw: unknown): EnabledBlocks {
  const fallback = defaultPrivateEnabledBlocks();
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof EnabledBlocks, unknown>>) : {};
  return {
    tasks: typeof r.tasks === 'boolean' ? r.tasks : fallback.tasks,
    reminder: typeof r.reminder === 'boolean' ? r.reminder : fallback.reminder,
    habits: typeof r.habits === 'boolean' ? r.habits : fallback.habits,
    notes: typeof r.notes === 'boolean' ? r.notes : fallback.notes,
    // Khối Thông báo không có cấu hình tắt theo Space — luôn true (xem forceRemindersEnabled()).
    reminders: true,
    logs: typeof r.logs === 'boolean' ? r.logs : fallback.logs,
    expenseTracking: typeof r.expenseTracking === 'boolean' ? r.expenseTracking : fallback.expenseTracking,
  };
}

/** Map 1 hàng `kn_private_spaces` -> `Space` (frontend type). `space_order` (DB) -> `order` (FE). */
function rowToSpace(row: PrivateSpaceRow): Space {
  const raw: Space = {
    id: row.id,
    name: row.name,
    order: row.space_order,
    enabledBlocks: normalizePrivateEnabledBlocks(row.enabled_blocks),
    tasks: Array.isArray(row.tasks) ? (row.tasks as Space['tasks']) : [],
    reminders: Array.isArray(row.reminders) ? (row.reminders as Space['reminders']) : [],
    habits: Array.isArray(row.habits) ? (row.habits as Space['habits']) : [],
    notes: Array.isArray(row.notes) ? (row.notes as Space['notes']) : [],
    logs: Array.isArray(row.logs) ? (row.logs as Space['logs']) : [],
    _privateVersion: row.version,
  };
  return normalizeSpace(raw);
}

/** Map `Space` (FE) -> object cột DB (không gồm `id`/`user_id` — caller tự thêm tuỳ ngữ cảnh insert/update). */
function toRowPayload(space: Space): Record<string, unknown> {
  return {
    name: space.name,
    space_order: space.order,
    enabled_blocks: space.enabledBlocks,
    tasks: space.tasks,
    reminders: space.reminders,
    habits: space.habits,
    notes: space.notes,
    logs: space.logs,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Space cá nhân của user hiện tại, sắp theo `space_order`. */
export async function loadPrivateSpaces(): Promise<Space[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('kn_private_spaces')
    .select('id,name,space_order,enabled_blocks,tasks,reminders,habits,notes,logs,version')
    .eq('user_id', userId)
    .order('space_order', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadPrivateSpaces lỗi:', error.message);
    throw error;
  }
  if (!data) return [];

  return (data as PrivateSpaceRow[]).map(rowToSpace);
}

/**
 * Đọc version hiện tại của 1 Space cá nhân — dùng để resync sau khi `savePrivateSpace()` báo
 * conflict, tránh mất thay đổi do bị drop im lặng (mirror `getSharedSpaceVersion`).
 */
export async function getPrivateSpaceVersion(spaceId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('kn_private_spaces')
    .select('version')
    .eq('id', spaceId)
    .maybeSingle<{ version: number }>();

  if (error) {
    console.warn('[KN-Space] getPrivateSpaceVersion lỗi:', error.message);
    throw error;
  }
  return data?.version ?? null;
}

/**
 * Tạo mới 1 Space cá nhân (INSERT) — dùng khi `Space._privateVersion === undefined` (chưa từng
 * lưu lên DB). `space.id` giữ nguyên (client tự sinh từ trước, xem `emptySpace()` ở
 * `state/reducers/spaces.ts`). Trigger chỉ chạy khi UPDATE nên version sau INSERT luôn = 1 (default
 * cột `version`) — không cần round-trip đọc lại.
 */
export async function createPrivateSpace(space: Space): Promise<{ ok: boolean; version?: number; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('kn_private_spaces').insert({
      id: space.id,
      user_id: userId,
      ...toRowPayload(space),
    });
    if (error) throw error;
    return { ok: true, version: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[KN-Space] createPrivateSpace lỗi:', message);
    return { ok: false, error: message };
  }
}

/**
 * Upsert HÀNG LOẠT Space cá nhân (INSERT nếu `id` chưa có, UPDATE tại chỗ nếu `id` đã tồn tại) —
 * dùng cho 2 tình huống duy nhất:
 *   1. `seedAndPersist()` (user mới) — không có conflict thật (bảng đang rỗng cho user này), upsert
 *      ở đây tương đương insert thuần, chỉ để dùng chung 1 hàm với (2).
 *   2. Import JSON (`IMPORT_DATA`, xem `AppStateContext.tsx`) — file export giữ NGUYÊN id gốc của
 *      Space (xem `normalizeImportedSpace`), nên re-import dữ liệu đã từng export trước đó rất có
 *      thể trùng `id` với hàng đang có sẵn trên `kn_private_spaces` — dùng INSERT thuần ở tình
 *      huống này sẽ vỡ do trùng khoá chính. Upsert xử lý đúng cả 2 nhánh (trùng id -> update tại
 *      chỗ, id mới -> insert) mà không cần biết trước case nào.
 *
 * Trả về `Space[]` với `_privateVersion` đã điền đúng từ kết quả DB thật (đọc lại qua `.select()`)
 * — version sau UPDATE (do upsert với id trùng) sẽ > 1 (trigger tự tăng), không giả định cứng = 1
 * như `createPrivateSpace()` (case đó CHẮC CHẮN là INSERT thuần, không có nhánh update).
 */
export async function upsertPrivateSpaces(spaces: Space[]): Promise<{ ok: boolean; spaces?: Space[]; error?: string }> {
  if (spaces.length === 0) return { ok: true, spaces: [] };
  try {
    const userId = await getCurrentUserId();
    const rows = spaces.map((s) => ({ id: s.id, user_id: userId, ...toRowPayload(s) }));
    const { data, error } = await supabase
      .from('kn_private_spaces')
      .upsert(rows)
      .select('id,version');
    if (error) throw error;
    const versionById = new Map((data ?? []).map((r) => [r.id as string, r.version as number]));
    return { ok: true, spaces: spaces.map((s) => ({ ...s, _privateVersion: versionById.get(s.id) ?? 1 })) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[KN-Space] upsertPrivateSpaces lỗi:', message);
    return { ok: false, error: message };
  }
}

/**
 * Save 1 Space cá nhân với optimistic locking — mirror CHÍNH XÁC `saveSharedSpace()`.
 *
 * UPDATE kn_private_spaces SET ... WHERE id = spaceId AND version = expectedVersion
 *
 * Trigger `kn_private_spaces_before_update` tự tăng version + `updated_at`. 0 rows affected =
 * version đã đổi trên DB (client khác/tab khác vừa ghi) → caller cần resync + retry.
 */
export async function savePrivateSpace(
  spaceId: string,
  patch: Partial<Pick<Space, 'name' | 'order' | 'enabledBlocks' | 'tasks' | 'reminders' | 'habits' | 'notes' | 'logs'>>,
  expectedVersion: number,
): Promise<{ ok: boolean; conflict: boolean; newVersion?: number; error?: string }> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.order !== undefined) updatePayload.space_order = patch.order;
  if (patch.enabledBlocks !== undefined) updatePayload.enabled_blocks = patch.enabledBlocks;
  if (patch.tasks !== undefined) updatePayload.tasks = patch.tasks;
  if (patch.reminders !== undefined) updatePayload.reminders = patch.reminders;
  if (patch.habits !== undefined) updatePayload.habits = patch.habits;
  if (patch.notes !== undefined) updatePayload.notes = patch.notes;
  if (patch.logs !== undefined) updatePayload.logs = patch.logs;

  if (Object.keys(updatePayload).length === 0) {
    return { ok: true, conflict: false, newVersion: expectedVersion };
  }

  try {
    const { data, error } = await supabase
      .from('kn_private_spaces')
      .update(updatePayload)
      .eq('id', spaceId)
      .eq('version', expectedVersion)
      .select('version')
      .maybeSingle<{ version: number }>();

    if (error) throw error;

    if (!data) {
      // 0 rows updated → version đã đổi trên DB → conflict
      return { ok: false, conflict: true };
    }

    return { ok: true, conflict: false, newVersion: data.version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[KN-Space] savePrivateSpace lỗi:', message);
    return { ok: false, conflict: false, error: message };
  }
}

/** Xoá 1 Space cá nhân (RLS `auth.uid() = user_id` đảm bảo chỉ xoá được hàng của chính mình). */
export async function deletePrivateSpace(spaceId: string): Promise<void> {
  const { error } = await supabase.from('kn_private_spaces').delete().eq('id', spaceId);
  if (error) {
    console.warn('[KN-Space] deletePrivateSpace lỗi:', error.message);
    throw error;
  }
}
