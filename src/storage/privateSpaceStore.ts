// =============================================================================
// privateSpaceStore.ts — Phần B Bước 3 (storage-architecture-fix): Space cá nhân
// =============================================================================
// Tất cả operation liên quan đến bảng `kn_private_spaces` — mỗi HÀNG là 1 Space cá nhân
// (thay cho mảng `kn_space_state.spaces[]` cũ, xem docs/features/storage-architecture-fix.md
// mục 1/3/4). Không đụng đến `kn_space_state` (giờ chỉ còn `current_space_id`/`settings`, xem
// `supabaseStore.ts`) hay `kn_shared_spaces`/`kn_space_members` (Shared Space, xem
// `sharedSpaceStore.ts`).
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `sharedSpaceStore.ts`:
//   - KHÔNG version-check/retry (bỏ theo docs/features/conflict-handling-simplification.md, 2026-07-10
//     — version-check chỉ bảo vệ được 1 khung rất hẹp, không chặn được đúng kịch bản gây mất dữ liệu
//     thật). `savePrivateSpace()` ghi thẳng `WHERE id = spaceId` (blind write, last-write-wins). Cột
//     `version`/trigger `kn_private_spaces_before_update` VẪN GIỮ trên DB (tự tăng version/updated_at
//     vô điều kiện) nhưng tầng app không còn đọc/dùng để chặn ghi — chỉ còn tác dụng phụ miễn phí là
//     `updated_at`. Rủi ro RAM cũ (root cause thật) được xử lý riêng bằng refresh-on-visible ở
//     `AppStateContext.tsx` (`refreshStaleSpaces()`), không phải version-check.
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

/**
 * Map `Space` (FE) -> object cột DB (không gồm `id`/`user_id` — caller tự thêm tuỳ ngữ cảnh
 * insert/update). Dùng cho CẢ `createPrivateSpace()` (INSERT 1 Space) lẫn `upsertPrivateSpaces()`
 * (bulk, dùng cho seed/import/legacy-migrate).
 *
 * **KHÔNG còn gồm `tasks`/`reminders`/`habits`/`notes`/`logs`** (dọn dẹp 2026-07-11, xem
 * docs/features/item-level-entity-tables-progress.md, câu hỏi mở #2, "Việc 1") — cả 5 entity đã
 * cutover đọc/ghi sang bảng item-level riêng (`kn_private_tasks`/`kn_private_notes`/...), 5 cột
 * jsonb tương ứng trên `kn_private_spaces` không còn được app đọc lại nữa (xem comment ở
 * `PrivateSpaceRow`/`schema.sql`). Ghi tiếp vào đó chỉ lãng phí network + phình dữ liệu trùng lặp,
 * không có tác dụng gì lên hiển thị. INSERT mới (`createPrivateSpace`) rỗng vẫn hợp lệ nhờ default
 * cột DB (`'[]'::jsonb`) — không cần gửi tường minh mảng rỗng.
 *
 * Riêng luồng IMPORT_DATA (`AppStateContext.tsx`, `syncImportedSpaceItems()`) và
 * `runLegacySpacesMigration()` (`migrateLegacySpaces.ts`) là 2 nơi DUY NHẤT còn cần tự bulk-insert
 * entity data vào bảng item-level SAU KHI gọi `upsertPrivateSpaces()` — hàm này không còn tự làm hộ
 * việc đó nữa.
 */
function toRowPayload(space: Space): Record<string, unknown> {
  return {
    name: space.name,
    space_order: space.order,
    enabled_blocks: space.enabledBlocks,
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
 * dùng cho 3 tình huống:
 *   1. `seedAndPersist()` (user mới) — không có conflict thật (bảng đang rỗng cho user này), upsert
 *      ở đây tương đương insert thuần, chỉ để dùng chung 1 hàm với (2).
 *   2. Import JSON (`IMPORT_DATA`, xem `AppStateContext.tsx`) — file export giữ NGUYÊN id gốc của
 *      Space (xem `normalizeImportedSpace`), nên re-import dữ liệu đã từng export trước đó rất có
 *      thể trùng `id` với hàng đang có sẵn trên `kn_private_spaces` — dùng INSERT thuần ở tình
 *      huống này sẽ vỡ do trùng khoá chính. Upsert xử lý đúng cả 2 nhánh (trùng id -> update tại
 *      chỗ, id mới -> insert) mà không cần biết trước case nào.
 *   3. `runLegacySpacesMigration()` (`migrateLegacySpaces.ts`) — chỉ gồm Space CHƯA có hàng, tương
 *      đương insert thuần.
 *
 * Trả về `Space[]` với `_privateVersion` đã điền đúng từ kết quả DB thật (đọc lại qua `.select()`)
 * — version sau UPDATE (do upsert với id trùng) sẽ > 1 (trigger tự tăng), không giả định cứng = 1
 * như `createPrivateSpace()` (case đó CHẮC CHẮN là INSERT thuần, không có nhánh update). Field
 * khác của `Space` (kể cả `tasks`/`notes`/`habits`/`reminders`/`logs`) được TRẢ NGUYÊN từ input
 * (spread `...s`) — hàm này KHÔNG ghi các field entity đó lên DB (xem `toRowPayload()`), CALLER tự
 * chịu trách nhiệm bulk-insert entity vào bảng item-level tương ứng SAU KHI upsert thành công (xem
 * `syncImportedSpaceItems()` ở `AppStateContext.tsx` cho case Import).
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
 * Save 1 Space cá nhân — ghi thẳng (blind write, last-write-wins), KHÔNG version-check (bỏ theo
 * docs/features/conflict-handling-simplification.md mục 2.1 — 2026-07-10). Mirror CHÍNH XÁC
 * `saveSharedSpace()`: throw lỗi thật ra ngoài cho caller tự bật banner lỗi mạng
 * (`AppStateContext.tsx` — `attemptSavePrivate`), KHÔNG tự nuốt lỗi rồi trả `{ok:false}` như bản cũ
 * (bản cũ tạo ra lỗ hổng banner không bao giờ bật cho Space cá nhân — xem mục "Cập nhật sau review
 * dev" trong tài liệu trên).
 *
 * UPDATE kn_private_spaces SET ... WHERE id = spaceId
 *
 * Trigger `kn_private_spaces_before_update` vẫn tự tăng `version` + `updated_at` (giữ nguyên, vô
 * hại) nhưng kết quả `newVersion` trả về ở đây chỉ mang tính thông tin, không dùng để chặn ghi lần
 * sau.
 *
 * **`patch` KHÔNG còn nhận `tasks`/`reminders`/`habits`/`notes`/`logs`** (dọn dẹp 2026-07-11, xem
 * docs/features/item-level-entity-tables-progress.md câu hỏi mở #2, "Việc 1") — 5 field này đã
 * cutover hoàn toàn sang bảng item-level riêng (`itemPersist.ts`), Space-level chỉ còn thật sự sở
 * hữu `name`/`order`/`enabledBlocks`. Compiler tự chặn mọi nơi còn lỡ gọi với field cũ.
 */
export async function savePrivateSpace(
  spaceId: string,
  patch: Partial<Pick<Space, 'name' | 'order' | 'enabledBlocks'>>,
): Promise<{ newVersion?: number }> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.order !== undefined) updatePayload.space_order = patch.order;
  if (patch.enabledBlocks !== undefined) updatePayload.enabled_blocks = patch.enabledBlocks;

  if (Object.keys(updatePayload).length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('kn_private_spaces')
    .update(updatePayload)
    .eq('id', spaceId)
    .select('version')
    .maybeSingle<{ version: number }>();

  if (error) {
    console.warn('[KN-Space] savePrivateSpace lỗi:', error.message);
    throw error;
  }

  return { newVersion: data?.version };
}

/** Xoá 1 Space cá nhân (RLS `auth.uid() = user_id` đảm bảo chỉ xoá được hàng của chính mình). */
export async function deletePrivateSpace(spaceId: string): Promise<void> {
  const { error } = await supabase.from('kn_private_spaces').delete().eq('id', spaceId);
  if (error) {
    console.warn('[KN-Space] deletePrivateSpace lỗi:', error.message);
    throw error;
  }
}
