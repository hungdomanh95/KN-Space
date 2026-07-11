// =============================================================================
// noteStore.ts — item-level storage cho Ghi chú (Note), Bước 5 (entity CUỐI
// CÙNG) của kế hoạch tách bảng theo entity (docs/features/item-level-entity-tables.md).
// =============================================================================
// Đọc/ghi 2 bảng MỚI `kn_private_notes`/`kn_shared_notes` (xem
// docs/features/item-level-note-schema.sql — CHƯA chạy thật trên Supabase, dữ
// liệu cũ CHƯA migrate). Các hàm GHI (`createNote`/`updateNote`/`deleteNote`)
// được gọi từ `state/itemPersist.ts` (dual-write, cờ
// `NOTE_ITEM_PERSIST_ENABLED = false` — xem comment đầu file đó, KHÔNG network
// call nào chạy thật cho tới khi bật cờ). Hàm ĐỌC (`loadPrivateNotes`/
// `loadSharedNotes`) CHƯA được nối vào đâu (`AppStateContext.tsx`
// bootstrap/`refreshStaleSpaces()`) — đó là Giai đoạn B, làm ở lượt sau,
// mirror đúng cách đã áp dụng cho Log/Habit/Reminder/Task.
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `taskStore.ts` (Note CÓ bản Shared, giống
// Task/Log/Reminder — khác Habit):
//   - KHÔNG version-check/retry — ghi thẳng blind write (`WHERE id =
//     noteId`), last-write-wins (docs/features/
//     conflict-handling-simplification.md mục 4.3). Cột `version`/trigger vẫn
//     giữ trên DB (miễn phí `updated_at`), tầng app không đọc/dùng để chặn
//     ghi.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem
//     `state/reducers/notes.ts`).
//   - `order` -> `item_order` (double precision, fractional-index, xem
//     `src/state/fractionalOrder.ts`) — CHỈ patch field `item_order` của ĐÚNG
//     1 note khi kéo-thả (`NOTE_REORDER`), KHÔNG reindex hàng loạt.
//   - `created_at` — NULLABLE, CHỈ set khi `Note.createdAt` có giá trị thật
//     (field optional ở tầng app — note cũ có thể THIẾU hẳn field này, có ý
//     nghĩa khác với "vừa tạo bây giờ", xem giải thích đầy đủ ở header
//     `item-level-note-schema.sql`). KHÔNG set `now()` giả khi thiếu.
//   - **`content_updated_at` — KHÁC MỌI entity trước (Log/Reminder/Task đều
//     dùng thẳng trigger `updated_at` để suy ra field hiển thị tương ứng):
//     cột RIÊNG, tầng app set tường minh, MAP THẲNG `Note.updatedAt` (epoch
//     ms, KHÔNG qua `Date`/ISO string) — chỉ đổi khi `createNote()`/
//     `updateNote()` được gọi với field `content` (tức action
//     `NOTE_CREATE`/`NOTE_UPDATE`), KHÔNG đổi khi chỉ đổi `order`/`hidden`
//     (`NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN`) — xem giải thích đầy đủ ở
//     header `item-level-note-schema.sql` (rủi ro thiết kế đã xác định:
//     kéo-thả/ẩn-hiện KHÔNG được vô tình đổi "đã sửa lúc..." hiển thị cho
//     user hay làm sai thứ tự sort "Mới sửa gần nhất").**
//   - `NOTE_UPDATE`/`NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN` là 3 action
//     UPDATE TÁCH BIỆT, mỗi action chỉ đổi 1 nhóm field hẹp (title/content/
//     color/contentUpdatedAt | order | hidden) — mirror cách `TASK_UPDATE`/
//     `TASK_TOGGLE_DONE`/`TASK_REORDER` dùng patch hẹp, KHÔNG mirror
//     `REMINDER_UPDATE` (thay nguyên item).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import type { Note } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/** Note thuộc Space cá nhân (`kn_private_notes`) hay Shared Space (`kn_shared_notes`) — 2 bảng tách
 * riêng hoàn toàn (Phương án B, không polymorphic FK), mirror `TaskScope`/`LogScope`/`ReminderScope`. */
export type NoteScope = 'private' | 'shared';

/** Định danh Space cha khi tạo mới 1 Note — cần biết cả scope (chọn bảng) lẫn spaceId (giá trị FK). */
export interface NoteSpaceRef {
  scope: NoteScope;
  spaceId: string; // = kn_private_spaces.id (private) hoặc kn_shared_spaces.id (shared)
}

function tableFor(scope: NoteScope): 'kn_private_notes' | 'kn_shared_notes' {
  return scope === 'private' ? 'kn_private_notes' : 'kn_shared_notes';
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  color: string;
  hidden: boolean;
  item_order: number;
  created_by: string | null;
  created_at: string | null;
  content_updated_at: number;
}

const NOTE_SELECT_COLUMNS = 'id,title,content,color,hidden,item_order,created_by,created_at,content_updated_at';

/** Map 1 hàng DB -> `Note` (frontend type). `createdAt` chỉ có mặt khi cột DB không null (xem giải
 * thích ở header file — note cũ THIẾU HẲN field này mang ý nghĩa khác "vừa tạo bây giờ"). `updatedAt`
 * map THẲNG từ `content_updated_at` (KHÔNG phải cột `updated_at` trigger — xem giải thích đầy đủ ở
 * header `item-level-note-schema.sql`). */
function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    color: row.color,
    hidden: row.hidden,
    order: row.item_order,
    updatedAt: row.content_updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
  };
}

/** Map `Note` (FE) -> object cột DB cho INSERT. `userId` chỉ set (không null) khi `scope === 'private'`. */
function toInsertRow(scope: NoteScope, spaceId: string, note: Note, userId: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: note.id,
    space_id: spaceId,
    title: note.title,
    content: note.content,
    color: note.color,
    hidden: note.hidden,
    item_order: note.order,
    content_updated_at: note.updatedAt,
  };
  if (note.createdBy) row.created_by = note.createdBy;
  // Chỉ set khi có giá trị thật — KHÔNG set `now()` giả cho note cũ thiếu field (xem header file).
  if (note.createdAt) row.created_at = note.createdAt;
  if (scope === 'private') row.user_id = userId;
  return row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Note của 1 Space cá nhân, sort theo `item_order` tăng dần. */
export async function loadPrivateNotes(spaceId: string): Promise<Note[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_notes')
    .select(NOTE_SELECT_COLUMNS)
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadPrivateNotes lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as NoteRow[]).map(rowToNote);
}

/** Load toàn bộ Note của 1 Shared Space — RLS (`is_space_member`) tự giới hạn đúng phạm vi. */
export async function loadSharedNotes(sharedSpaceId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('kn_shared_notes')
    .select(NOTE_SELECT_COLUMNS)
    .eq('space_id', sharedSpaceId)
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadSharedNotes lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as NoteRow[]).map(rowToNote);
}

/** Tạo mới 1 Note (INSERT) — dùng cho action `NOTE_CREATE` qua `itemPersist.ts`. */
export async function createNote(ref: NoteSpaceRef, note: Note): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = ref.scope === 'private' ? await getCurrentUserId() : null;
    const row = toInsertRow(ref.scope, ref.spaceId, note, userId);
    const { error } = await supabase.from(tableFor(ref.scope)).insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] createNote (${ref.scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * INSERT hàng loạt (dùng cho migration, `migrateLegacyNotes.ts`) — 1 network call cho N note thay vì
 * N call riêng lẻ (mục 4.3, item-level-entity-tables.md), mirror `insertTasksBulk()`.
 */
export async function insertNotesBulk(
  scope: NoteScope,
  rows: { spaceId: string; note: Note }[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  try {
    const userId = scope === 'private' ? await getCurrentUserId() : null;
    const payload = rows.map(({ spaceId, note }) => toInsertRow(scope, spaceId, note, userId));
    const { error } = await supabase.from(tableFor(scope)).insert(payload);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] insertNotesBulk (${scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Sửa 1 Note — patch HẸP, chỉ gửi field có mặt trong `patch` — dùng chung cho 3 action UPDATE tách
 * biệt (`NOTE_UPDATE`: title/content/color/updatedAt; `NOTE_REORDER`: order;
 * `NOTE_TOGGLE_CONTENT_HIDDEN`: hidden). Ghi thẳng blind write, KHÔNG version-check.
 *
 * `patch.updatedAt` map thẳng vào cột `content_updated_at` (KHÔNG phải `updated_at` trigger) — CHỈ
 * truyền field này khi patch tới từ `NOTE_UPDATE` (xem `computeNotePersistDescriptors` trong
 * `itemPersist.ts`), KHÔNG truyền khi patch tới từ `NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN` — giữ
 * đúng ngữ nghĩa "mốc sửa nội dung lần cuối" (xem header `item-level-note-schema.sql`).
 */
export async function updateNote(
  scope: NoteScope,
  noteId: string,
  patch: { title?: string; content?: string; color?: string; updatedAt?: number; order?: number; hidden?: boolean },
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.content !== undefined) updatePayload.content = patch.content;
  if (patch.color !== undefined) updatePayload.color = patch.color;
  if (patch.updatedAt !== undefined) updatePayload.content_updated_at = patch.updatedAt;
  if (patch.order !== undefined) updatePayload.item_order = patch.order;
  if (patch.hidden !== undefined) updatePayload.hidden = patch.hidden;
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabase.from(tableFor(scope)).update(updatePayload).eq('id', noteId);
  if (error) {
    console.warn(`[KN-Space] updateNote (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** Xoá 1 Note (`NOTE_DELETE`). Note KHÔNG có action xoá hàng loạt (khác Log). */
export async function deleteNote(scope: NoteScope, noteId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('id', noteId);
  if (error) {
    console.warn(`[KN-Space] deleteNote (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/**
 * Xoá TOÀN BỘ Note của 1 Space (theo `space_id`) — dùng cho luồng Import JSON (`IMPORT_DATA`,
 * `syncImportedSpaceItems()` ở `AppStateContext.tsx`), mirror `deleteAllTasksForSpace()`. KHÔNG
 * dùng cho CRUD thường (xoá 1 note luôn qua `deleteNote()`).
 */
export async function deleteAllNotesForSpace(scope: NoteScope, spaceId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('space_id', spaceId);
  if (error) {
    console.warn(`[KN-Space] deleteAllNotesForSpace (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** id của mọi Note hiện có trên bảng mới (theo scope) — dùng để phát hiện Note NÀO trong `notes[]`
 * jsonb cũ CHƯA được migrate (xem `migrateLegacyNotes.ts`). RLS tự giới hạn đúng phạm vi user/space
 * hiện tại, không cần filter thêm (private thêm `.eq('user_id', ...)` để nhất quán với
 * `listExistingTaskIds()`, phòng thủ 2 lớp). */
export async function listExistingNoteIds(scope: NoteScope): Promise<Set<string>> {
  let query = supabase.from(tableFor(scope)).select('id');
  if (scope === 'private') {
    const userId = await getCurrentUserId();
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`[KN-Space] listExistingNoteIds (${scope}) lỗi:`, error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id));
}
