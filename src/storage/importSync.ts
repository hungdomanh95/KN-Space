// =============================================================================
// importSync.ts — đồng bộ entity item-level khi Import JSON (`IMPORT_DATA`).
// =============================================================================
// Việc 1 (docs/features/item-level-entity-tables-progress.md, câu hỏi mở #2, dọn dẹp 2026-07-11) —
// sau khi Space-level (`kn_private_spaces`) NGỪNG ghi `tasks`/`notes`/`habits`/`reminders`/`logs`
// (xem `privateSnapshot()` ở `AppStateContext.tsx`, `toRowPayload()` ở `privateSpaceStore.ts`),
// Import JSON là con đường DUY NHẤT còn lại có thể mang dữ liệu entity THẬT (không rỗng) vào 1
// Space cùng lúc với Space-level — nên phải tự tay bulk-insert đúng vào bảng item-level, nếu không
// dữ liệu import "biến mất" ngay lần reload kế tiếp (UI đọc từ bảng item-level, không phải jsonb,
// từ Giai đoạn B).
//
// Tách riêng module này (không để trong `AppStateContext.tsx`) vì đây thuần là orchestration ở
// tầng storage (gọi các hàm CRUD hàng loạt đã có sẵn ở 5 store), không phụ thuộc React — dễ test
// độc lập (chỉ mock 5 module store, không cần mock AuthContext/supabaseStore/Supabase client thật
// như sẽ phải làm nếu import cả `AppStateContext.tsx`).
// =============================================================================

import type { Space } from '../types';
import { deleteAllLogsForSpace, insertLogsBulk } from './logStore';
import { deleteAllHabitsForSpace, insertHabitsBulk } from './habitStore';
import { deleteAllRemindersForSpace, insertRemindersBulk } from './reminderStore';
import { deleteAllTasksForSpace, insertTasksBulk } from './taskStore';
import { deleteAllNotesForSpace, insertNotesBulk } from './noteStore';

const ENTITY_LABELS = ['Task', 'Note', 'Habit', 'Reminder', 'Log'] as const;

/**
 * "Thay thế hoàn toàn" (đúng ngữ nghĩa IMPORT_DATA hiện có ở `appReducer`, KHÔNG merge với dữ liệu
 * cũ): xoá SẠCH mọi item-level hiện có của Space này trước (`deleteAllXForSpace`), rồi bulk-insert
 * lại từ dữ liệu import. An toàn cho cả 2 trường hợp: Space MỚI (xoá là no-op, chưa có gì) lẫn
 * Space ĐÃ TỒN TẠI bị ghi đè (reimport cùng id — phải xoá xong mới insert, tránh trùng khoá chính
 * `id` với item cũ còn sót lại nếu file import đã bớt/đổi item so với lần trước).
 *
 * CHỈ áp dụng Space CÁ NHÂN — IMPORT_DATA không đụng Shared Space (xem `newPrivateSpaces` ở nơi
 * gọi, `AppStateContext.tsx`). Lỗi xử lý ĐỘC LẬP theo từng entity (không throw tiếp) — 1 entity lỗi
 * không chặn 4 entity còn lại của CÙNG Space, cũng không chặn Space khác (`Promise.all` ở nơi
 * gọi). Trả `{ ok: false }` nếu CÓ ÍT NHẤT 1 lượt insert thất bại — caller (`AppStateContext.tsx`)
 * tự quyết định bật banner lỗi mạng dựa trên giá trị này (module này KHÔNG tự gọi
 * `setPrivateFallbackActive` — tránh phụ thuộc ngược vào `supabaseStore.ts`, giữ module thuần
 * storage-orchestration, dễ test).
 */
export async function syncImportedSpaceItems(space: Space): Promise<{ ok: boolean }> {
  const deleteResults = await Promise.allSettled([
    deleteAllTasksForSpace('private', space.id),
    deleteAllNotesForSpace('private', space.id),
    deleteAllHabitsForSpace(space.id),
    deleteAllRemindersForSpace('private', space.id),
    deleteAllLogsForSpace('private', space.id),
  ]);
  deleteResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(
        `[KN-Space] Import: xoá ${ENTITY_LABELS[i]} item-level cũ cho Space "${space.name}" (${space.id}) thất bại:`,
        r.reason,
      );
    }
  });

  const insertResults = await Promise.all([
    insertTasksBulk('private', space.tasks.map((task) => ({ spaceId: space.id, task }))),
    insertNotesBulk('private', space.notes.map((note) => ({ spaceId: space.id, note }))),
    insertHabitsBulk(space.habits.map((habit) => ({ spaceId: space.id, habit }))),
    insertRemindersBulk('private', space.reminders.map((reminder) => ({ spaceId: space.id, reminder }))),
    insertLogsBulk('private', space.logs.map((log) => ({ spaceId: space.id, log }))),
  ]);
  insertResults.forEach((r, i) => {
    if (!r.ok) {
      console.warn(
        `[KN-Space] Import: ghi ${ENTITY_LABELS[i]} vào bảng item-level cho Space "${space.name}" (${space.id}) thất bại:`,
        r.error,
      );
    }
  });

  return { ok: insertResults.every((r) => r.ok) };
}
