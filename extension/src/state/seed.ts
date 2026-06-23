import type { Settings, Space } from '../types';
import { DEFAULT_HOME_IMAGES, dayIndex } from '../features/home/homeContent';

export function defaultSettings(): Settings {
  return {
    theme: 'light',
    accent: '#5b6cff',
    homeBackground: {
      images: [...DEFAULT_HOME_IMAGES],
      // Chỉ số ngày tính từ epoch — đồng bộ cách chọn với quote, đổi mỗi ngày tự nhiên.
      index: dayIndex(DEFAULT_HOME_IMAGES.length),
      autoRotateMs: 0,
    },
    layoutSizes: { combined: 45, notes: 35, tasks: 45, reminder: 50 },
    mainBlockOrder: ['combined', 'notes', 'reminders'],
    collapsedBlocks: { tasks: false, reminder: false, habits: false, notes: false, reminders: false },
    noteView: 'grid',
    lastScreen: 'home',
  };
}

/** Lần đầu mở extension (storage rỗng): tạo đúng 1 Space trống, không seed data demo. */
export function createSeedSpaces(): Space[] {
  const space: Space = {
    id: crypto.randomUUID(),
    name: 'Cá nhân',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };

  return [space];
}
