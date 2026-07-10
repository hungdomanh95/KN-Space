import type { LogEntry, SharedSpaceMember } from '../../types';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';

/**
 * Logic parse số tiền + phân loại hạng mục cho tính năng Quản lý/phân loại chi tiêu
 * (`docs/features/quan-ly-chi-tieu.md`). Port gần như nguyên vẹn từ demo Artifact đã verify bằng
 * test thật trong quá trình bàn UX (mục 6.1/6.2 tài liệu) — KHÔNG tự nghĩ lại quy tắc.
 *
 * Toàn bộ hàm ở đây THUẦN (không đọc/ghi state) — `amount`/hạng mục tự nhận diện được tính lại
 * CLIENT-SIDE mỗi lần render từ `content`, không lưu cố định vào `LogEntry` (mục 6.3 tài liệu).
 */

export interface ExpenseCategory {
  name: string;
  colorVar: string;
  keywords: string[];
}

/**
 * Preset 9 hạng mục cố định, thứ tự ưu tiên khi khớp nhiều nhóm — dừng ở nhóm đầu tiên khớp
 * (mục 6.2 tài liệu). "Khác" (`OTHER_CATEGORY`) là fallback, không có từ khoá.
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    name: 'Ăn uống',
    colorVar: 'var(--habit-color)',
    keywords: ['an sang', 'an trua', 'an toi', 'an vat', 'ca phe', 'cf', 'coffee', 'tra sua', 'com trua', 'com', 'pho', 'bun', 'chao', 'banh mi', 'xoi'],
  },
  {
    name: 'Nhà cửa / Hoá đơn',
    colorVar: 'var(--accent)',
    keywords: ['tien dien', 'tien nuoc', 'tien nha', 'tien internet', 'wifi', 'tien rac', 'chung cu', 'quan ly phi', 'gas'],
  },
  {
    name: 'Di chuyển',
    colorVar: 'var(--recurring-color)',
    keywords: ['xang', 'grab', 'taxi', 'xe om', 'gui xe', 've xe', 'bao duong xe'],
  },
  {
    name: 'Mua sắm',
    colorVar: 'var(--note-color)',
    keywords: ['mua', 'shopee', 'tiki', 'lazada', 'quan ao', 'giay dep', 'sieu thi', 'cho'],
  },
  {
    name: 'Sức khoẻ',
    colorVar: 'var(--done)',
    keywords: ['thuoc', 'kham benh', 'benh vien', 'nha khoa'],
  },
  {
    name: 'Giáo dục / Con cái',
    colorVar: 'var(--purple)',
    // 'sua ' (có khoảng trắng cuối) cố ý — tránh khớp nhầm "sửa" (sửa xe/sửa đồ, cũng bỏ dấu
    // thành "sua") khi từ này không phải từ cuối câu; log chi tiêu thường có số tiền theo sau
    // nên hầu hết case thật vẫn có khoảng trắng sau "sua".
    keywords: ['hoc phi', 'sach vo', 'bim', 'sua ', 'do choi'],
  },
  {
    name: 'Giải trí',
    colorVar: 'var(--amber)',
    // ' choi' có khoảng trắng đầu — tránh khớp nhầm bên trong từ khác chứa "choi" không đứng riêng.
    keywords: ['xem phim', 'du lich', ' choi'],
  },
  {
    name: 'Chuyển khoản',
    colorVar: 'var(--log-color)',
    // ' muon' có khoảng trắng đầu — cùng lý do trên (tránh khớp nhầm trong từ khác).
    keywords: ['chuyen tien', 'chuyen khoan', 'tra no', 'cho vay', ' muon'],
  },
];

export const OTHER_CATEGORY: ExpenseCategory = { name: 'Khác', colorVar: 'var(--text-dim)', keywords: [] };

/** Toàn bộ tên hạng mục hợp lệ, đúng thứ tự hiển thị trong dropdown chọn hạng mục. */
export const ALL_CATEGORY_NAMES: string[] = [...EXPENSE_CATEGORIES.map((c) => c.name), OTHER_CATEGORY.name];

/** Chuẩn hoá tiếng Việt: bỏ dấu (NFD + xoá combining mark) + đ/Đ -> d + lowercase. */
function normalizeVN(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/** Tự nhận diện hạng mục từ `content` theo thứ tự ưu tiên preset — fallback "Khác". */
export function categorizeContent(content: string): string {
  const n = normalizeVN(content);
  for (const cat of EXPENSE_CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw))) return cat.name;
  }
  return OTHER_CATEGORY.name;
}

/** Màu token CSS gắn với 1 tên hạng mục (kể cả "Khác"). Tên lạ (không thuộc preset) fallback màu "Khác". */
export function categoryColor(name: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.name === name)?.colorVar ?? OTHER_CATEGORY.colorVar;
}

/**
 * Parse số tiền từ `content` — 3 rule theo thứ tự ưu tiên (mục 6.1 tài liệu), dừng ở rule đầu
 * tiên khớp. BẮT BUỘC dùng `\p{L}` (Unicode letter, flag `/u`) thay vì `\b` mặc định của JS —
 * `\b` không coi ký tự có dấu tiếng Việt là word-char, match sai kiểu "hẹn 13 trưa" -> 13tr.
 */
export function parseAmount(content: string): number | null {
  // Rule 1: "Xtr" / "XtrY" (Y đúng 1 chữ số) -> X triệu + Y trăm nghìn. ≥2 chữ số sau "tr"
  // ("1tr20") cố tình KHÔNG parse — nhập nhằng thật, an toàn hơn đoán sai.
  const trieu = content.match(/(?<![\p{L}\d])(\d+)tr(\d)?(?!\d)(?![\p{L}])/u);
  if (trieu) {
    const million = parseInt(trieu[1], 10);
    const hundredK = trieu[2] ? parseInt(trieu[2], 10) : 0;
    return million * 1_000_000 + hundredK * 100_000;
  }
  // Rule 2: "Xk" -> X nghìn (làm tròn, cho phép phần thập phân "1.5k"/"1,5k").
  const k = content.match(/(?<![\p{L}\d])(\d+(?:[.,]\d+)?)k(?![\p{L}])/u);
  if (k) {
    return Math.round(parseFloat(k[1].replace(',', '.')) * 1000);
  }
  // Rule 3: số nguyên nhóm 3 chữ số cách nhau dấu chấm (vd "1.250.143") -> giữ nguyên sau khi bỏ dấu chấm.
  const grouped = content.match(/(?<![\p{L}\d.])(\d{1,3}(?:\.\d{3})+)(?![\p{L}\d])/u);
  if (grouped) {
    return parseInt(grouped[1].replace(/\./g, ''), 10);
  }
  return null;
}

/** Format số nguyên VNĐ kiểu "1.250.143đ". */
export function fmtVND(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`;
}

/** "YYYY-MM-DD" -> `Date` local lúc 00:00 (không qua `new Date(string)` để tránh lệch UTC). */
function parseYMD(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function todayLocalYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ngày giao dịch hiệu lực — `expenseDate` nếu có, không thì lấy phần ngày của `createdAt` (mục 9). */
export function getLogExpenseDate(log: LogEntry): string {
  return log.expenseDate || log.createdAt.slice(0, 10);
}

/** Hạng mục hiệu lực — `categoryOverride` nếu có, không thì auto-detect theo `content` (mục 9). */
export function getLogCategory(log: LogEntry): string {
  return log.categoryOverride || categorizeContent(log.content);
}

/** true nếu log đã bị "backdate" — `expenseDate` khác ngày `createdAt` gốc (mục 5.1 tài liệu). */
export function isLogBackdated(log: LogEntry): boolean {
  return !!log.expenseDate && log.expenseDate !== log.createdAt.slice(0, 10);
}

/** Chỉ log của chính mình (createdBy trống hoặc === userId hiện tại) mới sửa được ngày/hạng mục/loại-bỏ (mục 4 tài liệu). */
export function isOwnExpenseLog(log: LogEntry, currentUserId: string | null): boolean {
  return !log.createdBy || log.createdBy === currentUserId;
}

export type ExpenseRange = 'week' | 'month';

/** "7 ngày qua" = hôm nay lùi tối đa 6 ngày. "Tháng này" = cùng năm+tháng dương lịch hiện tại. */
export function isDateInRange(dateStr: string, range: ExpenseRange): boolean {
  const d = parseYMD(dateStr);
  if (!d) return false;
  const today = parseYMD(todayLocalYMD())!;
  if (range === 'month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 6;
}

/** "Hôm nay" nếu đúng ngày hiện tại, không thì "dd/MM". Dùng cho chip ngày backdate + label bảng "Theo ngày". */
export function formatExpenseDateLabel(dateStr: string): string {
  if (dateStr === todayLocalYMD()) return 'Hôm nay';
  const d = parseYMD(dateStr);
  if (!d) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Nhãn hiển thị + màu cho 1 tác giả log trong bảng "Theo người ghi"/badge chi tiết hạng mục.
 * KHÔNG dùng thẳng fallback `"Thành viên"` mặc định của `getMemberDisplayName` cho member đã rời
 * Shared Space — rủi ro gộp nhầm nhiều cựu thành viên khác nhau vào cùng 1 nhãn, cộng sai số tiền
 * (edge case mục 8/10#2 tài liệu). Thêm hậu tố 4 ký tự cuối `userId` để phân biệt.
 */
export function getExpenseAuthorLabel(
  userId: string | undefined,
  members: SharedSpaceMember[],
  currentUserId: string | null,
): { name: string; color: string } {
  if (!userId || userId === currentUserId) {
    return { name: 'Bạn', color: 'var(--accent)' };
  }
  const isKnownMember = members.some((m) => m.userId === userId);
  const color = getMemberColor(userId, members);
  if (isKnownMember) {
    return { name: getMemberDisplayName(userId, members, Infinity), color };
  }
  return { name: `Cựu thành viên #${userId.slice(-4)}`, color };
}
