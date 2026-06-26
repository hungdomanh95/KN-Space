import type { NotificationRow, Space } from '../../types';
import { freqText, isRecurringDueToday, timeToMinutes } from '../reminders/reminderUtils';
import { isHabitDoneOn } from '../habits/habitUtils';

/**
 * Hàm thuần derive thông báo từ Việc cần làm + Nhắc việc + Thói quen — KHÔNG lưu storage.
 * Sort theo timeMinutes tăng dần (timed trước, untimed sau).
 */
export function computeNotifications(space: Space, todayStr: string): NotificationRow[] {
  const rows: NotificationRow[] = [];

  if (space.enabledBlocks.tasks) {
    space.tasks
      .filter((t) => t.date === todayStr)
      .forEach((t) => {
        rows.push({
          key: `task:${t.id}`,
          title: t.title,
          label: `${t.time || '--:--'} · Việc cần làm`,
          done: t.done,
          isReadOnly: false,
          source: { type: 'task', id: t.id },
          timeMinutes: timeToMinutes(t.time),
          isInfo: false,
        });
      });
  }

  if (space.enabledBlocks.reminder) {
    space.reminders.forEach((r) => {
      if (r.type === 'once') {
        if (r.date !== todayStr) return;
        rows.push({
          key: `reminder:${r.id}`,
          title: r.title,
          label: `${r.time || '--:--'} · Nhắc việc`,
          done: false,
          isReadOnly: true,
          source: null,
          timeMinutes: timeToMinutes(r.time),
          isInfo: true,
        });
      } else {
        if (!isRecurringDueToday(r, todayStr)) return;
        const label = r.freqUnit === 'hour' ? `${freqText(r)} · Nhắc lặp lại` : `${r.time || 'Hôm nay'} · Nhắc lặp lại`;
        rows.push({
          key: `reminder:${r.id}`,
          title: r.title,
          label,
          done: false,
          isReadOnly: true,
          source: null,
          timeMinutes: r.freqUnit === 'hour' ? null : timeToMinutes(r.time),
          isInfo: true,
        });
      }
    });
  }

  if (space.enabledBlocks.habits) {
    space.habits
      .filter((h) => !isHabitDoneOn(h, todayStr))
      .forEach((h) => {
        rows.push({
          key: `habit:${h.id}`,
          title: h.title,
          label: 'Thói quen · Hôm nay',
          done: false,
          isReadOnly: false,
          source: { type: 'habit', id: h.id },
          timeMinutes: null,
          isInfo: false,
        });
      });
  }

  rows.sort((a, b) => {
    const am = a.timeMinutes ?? Number.POSITIVE_INFINITY;
    const bm = b.timeMinutes ?? Number.POSITIVE_INFINITY;
    return am - bm;
  });

  return rows;
}
