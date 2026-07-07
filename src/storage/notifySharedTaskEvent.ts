import { supabase } from '../lib/supabaseClient';

// Gọi Edge Function `notify-shared-task-event` — sự kiện (assign/complete) trong Shared Space,
// KHÁC cơ chế cron "đến hạn" (send-due-notifications). Xem
// docs/features/shared-space-task-assign-notify.md mục 4 (Kiến trúc kỹ thuật).
//
// Best-effort: lỗi mạng/lỗi function không throw ra ngoài, không chặn luồng lưu task
// (mục 6.3 spec — "chấp nhận best-effort, không Realtime").

interface NotifyPayload {
  spaceId: string;
  spaceName: string;
  taskId: string;
  taskTitle: string;
  event: 'assigned' | 'completed';
  recipientUserIds?: string[];
  excludeUserId?: string;
}

async function callNotify(payload: NotifyPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('notify-shared-task-event', { body: payload });
    if (error) console.warn('[KN-Space] notify-shared-task-event lỗi:', error.message);
  } catch (err) {
    console.warn('[KN-Space] notify-shared-task-event lỗi mạng:', err);
  }
}

/** Task vừa tạo/sửa có assignee MỚI — gọi ngay, không debounce (xem spec mục 6.1). */
export function notifyTaskAssigned(spaceId: string, spaceName: string, taskId: string, taskTitle: string, recipientUserIds: string[]): void {
  if (recipientUserIds.length === 0) return;
  void callNotify({ spaceId, spaceName, taskId, taskTitle, event: 'assigned', recipientUserIds });
}

/** Task vừa chuyển sang hoàn thành — caller (AppStateContext) tự debounce trước khi gọi hàm này. */
export function notifyTaskCompleted(spaceId: string, spaceName: string, taskId: string, taskTitle: string, excludeUserId: string): void {
  void callNotify({ spaceId, spaceName, taskId, taskTitle, event: 'completed', excludeUserId });
}
