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
  hidden: boolean;   // ẩn nội dung (note bảo mật) — persist để giữ trạng thái sau reload
  createdBy?: string; // userId — chỉ set trong shared space
  createdAt?: string; // ISO timestamp lúc tạo — dùng hiện giờ gửi trong MobileChatScreen (khác updatedAt vì đó là lần sửa cuối)
}

/**
 * Nhật ký nhanh (`docs/features/nhat-ky-nhanh.md`) — record gần như bất biến: `content`/
 * `createdBy`/`createdAt` KHÔNG sửa được sau khi tạo, không có tiêu đề/giờ hẹn/trạng thái hoàn
 * thành/`order` thủ công. Sắp xếp CHỈ theo `createdAt` (ISO timestamp) — nguồn sự thật duy nhất,
 * không có `updatedAt`.
 *
 * Mở rộng cho tính năng Quản lý/phân loại chi tiêu (`docs/features/quan-ly-chi-tieu.md` mục 6.3/9)
 * — đúng 1 khe hẹp: 3 field optional bên dưới SỬA được, tách bạch hoàn toàn khỏi `content` gốc.
 * `amount`/hạng mục tự nhận diện KHÔNG lưu ở đây — tính lại client-side mỗi lần xem
 * (`features/logs/expenseUtils.ts`), chỉ 3 field dưới đây là state thật (user chủ động sửa).
 */
export interface LogEntry {
  id: string;
  content: string; // nội dung log, bắt buộc không rỗng sau trim() — validate ở client
  createdBy?: string; // userId — chỉ set trong shared space, giống Task/Note
  createdAt: string; // ISO timestamp — dùng để sort, KHÔNG có updatedAt (bất biến)
  /** Ngày giao dịch thực tế, "YYYY-MM-DD". Absent = dùng ngày phần `createdAt` (xem `getLogExpenseDate`). */
  expenseDate?: string;
  /** Hạng mục user tự chọn (1 trong preset cố định, `EXPENSE_CATEGORIES`), đè lên kết quả tự nhận
   *  diện theo `content`. Absent = dùng auto-detect (xem `getLogCategory`). */
  categoryOverride?: string;
  /** true = loại khỏi Tổng hợp dù `content` có parse ra số tiền. Absent = coi như `false`. */
  excluded?: boolean;
}

export interface EnabledBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  /** Bật/tắt khối "Nhật ký nhanh" theo từng Space, giống Task/Note/Habit (xem docs/features/nhat-ky-nhanh.md). */
  logs: boolean;
  /**
   * Bật tab "Tổng hợp" (phân loại/tổng hợp chi tiêu, xem docs/features/quan-ly-chi-tieu.md) trong
   * khối Nhật ký nhanh. Theo Space chứ không phải toàn app — không phải Space nào cũng dùng Nhật ký
   * nhanh để log chi tiêu. Space cá nhân MỚI tạo mặc định `false` (`defaultEnabledBlocks()`); Space
   * đã tồn tại trước khi field này ra đời mặc định `true` khi thiếu key (xem các hàm
   * `normalize*EnabledBlocks()`), để không mất tab đột ngột ở Space đang dùng thật.
   */
  expenseTracking: boolean;
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
 * 7 phần tử tham gia layout tự do của Dashboard (xem docs/requirements.md mục 4.1). `reminder`
 * (số ít) = khối "Nhắc việc"; `reminders` = khối "Thông báo" (tên field cũ giữ nguyên để không
 * phải đổi schema EnabledBlocks/CollapsedBlocks ở nơi khác). `logs` = khối "Nhật ký nhanh".
 *
 * `settings` = khối gộp "Widget điều hướng + Hôm nay" (`DashboardCornerBlock.tsx`) — trước đây là
 * 2 phần tử riêng (`settings` = nav, `today` = đồng hồ/ngày/quote). Giữ nguyên tên key `settings`
 * cho khối gộp (đỡ đổi `HEIGHT_LOCKED_IDS`/`ENABLED_BLOCKS_KEY`/`MOBILE_VISIBLE_BLOCKS`/
 * `blockRefs` ở nhiều nơi khác) — `'today'` đã bị xoá khỏi union này, KHÔNG còn là 1
 * `LayoutBlockKey` độc lập. Layout đã lưu từ trước còn `id:'today'` được tự động migrate 1 lần
 * (xem `normalizeDashboardLayout` trong `storage/normalize.ts`).
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
   * Nhật ký nhanh — item-level, giống `tasks`/`notes` (xem docs/features/nhat-ky-nhanh.md). Ở
   * Shared Space (`kn_shared_spaces`), field này có cột `logs` riêng trong DB (xem
   * `docs/features/nhat-ky-nhanh-schema.sql`) — bảng đó lưu từng mảng thành CỘT RIÊNG
   * (`tasks`/`notes`/`reminders`/`logs`), KHÔNG phải 1 cột `spaces` jsonb gộp chung như
   * `kn_space_state` (Space cá nhân). Đọc/ghi qua `sharedSpaceStore.ts`.
   */
  logs: LogEntry[];
  /** true nếu là shared space (lưu trong kn_shared_spaces) */
  isShared?: boolean;
  /** uuid của hàng trong kn_shared_spaces (= id trong bảng đó) */
  sharedSpaceId?: string;
  /** version optimistic lock từ kn_shared_spaces — dùng nội bộ để save, không hiển thị UI */
  _sharedVersion?: number;
  /**
   * version optimistic lock từ `kn_private_spaces` (Space cá nhân, xem
   * docs/features/storage-architecture-fix.md mục 4 Bước 3) — dùng nội bộ để save, không hiển thị
   * UI. Chỉ có ý nghĩa khi `!isShared`. `undefined` = Space CHƯA từng được ghi lên DB (vừa tạo cục
   * bộ qua `SPACE_CREATE`/import — tầng storage cần INSERT thay vì UPDATE); một số giá trị số =
   * hàng đã tồn tại trên `kn_private_spaces`, dùng làm `expectedVersion` cho UPDATE.
   */
  _privateVersion?: number;
}

export interface CollapsedBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  /** Trạng thái icon mắt ẩn/hiện nội dung khối "Nhật ký nhanh". */
  logs: boolean;
}

export type TaskFilter = 'all' | 'pending' | 'done';
export type NoteSortBy = 'order' | 'title' | 'recent';

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
   * Bố cục Dashboard — field ĐƠN LỊCH SỬ, ĐÃ NGỪNG dùng làm nguồn đọc/fallback cho
   * `dashboardColWidths`/`dashboardCols` bên dưới (xem `resolveDashboardCols`/`normalizeSettings`
   * trong `storage/normalize.ts` để biết lý do — dữ liệu đóng băng, có thể mang cấu trúc cột cũ
   * không khớp bố cục mặc định hiện hành, gây vỡ layout nếu dùng làm fallback ngầm). Field này
   * **KHÔNG bị xoá khỏi schema** (dữ liệu cũ trong Postgres của user vẫn còn cột này, xoá field TS
   * không xoá được data thật) và **vẫn được `normalizeSettings` tính/giữ nguyên trong object trả
   * về** (để không vi phạm kiểu bắt buộc + không mất dữ liệu khi export/import) — nhưng không còn
   * action nào ghi mới, và không còn nơi nào đọc chủ động để suy luận colCount/giá trị mặc định.
   * Coi như field "chết" an toàn.
   */
  dashboardLayout: DashboardLayout;
  /**
   * Độ rộng 3 cột lớn của Dashboard (%, không cần cộng đúng 100). DÙNG CHUNG cho MỌI Space của
   * user. Fallback khi chưa lưu: THẲNG `defaultDashboardLayout().colWidths` (KHÔNG qua
   * `dashboardLayout.colWidths` cũ, xem comment `dashboardLayout` phía trên).
   */
  dashboardColWidths: number[];
  /**
   * Khối nào nằm cột nào/chiều cao bao nhiêu trong Dashboard — RIÊNG theo TỪNG Space (key =
   * `spaceId`), khác hẳn `dashboardColWidths` phía trên. Space chưa có entry ở đây (chưa từng bị
   * user tự chỉnh riêng) đọc fallback qua `resolveDashboardCols()` (storage/normalize.ts): THẲNG
   * `defaultDashboardLayout().cols` (KHÔNG qua `dashboardLayout.cols` cũ). KHÔNG eager-write entry
   * cho mọi Space ngay từ đầu (Space cá nhân/Shared Space load không đồng bộ).
   *
   * Áp dụng đúng bài học `enabledBlocks` (docs/features/shared-space.md) — 2 field này PHẢI nằm
   * trong `Settings` (cấp user), KHÔNG đặt trong `interface Space` — nếu không sẽ tái tạo bug
   * "layout dùng chung cho mọi thành viên Shared Space", vi phạm nguyên tắc "mỗi thành viên tự
   * sắp layout riêng" đã chốt.
   */
  dashboardCols: Record<string, LayoutSlot[][]>;
  /**
   * Ngoại lệ mục 11.10 (docs/requirements.md): trọng số `h` của slot `id === 'settings'` (khối
   * gộp "Điều hướng + Hôm nay", luôn hiển thị mọi Space, không thuộc `enabledBlocks`) — DÙNG CHUNG
   * mọi Space, cùng nhóm với `dashboardColWidths` phía trên, KHÔNG theo `spaceId` như phần còn lại
   * của `dashboardCols`. Lý do: nội dung khối này giống hệt nhau ở mọi Space (nav + đồng hồ/ngày/
   * quote), không có ý nghĩa gì khi mỗi Space có 1 chiều cao khác nhau cho cùng 1 nội dung tĩnh —
   * khác các khối dữ liệu thật (Task/Note/Log/...) vẫn `h` riêng theo Space bình thường, không đổi.
   *
   * Giá trị `h` lưu SẴN cho slot `settings` bên trong `dashboardCols[spaceId]`/
   * `defaultDashboardLayout().cols` bị BỎ QUA khi hiển thị — luôn override bằng field này (xem
   * `resolveDashboardCols()` trong `storage/normalize.ts`). **Vị trí** của khối `settings` (cột
   * nào, đứng trước/sau khối nào) vẫn tiếp tục riêng theo Space như bình thường — chỉ `h` là
   * ngoại lệ, phạm vi hẹp, không suy rộng sang khối khác.
   *
   * Khối `reminders` (Thông báo) cũng LUÔN hiển thị mọi Space, không tắt được, y hệt lý do trên —
   * dùng field riêng `dashboardReminderHeight` bên dưới (KHÔNG gộp chung 1 field, xem comment
   * field đó).
   */
  dashboardCornerHeight: number;
  /**
   * Cặp đôi với `dashboardCornerHeight` ở trên: trọng số `h` của slot `id === 'reminders'` (khối
   * "Thông báo", `AppLayout.tsx` — LUÔN hiển thị mọi Space, không thuộc `enabledBlocks`, y hệt lý
   * do đã áp dụng cho `settings`). DÙNG CHUNG mọi Space, override khi đọc qua
   * `resolveDashboardCols()`, ghi qua action `SETTINGS_SET_REMINDER_HEIGHT` riêng (không kèm
   * `spaceId`).
   *
   * **Vì sao TÁCH 2 field độc lập thay vì suy ra `reminders.h = 100 - dashboardCornerHeight`:**
   * `h` trong `LayoutSlot` là TRỌNG SỐ FLEX-GROW tương đối (`flex: h 1 0`, xem `AppLayout.tsx`),
   * KHÔNG phải phần trăm tuyệt đối phải cộng đúng 100 — khác hẳn `dashboardColWidths` (dùng
   * `flex: 0 1 W%`, W% là kích thước thật, cộng lệch 100% gây tràn/hụt layout thấy rõ bằng mắt).
   * Bằng chứng ngay trong `defaultDashboardLayout()`: cột khác đã có tổng `h` khác 100 (cột 1:
   * 62+20=82) mà vẫn hiển thị đúng vì chỉ là TỈ LỆ giữa các khối cùng cột. Vì vậy 2 field độc lập
   * không cần thêm cơ chế chuẩn hoá "đảm bảo tổng luôn ra 100" — trôi lệch tổng qua nhiều lần
   * resize (nếu có) chỉ đổi tỉ lệ hiển thị tương đối, không gây lỗi hiển thị/tràn UI như
   * `colWidths`. Hướng 2-field cũng nhất quán với field liền trước, dễ maintain hơn hướng suy-bù
   * (tránh phải giả định cứng "cột này luôn đúng 2 khối" ngay trong logic tính field).
   */
  dashboardReminderHeight: number;
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
