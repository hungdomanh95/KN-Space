import type { BackgroundKey, CollapsedBlocks, MainBlockKey, Settings, ThemeMode } from '../../types';
import { defaultSettings } from '../seed';

export type SettingsAction =
  | { type: 'SETTINGS_SET_THEME'; payload: { theme: ThemeMode } }
  | { type: 'SETTINGS_SET_ACCENT'; payload: { accent: string } }
  | { type: 'SETTINGS_SET_BACKGROUND'; payload: { background: BackgroundKey } }
  | { type: 'SETTINGS_SET_LAYOUT_SIZES'; payload: Partial<Settings['layoutSizes']> }
  | { type: 'SETTINGS_RESET_LAYOUT' }
  | { type: 'SETTINGS_SET_MAIN_BLOCK_ORDER'; payload: { order: MainBlockKey[] } }
  | { type: 'BLOCK_TOGGLE_COLLAPSED'; payload: { key: keyof CollapsedBlocks } }
  | { type: 'BLOCK_TOGGLE_COLLAPSE_ALL' };

export function settingsReducer(settings: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case 'SETTINGS_SET_THEME':
      return { ...settings, theme: action.payload.theme };
    case 'SETTINGS_SET_ACCENT':
      return { ...settings, accent: action.payload.accent };
    case 'SETTINGS_SET_BACKGROUND':
      return { ...settings, background: action.payload.background };
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
    default:
      return settings;
  }
}
