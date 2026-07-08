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

/**
 * Nhật ký nhanh (`docs/features/nhat-ky-nhanh.md`) — record bất biến (chỉ tạo/xoá, không sửa),
 * không có tiêu đề/ngày-giờ hẹn/trạng thái hoàn thành/`order` thủ công. Sắp xếp CHỈ theo
 * `createdAt` (ISO timestamp) — nguồn sự thật duy nhất, không có `updatedAt`.
 */
export interface LogEntry {
  id: string;
  content: string; // nội dung log, bắt buộc không rỗng sau trim() — validate ở client
  createdBy?: string; // userId — chỉ set trong shared space, giống Task/Note
  createdAt: string; // ISO timestamp — dùng để sort, KHÔNG có updatedAt (bất biến)
}

export interface EnabledBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  /**
   * MỚI (2026-07-07, xem docs/features/nhat-ky-nhanh.md) — bật/tắt khối "Nhật ký nhanh" theo
   * từng Space, giống Task/Note/Habit.
   */
  logs: boolean;
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
 * 7 phần tử tham gia layout tự do của Dashboard (2026-07-08: gộp `today` vào `settings`, xem
 * docs/requirements.md mục 4.1). `reminder` (số ít) = khối "Nhắc việc"; `reminders` = khối
 * "Thông báo" (tên field cũ giữ nguyên để không phải đổi schema EnabledBlocks/CollapsedBlocks ở
 * nơi khác). `logs` = khối "Nhật ký nhanh".
 *
 * `settings` = khối gộp "Widget điều hướng + Hôm nay" (`DashboardCornerBlock.tsx`) — trước
 * 2026-07-08 là 2 phần tử riêng (`settings` = nav, `today` = đồng hồ/ngày/quote). Giữ nguyên tên
 * key `settings` cho khối gộp (đỡ đổi `HEIGHT_LOCKED_IDS`/`ENABLED_BLOCKS_KEY`/
 * `MOBILE_VISIBLE_BLOCKS`/`blockRefs` ở nhiều nơi khác — quyết định implementation, xem
 * docs/requirements.md mục 4.1 change impact #3) — `'today'` đã bị xoá khỏi union này, KHÔNG
 * còn là 1 `LayoutBlockKey` độc lập. Layout đã lưu từ trước còn `id:'today'` được tự động
 * migrate 1 lần (xem `normalizeDashboardLayout` trong `storage/normalize.ts`).
 */
export type LayoutBlockKey =
  | 'tasks'
  | 'reminder'
  | 'habits'
  | 'notes'
  | 'reminders'
  | 'settings'
  | 'logs';

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
  /**
   * MỚI (2026-07-07, xem docs/features/nhat-ky-nhanh.md) — item-level, giống `tasks`/`notes`.
   * Ở Shared Space (`kn_shared_spaces`), field này cần thêm cột `logs` mới trong DB (xem
   * `docs/features/nhat-ky-nhanh-schema.sql`) — bảng đó lưu từng mảng thành CỘT RIÊNG
   * (`tasks`/`notes`/`reminders`), KHÔNG phải 1 cột `spaces` jsonb gộp chung như
   * `kn_space_state` (Space cá nhân). Đọc/ghi cột này qua Supabase là việc của Phần 2
   * (storage functions), CHƯA làm ở Phần 1 — hiện `sharedSpaceStore.rowToSpace()` tạm trả về
   * `logs: []` cho mọi Shared Space bất kể DB có dữ liệu gì.
   */
  logs: LogEntry[];
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
  /** MỚI (2026-07-07) — trạng thái icon mắt ẩn/hiện nội dung khối "Nhật ký nhanh". */
  logs: boolean;
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
