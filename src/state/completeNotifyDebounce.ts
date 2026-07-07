// Debounce module-level (chỉ tồn tại trong bộ nhớ tab đang mở) cho sự kiện "task hoàn thành"
// trong Shared Space — xem docs/features/shared-space-task-assign-notify.md mục 6.1.
// Mục đích: tick nhầm rồi tick lại/untick trong vài giây không bắn noti mỗi lần.

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const COMPLETE_NOTIFY_DEBOUNCE_MS = 15_000;

/** Huỷ lịch gọi đang chờ (nếu có) của `taskId`, không làm gì nếu không có lịch nào. */
export function cancelCompletedNotify(taskId: string): void {
  const existing = timers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(taskId);
  }
}

/** Lên lịch gọi `fn` sau `delayMs` — tự huỷ lịch cũ (nếu có) của cùng `taskId` trước khi đặt lịch mới. */
export function scheduleCompletedNotify(taskId: string, fn: () => void, delayMs: number = COMPLETE_NOTIFY_DEBOUNCE_MS): void {
  cancelCompletedNotify(taskId);
  const timer = setTimeout(() => {
    timers.delete(taskId);
    fn();
  }, delayMs);
  timers.set(taskId, timer);
}
