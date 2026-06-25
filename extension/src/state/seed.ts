import type { DashboardLayout, HomeBgSlot, Settings, Space } from '../types';
import { DEFAULT_HOME_IMAGES, HOME_QUOTES, dayIndex, epochDay } from '../features/home/homeContent';

/**
 * Layout mặc định — tái tạo ĐÚNG hình ảnh layout cứng cũ (LayoutSizes mặc định:
 * combined 45 / notes 40 / reminders ~15%, tasks 45 / bottomRow 55, reminder 50 / habits 50)
 * để user cũ mở lại extension không bị xáo trộn cảm giác layout ban đầu:
 * - Cột 1 (45%): tasks (trên, h=45) + reminder/habits ghép ngang (dưới, h=55, w=50/50)
 * - Cột 2 (40%): today (trên, cố định theo nội dung) + notes (dưới, lớn)
 * - Cột 3 (15%): settings (trên, cố định theo nội dung) + reminders/Thông báo (dưới)
 */
export function defaultDashboardLayout(): DashboardLayout {
  return {
    colWidths: [45, 40, 15],
    cols: [
      [
        { type: 'single', id: 'tasks', h: 45 },
        { type: 'row', items: [{ id: 'reminder', w: 50 }, { id: 'habits', w: 50 }], h: 55 },
      ],
      [
        { type: 'single', id: 'today', h: 18 },
        { type: 'single', id: 'notes', h: 82 },
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
  };
}

/** Lần đầu mở extension (storage rỗng): tạo đúng 1 Space trống, không seed data demo. */
export function createSeedSpaces(): Space[] {
  const space: Space = {
    id: crypto.randomUUID(),
    name: 'Cá nhân',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, today: true },
    dashboardLayout: defaultDashboardLayout(),
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };

  return [space];
}
