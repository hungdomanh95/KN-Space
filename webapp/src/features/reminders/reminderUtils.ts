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
  // `createdAt` có thể là ISO đầy đủ (có giờ:phút, dữ liệu mới) hoặc chỉ `yyyy-mm-dd` (dữ liệu
  // cũ trước khi sửa để lưu giờ tạo thật cho freqUnit 'hour'). Diff ngày ở đây CHỈ nên tính theo
  // NGÀY lịch, không phụ thuộc giờ:phút — nếu dùng `new Date(r.createdAt)` nguyên bản (có giờ)
  // so với `new Date(todayStr)` (luôn là 00:00), chênh lệch giờ trong ngày sẽ làm
  // `Math.round(diffMs / dayMs)` lệch đi 1 ngày tuỳ thời điểm tạo, sai chu kỳ lặp. Cắt về đúng
  // phần ngày (10 ký tự đầu) trước khi parse để tương thích cả 2 dạng dữ liệu.
  const created = new Date(r.createdAt.slice(0, 10));
  const today = new Date(todayStr);
  const diffDays = Math.round((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return false;
  return diffDays % r.freqN === 0;
}
