import type { CollapsedBlocks, HomeBgAutoRotateMs, MainBlockKey, NoteView, Screen, Settings, ThemeMode } from '../../types';
import { defaultSettings } from '../seed';

export type SettingsAction =
  | { type: 'SETTINGS_SET_THEME'; payload: { theme: ThemeMode } }
  | { type: 'SETTINGS_SET_ACCENT'; payload: { accent: string } }
  | { type: 'SETTINGS_SET_HOME_BG_INDEX'; payload: { index: number } }
  | { type: 'SETTINGS_SET_HOME_BG_IMAGE'; payload: { index: number; url: string } }
  | { type: 'SETTINGS_SET_HOME_BG_AUTO_ROTATE'; payload: { ms: HomeBgAutoRotateMs } }
  | { type: 'SETTINGS_HOME_BG_ROTATE_NEXT' }
  | { type: 'SETTINGS_SET_LAST_SCREEN'; payload: { screen: Screen } }
  | { type: 'SETTINGS_SET_LAYOUT_SIZES'; payload: Partial<Settings['layoutSizes']> }
  | { type: 'SETTINGS_RESET_LAYOUT' }
  | { type: 'SETTINGS_SET_MAIN_BLOCK_ORDER'; payload: { order: MainBlockKey[] } }
  | { type: 'BLOCK_TOGGLE_COLLAPSED'; payload: { key: keyof CollapsedBlocks } }
  | { type: 'BLOCK_TOGGLE_COLLAPSE_ALL' }
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
      images[action.payload.index] = action.payload.url;
      return { ...settings, homeBackground: { ...settings.homeBackground, images } };
    }
    case 'SETTINGS_SET_HOME_BG_AUTO_ROTATE':
      return { ...settings, homeBackground: { ...settings.homeBackground, autoRotateMs: action.payload.ms } };
    case 'SETTINGS_HOME_BG_ROTATE_NEXT': {
      const total = settings.homeBackground.images.length;
      return { ...settings, homeBackground: { ...settings.homeBackground, index: (settings.homeBackground.index + 1) % total } };
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
    case 'BLOCK_TOGGLE_COLLAPSE_ALL': {
      const allCollapsed = Object.values(settings.collapsedBlocks).every(Boolean);
      const target = !allCollapsed;
      const keys: (keyof CollapsedBlocks)[] = ['tasks', 'reminder', 'habits', 'notes', 'reminders'];
      const collapsedBlocks = keys.reduce(
        (acc, key) => ({ ...acc, [key]: target }),
        {} as CollapsedBlocks,
      );
      return { ...settings, collapsedBlocks };
    }
    case 'NOTE_SET_VIEW':
      return { ...settings, noteView: action.payload.view };
    default:
      return settings;
  }
}
