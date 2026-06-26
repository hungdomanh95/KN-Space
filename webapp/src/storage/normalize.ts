import type { DashboardLayout, HomeBackground, HomeQuotes, QuoteRotateMode, Settings, Space, UiState } from '../types';
import { defaultDashboardLayout, defaultSettings } from '../state/seed';

/** Đảm bảo field thiếu (do import cũ/schema cũ) có giá trị mặc định hợp lệ, không crash. */
export function normalizeSpace(space: Space): Space {
  return {
    id: space.id,
    name: space.name ?? 'Space chưa đặt tên',
    order: space.order ?? 0,
    enabledBlocks: {
      tasks: space.enabledBlocks?.tasks ?? true,
      reminder: space.enabledBlocks?.reminder ?? true,
      habits: space.enabledBlocks?.habits ?? true,
      notes: space.enabledBlocks?.notes ?? true,
      // Khối Thông báo không có cấu hình tắt theo Space — luôn `true`, không đọc từ data cũ.
      reminders: true,
      // Space lưu TRƯỚC khi có field `today` -> mặc định hiện, không tự ẩn khối của user cũ.
      today: space.enabledBlocks?.today ?? true,
    },
    tasks: Array.isArray(space.tasks)
      ? space.tasks.map((t, idx) => ({ ...t, content: t.content ?? '', order: t.order ?? idx }))
      : [],
    reminders: Array.isArray(space.reminders) ? space.reminders : [],
    habits: Array.isArray(space.habits) ? space.habits : [],
    notes: Array.isArray(space.notes) ? space.notes.map((n) => ({ ...n, expanded: n.expanded ?? false })) : [],
  };
}

const VALID_AUTO_ROTATE_MS = new Set([0, 60_000, 900_000, 3_600_000]);

/** Chuẩn hoá 1 slot — migrate đúng từ schema cũ (string[] trước khi có {type,value}). */
function normalizeHomeBgSlot(raw: unknown, fallback: HomeBackground['images'][number]): HomeBackground['images'][number] {
  if (typeof raw === 'string') {
    // Schema cũ: slot là string URL thuần.
    return raw.trim() ? { type: 'url', value: raw } : fallback;
  }
  if (raw && typeof raw === 'object' && 'type' in raw && 'value' in raw) {
    const slot = raw as { type: unknown; value: unknown };
    if ((slot.type === 'url' || slot.type === 'upload') && typeof slot.value === 'string' && slot.value.trim()) {
      return { type: slot.type, value: slot.value };
    }
  }
  return fallback;
}

export function normalizeHomeBackground(raw: HomeBackground | undefined, fallback: HomeBackground): HomeBackground {
  const images = Array.isArray(raw?.images) && raw.images.length === fallback.images.length
    ? raw.images.map((slot, i) => normalizeHomeBgSlot(slot, fallback.images[i]))
    : fallback.images;
  const index = typeof raw?.index === 'number' && raw.index >= 0 && raw.index < images.length ? raw.index : fallback.index;
  const autoRotateMs = VALID_AUTO_ROTATE_MS.has(raw?.autoRotateMs as number)
    ? (raw!.autoRotateMs as HomeBackground['autoRotateMs'])
    : fallback.autoRotateMs;
  return { images, index, autoRotateMs };
}

const VALID_QUOTE_ROTATE_MODES = new Set<QuoteRotateMode>(['daily', 'onopen', 'every15m', 'every1h']);

/** Mọi `LayoutBlockKey` từng tồn tại trong 1 slot (đơn hoặc ghép ngang) của layout đã lưu. */
function collectLayoutBlockIds(layout: DashboardLayout): Set<string> {
  const ids = new Set<string>();
  layout.cols.forEach((col) =>
    col.forEach((slot) => {
      if (slot.type === 'single') ids.add(slot.id);
      else slot.items.forEach((it) => ids.add(it.id));
    }),
  );
  return ids;
}

/**
 * Đọc `dashboardLayout` LEGACY (schema cũ: lưu RIÊNG theo từng Space, trước khi gộp về dùng
 * chung ở `Settings`) từ mảng Space thô (chưa qua `normalizeSpace` — hàm đó đã bỏ field này
 * khỏi `Space` type nên đọc sau sẽ luôn `undefined`). Ưu tiên Space tên "MAFC" (Space mẫu người
 * dùng đã tự chốt làm chuẩn khi còn dùng layout riêng-từng-Space), nếu không có thì lấy Space
 * đầu tiên tìm thấy field này. Trả `undefined` nếu không Space nào có (dữ liệu đã ở schema mới,
 * hoặc cài mới hoàn toàn) — caller tự fallback `defaultDashboardLayout()`.
 */
export function findLegacyDashboardLayout(rawSpaces: unknown[]): DashboardLayout | undefined {
  let fallback: DashboardLayout | undefined;
  for (const raw of rawSpaces) {
    const space = raw as { name?: unknown; dashboardLayout?: DashboardLayout } | null;
    if (!space || !space.dashboardLayout) continue;
    if (space.name === 'MAFC') return space.dashboardLayout;
    fallback ??= space.dashboardLayout;
  }
  return fallback;
}

/**
 * Chuẩn hoá `dashboardLayout` DÙNG CHUNG (xem `Settings.dashboardLayout`). Không viết migration
 * phức tạp từ schema cứng cũ (layoutSizes/mainBlockOrder, dự án giai đoạn cá nhân, quy mô nhỏ),
 * nhưng vẫn cần vá 2 trường hợp thực tế đã gặp với layout đã lưu HỢP LỆ về cấu trúc nhưng sai
 * dữ liệu:
 *
 * 1. Layout lưu TRƯỚC khi khối mới (`today`) ra đời — cấu trúc vẫn hợp lệ nên không rơi về
 *    default, nhưng thiếu hẳn khối đó. Vá bằng cách chèn nó vào đầu cột chứa `notes` (đúng vị
 *    trí mặc định đã chốt) nếu chưa có, không reset toàn bộ layout người dùng đã tự sắp xếp.
 * 2. `colWidths` bị lệch quá xa 100% (vd do bug resize cộng-dồn-delta cũ trước khi sửa, đã có
 *    người dùng lưu lại layout với 1 cột emoji rộng hàng trăm %) — vì cột dùng `flex-shrink:0`,
 *    tổng vượt 100% làm cột cuối tràn ra ngoài viewport, sát mép phải dù vẫn còn padding.
 *    KHÔNG rescale-giữ-tỉ-lệ ở đây — vì giá trị đã méo (vd 1 cột bị bug đẩy lên 900%, cột
 *    khác bị kẹp xuống sàn tối thiểu 10%) nên chính TỈ LỆ cũng sai, giữ nguyên tỉ lệ vẫn ra
 *    layout lệch (chỉ đỡ tràn). Phát hiện méo thì RESET THẲNG về tỉ lệ mặc định — an toàn hơn,
 *    đúng tinh thần "không migration phức tạp" của dự án giai đoạn này; người dùng resize lại
 *    bằng tay sau đó (đã sửa hết bug resize) là đủ.
 */
export function normalizeDashboardLayout(raw: DashboardLayout | undefined): DashboardLayout {
  if (!raw || !Array.isArray(raw.colWidths) || !Array.isArray(raw.cols) || raw.colWidths.length !== raw.cols.length) {
    return defaultDashboardLayout();
  }

  let layout = raw;

  const widthSum = layout.colWidths.reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0);
  const hasOutlier = layout.colWidths.some((w) => !Number.isFinite(w) || w > 90);
  if (widthSum <= 0 || hasOutlier || Math.abs(widthSum - 100) > 1) {
    const fallbackWidths = defaultDashboardLayout().colWidths;
    layout = {
      ...layout,
      colWidths: layout.colWidths.map((_, i) => fallbackWidths[i] ?? 100 / layout.colWidths.length),
    };
  }

  const ids = collectLayoutBlockIds(layout);
  if (!ids.has('today')) {
    const cols = layout.cols.map((col) => col.slice());
    const notesColIdx = cols.findIndex((col) => col.some((slot) => slot.type === 'single' && slot.id === 'notes'));
    const targetCi = notesColIdx !== -1 ? notesColIdx : 0;
    cols[targetCi] = [{ type: 'single', id: 'today', h: 18 } as DashboardLayout['cols'][number][number], ...cols[targetCi]];
    layout = { ...layout, cols };
  }

  return layout;
}

/** Chuẩn hoá `homeQuotes` — migrate dữ liệu cũ chưa có field này (trước khi có tab "Quote"). */
function normalizeHomeQuotes(raw: HomeQuotes | undefined, fallback: HomeQuotes): HomeQuotes {
  const texts = Array.isArray(raw?.texts) && raw.texts.length === fallback.texts.length
    ? raw.texts.map((t, i) => (typeof t === 'string' && t.trim() ? t : fallback.texts[i]))
    : fallback.texts;
  const index = typeof raw?.index === 'number' && raw.index >= 0 && raw.index < texts.length ? raw.index : fallback.index;
  const rotateMode = VALID_QUOTE_ROTATE_MODES.has(raw?.rotateMode as QuoteRotateMode)
    ? (raw!.rotateMode as QuoteRotateMode)
    : fallback.rotateMode;
  return { texts, index, rotateMode };
}

/**
 * `homeBgRaw` được truyền RIÊNG khi caller lưu `homeBackground` tách khỏi phần còn lại của
 * settings (lý do lịch sử từ chrome.storage quota — không còn áp dụng với Postgres, nhưng giữ
 * tham số để tương thích dữ liệu cũ import từ bản extension). `legacyDashboardLayout` chỉ dùng
 * khi `settings.dashboardLayout` chưa có (dữ liệu từ trước khi gộp layout về dùng chung).
 */
export function normalizeSettings(
  settings: Settings,
  homeBgRaw?: HomeBackground,
  legacyDashboardLayout?: DashboardLayout,
): Settings {
  const fallback = defaultSettings();
  return {
    theme: settings.theme ?? fallback.theme,
    accent: settings.accent ?? fallback.accent,
    homeBackground: normalizeHomeBackground(homeBgRaw ?? settings.homeBackground, fallback.homeBackground),
    homeQuotes: normalizeHomeQuotes(settings.homeQuotes, fallback.homeQuotes),
    collapsedBlocks: { ...fallback.collapsedBlocks, ...settings.collapsedBlocks },
    noteView: settings.noteView ?? fallback.noteView,
    lastScreen: settings.lastScreen === 'dashboard' ? 'dashboard' : 'home',
    // Dữ liệu cũ (trước khi có field này) không có `lastOpenedEpochDay` -> -1 để HYDRATE coi
    // là "ngày mới", tự snap lại ảnh nền/quote theo dayIndex đúng 1 lần khi nâng cấp lên.
    lastOpenedEpochDay: typeof settings.lastOpenedEpochDay === 'number' ? settings.lastOpenedEpochDay : -1,
    dashboardLayout: normalizeDashboardLayout(settings.dashboardLayout ?? legacyDashboardLayout),
  };
}

/**
 * `currentScreen` ephemeral được khởi tạo từ `lastScreen` đã persist (chỉ lúc HYDRATE) —
 * sau đó user điều hướng Home/Dashboard trong phiên không ghi storage lại liên tục,
 * mà chỉ ghi khi `lastScreen` thực sự đổi (xem appReducer SCREEN_SET).
 */
export function buildUiInitialState(lastScreen: UiState['currentScreen'] = 'home'): UiState {
  return {
    taskFilter: 'all',
    noteSearch: '',
    noteSortBy: 'order',
    hiddenNoteContentIds: new Set(),
    currentScreen: lastScreen,
  };
}
