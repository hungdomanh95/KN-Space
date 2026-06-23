// ============================================================================
// Mô hình dữ liệu KN-Space — Phase 1
// ============================================================================

export interface Task {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd, '' nếu không đặt
  time: string; // HH:mm, '' nếu không đặt
  done: boolean;
}

export type ReminderFreqUnit = 'hour' | 'day' | 'month';

export interface ReminderOnce {
  id: string;
  type: 'once';
  title: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm, '' nếu không đặt
}

export interface ReminderRecurring {
  id: string;
  type: 'recurring';
  title: string;
  freqN: number; // >= 1
  freqUnit: ReminderFreqUnit;
  dayOfMonth: number | null; // chỉ dùng khi freqUnit === 'month', 1-31
  time: string; // HH:mm, '' nếu freqUnit === 'hour' hoặc không đặt
  /**
   * Mốc tạo (yyyy-mm-dd) — field MỚI không có trong mockup, dùng để tính
   * due-today cho chu kỳ theo "Ngày": (số ngày từ createdAt đến hôm nay) % freqN === 0.
   */
  createdAt: string;
}

export type ReminderDefinition = ReminderOnce | ReminderRecurring;

export interface Habit {
  id: string;
  title: string;
  completedDates: string[]; // yyyy-mm-dd[]
}

export interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  updatedAt: number; // epoch ms
  order: number;
  expanded: boolean; // view list: show hết nội dung thay vì clamp 4 dòng
}

export interface EnabledBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
}

export interface Space {
  id: string;
  name: string;
  order: number;
  enabledBlocks: EnabledBlocks;
  tasks: Task[];
  reminders: ReminderDefinition[];
  habits: Habit[];
  notes: Note[];
}

export type ThemeMode = 'light' | 'dark';

export type Screen = 'home' | 'dashboard';

/** Khoảng tự động đổi ảnh nền Home/Dashboard, ms. 0 = tắt. */
export type HomeBgAutoRotateMs = 0 | 60_000 | 900_000 | 3_600_000;

/** Ảnh nền dùng chung Home + Dashboard: 6 link tĩnh, chỉ số đang chọn, khoảng tự đổi. */
export interface HomeBackground {
  images: string[]; // luôn 6 link cố định, sửa được qua Settings
  index: number; // chỉ số ảnh đang dùng trong `images`
  autoRotateMs: HomeBgAutoRotateMs;
}

export interface LayoutSizes {
  combined: number; // % chiều rộng khối tổng hợp
  notes: number; // % chiều rộng khối Ghi chú (Thông báo = phần còn lại)
  tasks: number; // % chiều cao "Việc cần làm" so với hàng dưới (Nhắc việc + Thói quen)
  reminder: number; // % chiều rộng "Nhắc việc" so với hàng dưới (Thói quen = phần còn lại)
}

export type MainBlockKey = 'combined' | 'notes' | 'reminders';

export interface CollapsedBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
}

export type TaskFilter = 'all' | 'pending' | 'done';
export type NoteSortBy = 'order' | 'title' | 'recent';
export type NoteView = 'grid' | 'list';

export interface Settings {
  theme: ThemeMode;
  accent: string;
  homeBackground: HomeBackground;
  layoutSizes: LayoutSizes;
  mainBlockOrder: MainBlockKey[];
  collapsedBlocks: CollapsedBlocks;
  noteView: NoteView;
  /**
   * Màn cuối cùng user rời đi (Home/Dashboard) — PHẢI persist để mở tab mới
   * luôn mở lại đúng màn cuối (yêu cầu cố định, không phải setting cho chọn).
   */
  lastScreen: Screen;
}

/** UI state ephemeral — KHÔNG persist xuống storage. */
export interface UiState {
  taskFilter: TaskFilter;
  noteSearch: string;
  noteSortBy: NoteSortBy;
  hiddenNoteContentIds: Set<string>;
  /** Màn hiện tại đang hiển thị — khởi tạo từ settings.lastScreen lúc HYDRATE, sau đó ephemeral. */
  currentScreen: Screen;
}

export interface AppState {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
  ui: UiState;
  storageFallbackActive: boolean;
}

export interface NotificationRow {
  key: string;
  title: string;
  label: string;
  done: boolean;
  isReadOnly: boolean;
  source: { type: 'task' | 'habit'; id: string } | null;
  timeMinutes: number | null;
  isInfo: boolean;
}

/** Payload export/import JSON. */
export interface ExportPayload {
  schemaVersion: number;
  exportedAt: string;
  currentSpaceId: string;
  spaces: Space[];
  settings: Settings;
}
