import type {
  CollapsedBlocks,
  HomeBgAutoRotateMs,
  MainBlockKey,
  NoteView,
  QuoteRotateMode,
  Screen,
  Settings,
  ThemeMode,
} from '../../types';
import { defaultSettings } from '../seed';
import { dayIndex } from '../../features/home/homeContent';

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
  | { type: 'SETTINGS_SET_LAST_SCREEN'; payload: { screen: Screen } }
  | { type: 'SETTINGS_SET_LAYOUT_SIZES'; payload: Partial<Settings['layoutSizes']> }
  | { type: 'SETTINGS_RESET_LAYOUT' }
  | { type: 'SETTINGS_SET_MAIN_BLOCK_ORDER'; payload: { order: MainBlockKey[] } }
  | { type: 'BLOCK_TOGGLE_COLLAPSED'; payload: { key: keyof CollapsedBlocks } }
  | { type: 'NOTE_SET_VIEW'; payload: { view: NoteView } };

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
    case 'SETTINGS_SET_LAST_SCREEN':
      return { ...settings, lastScreen: action.payload.screen };
    case 'SETTINGS_SET_LAYOUT_SIZES':
      return { ...settings, layoutSizes: { ...settings.layoutSizes, ...action.payload } };
    case 'SETTINGS_RESET_LAYOUT':
      return { ...settings, layoutSizes: defaultSettings().layoutSizes };
    case 'SETTINGS_SET_MAIN_BLOCK_ORDER':
      return { ...settings, mainBlockOrder: action.payload.order };
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
    default:
      return settings;
  }
}
