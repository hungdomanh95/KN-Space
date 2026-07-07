import type { Habit } from '../../types';

export function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isHabitDoneOn(h: Habit, dateStr: string): boolean {
  return h.completedDates.includes(dateStr);
}

export function isHabitDoneToday(h: Habit): boolean {
  return isHabitDoneOn(h, todayStr());
}

/** Streak = số ngày LIÊN TIẾP tính từ hôm nay lùi về trước, dựa vào completedDates thật. */
export function computeStreak(h: Habit): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (!isHabitDoneOn(h, dateOffset(i))) break;
    streak++;
  }
  return streak;
}

export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
