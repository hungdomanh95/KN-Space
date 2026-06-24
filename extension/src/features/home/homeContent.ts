// ============================================================================
// Nội dung tĩnh cho màn Home + ảnh nền chung (Home + Dashboard).
// Đóng gói cứng trong code — KHÔNG gọi API quote/ảnh ngoài (đúng yêu cầu Phase 1).
// ============================================================================

/**
 * 6 link ảnh phong cảnh tĩnh, hotlink trực tiếp images.unsplash.com (URL cố định,
 * không phải Unsplash API random/search — không cần Access Key, không rate-limit).
 * Copy từ HOME_IMAGES trong docs/mockup/index.html.
 */
export const DEFAULT_HOME_IMAGES: string[] = [
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2000&q=80', // rừng nắng xuyên cây
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=2000&q=80', // rừng sương mù
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=2000&q=80', // núi + tia nắng
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=2000&q=80', // hồ phản chiếu
  'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&w=2000&q=80', // đồi xanh
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80', // hồ + núi
];

/** Gradient fallback đóng gói sẵn — dùng khi ảnh load lỗi hoặc offline. */
export const HOME_GRADIENTS: string[] = [
  'linear-gradient(135deg,#1e3c72 0%,#2a5298 50%,#6a82fb 100%)',
  'linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)',
  'linear-gradient(135deg,#42275a 0%,#734b6d 100%)',
  'linear-gradient(135deg,#134e5e 0%,#71b280 100%)',
];

/**
 * 10 slot quote cố định đóng gói cứng (không CRUD thêm/xoá tự do) — đây là nội dung MẶC ĐỊNH,
 * dùng để seed `settings.homeQuotes.texts`. Sửa nội dung qua Settings tab "Quote" (chỉ sửa
 * `settings.homeQuotes.texts`, không sửa mảng này lúc runtime). Copy nguyên văn từ HOME_QUOTES
 * trong docs/mockup/index.html để khớp đúng nội dung mockup.
 */
export const HOME_QUOTES: string[] = [
  'Một bước nhỏ mỗi ngày tạo nên hành trình lớn.',
  'Tập trung vào việc quan trọng, bỏ qua việc khẩn cấp giả.',
  'Bắt đầu từ nơi bạn đang đứng, dùng những gì bạn có.',
  'Kỷ luật là cây cầu giữa mục tiêu và thành quả.',
  'Hôm nay là trang giấy trắng — hãy viết điều tử tế lên đó.',
  'Việc khó nhất thường là việc đáng làm nhất.',
  'Đơn giản hoá. Rồi làm cho xong.',
  'Làm xong tốt hơn làm hoàn hảo — bắt đầu trước, chỉnh sau.',
  'Nghỉ ngơi đúng lúc cũng là một phần của năng suất.',
  'Đừng so sánh ngày hôm nay với hôm qua của người khác — so với chính bạn hôm qua.',
];

/** Tên người dùng ghép vào lời chào — để trống theo yêu cầu (không có setting đổi tên ở Phase 1). */
export const HOME_NAME = '';

/** Số ngày tính từ epoch (mốc ổn định để so sánh "có phải lần mở đầu tiên trong ngày" — xem appReducer HYDRATE). */
export function epochDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** Số ngày tính từ epoch modulo `len` — cùng ngày luôn ra cùng chỉ số. */
export function dayIndex(len: number): number {
  return epochDay() % len;
}

export function gradientForImageIndex(index: number): string {
  return HOME_GRADIENTS[index % HOME_GRADIENTS.length];
}

const DAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface HomeClockParts {
  hh: string;
  mm: string;
  ss: string;
}

export function formatHomeClock(now: Date): HomeClockParts {
  return { hh: pad2(now.getHours()), mm: pad2(now.getMinutes()), ss: pad2(now.getSeconds()) };
}

export function formatHomeDate(now: Date): string {
  return `${DAY_NAMES[now.getDay()]}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
}

export function formatGreeting(now: Date, name = HOME_NAME): string {
  const h = now.getHours();
  const part = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return name ? `${part}, ${name}` : part;
}

/** Lấy câu quote hiện tại từ `settings.homeQuotes` — index đã được seed/cập nhật theo rotateMode. */
export function todayQuote(homeQuotes: { texts: string[]; index: number }): string {
  return homeQuotes.texts[homeQuotes.index] ?? '';
}
