export function maskContent(text: string): string {
  return (text || '')
    .split('\n')
    .map((line) => (line.trim() ? '*'.repeat(Math.min(line.length, 22)) : ''))
    .join('\n');
}

export function formatNoteDate(updatedAt: number): string {
  const d = new Date(updatedAt);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}

export type NoteKind = 'hidden' | 'link' | 'text';

function findLinkLine(content: string): string | undefined {
  return content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
}

/**
 * Tự nhận diện loại nội dung để hiện icon/badge trong hàng danh sách (xem thảo luận redesign
 * khối Ghi chú — dữ liệu thật chủ yếu là link/tài khoản/lệnh tham khảo, không phải note ý tưởng
 * thuần tuý). Chỉ 2 tín hiệu đơn giản, KHÔNG cố nhận diện thêm loại khác (tránh phân loại sai
 * gây hiểu nhầm hơn là không phân loại):
 * - `hidden` — note đang bật "Ẩn nội dung" (ưu tiên cao nhất, bất kể content là gì).
 * - `link` — BẤT KỲ dòng nào (không chỉ dòng đầu) bắt đầu bằng http(s):// — thực tế phổ biến là
 *   1-2 dòng nhãn ("PROD - v1.0.84") đứng trước dòng link thật, kiểm tra riêng dòng đầu sẽ bỏ sót.
 * - `text` — mọi trường hợp còn lại (mặc định).
 */
export function detectNoteKind(hidden: boolean, content: string): NoteKind {
  if (hidden) return 'hidden';
  return findLinkLine(content) ? 'link' : 'text';
}

/**
 * Preview 1 dòng cho hàng danh sách, cắt gọn bằng CSS ellipsis ở nơi hiển thị. Note ẩn trả về
 * placeholder chấm tròn cố định. Note dạng `link` ưu tiên hiện ĐÚNG dòng link (kèm dòng nhãn
 * đứng trước nếu có) thay vì mù quáng lấy 2 dòng đầu — tránh mất chính phần thông tin hữu ích
 * nhất (URL) khi content có 1-2 dòng nhãn đứng trước, xem `detectNoteKind`.
 */
export function notePreviewText(hidden: boolean, content: string): string {
  if (hidden) return '•'.repeat(24);
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return '(Trống)';
  const linkLine = findLinkLine(content);
  if (linkLine) {
    const label = lines[0] !== linkLine ? lines[0] : undefined;
    return label ? `${label} · ${linkLine}` : linkLine;
  }
  return lines.slice(0, 2).join(' · ');
}
