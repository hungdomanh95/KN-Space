// ============================================================================
// Mô hình dữ liệu KN-Space — Phase 1
// ============================================================================

export interface Task {
  id: string;
  title: string;
  content: string; // nội dung chi tiết tuỳ chọn (textarea), '' nếu không đặt
  date: string; // yyyy-mm-dd, '' nếu không đặt
  time: string; // HH:mm, '' nếu không đặt
  done: boolean;
  order: number; // thứ tự sắp xếp thủ công (kéo-thả qua icon grip)
  createdBy?: string; // userId — chỉ set trong shared space
  createdAt?: string; // ISO timestamp lúc tạo — dùng hiện giờ gửi trong MobileChatScreen
  /** user_id được giao việc — chỉ có ý nghĩa ở Shared Space, rỗng = chưa giao ai */
  assigneeIds: string[];
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
  hidden: boolean;   // ẩn nội dung (note bảo mật) — persist để giữ trạng thái sau reload
  createdBy?: string; // userId — chỉ set trong shared space
  createdAt?: string; // ISO timestamp lúc tạo — dùng hiện giờ gửi trong MobileChatScreen (khác updatedAt vì đó là lần sửa cuối)
}

export interface EnabledBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  today: boolean;
}

export type ThemeMode = 'light' | 'dark';

export type Screen = 'home' | 'dashboard';

/** Khoảng tự động đổi ảnh nền Home/Dashboard, ms. 0 = tắt. */
export type HomeBgAutoRotateMs = 0 | 60_000 | 900_000 | 3_600_000;

/**
 * 1 slot ảnh nền: `url` = link hotlink tĩnh, `upload` = ảnh người dùng chọn từ máy,
 * lưu base64 data-URL (xem mục 10 requirements). Lưu trong `settings` (jsonb) trên
 * Supabase nên đồng bộ được giữa các máy, khác bản chrome.storage cũ (ảnh upload
 * từng phải tách riêng vào local vì vượt quota 8KB/item của chrome.storage.sync).
 */
export type HomeBgSlot = { type: 'url'; value: string } | { type: 'upload'; value: string };

/** Ảnh nền dùng chung Home + Dashboard: 6 slot, chỉ số đang chọn, khoảng tự đổi. */
export interface HomeBackground {
  images: HomeBgSlot[]; // luôn 6 slot cố định, sửa được qua Settings (link hoặc upload)
  index: number; // chỉ số ảnh đang dùng trong `images`
  autoRotateMs: HomeBgAutoRotateMs;
}

/**
 * 6 phần tử tham gia layout tự do của Dashboard. `reminder` (số ít) = khối "Nhắc việc";
 * `reminders` = khối "Thông báo" (tên field cũ giữ nguyên để không phải đổi schema
 * EnabledBlocks/CollapsedBlocks ở nơi khác). `settings` = widget điều hướng DashboardCorner.
 */
export type LayoutBlockKey = 'tasks' | 'reminder' | 'habits' | 'notes' | 'reminders' | 'settings' | 'today';

/**
 * 1 slot xếp dọc trong 1 cột — `single` chiếm cả chiều rộng cột, `row` ghép 2 khối nằm
 * ngang cạnh nhau trong cùng 1 slot. `h`/`w` là trọng số flex-grow tương đối (không cần
 * cộng = 100) — xem demo docs/demo-layout-options/index.html.
 */
export type LayoutSlot =
  | { type: 'single'; id: LayoutBlockKey; h: number }
  | { type: 'row'; items: { id: LayoutBlockKey; w: number }[]; h: number };

/** Layout Dashboard tự do: N cột, mỗi cột là 1 danh sách slot xếp dọc. */
export interface DashboardLayout {
  colWidths: number[]; // % mỗi cột, không cần cộng đúng 100
  cols: LayoutSlot[][];
}

export type SpaceMemberRole = 'owner' | 'member';

export interface SharedSpaceMember {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: SpaceMemberRole;
  joinedAt: string; // ISO timestamp
}

export interface SpaceInvite {
  id: string;
  spaceId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string; // userId
  acceptedAt?: string;
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
  /** true nếu là shared space (lưu trong kn_shared_spaces) */
  isShared?: boolean;
  /** uuid của hàng trong kn_shared_spaces (= id trong bảng đó) */
  sharedSpaceId?: string;
  /** version optimistic lock từ kn_shared_spaces — dùng nội bộ để save, không hiển thị UI */
  _sharedVersion?: number;
}

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

/** Tần suất đổi quote Home: 'daily' = theo dayIndex (mặc định), các giá trị khác đổi theo sự kiện/interval. */
export type QuoteRotateMode = 'daily' | 'onopen' | 'every15m' | 'every1h';

/** Quote Home: 10 slot cố định (không CRUD thêm/xoá), chỉ sửa nội dung qua Settings tab "Quote". */
export interface HomeQuotes {
  texts: string[]; // luôn đúng 10 phần tử
  index: number; // chỉ số quote đang hiển thị trên Home
  rotateMode: QuoteRotateMode;
}

export interface Settings {
  theme: ThemeMode;
  accent: string;
  homeBackground: HomeBackground;
  homeQuotes: HomeQuotes;
  collapsedBlocks: CollapsedBlocks;
  noteView: NoteView;
  /**
   * Màn cuối cùng user rời đi (Home/Dashboard) — PHẢI persist để mở tab mới
   * luôn mở lại đúng màn cuối (yêu cầu cố định, không phải setting cho chọn).
   */
  lastScreen: Screen;
  /**
   * `epochDay()` (xem homeContent.ts) lúc app HYDRATE lần gần nhất — dùng để phát hiện
   * "lần đầu mở app trong ngày" (mục 4.6/7 requirements: ảnh nền + quote "Mỗi ngày" chỉ
   * snap lại theo dayIndex 1 LẦN mỗi ngày, không phải mỗi lần mở tab trong cùng 1 ngày).
   * -1 = chưa từng hydrate (luôn coi là "ngày mới" ở lần đầu).
   */
  lastOpenedEpochDay: number;
  /**
   * Bố cục Dashboard — DÙNG CHUNG cho mọi Space (đúng yêu cầu mục 4 requirements.md: "Lưu tỉ lệ
   * layout + thứ tự khối vào storage, dùng chung cho mọi Space"). Khối nào 1 Space không bật
   * (`enabledBlocks`) thì tự ẩn khỏi layout lúc render (xem `deriveVisibleLayout`), không cần
   * layout riêng từng Space — tránh hẳn việc đồng bộ/copy layout giữa các Space.
   */
  dashboardLayout: DashboardLayout;
  /** Bật/tắt thông báo push cho sự kiện Shared Space (giao việc/hoàn thành) — độc lập với thông báo đến hạn. */
  pushNotifySharedSpaceEvents: boolean;
}

/** UI state ephemeral — KHÔNG persist xuống storage. */
export interface UiState {
  taskFilter: TaskFilter;
  noteSearch: string;
  noteSortBy: NoteSortBy;
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
