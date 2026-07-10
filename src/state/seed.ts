import type { DashboardLayout, HomeBgSlot, LayoutBlockKey, LayoutSlot, Settings, Space } from '../types';
import { DEFAULT_HOME_IMAGES, HOME_QUOTES, dayIndex, epochDay } from '../features/home/homeContent';

/**
 * Layout mặc định — dựa trên bố cục tham chiếu `docs/demo-layout-options/index.html` nhưng
 * đổi vị trí khối Thói quen: gộp cùng cột với Việc cần làm + Nhắc việc (xếp dưới Việc cần làm)
 * thay vì tách riêng sang cột Thông báo như demo gốc — đúng yêu cầu thực tế đã chốt (Thói quen
 * và Nhắc việc phải nằm dưới Việc cần làm, không lẫn sang cột khác):
 * - Cột 1 (32%): notes (h=62) + logs/"Nhật ký nhanh" (h=20).
 * - Cột 2 (36%): tasks (h=45) + reminder/"Nhắc việc" (h=28) + habits/"Thói quen" (h=27)
 * - Cột 3 (32%): settings (h=22 — khối gộp "Widget điều hướng + Hôm nay", xem docs/requirements.md
 *   mục 4.1: hàng nav khoá cứng theo nội dung + hàng ambient đồng hồ/ngày/quote resize tự do bên
 *   trong, KHÔNG còn khoá cứng toàn khối ở cấp layout-engine — `h` chỉ là điểm khởi tạo, user
 *   resize được bình thường qua splitter) + reminders/"Thông báo" (h=68).
 * Lưu ý mapping id: demo dùng `reminders`/`noti` cho 2 khối khác field-naming trong code thật —
 * demo.reminders = "Nhắc việc" = field `reminder` (số ít) ở đây; demo.noti = "Thông báo" =
 * field `reminders` (số nhiều) ở đây (xem comment LayoutBlockKey trong types.ts).
 */
export function defaultDashboardLayout(): DashboardLayout {
  return {
    colWidths: [32, 36, 32],
    cols: [
      [
        { type: 'single', id: 'notes', h: 62 },
        { type: 'single', id: 'logs', h: 20 },
      ],
      [
        { type: 'single', id: 'tasks', h: 45 },
        { type: 'single', id: 'reminder', h: 28 },
        { type: 'single', id: 'habits', h: 27 },
      ],
      [
        { type: 'single', id: 'settings', h: 22 },
        { type: 'single', id: 'reminders', h: 68 },
      ],
    ],
  };
}

/**
 * `h` hiện tại của slot mang khối `id` trong 1 mảng `cols` — dùng làm giá trị khởi tạo/migrate
 * cho các field "dùng chung mọi Space" của mục 11.10 (`dashboardCornerHeight`/
 * `dashboardReminderHeight`, docs/features/layout-theo-space.md). Viết thành hàm chung thay vì
 * hard-code lại số ở nhiều nơi để không lệch pha nếu `defaultDashboardLayout()` sau này đổi giá
 * trị mặc định. Trả `fallback` nếu không tìm thấy slot nào chứa khối này (lưới an toàn — không
 * nên xảy ra với dữ liệu hợp lệ, cả 2 khối `settings`/`reminders` luôn có mặt).
 */
export function findSlotHeight(cols: LayoutSlot[][], id: LayoutBlockKey, fallback: number): number {
  for (const col of cols) {
    for (const slot of col) {
      if (slot.type === 'single' && slot.id === id) return slot.h;
      if (slot.type === 'row' && slot.items.some((it) => it.id === id)) return slot.h;
    }
  }
  return fallback;
}

/** Thin wrapper — giữ tên cũ cho các nơi gọi/test đã có, xem `findSlotHeight`. */
export function findSettingsCornerHeight(cols: LayoutSlot[][], fallback = 22): number {
  return findSlotHeight(cols, 'settings', fallback);
}

/** Cặp đôi với `findSettingsCornerHeight` — xem `findSlotHeight`. */
export function findReminderHeight(cols: LayoutSlot[][], fallback = 68): number {
  return findSlotHeight(cols, 'reminders', fallback);
}

export function defaultSettings(): Settings {
  return {
    theme: 'light',
    accent: '#5457d6',
    homeBackground: {
      images: DEFAULT_HOME_IMAGES.map((url): HomeBgSlot => ({ type: 'url', value: url })),
      // Chỉ số ngày tính từ epoch — đồng bộ cách chọn với quote, đổi mỗi ngày tự nhiên.
      index: dayIndex(DEFAULT_HOME_IMAGES.length),
      // Mặc định "Mỗi 15 phút" theo yêu cầu — trước đây mặc định "Tắt" (0).
      autoRotateMs: 900_000,
    },
    homeQuotes: {
      texts: [...HOME_QUOTES],
      // Cùng cách chọn với ảnh nền mặc định "Mỗi ngày" — chỉ số ngày tính từ epoch modulo 10.
      index: dayIndex(HOME_QUOTES.length),
      rotateMode: 'daily',
    },
    collapsedBlocks: { tasks: false, reminder: false, habits: false, notes: false, reminders: false, logs: false },
    noteView: 'grid',
    lastScreen: 'home',
    // Đã snap theo dayIndex ngay trên — đánh dấu hôm nay đã "sync" để HYDRATE đầu tiên
    // (ngay sau seed, cùng lượt) không snap lại lần nữa một cách dư thừa.
    lastOpenedEpochDay: epochDay(),
    dashboardLayout: defaultDashboardLayout(),
    // User hoàn toàn mới -> colWidths lấy đúng default, cols khởi tạo RỖNG (mọi Space fallback
    // qua `resolveDashboardCols()` về `defaultDashboardLayout().cols`).
    dashboardColWidths: defaultDashboardLayout().colWidths,
    dashboardCols: {},
    // Ngoại lệ dùng chung: h của khối 'settings', cùng nhóm khởi tạo với dashboardColWidths phía trên.
    dashboardCornerHeight: findSettingsCornerHeight(defaultDashboardLayout().cols),
    // Cặp đôi với dashboardCornerHeight: h của khối 'reminders' (Thông báo, LUÔN hiển thị mọi
    // Space, y hệt lý do settings dùng chung).
    dashboardReminderHeight: findReminderHeight(defaultDashboardLayout().cols),
    pushNotifySharedSpaceEvents: true,
  };
}

/** Lần đầu mở app (chưa có dữ liệu Supabase): tạo đúng 1 Space trống, không seed data demo. */
export function createSeedSpaces(): Space[] {
  const space: Space = {
    id: crypto.randomUUID(),
    name: 'Cá nhân',
    order: 0,
    // Space đầu tiên của user mới — coi như Space MỚI, mặc định TẮT tab Tổng hợp chi tiêu (giống
    // `defaultEnabledBlocks()` ở reducers/spaces.ts), user tự bật nếu muốn dùng làm sổ chi tiêu.
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true, expenseTracking: false },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
    logs: [],
  };

  return [space];
}
