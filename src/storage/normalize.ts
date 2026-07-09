import type { DashboardLayout, HomeBackground, HomeQuotes, LayoutBlockKey, LayoutSlot, LogEntry, QuoteRotateMode, Settings, Space, UiState } from '../types';
import { defaultDashboardLayout, defaultSettings, findReminderHeight, findSettingsCornerHeight } from '../state/seed';

/**
 * Chuẩn hoá `logs[]` (Nhật ký nhanh, xem docs/features/nhat-ky-nhanh.md). Dữ liệu thiếu field
 * này -> fallback `[]`, không crash. Mỗi entry bất biến (chỉ tạo/xoá) nên chỉ cần `id`/`content`/
 * `createdAt` hợp lệ, không có `updatedAt`/`order` để normalize như Task/Note.
 */
export function normalizeLogEntries(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .filter((l) => typeof l.id === 'string' && typeof l.content === 'string')
    .map((l) => ({
      id: l.id as string,
      content: l.content as string,
      createdAt: typeof l.createdAt === 'string' && l.createdAt ? l.createdAt : new Date().toISOString(),
      ...(typeof l.createdBy === 'string' && l.createdBy ? { createdBy: l.createdBy } : {}),
    }));
}

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
      // Dữ liệu thiếu field `logs` (Nhật ký nhanh) -> mặc định hiện, không tự ẩn.
      logs: space.enabledBlocks?.logs ?? true,
    },
    tasks: Array.isArray(space.tasks)
      ? space.tasks.map((t, idx) => ({
          ...t,
          content: t.content ?? '',
          order: t.order ?? idx,
          assigneeIds: Array.isArray(t.assigneeIds) ? t.assigneeIds : [],
        }))
      : [],
    reminders: Array.isArray(space.reminders)
      ? space.reminders.map((r) => {
          if (r.type !== 'recurring') return r;
          // `createdAt` bắt buộc theo type nhưng dữ liệu lưu trước khi field này ra đời không có
          // — patch về ngày hiện tại thay vì crash khi tính isDueToday.
          const raw = r as typeof r & { createdAt?: string };
          return raw.createdAt ? r : { ...r, createdAt: new Date().toISOString() };
        })
      : [],
    habits: Array.isArray(space.habits)
      ? space.habits.map((h) => ({
          ...h,
          completedDates: Array.isArray(h.completedDates) ? h.completedDates : [],
        }))
      : [],
    notes: Array.isArray(space.notes) ? space.notes.map((n) => ({ ...n, expanded: n.expanded ?? false, hidden: n.hidden ?? false })) : [],
    logs: normalizeLogEntries(space.logs),
    ...(space.isShared ? { isShared: true as const, sharedSpaceId: space.sharedSpaceId, _sharedVersion: space._sharedVersion } : {}),
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

/** Mọi `LayoutBlockKey` từng tồn tại trong 1 slot (đơn hoặc ghép ngang) của `cols` đã lưu. */
function collectLayoutBlockIds(cols: LayoutSlot[][]): Set<string> {
  const ids = new Set<string>();
  cols.forEach((col) =>
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
 * Migrate layout cũ: trước khi khối "Hôm nay" gộp vào "Widget điều hướng" (xem
 * docs/requirements.md mục 4.1), 2 khối này là 2 slot ĐỘC LẬP — `id:'today'` (đồng hồ/ngày/quote)
 * và `id:'settings'` (nav). `'today'` đã bị xoá khỏi `LayoutBlockKey` nên không còn hợp lệ về
 * type, phải cast `as string` để đọc dữ liệu LEGACY.
 *
 * Quy tắc:
 * - Neo vị trí theo slot `settings` cũ (nav ổn định hơn, ít khả năng đã bị kéo đi chỗ khác).
 * - Nếu `today` đã bị kéo sang vị trí khác/ghép ngang với khối khác — vị trí đó bị BỎ HẲN sau
 *   migrate (không giữ được 2 vị trí cho 1 khối gộp); slot/row chứa nó được rút gọn giống hệt
 *   logic `removeIdFromLayout` (viết tay lại ở đây vì hàm gốc trong `dashboardLayoutUtils.ts`
 *   thao tác trên `LayoutBlockKey` đã không còn chấp nhận `'today'`).
 * - Chiều cao slot gộp = `max(h cũ của 'today', h cũ của 'settings')` — không cộng dồn (dễ ra
 *   quá cao so với mặc định mới, xem `defaultDashboardLayout()`), chỉ cần đủ chỗ hiển thị thêm
 *   hàng ambient so với khi `settings` còn đứng 1 mình, không cần khớp tuyệt đối.
 *
 * Chạy tự động, 1 chiều, bỏ qua ngay nếu layout đã ở schema mới (không còn `'today'`).
 *
 * **Fallback an toàn nếu dữ liệu bất thường:** giả định "luôn có sẵn slot `settings` để neo vị
 * trí" có thể sai với dữ liệu hỏng/import cũ bất thường — nếu sau bước gộp vẫn không tìm thấy
 * `settings` trong layout, tự chèn thêm 1 slot mới (không để Dashboard mất hẳn cách về Home/đổi
 * Space/mở Settings).
 */
function migrateTodaySettingsMerge(rawCols: LayoutSlot[][]): LayoutSlot[][] {
  const ids = collectLayoutBlockIds(rawCols);
  if (!ids.has('today')) return rawCols; // đã ở schema mới hoặc cài đặt mới hoàn toàn (chưa từng có 'today')

  // 1. Tìm `h` của slot 'today' cũ (nếu có) để nội suy chiều cao slot gộp.
  let todayH: number | undefined;
  rawCols.forEach((col) =>
    col.forEach((slot) => {
      if (slot.type === 'single' && (slot.id as string) === 'today') todayH = slot.h;
      else if (slot.type === 'row' && slot.items.some((it) => (it.id as string) === 'today')) todayH = slot.h;
    }),
  );

  // 2. Xoá slot/khối 'today' khỏi layout (deep-clone trước khi sửa, giống removeIdFromLayout).
  let cols = rawCols.map((col) => col.map((slot) => (slot.type === 'row' ? { ...slot, items: [...slot.items] } : { ...slot })));
  for (const col of cols) {
    for (let si = 0; si < col.length; si++) {
      const slot = col[si];
      if (slot.type === 'single' && (slot.id as string) === 'today') {
        col.splice(si, 1);
        si--;
      } else if (slot.type === 'row') {
        const idx = slot.items.findIndex((it) => (it.id as string) === 'today');
        if (idx !== -1) {
          slot.items.splice(idx, 1);
          if (slot.items.length === 1) col[si] = { type: 'single', id: slot.items[0].id, h: slot.h };
        }
      }
    }
  }

  // 3. Tăng `h` của slot 'settings' (nếu tìm thấy) lên max(h cũ, todayH cũ) — neo đúng vị trí cũ.
  let foundSettings = false;
  cols = cols.map((col) =>
    col.map((slot) => {
      if (slot.type === 'single' && slot.id === 'settings') {
        foundSettings = true;
        return { ...slot, h: todayH != null ? Math.max(slot.h, todayH) : slot.h };
      }
      return slot;
    }),
  );

  // 4. Fallback an toàn: không tìm thấy 'settings' ở bước trên (dữ liệu bất thường) -> chèn mới,
  //    không để Dashboard mất hẳn khối điều hướng (vi phạm AC3).
  if (!foundSettings) {
    cols = cols.map((col, i) => (i === 0 ? [{ type: 'single', id: 'settings', h: todayH ?? 22 } as LayoutSlot, ...col] : col));
  }

  return cols;
}

/**
 * Layout lưu TRƯỚC khi khối "Nhật ký nhanh" (`logs`) ra đời (xem docs/features/nhat-ky-nhanh.md)
 * — cấu trúc vẫn hợp lệ nên không rơi về default, nhưng thiếu hẳn khối đó. Vá bằng cách chèn vào
 * CUỐI cột chứa `notes` (vị trí mặc định đã chốt ở `defaultDashboardLayout()`) nếu chưa có,
 * không reset toàn bộ layout người dùng đã tự sắp xếp.
 */
function patchMissingLogsBlock(rawCols: LayoutSlot[][]): LayoutSlot[][] {
  if (collectLayoutBlockIds(rawCols).has('logs')) return rawCols;
  const cols = rawCols.map((col) => col.slice());
  const notesColIdx = cols.findIndex((col) => col.some((slot) => slot.type === 'single' && slot.id === 'notes'));
  const targetCi = notesColIdx !== -1 ? notesColIdx : 0;
  cols[targetCi] = [...cols[targetCi], { type: 'single', id: 'logs', h: 20 } as LayoutSlot];
  return cols;
}

/**
 * Chuẩn hoá `colWidths` — N số, không lệch quá xa 100% (vd do bug resize cộng-dồn-delta cũ
 * trước khi sửa, đã có người dùng lưu lại layout với 1 cột rộng hàng trăm %) — vì cột dùng
 * `flex-shrink:0`, tổng vượt 100% làm cột cuối tràn ra ngoài viewport, sát mép phải dù vẫn còn
 * padding. KHÔNG rescale-giữ-tỉ-lệ ở đây — vì giá trị đã méo (vd 1 cột bị bug đẩy lên 900%, cột
 * khác bị kẹp xuống sàn tối thiểu 10%) nên chính TỈ LỆ cũng sai, giữ nguyên tỉ lệ vẫn ra layout
 * lệch (chỉ đỡ tràn). Phát hiện méo thì RESET THẲNG về `fallback` — an toàn hơn, đúng tinh thần
 * "không migration phức tạp" của dự án giai đoạn này; người dùng resize lại bằng tay sau đó (đã
 * sửa hết bug resize) là đủ.
 *
 * Dùng chung cho cả `Settings.dashboardColWidths` (dùng chung mọi Space) và
 * `DashboardLayout.colWidths` legacy (field `dashboardLayout` cũ, qua `normalizeDashboardLayout`).
 */
function normalizeColWidths(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw) || raw.length !== fallback.length) return fallback;
  const widths = raw as number[];
  const widthSum = widths.reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0);
  const hasOutlier = widths.some((w) => !Number.isFinite(w) || w > 90);
  if (widthSum <= 0 || hasOutlier || Math.abs(widthSum - 100) > 1) {
    return fallback;
  }
  return widths;
}

/**
 * Chuẩn hoá 1 mảng `cols` (`LayoutSlot[][]`, đúng `colCount` cột) — chạy đúng 2 bước migration
 * đã có (`migrateTodaySettingsMerge`/`patchMissingLogsBlock`). Không validate sâu hình dạng từng
 * `LayoutSlot` (giữ đúng mức độ khoan dung đã có từ trước — dự án giai đoạn nhỏ, không viết
 * migration phức tạp). Dùng chung cho CẢ 2 nơi: `DashboardLayout.cols` legacy (qua
 * `normalizeDashboardLayout`) VÀ từng entry trong `Settings.dashboardCols[spaceId]` (field mới).
 */
function normalizeCols(raw: unknown, colCount: number): LayoutSlot[][] | undefined {
  if (!Array.isArray(raw) || raw.length !== colCount) return undefined;
  let cols = raw as LayoutSlot[][];
  cols = migrateTodaySettingsMerge(cols);
  cols = patchMissingLogsBlock(cols);
  return cols;
}

/**
 * Chuẩn hoá `dashboardLayout` — field ĐƠN LỊCH SỬ (xem comment `Settings.dashboardLayout` trong
 * types.ts), vẫn giữ nguyên vai trò fallback đọc cho `dashboardColWidths`/`dashboardCols` mới
 * (xem `normalizeSettings`/`resolveDashboardCols` phía dưới).
 */
export function normalizeDashboardLayout(raw: DashboardLayout | undefined): DashboardLayout {
  if (!raw || !Array.isArray(raw.colWidths) || !Array.isArray(raw.cols) || raw.colWidths.length !== raw.cols.length) {
    return defaultDashboardLayout();
  }
  const fallback = defaultDashboardLayout();
  const colWidths = normalizeColWidths(raw.colWidths, fallback.colWidths);
  const cols = normalizeCols(raw.cols, colWidths.length) ?? fallback.cols;
  return { colWidths, cols };
}

/**
 * Chuẩn hoá SHAPE của `Settings.dashboardCols` (map `spaceId -> cols`) — chỉ validate cấu trúc
 * từng entry (`normalizeCols`), KHÔNG suy luận fallback theo 1 `spaceId` cụ thể nào ở đây (hàm
 * này không biết `currentSpaceId`). Entry hỏng cấu trúc bị BỎ HẲN (không thay bằng default) — để
 * `resolveDashboardCols()` tự rơi xuống đúng thứ tự fallback khi đọc, thay vì lưu cứng 1 giá trị
 * default vào đúng key đó (tránh "khoá cứng" 1 Space vào default sớm hơn cần thiết).
 */
function normalizeDashboardColsMap(raw: unknown, colCount: number): Record<string, LayoutSlot[][]> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, LayoutSlot[][]> = {};
  for (const [spaceId, cols] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeCols(cols, colCount);
    if (normalized) result[spaceId] = normalized;
  }
  return result;
}

/**
 * Chuẩn hoá `Settings.dashboardCornerHeight`/`dashboardReminderHeight` — 1 số dương hữu hạn, DÙNG
 * CHUNG mọi Space (cùng nhóm `dashboardColWidths`). **Cố ý KHÔNG migrate/fallback qua field
 * `dashboardLayout` cũ**: field đó là dữ liệu ĐÓNG BĂNG tại 1 thời điểm cũ, có thể mang giá trị
 * bất thường (vd do bug resize cộng-dồn-delta đã sửa trước đây). Với 2 field NÀY rủi ro còn LỚN
 * HƠN cả `cols` per-Space — vì dùng CHUNG mọi Space, 1 giá trị lỗi đọc được từ dữ liệu cũ sẽ làm
 * SAI NGAY LẬP TỨC ở TẤT CẢ Space cùng lúc, thay vì chỉ 1 Space chưa từng chỉnh như trường hợp
 * `cols`. Fallback THẲNG `defaultDashboardLayout()` (qua `findSettingsCornerHeight`/
 * `findReminderHeight`, tham số `fallback` truyền vào từ `normalizeSettings`).
 */
function normalizeGlobalSlotHeight(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Ghi đè `h` của MỌI slot mang khối trong `overrides` (single hoặc ghép ngang) bằng giá trị DÙNG
 * CHUNG tương ứng (`settings` lẫn `reminders`) — áp dụng bất kể `dashboardCols[spaceId]`/
 * `defaultDashboardLayout().cols` lưu gì cho slot đó. Chỉ đổi đúng các `LayoutBlockKey` có mặt
 * trong `overrides`, giữ nguyên `h` của mọi khối khác. Giữ nguyên REFERENCE gốc của `cols` nếu
 * không có gì cần đổi (referential-stability cho `useMemo` ở `useDashboardLayout.ts`).
 */
function overrideSlotHeights(cols: LayoutSlot[][], overrides: Partial<Record<LayoutBlockKey, number>>): LayoutSlot[][] {
  let changed = false;
  const next = cols.map((col) =>
    col.map((slot) => {
      if (slot.type === 'single' && slot.id in overrides) {
        const h = overrides[slot.id]!;
        if (slot.h !== h) {
          changed = true;
          return { ...slot, h };
        }
        return slot;
      }
      if (slot.type === 'row') {
        const matched = slot.items.find((it) => it.id in overrides);
        if (matched) {
          const h = overrides[matched.id]!;
          if (slot.h !== h) {
            changed = true;
            return { ...slot, h };
          }
        }
      }
      return slot;
    }),
  );
  return changed ? next : cols;
}

/**
 * Đọc `cols` hiệu lực cho 1 Space cụ thể — thứ tự fallback:
 *   1. `settings.dashboardCols[spaceId]` — Space này đã từng bị user tự chỉnh riêng (kéo dọc/
 *      kéo-thả).
 *   2. `defaultDashboardLayout().cols` — mọi trường hợp còn lại (user mới, hoặc Space chưa từng
 *      tự chỉnh riêng).
 *
 * **Cố ý KHÔNG fallback qua `settings.dashboardLayout.cols`** (field lịch sử) — field đó là dữ
 * liệu ĐÓNG BĂNG tại 1 thời điểm cũ, có thể mang cấu trúc cột CŨ/LẠ (nhóm khối khác bố cục hiện
 * hành) mà không có cách nào phân biệt "dữ liệu hợp lệ nhưng cũ" với "dữ liệu hỏng" chỉ bằng
 * validate SHAPE — dễ gây vỡ layout thật (1 cột chỉ chứa 1 khối đã bị Space tắt sẽ biến mất khỏi
 * render, làm 2 cột còn lại trông như gộp làm 1). Đánh đổi chấp nhận: Space chưa từng tự chỉnh
 * riêng sẽ dùng đúng bố cục mặc định hiện hành, thay vì âm thầm dùng dữ liệu đóng băng có thể sai
 * lệch.
 *
 * Hàm THUẦN (không dispatch/side-effect nào) — nhận `settings` đã qua `normalizeSettings()` (nên
 * `dashboardCols` ở đây đã hợp lệ về cấu trúc, không cần validate lại).
 *
 * Sau khi resolve `cols` theo thứ tự fallback trên, override `h` của slot `settings` bằng
 * `settings.dashboardCornerHeight` VÀ `h` của slot `reminders` bằng
 * `settings.dashboardReminderHeight` (cả 2 dùng chung mọi Space — khối `reminders`/Thông báo cũng
 * LUÔN hiển thị, không tắt theo Space, y hệt lý do `settings`) — bất kể entry per-Space hay
 * default lưu giá trị `h` nào cho 2 slot đó. Đây là bước override ĐỌC-THỜI-ĐIỂM-RENDER duy nhất
 * trong hàm này; ghi (2 đích lưu trữ khi resize splitter liền kề 1 trong 2 khối này) là việc của
 * `useDashboardLayout.ts`, không phải hàm thuần này.
 */
export function resolveDashboardCols(settings: Settings, spaceId: string): LayoutSlot[][] {
  const perSpace = settings.dashboardCols?.[spaceId];
  const cols = perSpace ?? defaultDashboardLayout().cols;
  return overrideSlotHeights(cols, {
    settings: settings.dashboardCornerHeight,
    reminders: settings.dashboardReminderHeight,
  });
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
  const dashboardLayout = normalizeDashboardLayout(settings.dashboardLayout ?? legacyDashboardLayout);
  // Nguồn colCount/fallback DUY NHẤT cho `dashboardColWidths`/`dashboardCols` bên dưới — KHÔNG
  // dùng `dashboardLayout` (biến ở trên, field lịch sử đã đóng băng, xem lý do ở
  // `resolveDashboardCols`/`normalizeGlobalSlotHeight`). `dashboardLayout` vẫn được tính/giữ
  // trong object trả về để không mất field khi export/import (Settings vẫn khai báo bắt buộc
  // field này), nhưng từ đây trở đi CHỈ dùng làm dữ liệu đọc thô lịch sử, không tham gia suy luận
  // colCount/giá trị mặc định cho 2 field mới.
  const defaultLayout = defaultDashboardLayout();
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
    pushNotifySharedSpaceEvents:
      typeof settings.pushNotifySharedSpaceEvents === 'boolean'
        ? settings.pushNotifySharedSpaceEvents
        : fallback.pushNotifySharedSpaceEvents,
    // Field ĐƠN LỊCH SỬ — giữ nguyên (không xoá khỏi schema, vẫn có giá trị hợp lệ để đọc/export
    // nếu cần), nhưng KHÔNG còn tham gia tính `dashboardColWidths`/`dashboardCols` bên dưới (xem
    // comment ở `defaultLayout` phía trên + comment `Settings.dashboardLayout` trong types.ts).
    dashboardLayout,
    // `colWidths` dùng chung mọi Space: copy 1:1 từ giá trị đã lưu, fallback THẲNG
    // `defaultDashboardLayout()` (KHÔNG qua `dashboardLayout` cũ — xem lý do ở
    // `resolveDashboardCols`). Migration diễn ra NGAY TẠI ĐÂY (khác `cols` bên dưới, đọc-fallback
    // tại chỗ) vì đây chỉ là 1 giá trị đơn, không có vấn đề thứ tự load nhiều Space.
    dashboardColWidths: normalizeColWidths(settings.dashboardColWidths, defaultLayout.colWidths),
    // `cols` RIÊNG theo từng Space: chỉ chuẩn hoá SHAPE của map ở đây (từng entry hợp lệ cấu
    // trúc, colCount chuẩn lấy từ `defaultDashboardLayout()`, không từ `dashboardLayout` cũ);
    // fallback theo 1 `spaceId` cụ thể là việc của `resolveDashboardCols()` (gọi tại nơi biết
    // `currentSpaceId`).
    dashboardCols: normalizeDashboardColsMap(settings.dashboardCols, defaultLayout.colWidths.length),
    // Ngoại lệ dùng chung: h của khối 'settings'. KHÔNG migrate qua `dashboardLayout` cũ (xem
    // comment `normalizeGlobalSlotHeight` — rủi ro cao hơn `colWidths` vì đây cũng dùng chung
    // mọi Space).
    dashboardCornerHeight: normalizeGlobalSlotHeight(settings.dashboardCornerHeight, findSettingsCornerHeight(defaultLayout.cols)),
    // Cặp đôi với dashboardCornerHeight: h của khối 'reminders' (Thông báo), cùng lý do/cách xử
    // lý (KHÔNG migrate qua `dashboardLayout` cũ).
    dashboardReminderHeight: normalizeGlobalSlotHeight(settings.dashboardReminderHeight, findReminderHeight(defaultLayout.cols)),
  };
}

/**
 * `currentScreen` ephemeral được khởi tạo từ `lastScreen` (localStorage, per-machine) lúc HYDRATE —
 * sau đó theo dõi qua SCREEN_NAVIGATE; mỗi lần đổi ghi lại vào localStorage (xem AppStateContext).
 */
export function buildUiInitialState(lastScreen: UiState['currentScreen'] = 'home'): UiState {
  return {
    taskFilter: 'all',
    noteSearch: '',
    noteSortBy: 'order',
    currentScreen: lastScreen,
  };
}
