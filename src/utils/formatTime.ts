/**
 * Tách ra từ `MobileChatScreen.tsx` (Phần 3, `docs/features/nhat-ky-nhanh.md`) — dùng chung cho
 * cả bubble chat lẫn dòng log trong `LogsBlock.tsx` (mục 5.1: "Giờ tạo: dùng lại nguyên hàm
 * `formatBubbleTime`, import dùng chung, không viết lại").
 */

/** Hiện "HH:mm" nếu cùng ngày hôm nay, "dd/MM HH:mm" nếu khác ngày. Trả '' nếu thiếu dữ liệu (item cũ trước khi có createdAt). */
export function formatBubbleTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return hhmm;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
}

/**
 * "HH:mm" thuần từ `createdAt`, KHÔNG kèm ngày dù khác ngày hôm nay (khác `formatBubbleTime`) —
 * dùng khi ngày đã được hiển thị riêng ở chỗ khác (vd chip "{ngày expenseDate} · {giờ tạo}" khi
 * log đã backdate, `LogsBlock.tsx`/`docs/features/quan-ly-chi-tieu.md` mục 5.1).
 */
export function formatHHmm(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
