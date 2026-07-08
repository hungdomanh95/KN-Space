import type { DashboardLayout, HomeBgSlot, LayoutSlot, Settings, Space } from '../types';
import { DEFAULT_HOME_IMAGES, HOME_QUOTES, dayIndex, epochDay } from '../features/home/homeContent';

/**
 * Layout mặc định — dựa trên bố cục tham chiếu `docs/demo-layout-options/index.html` nhưng
 * đổi vị trí khối Thói quen: gộp cùng cột với Việc cần làm + Nhắc việc (xếp dưới Việc cần làm)
 * thay vì tách riêng sang cột Thông báo như demo gốc — đúng yêu cầu thực tế đã chốt (Thói quen
 * và Nhắc việc phải nằm dưới Việc cần làm, không lẫn sang cột khác):
 * - Cột 1 (32%): notes (h=62) + logs/"Nhật ký nhanh" (h=20) — không đổi so với trước
 *   2026-07-08 ngoài việc mất khối `today` cũ (đã gộp vào `settings`, xem cột 3 dưới đây).
 * - Cột 2 (36%): tasks (h=45) + reminder/"Nhắc việc" (h=28) + habits/"Thói quen" (h=27)
 * - Cột 3 (32%): settings (h=22, MỚI 2026-07-08 — khối gộp "Widget điều hướng + Hôm nay", xem
 *   docs/requirements.md mục 4.1: hàng nav khoá cứng theo nội dung + hàng ambient đồng hồ/ngày/
 *   quote resize tự do bên trong, KHÔNG còn khoá cứng toàn khối ở cấp layout-engine — `h` chỉ là
 *   điểm khởi tạo, user resize được bình thường qua splitter) + reminders/"Thông báo" (h=68,
 *   giảm từ 86 để nhường chỗ cho hàng ambient mới của khối gộp).
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
 * `h` hiện tại của slot `id === 'settings'` trong 1 mảng `cols` — dùng làm giá trị khởi tạo/
 * migrate cho `Settings.dashboardCornerHeight` (mục 11.10, docs/features/layout-theo-space.md).
 * Viết thành hàm thay vì hard-code lại số `22` để không lệch pha nếu `defaultDashboardLayout()`
 * sau này đổi giá trị mặc định. Trả `fallback` nếu không tìm thấy slot nào chứa khối này (lưới
 * an toàn — không nên xảy ra với dữ liệu hợp lệ, khối `settings` luôn có mặt).
 */
export function findSettingsCornerHeight(cols: LayoutSlot[][], fallback = 22): number {
  for (const col of cols) {
    for (const slot of col) {
      if (slot.type === 'single' && slot.id === 'settings') return slot.h;
      if (slot.type === 'row' && slot.items.some((it) => it.id === 'settings')) return slot.h;
    }
  }
  return fallback;
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
    // MỚI (2026-07-08, xem docs/features/layout-theo-space.md mục 11.4): user hoàn toàn mới
    // (chưa từng có `dashboardLayout` cũ) -> colWidths lấy đúng default, cols khởi tạo RỖNG (mọi
    // Space fallback qua `resolveDashboardCols()` về `defaultDashboardLayout().cols`).
    dashboardColWidths: defaultDashboardLayout().colWidths,
    dashboardCols: {},
    // MỚI (2026-07-08, mục 11.10) — ngoại lệ dùng chung: h của khối 'settings', cùng nhóm khởi
    // tạo với dashboardColWidths phía trên.
    dashboardCornerHeight: findSettingsCornerHeight(defaultDashboardLayout().cols),
    pushNotifySharedSpaceEvents: true,
  };
}

/** Lần đầu mở extension (storage rỗng): tạo đúng 1 Space trống, không seed data demo. */
export function createSeedSpaces(): Space[] {
  const space: Space = {
    id: crypto.randomUUID(),
    name: 'Cá nhân',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
    logs: [],
  };

  return [space];
}
