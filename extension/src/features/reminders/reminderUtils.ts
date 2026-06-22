import type { ReminderDefinition } from '../../types';

const UNIT_LABEL: Record<string, string> = { hour: 'giờ', day: 'ngày', month: 'tháng' };

export function freqText(r: { freqN: number; freqUnit: string; dayOfMonth: number | null }): string {
  const n = r.freqN || 1;
  const unit = UNIT_LABEL[r.freqUnit] || 'ngày';
  let text = n === 1 ? `Mỗi ${unit}` : `Mỗi ${n} ${unit}`;
  if (r.freqUnit === 'month' && r.dayOfMonth) text += ` (ngày ${r.dayOfMonth})`;
  return text;
}

export function timeToMinutes(t: string | undefined | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Reminder lặp lại đến hạn hôm nay:
 * - hour: luôn đến hạn (nhắc liên tục theo giờ trong ngày, không track riêng từng giờ).
 * - day: (số ngày từ createdAt đến hôm nay) % freqN === 0.
 * - month: dayOfMonth === ngày hôm nay.
 */
export function isRecurringDueToday(r: ReminderDefinition & { type: 'recurring' }, todayStr: string): boolean {
  if (r.freqUnit === 'hour') return true;
  if (r.freqUnit === 'month') {
    const dayOfMonth = new Date(todayStr).getDate();
    return r.dayOfMonth === dayOfMonth;
  }
  // freqUnit === 'day'
  const created = new Date(r.createdAt);
  const today = new Date(todayStr);
  const diffDays = Math.round((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return false;
  return diffDays % r.freqN === 0;
}
