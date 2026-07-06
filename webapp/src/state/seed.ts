import type { DashboardLayout, HomeBgSlot, Settings, Space } from '../types';
import { DEFAULT_HOME_IMAGES, HOME_QUOTES, dayIndex, epochDay } from '../features/home/homeContent';

/**
 * Layout mặc định — dựa trên bố cục tham chiếu `docs/demo-layout-options/index.html` nhưng
 * đổi vị trí khối Thói quen: gộp cùng cột với Việc cần làm + Nhắc việc (xếp dưới Việc cần làm)
 * thay vì tách riêng sang cột Thông báo như demo gốc — đúng yêu cầu thực tế đã chốt (Thói quen
 * và Nhắc việc phải nằm dưới Việc cần làm, không lẫn sang cột khác):
 * - Cột 1 (32%): today (h=18) + notes (h=82)
 * - Cột 2 (36%): tasks (h=45) + reminder/"Nhắc việc" (h=28) + habits/"Thói quen" (h=27)
 * - Cột 3 (32%): settings (h=14, cố định theo nội dung) + reminders/"Thông báo" (h=86)
 * Lưu ý mapping id: demo dùng `reminders`/`noti` cho 2 khối khác field-naming trong code thật —
 * demo.reminders = "Nhắc việc" = field `reminder` (số ít) ở đây; demo.noti = "Thông báo" =
 * field `reminders` (số nhiều) ở đây (xem comment LayoutBlockKey trong types.ts).
 */
export function defaultDashboardLayout(): DashboardLayout {
  return {
    colWidths: [32, 36, 32],
    cols: [
      [
        { type: 'single', id: 'today', h: 18 },
        { type: 'single', id: 'notes', h: 82 },
      ],
      [
        { type: 'single', id: 'tasks', h: 45 },
        { type: 'single', id: 'reminder', h: 28 },
        { type: 'single', id: 'habits', h: 27 },
      ],
      [
        { type: 'single', id: 'settings', h: 14 },
        { type: 'single', id: 'reminders', h: 86 },
      ],
    ],
  };
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
    collapsedBlocks: { tasks: false, reminder: false, habits: false, notes: false, reminders: false },
    noteView: 'grid',
    lastScreen: 'home',
    // Đã snap theo dayIndex ngay trên — đánh dấu hôm nay đã "sync" để HYDRATE đầu tiên
    // (ngay sau seed, cùng lượt) không snap lại lần nữa một cách dư thừa.
    lastOpenedEpochDay: epochDay(),
    dashboardLayout: defaultDashboardLayout(),
    pushNotifySharedSpaceEvents: true,
  };
}

/** Lần đầu mở extension (storage rỗng): tạo đúng 1 Space trống, không seed data demo. */
export function createSeedSpaces(): Space[] {
  const space: Space = {
    id: crypto.randomUUID(),
    name: 'Cá nhân',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, today: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };

  return [space];
}
