import type { AppState, ExportPayload, NoteSortBy, NoteView, Space, TaskFilter } from '../types';
import { buildUiInitialState } from '../storage/chromeStorage';
import type { HabitAction } from './reducers/habits';
import { habitsReducer } from './reducers/habits';
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
  | SpacesAction
  | SettingsAction
  | { type: 'TASK_SET_FILTER'; payload: { filter: TaskFilter } }
  | { type: 'NOTE_SET_SEARCH'; payload: { search: string } }
  | { type: 'NOTE_SET_SORT'; payload: { sortBy: NoteSortBy } }
  | { type: 'NOTE_SET_VIEW'; payload: { view: NoteView } }
  | { type: 'NOTE_TOGGLE_CONTENT_HIDDEN'; payload: { id: string } }
  | { type: 'SPACE_SWITCH'; payload: { id: string } }
  | { type: 'IMPORT_DATA'; payload: ExportPayload }
  | { type: 'SET_STORAGE_FALLBACK_ACTIVE'; payload: { active: boolean } };

const SPACE_DOMAIN_ACTION_TYPES = new Set([
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'TASK_TOGGLE_DONE',
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
]);

const SETTINGS_ACTION_TYPES = new Set([
  'SETTINGS_SET_THEME',
  'SETTINGS_SET_ACCENT',
  'SETTINGS_SET_BACKGROUND',
  'SETTINGS_SET_LAYOUT_SIZES',
  'SETTINGS_RESET_LAYOUT',
  'SETTINGS_SET_MAIN_BLOCK_ORDER',
  'BLOCK_TOGGLE_COLLAPSED',
  'BLOCK_TOGGLE_COLLAPSE_ALL',
]);

const SPACES_ACTION_TYPES = new Set([
  'SPACE_CREATE',
  'SPACE_RENAME',
  'SPACE_SET_ENABLED_BLOCKS',
  'SPACE_DELETE',
  'SPACE_MOVE',
]);

/** Reset UI ephemeral: dùng chung cho SPACE_SWITCH và IMPORT_DATA. */
function resetEphemeralUi(): AppState['ui'] {
  return buildUiInitialState();
}

function applySpaceDomainAction(spaces: Space[], currentSpaceId: string, action: AppAction): Space[] {
  return spaces.map((space) => {
    if (space.id !== currentSpaceId) return space;
    switch (action.type) {
      case 'TASK_CREATE':
      case 'TASK_UPDATE':
      case 'TASK_DELETE':
      case 'TASK_TOGGLE_DONE':
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
        return notesReducer(space, action);
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
      reminders: raw.enabledBlocks?.reminders ?? true,
    },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
    habits: Array.isArray(raw.habits) ? raw.habits : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return {
        spaces: action.payload.spaces,
        currentSpaceId: action.payload.currentSpaceId,
        settings: action.payload.settings,
        ui: buildUiInitialState(),
        storageFallbackActive: action.payload.storageFallbackActive,
      };

    case 'SET_STORAGE_FALLBACK_ACTIVE':
      return { ...state, storageFallbackActive: action.payload.active };

    case 'TASK_SET_FILTER':
      return { ...state, ui: { ...state.ui, taskFilter: action.payload.filter } };

    case 'NOTE_SET_SEARCH':
      return { ...state, ui: { ...state.ui, noteSearch: action.payload.search } };

    case 'NOTE_SET_SORT':
      return { ...state, ui: { ...state.ui, noteSortBy: action.payload.sortBy } };

    case 'NOTE_SET_VIEW':
      return { ...state, ui: { ...state.ui, noteView: action.payload.view } };

    case 'NOTE_TOGGLE_CONTENT_HIDDEN': {
      const nextHidden = new Set(state.ui.hiddenNoteContentIds);
      if (nextHidden.has(action.payload.id)) nextHidden.delete(action.payload.id);
      else nextHidden.add(action.payload.id);
      return { ...state, ui: { ...state.ui, hiddenNoteContentIds: nextHidden } };
    }

    case 'SPACE_SWITCH': {
      if (!state.spaces.some((s) => s.id === action.payload.id)) return state;
      return { ...state, currentSpaceId: action.payload.id, ui: resetEphemeralUi() };
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
        ui: switchedSpace ? resetEphemeralUi() : state.ui,
      };
    }

    case 'SPACE_CREATE': {
      const nextSpaces = spacesReducer(state.spaces, action);
      const created = nextSpaces[nextSpaces.length - 1];
      return { ...state, spaces: nextSpaces, currentSpaceId: created.id, ui: resetEphemeralUi() };
    }

    case 'IMPORT_DATA': {
      const importedSpaces = Array.isArray(action.payload.spaces) ? action.payload.spaces.map(normalizeImportedSpace) : [];
      if (importedSpaces.length === 0) return state; // không có space hợp lệ — bỏ qua import lỗi
      const currentSpaceId = importedSpaces.some((s) => s.id === action.payload.currentSpaceId)
        ? action.payload.currentSpaceId
        : importedSpaces[0].id;
      const settings = action.payload.settings ?? defaultSettings();
      return {
        spaces: importedSpaces,
        currentSpaceId,
        settings,
        ui: resetEphemeralUi(),
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
