import type {
  CollapsedBlocks,
  DashboardLayout,
  HomeBgAutoRotateMs,
  LayoutSlot,
  NoteView,
  QuoteRotateMode,
  Settings,
  ThemeMode,
} from '../../types';
import { dayIndex } from '../../features/home/homeContent';
import { defaultDashboardLayout } from '../seed';

export type SettingsAction =
  | { type: 'SETTINGS_SET_THEME'; payload: { theme: ThemeMode } }
  | { type: 'SETTINGS_SET_ACCENT'; payload: { accent: string } }
  | { type: 'SETTINGS_SET_HOME_BG_INDEX'; payload: { index: number } }
  | { type: 'SETTINGS_SET_HOME_BG_IMAGE'; payload: { index: number; url: string } }
  | { type: 'SETTINGS_SET_HOME_BG_UPLOAD'; payload: { index: number; dataUrl: string } }
  | { type: 'SETTINGS_HOME_BG_USE_LINK_MODE'; payload: { index: number } }
  | { type: 'SETTINGS_SET_HOME_BG_AUTO_ROTATE'; payload: { ms: HomeBgAutoRotateMs } }
  | { type: 'SETTINGS_HOME_BG_ROTATE_NEXT' }
  | { type: 'SETTINGS_SET_HOME_QUOTE_TEXT'; payload: { index: number; text: string } }
  | { type: 'SETTINGS_SET_HOME_QUOTE_INDEX'; payload: { index: number } }
  | { type: 'SETTINGS_SET_QUOTE_ROTATE_MODE'; payload: { mode: QuoteRotateMode } }
  | { type: 'SETTINGS_HOME_QUOTE_ROTATE_NEXT' }
  | { type: 'BLOCK_TOGGLE_COLLAPSED'; payload: { key: keyof CollapsedBlocks } }
  | { type: 'NOTE_SET_VIEW'; payload: { view: NoteView } }
  // LỊCH SỬ (xem docs/features/layout-theo-space.md mục 11) — set/reset TOÀN BỘ `dashboardLayout`
  // (colWidths + cols) trong 1 lần, dùng chung mọi Space. UI (useDashboardLayout.ts/AppLayout.tsx/
  // SettingsModal.tsx) đã chuyển hẳn sang dùng 2 action mới bên dưới, KHÔNG còn nơi nào trong UI
  // dispatch 2 action này nữa — giữ lại dead-but-typed (không xoá) để có đường lùi tạm thời.
  | { type: 'SETTINGS_SET_DASHBOARD_LAYOUT'; payload: { layout: DashboardLayout } }
  | { type: 'SETTINGS_RESET_DASHBOARD_LAYOUT' }
  // Tách theo đúng 2 phạm vi mục 11.1: colWidths (không kèm spaceId, dùng chung mọi Space) và
  // cols (kèm spaceId, riêng theo Space). Xem AC-11.9: nút "Khôi phục mặc định" chỉ reset `cols`
  // của Space đang mở, không đụng `colWidths`.
  | { type: 'SETTINGS_SET_COL_WIDTHS'; payload: { colWidths: number[] } }
  | { type: 'SETTINGS_SET_DASHBOARD_COLS'; payload: { spaceId: string; cols: LayoutSlot[][] } }
  | { type: 'SETTINGS_RESET_DASHBOARD_COLS'; payload: { spaceId: string } }
  // Mục 11.10 — ngoại lệ chiều cao khối 'settings' — dùng chung mọi Space, không kèm `spaceId`,
  // cùng nhóm với SETTINGS_SET_COL_WIDTHS.
  | { type: 'SETTINGS_SET_CORNER_HEIGHT'; payload: { h: number } }
  // Cặp đôi với SETTINGS_SET_CORNER_HEIGHT, cho khối 'reminders' (Thông báo, cũng LUÔN hiển thị
  // mọi Space).
  | { type: 'SETTINGS_SET_REMINDER_HEIGHT'; payload: { h: number } }
  | { type: 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS'; payload: { enabled: boolean } };

export function settingsReducer(settings: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case 'SETTINGS_SET_THEME':
      return { ...settings, theme: action.payload.theme };
    case 'SETTINGS_SET_ACCENT':
      return { ...settings, accent: action.payload.accent };
    case 'SETTINGS_SET_HOME_BG_INDEX':
      return { ...settings, homeBackground: { ...settings.homeBackground, index: action.payload.index } };
    case 'SETTINGS_SET_HOME_BG_IMAGE': {
      const images = [...settings.homeBackground.images];
      images[action.payload.index] = { type: 'url', value: action.payload.url };
      return { ...settings, homeBackground: { ...settings.homeBackground, images } };
    }
    case 'SETTINGS_SET_HOME_BG_UPLOAD': {
      const images = [...settings.homeBackground.images];
      images[action.payload.index] = { type: 'upload', value: action.payload.dataUrl };
      return { ...settings, homeBackground: { ...settings.homeBackground, images } };
    }
    case 'SETTINGS_HOME_BG_USE_LINK_MODE': {
      // Chuyển slot về dạng 'url' nhưng GIỮ NGUYÊN ảnh (data-URL) hiện tại cho tới khi
      // người dùng gõ link mới đè lên (yêu cầu UX — không xoá ảnh upload ngay lập tức).
      const images = [...settings.homeBackground.images];
      const current = images[action.payload.index];
      images[action.payload.index] = { type: 'url', value: current.value };
      return { ...settings, homeBackground: { ...settings.homeBackground, images } };
    }
    case 'SETTINGS_SET_HOME_BG_AUTO_ROTATE':
      return { ...settings, homeBackground: { ...settings.homeBackground, autoRotateMs: action.payload.ms } };
    case 'SETTINGS_HOME_BG_ROTATE_NEXT': {
      const total = settings.homeBackground.images.length;
      return { ...settings, homeBackground: { ...settings.homeBackground, index: (settings.homeBackground.index + 1) % total } };
    }
    case 'SETTINGS_SET_HOME_QUOTE_TEXT': {
      const texts = [...settings.homeQuotes.texts];
      const trimmed = action.payload.text.trim();
      texts[action.payload.index] = trimmed || texts[action.payload.index];
      return { ...settings, homeQuotes: { ...settings.homeQuotes, texts } };
    }
    case 'SETTINGS_SET_HOME_QUOTE_INDEX': {
      const total = settings.homeQuotes.texts.length;
      const index = ((action.payload.index % total) + total) % total;
      return { ...settings, homeQuotes: { ...settings.homeQuotes, index } };
    }
    case 'SETTINGS_SET_QUOTE_ROTATE_MODE': {
      // Đổi sang 'daily': snap NGAY về đúng quote-của-hôm-nay (port setQuoteRotateMode('daily')
      // trong mockup gọi applyHomeQuote(dayIndex(...)) ngay khi chọn) — không đợi tới lượt
      // HYDRATE/mở tab kế tiếp mới đồng bộ.
      const index =
        action.payload.mode === 'daily'
          ? dayIndex(settings.homeQuotes.texts.length)
          : settings.homeQuotes.index;
      return { ...settings, homeQuotes: { ...settings.homeQuotes, rotateMode: action.payload.mode, index } };
    }
    case 'SETTINGS_HOME_QUOTE_ROTATE_NEXT': {
      const total = settings.homeQuotes.texts.length;
      return { ...settings, homeQuotes: { ...settings.homeQuotes, index: (settings.homeQuotes.index + 1) % total } };
    }
    case 'BLOCK_TOGGLE_COLLAPSED':
      return {
        ...settings,
        collapsedBlocks: {
          ...settings.collapsedBlocks,
          [action.payload.key]: !settings.collapsedBlocks[action.payload.key],
        },
      };
    case 'NOTE_SET_VIEW':
      return { ...settings, noteView: action.payload.view };
    case 'SETTINGS_SET_DASHBOARD_LAYOUT':
      return { ...settings, dashboardLayout: action.payload.layout };
    case 'SETTINGS_RESET_DASHBOARD_LAYOUT':
      return { ...settings, dashboardLayout: defaultDashboardLayout() };
    case 'SETTINGS_SET_COL_WIDTHS':
      return { ...settings, dashboardColWidths: action.payload.colWidths };
    case 'SETTINGS_SET_DASHBOARD_COLS':
      return {
        ...settings,
        dashboardCols: { ...settings.dashboardCols, [action.payload.spaceId]: action.payload.cols },
      };
    case 'SETTINGS_RESET_DASHBOARD_COLS':
      return {
        ...settings,
        dashboardCols: { ...settings.dashboardCols, [action.payload.spaceId]: defaultDashboardLayout().cols },
      };
    case 'SETTINGS_SET_CORNER_HEIGHT':
      return { ...settings, dashboardCornerHeight: action.payload.h };
    case 'SETTINGS_SET_REMINDER_HEIGHT':
      return { ...settings, dashboardReminderHeight: action.payload.h };
    case 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS':
      return { ...settings, pushNotifySharedSpaceEvents: action.payload.enabled };
    default:
      return settings;
  }
}
