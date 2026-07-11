// =============================================================================
// taskStore.ts — item-level storage cho Việc cần làm (Task), Bước 4 của kế
// hoạch tách bảng theo entity (docs/features/item-level-entity-tables.md).
// =============================================================================
// Đọc/ghi 2 bảng MỚI `kn_private_tasks`/`kn_shared_tasks` (xem
// docs/features/item-level-task-schema.sql — CHƯA chạy thật trên Supabase, dữ
// liệu cũ CHƯA migrate). Các hàm GHI (`createTask`/`updateTask`/`deleteTask`)
// được gọi từ `state/itemPersist.ts` (dual-write, cờ
// `TASK_ITEM_PERSIST_ENABLED = false` — xem comment đầu file đó, KHÔNG network
// call nào chạy thật cho tới khi bật cờ). Hàm ĐỌC (`loadPrivateTasks`/
// `loadSharedTasks`) CHƯA được nối vào đâu (`AppStateContext.tsx`
// bootstrap/`refreshStaleSpaces()`) — đó là Giai đoạn B, làm ở lượt sau,
// mirror đúng cách đã áp dụng cho Log/Habit/Reminder.
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `logStore.ts`/`reminderStore.ts` (Task CÓ bản
// Shared, giống Log/Reminder — khác Habit):
//   - KHÔNG version-check/retry — ghi thẳng blind write (`WHERE id =
//     taskId`), last-write-wins (docs/features/
//     conflict-handling-simplification.md mục 4.3). Cột `version`/trigger vẫn
//     giữ trên DB (miễn phí `updated_at`), tầng app không đọc/dùng để chặn
//     ghi.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem
//     `state/reducers/tasks.ts`) — id này còn được dùng làm deep-link trong
//     notify Shared Space (`docs/features/shared-space-task-assign-notify.md`),
//     KHÔNG được đổi qua migration.
//   - `order` -> `item_order` (double precision, fractional-index, xem
//     `src/state/fractionalOrder.ts`) — CHỈ patch field `item_order` của ĐÚNG
//     1 task khi kéo-thả (`TASK_REORDER`), KHÔNG reindex hàng loạt.
//   - `assignee_ids` giữ nguyên kiểu jsonb (quyết định đã chốt #4, KHÔNG đổi
//     sang `uuid[]`).
//   - `created_at` — KHÁC Log/Reminder (2 bảng đó NOT NULL DEFAULT now(),
//     LUÔN set tường minh): cột này NULLABLE, CHỈ set khi `Task.createdAt` có
//     giá trị thật (field optional ở tầng app — task cũ có thể THIẾU hẳn field
//     này, có ý nghĩa khác với "vừa tạo bây giờ", xem giải thích đầy đủ ở
//     header `item-level-task-schema.sql`). KHÔNG set `now()` giả khi thiếu.
//   - `TASK_UPDATE`/`TASK_TOGGLE_DONE`/`TASK_REORDER` là 3 action UPDATE
//     TÁCH BIỆT, mỗi action chỉ đổi 1 nhóm field hẹp (title/content/date/
//     time/assigneeIds | done | order) — mirror cách `HABIT_UPDATE`/
//     `HABIT_TOGGLE_TODAY` dùng patch hẹp qua `updateHabit()`, KHÔNG mirror
//     `REMINDER_UPDATE` (thay nguyên item) vì Task không có action nào đổi
//     "hình dạng" toàn bộ item như đổi type Reminder once<->recurring.
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import type { Task } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/** Task thuộc Space cá nhân (`kn_private_tasks`) hay Shared Space (`kn_shared_tasks`) — 2 bảng tách
 * riêng hoàn toàn (Phương án B, không polymorphic FK), mirror `LogScope`/`ReminderScope`. */
export type TaskScope = 'private' | 'shared';

/** Định danh Space cha khi tạo mới 1 Task — cần biết cả scope (chọn bảng) lẫn spaceId (giá trị FK). */
export interface TaskSpaceRef {
  scope: TaskScope;
  spaceId: string; // = kn_private_spaces.id (private) hoặc kn_shared_spaces.id (shared)
}

function tableFor(scope: TaskScope): 'kn_private_tasks' | 'kn_shared_tasks' {
  return scope === 'private' ? 'kn_private_tasks' : 'kn_shared_tasks';
}

interface TaskRow {
  id: string;
  title: string;
  content: string;
  task_date: string;
  task_time: string;
  done: boolean;
  item_order: number;
  created_by: string | null;
  assignee_ids: string[] | null;
  created_at: string | null;
}

const TASK_SELECT_COLUMNS = 'id,title,content,task_date,task_time,done,item_order,created_by,assignee_ids,created_at';

/** Map 1 hàng DB -> `Task` (frontend type). `createdAt` chỉ có mặt khi cột DB không null (xem giải
 * thích ở header file — task cũ THIẾU HẲN field này mang ý nghĩa khác "vừa tạo bây giờ"). */
function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    date: row.task_date,
    time: row.task_time,
    done: row.done,
    order: row.item_order,
    assigneeIds: row.assignee_ids ?? [],
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
  };
}

/** Map `Task` (FE) -> object cột DB cho INSERT. `userId` chỉ set (không null) khi `scope === 'private'`. */
function toInsertRow(scope: TaskScope, spaceId: string, task: Task, userId: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: task.id,
    space_id: spaceId,
    title: task.title,
    content: task.content,
    task_date: task.date,
    task_time: task.time,
    done: task.done,
    item_order: task.order,
    assignee_ids: task.assigneeIds,
  };
  if (task.createdBy) row.created_by = task.createdBy;
  // Chỉ set khi có giá trị thật — KHÔNG set `now()` giả cho task cũ thiếu field (xem header file).
  if (task.createdAt) row.created_at = task.createdAt;
  if (scope === 'private') row.user_id = userId;
  return row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Task của 1 Space cá nhân, sort theo `item_order` tăng dần (khớp
 * `sortTasksForDisplay()` trong `TasksBlock.tsx`). */
export async function loadPrivateTasks(spaceId: string): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_tasks')
    .select(TASK_SELECT_COLUMNS)
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadPrivateTasks lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as TaskRow[]).map(rowToTask);
}

/** Load toàn bộ Task của 1 Shared Space — RLS (`is_space_member`) tự giới hạn đúng phạm vi. */
export async function loadSharedTasks(sharedSpaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('kn_shared_tasks')
    .select(TASK_SELECT_COLUMNS)
    .eq('space_id', sharedSpaceId)
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadSharedTasks lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as TaskRow[]).map(rowToTask);
}

/** Tạo mới 1 Task (INSERT) — dùng cho action `TASK_CREATE` qua `itemPersist.ts`. */
export async function createTask(ref: TaskSpaceRef, task: Task): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = ref.scope === 'private' ? await getCurrentUserId() : null;
    const row = toInsertRow(ref.scope, ref.spaceId, task, userId);
    const { error } = await supabase.from(tableFor(ref.scope)).insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] createTask (${ref.scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * INSERT hàng loạt (dùng cho migration, `migrateLegacyTasks.ts`) — 1 network call cho N task thay vì
 * N call riêng lẻ (mục 4.3, item-level-entity-tables.md). Khác `insertRemindersBulk()` — Task KHÔNG
 * cần tách lô theo "type" (mọi task cùng 1 bộ cột cố định, không có nhánh cột khác nhau theo dữ
 * liệu như Reminder once/recurring).
 */
export async function insertTasksBulk(
  scope: TaskScope,
  rows: { spaceId: string; task: Task }[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  try {
    const userId = scope === 'private' ? await getCurrentUserId() : null;
    const payload = rows.map(({ spaceId, task }) => toInsertRow(scope, spaceId, task, userId));
    const { error } = await supabase.from(tableFor(scope)).insert(payload);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] insertTasksBulk (${scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Sửa 1 Task — patch HẸP, chỉ gửi field có mặt trong `patch` — dùng chung cho 3 action UPDATE tách
 * biệt (`TASK_UPDATE`: title/content/date/time/assigneeIds; `TASK_TOGGLE_DONE`: done;
 * `TASK_REORDER`: order). Ghi thẳng blind write, KHÔNG version-check.
 */
export async function updateTask(
  scope: TaskScope,
  taskId: string,
  patch: { title?: string; content?: string; date?: string; time?: string; assigneeIds?: string[]; done?: boolean; order?: number },
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.content !== undefined) updatePayload.content = patch.content;
  if (patch.date !== undefined) updatePayload.task_date = patch.date;
  if (patch.time !== undefined) updatePayload.task_time = patch.time;
  if (patch.assigneeIds !== undefined) updatePayload.assignee_ids = patch.assigneeIds;
  if (patch.done !== undefined) updatePayload.done = patch.done;
  if (patch.order !== undefined) updatePayload.item_order = patch.order;
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabase.from(tableFor(scope)).update(updatePayload).eq('id', taskId);
  if (error) {
    console.warn(`[KN-Space] updateTask (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** Xoá 1 Task (`TASK_DELETE`). Task KHÔNG có action xoá hàng loạt (khác Log). */
export async function deleteTask(scope: TaskScope, taskId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('id', taskId);
  if (error) {
    console.warn(`[KN-Space] deleteTask (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/**
 * Xoá TOÀN BỘ Task của 1 Space (theo `space_id`) — dùng cho luồng Import JSON (`IMPORT_DATA`,
 * `syncImportedSpaceItems()` ở `AppStateContext.tsx`), nơi cần "dọn sạch" item-level trước khi
 * bulk-insert lại từ file import (thay thế hoàn toàn, mirror đúng ngữ nghĩa `IMPORT_DATA` ở
 * Space-level). KHÔNG dùng cho CRUD thường (xoá 1 task luôn qua `deleteTask()`).
 */
export async function deleteAllTasksForSpace(scope: TaskScope, spaceId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('space_id', spaceId);
  if (error) {
    console.warn(`[KN-Space] deleteAllTasksForSpace (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** id của mọi Task hiện có trên bảng mới (theo scope) — dùng để phát hiện Task NÀO trong `tasks[]`
 * jsonb cũ CHƯA được migrate (xem `migrateLegacyTasks.ts`). RLS tự giới hạn đúng phạm vi user/space
 * hiện tại, không cần filter thêm (private thêm `.eq('user_id', ...)` để nhất quán với
 * `listExistingLogIds()`/`listExistingReminderIds()`, phòng thủ 2 lớp). */
export async function listExistingTaskIds(scope: TaskScope): Promise<Set<string>> {
  let query = supabase.from(tableFor(scope)).select('id');
  if (scope === 'private') {
    const userId = await getCurrentUserId();
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`[KN-Space] listExistingTaskIds (${scope}) lỗi:`, error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id));
}
