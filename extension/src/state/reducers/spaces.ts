import type { EnabledBlocks, Space } from '../../types';

export type SpacesAction =
  | { type: 'SPACE_CREATE'; payload: { name: string; enabledBlocks: EnabledBlocks } }
  | { type: 'SPACE_RENAME'; payload: { id: string; name: string } }
  | { type: 'SPACE_SET_ENABLED_BLOCKS'; payload: { id: string; enabledBlocks: EnabledBlocks } }
  | { type: 'SPACE_DELETE'; payload: { id: string } }
  | { type: 'SPACE_MOVE'; payload: { id: string; direction: -1 | 1 } };

export function defaultEnabledBlocks(): EnabledBlocks {
  return { tasks: true, reminder: true, habits: true, notes: true, reminders: true };
}

function emptySpace(name: string, order: number, enabledBlocks: EnabledBlocks): Space {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Space chưa đặt tên',
    order,
    enabledBlocks,
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };
}

/** Reducer thuần cho mảng spaces (không cần biết currentSpaceId — caller xử lý chuyển space riêng). */
export function spacesReducer(spaces: Space[], action: SpacesAction): Space[] {
  switch (action.type) {
    case 'SPACE_CREATE': {
      const maxOrder = spaces.reduce((max, s) => Math.max(max, s.order), -1);
      const newSpace = emptySpace(action.payload.name, maxOrder + 1, action.payload.enabledBlocks);
      return [...spaces, newSpace];
    }
    case 'SPACE_RENAME':
      return spaces.map((s) =>
        s.id === action.payload.id ? { ...s, name: action.payload.name.trim() || 'Space chưa đặt tên' } : s,
      );
    case 'SPACE_SET_ENABLED_BLOCKS':
      return spaces.map((s) =>
        s.id === action.payload.id ? { ...s, enabledBlocks: action.payload.enabledBlocks } : s,
      );
    case 'SPACE_DELETE': {
      if (spaces.length <= 1) return spaces; // Không cho xoá nếu chỉ còn 1 Space.
      return spaces.filter((s) => s.id !== action.payload.id);
    }
    case 'SPACE_MOVE': {
      const ordered = [...spaces].sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((s) => s.id === action.payload.id);
      if (idx === -1) return spaces;
      const targetIdx = idx + action.payload.direction;
      if (targetIdx < 0 || targetIdx >= ordered.length) return spaces;
      [ordered[idx], ordered[targetIdx]] = [ordered[targetIdx], ordered[idx]];
      return ordered.map((s, i) => ({ ...s, order: i }));
    }
    default:
      return spaces;
  }
}
