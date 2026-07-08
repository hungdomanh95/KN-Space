import type { AppState, ExportPayload, NoteSortBy, Screen, Settings, Space, TaskFilter } from '../types';
import { buildUiInitialState, normalizeSettings, findLegacyDashboardLayout, normalizeLogEntries } from '../storage/normalize';
import { dayIndex, epochDay } from '../features/home/homeContent';
import type { HabitAction } from './reducers/habits';
import { habitsReducer } from './reducers/habits';
import type { LogAction } from './reducers/logs';
import { logsReducer } from './reducers/logs';
import type { NoteAction } from './reducers/notes';
import { notesReducer } from './reducers/notes';
import type { ReminderAction } from './reducers/reminders';
import { remindersReducer } from './reducers/reminders';
import type { SettingsAction } from './reducers/settings';
import { settingsReducer } from './reducers/settings';
import type { SpacesAction } from './reducers/spaces';
import { spacesReducer } from './reducers/spaces';
import type { TaskAction } from './reducers/tasks';
import { tasksReducer } from './reducers/tasks';
import { defaultSettings } from './seed';

export type AppAction =
  | { type: 'HYDRATE'; payload: { spaces: Space[]; currentSpaceId: string; settings: AppState['settings']; storageFallbackActive: boolean } }
  | TaskAction
  | ReminderAction
  | HabitAction
  | NoteAction
  | LogAction
  | SpacesAction
  | SettingsAction
  | { type: 'TASK_SET_FILTER'; payload: { filter: TaskFilter } }
  | { type: 'NOTE_SET_SEARCH'; payload: { search: string } }
  | { type: 'NOTE_SET_SORT'; payload: { sortBy: NoteSortBy } }
  | { type: 'SPACE_SWITCH'; payload: { id: string } }
  | { type: 'IMPORT_DATA'; payload: ExportPayload }
  | { type: 'SET_STORAGE_FALLBACK_ACTIVE'; payload: { active: boolean } }
  | { type: 'SCREEN_NAVIGATE'; payload: { screen: Screen } };

const SPACE_DOMAIN_ACTION_TYPES = new Set([
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'TASK_TOGGLE_DONE',
  'TASK_REORDER',
  'REMINDER_CREATE',
  'REMINDER_UPDATE',
  'REMINDER_DELETE',
  'HABIT_CREATE',
  'HABIT_UPDATE',
  'HABIT_DELETE',
  'HABIT_TOGGLE_TODAY',
  'NOTE_CREATE',
  'NOTE_UPDATE',
  'NOTE_DELETE',
  'NOTE_REORDER',
  'NOTE_TOGGLE_EXPANDED',
  'NOTE_TOGGLE_CONTENT_HIDDEN',
  'LOG_CREATE',
  'LOG_DELETE',
  'LOG_DELETE_MANY',
]);

const SETTINGS_ACTION_TYPES = new Set([
  'SETTINGS_SET_THEME',
  'SETTINGS_SET_ACCENT',
  'SETTINGS_SET_HOME_BG_INDEX',
  'SETTINGS_SET_HOME_BG_IMAGE',
  'SETTINGS_SET_HOME_BG_UPLOAD',
  'SETTINGS_HOME_BG_USE_LINK_MODE',
  'SETTINGS_SET_HOME_BG_AUTO_ROTATE',
  'SETTINGS_HOME_BG_ROTATE_NEXT',
  'BLOCK_TOGGLE_COLLAPSED',
  'SETTINGS_SET_HOME_QUOTE_TEXT',
  'SETTINGS_SET_HOME_QUOTE_INDEX',
  'SETTINGS_SET_QUOTE_ROTATE_MODE',
  'SETTINGS_HOME_QUOTE_ROTATE_NEXT',
  'NOTE_SET_VIEW',
  'SETTINGS_SET_DASHBOARD_LAYOUT',
  'SETTINGS_RESET_DASHBOARD_LAYOUT',
  'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS',
]);

const SPACES_ACTION_TYPES = new Set([
  'SPACE_CREATE',
  'SPACE_RENAME',
  'SPACE_SET_ENABLED_BLOCKS',
  'SPACE_DELETE',
  'SPACE_MOVE',
]);

/**
 * Snap ảnh nền + quote (nếu rotateMode 'daily') theo `dayIndex` đúng 1 LẦN mỗi ngày — vào lần
 * HYDRATE đầu tiên của ngày đó (mục 4.6/7 requirements: "ảnh đang dùng được chọn theo chỉ số
 * ngày... khi mở app LẦN ĐẦU trong ngày"). Các lần mở app khác trong cùng ngày giữ nguyên index
 * hiện tại (có thể đã đổi do auto-rotate/chọn tay), không snap lại — khác hành vi mockup vanilla
 * (luôn snap mỗi lần reload trang) vì extension thật PERSIST state giữa các lần mở tab.
 */
function syncDailyContentIfNewDay(settings: Settings): Settings {
  const today = epochDay();
  if (settings.lastOpenedEpochDay === today) return settings;
  return {
    ...settings,
    homeBackground: { ...settings.homeBackground, index: dayIndex(settings.homeBackground.images.length) },
    homeQuotes:
      settings.homeQuotes.rotateMode === 'daily'
        ? { ...settings.homeQuotes, index: dayIndex(settings.homeQuotes.texts.length) }
        : settings.homeQuotes,
    lastOpenedEpochDay: today,
  };
}

/**
 * Reset UI ephemeral: dùng chung cho SPACE_SWITCH và IMPORT_DATA.
 * Giữ nguyên `currentScreen` hiện tại — đổi Space không liên quan tới đổi màn Home/Dashboard.
 */
function resetEphemeralUi(currentScreen: AppState['ui']['currentScreen']): AppState['ui'] {
  return buildUiInitialState(currentScreen);
}

function applySpaceDomainAction(spaces: Space[], currentSpaceId: string, action: AppAction): Space[] {
  return spaces.map((space) => {
    if (space.id !== currentSpaceId) return space;
    switch (action.type) {
      case 'TASK_CREATE':
      case 'TASK_UPDATE':
      case 'TASK_DELETE':
      case 'TASK_TOGGLE_DONE':
      case 'TASK_REORDER':
        return tasksReducer(space, action);
      case 'REMINDER_CREATE':
      case 'REMINDER_UPDATE':
      case 'REMINDER_DELETE':
        return remindersReducer(space, action);
      case 'HABIT_CREATE':
      case 'HABIT_UPDATE':
      case 'HABIT_DELETE':
      case 'HABIT_TOGGLE_TODAY':
        return habitsReducer(space, action);
      case 'NOTE_CREATE':
      case 'NOTE_UPDATE':
      case 'NOTE_DELETE':
      case 'NOTE_REORDER':
      case 'NOTE_TOGGLE_EXPANDED':
      case 'NOTE_TOGGLE_CONTENT_HIDDEN':
        return notesReducer(space, action);
      case 'LOG_CREATE':
      case 'LOG_DELETE':
      case 'LOG_DELETE_MANY':
        return logsReducer(space, action);
      default:
        return space;
    }
  });
}

function normalizeImportedSpace(raw: Partial<Space> & { id?: string }): Space {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? 'Space chưa đặt tên',
    order: raw.order ?? 0,
    enabledBlocks: {
      tasks: raw.enabledBlocks?.tasks ?? true,
      reminder: raw.enabledBlocks?.reminder ?? true,
      habits: raw.enabledBlocks?.habits ?? true,
      notes: raw.enabledBlocks?.notes ?? true,
      // Khối Thông báo không có cấu hình tắt theo Space — luôn `true`, bất kể data import.
      reminders: true,
      // Import cũ (trước khi có Nhật ký nhanh, xem docs/features/nhat-ky-nhanh.md) không có
      // field này -> mặc định hiện, không tự ẩn khối của user cũ.
      logs: raw.enabledBlocks?.logs ?? true,
    },
    tasks: Array.isArray(raw.tasks)
      ? raw.tasks.map((t, idx) => ({ ...t, content: t.content ?? '', order: t.order ?? idx }))
      : [],
    reminders: Array.isArray(raw.reminders)
      ? raw.reminders.map((r) => {
          if (r.type !== 'recurring') return r;
          const rec = r as typeof r & { createdAt?: string };
          return rec.createdAt ? r : { ...r, createdAt: new Date().toISOString() };
        })
      : [],
    habits: Array.isArray(raw.habits)
      ? raw.habits.map((h) => ({
          ...h,
          completedDates: Array.isArray(h.completedDates) ? h.completedDates : [],
        }))
      : [],
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => ({ ...n, expanded: n.expanded ?? false, hidden: n.hidden ?? false })) : [],
    logs: normalizeLogEntries(raw.logs),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'HYDRATE': {
      const settings = syncDailyContentIfNewDay(action.payload.settings);
      return {
        spaces: action.payload.spaces,
        currentSpaceId: action.payload.currentSpaceId,
        settings,
        ui: buildUiInitialState(settings.lastScreen),
        storageFallbackActive: action.payload.storageFallbackActive,
      };
    }

    case 'SCREEN_NAVIGATE':
      if (state.ui.currentScreen === action.payload.screen) return state;
      return {
        ...state,
        ui: { ...state.ui, currentScreen: action.payload.screen },
        settings: { ...state.settings, lastScreen: action.payload.screen },
      };

    case 'SET_STORAGE_FALLBACK_ACTIVE':
      return { ...state, storageFallbackActive: action.payload.active };

    case 'TASK_SET_FILTER':
      return { ...state, ui: { ...state.ui, taskFilter: action.payload.filter } };

    case 'NOTE_SET_SEARCH':
      return { ...state, ui: { ...state.ui, noteSearch: action.payload.search } };

    case 'NOTE_SET_SORT':
      return { ...state, ui: { ...state.ui, noteSortBy: action.payload.sortBy } };

    case 'SPACE_SWITCH': {
      if (!state.spaces.some((s) => s.id === action.payload.id)) return state;
      return { ...state, currentSpaceId: action.payload.id, ui: resetEphemeralUi(state.ui.currentScreen) };
    }

    case 'SPACE_DELETE': {
      const nextSpaces = spacesReducer(state.spaces, action);
      if (nextSpaces === state.spaces) return state; // chặn xoá khi chỉ còn 1 space
      const currentSpaceId = nextSpaces.some((s) => s.id === state.currentSpaceId)
        ? state.currentSpaceId
        : nextSpaces[0].id;
      const switchedSpace = currentSpaceId !== state.currentSpaceId;
      return {
        ...state,
        spaces: nextSpaces,
        currentSpaceId,
        ui: switchedSpace ? resetEphemeralUi(state.ui.currentScreen) : state.ui,
      };
    }

    case 'SPACE_CREATE': {
      const nextSpaces = spacesReducer(state.spaces, action);
      const created = nextSpaces[nextSpaces.length - 1];
      return { ...state, spaces: nextSpaces, currentSpaceId: created.id, ui: resetEphemeralUi(state.ui.currentScreen) };
    }

    case 'SPACE_ADD_SHARED': {
      // spacesReducer xử lý idempotency: bỏ qua nếu id đã tồn tại
      const nextSpaces = spacesReducer(state.spaces, action);
      const spaceId = action.payload.space.id;
      return { ...state, spaces: nextSpaces, currentSpaceId: spaceId, ui: resetEphemeralUi(state.ui.currentScreen) };
    }

    case 'IMPORT_DATA': {
      const rawSpaces = Array.isArray(action.payload.spaces) ? action.payload.spaces : [];
      const importedSpaces = rawSpaces.map(normalizeImportedSpace);
      if (importedSpaces.length === 0) return state; // không có space hợp lệ — bỏ qua import lỗi
      const currentSpaceId = importedSpaces.some((s) => s.id === action.payload.currentSpaceId)
        ? action.payload.currentSpaceId
        : importedSpaces[0].id;
      // File export CŨ (trước khi dashboardLayout chuyển về dùng chung) lưu layout riêng trong
      // từng Space — `findLegacyDashboardLayout` đọc thẳng field đó từ JSON thô (rawSpaces, chưa
      // qua normalizeImportedSpace nên còn field cũ) làm fallback khi `action.payload.settings`
      // chưa có `dashboardLayout` (file export càng cũ).
      const settings = normalizeSettings(
        action.payload.settings ?? defaultSettings(),
        undefined,
        findLegacyDashboardLayout(rawSpaces),
      );
      return {
        spaces: importedSpaces,
        currentSpaceId,
        settings,
        ui: resetEphemeralUi(state.ui.currentScreen),
        storageFallbackActive: state.storageFallbackActive,
      };
    }

    default:
      break;
  }

  if (SETTINGS_ACTION_TYPES.has(action.type)) {
    return { ...state, settings: settingsReducer(state.settings, action as SettingsAction) };
  }

  if (SPACES_ACTION_TYPES.has(action.type)) {
    return { ...state, spaces: spacesReducer(state.spaces, action as SpacesAction) };
  }

  if (SPACE_DOMAIN_ACTION_TYPES.has(action.type)) {
    return { ...state, spaces: applySpaceDomainAction(state.spaces, state.currentSpaceId, action) };
  }

  return state;
}
