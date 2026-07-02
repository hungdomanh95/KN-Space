import type { Note, Space } from '../../types';

export const NOTE_PALETTE = ['#8b5cf6', '#0ea5e9', '#22c55e', '#f97316', '#ec4899', '#64748b'];

export function defaultNoteColor(noteCount: number): string {
  return NOTE_PALETTE[noteCount % NOTE_PALETTE.length];
}

export type NoteAction =
  | { type: 'NOTE_CREATE'; payload: { title: string; content: string; color: string; createdBy?: string } }
  | { type: 'NOTE_UPDATE'; payload: { id: string; title: string; content: string; color: string } }
  | { type: 'NOTE_DELETE'; payload: { id: string } }
  | { type: 'NOTE_REORDER'; payload: { draggedId: string; targetId: string; insertAfter: boolean } }
  | { type: 'NOTE_TOGGLE_EXPANDED'; payload: { id: string } }
  | { type: 'NOTE_TOGGLE_CONTENT_HIDDEN'; payload: { id: string } };

export function notesReducer(space: Space, action: NoteAction): Space {
  switch (action.type) {
    case 'NOTE_CREATE': {
      const maxOrder = space.notes.reduce((max, n) => Math.max(max, n.order), -1);
      const newNote: Note = {
        id: crypto.randomUUID(),
        title: action.payload.title.trim() || 'Note chưa đặt tên',
        content: action.payload.content,
        color: action.payload.color || NOTE_PALETTE[0],
        updatedAt: Date.now(),
        order: maxOrder + 1,
        expanded: false,
        hidden: false,
        createdAt: new Date().toISOString(),
        ...(action.payload.createdBy ? { createdBy: action.payload.createdBy } : {}),
      };
      return { ...space, notes: [...space.notes, newNote] };
    }
    case 'NOTE_UPDATE':
      return {
        ...space,
        notes: space.notes.map((n) =>
          n.id === action.payload.id
            ? {
                ...n,
                title: action.payload.title.trim() || 'Note chưa đặt tên',
                content: action.payload.content,
                color: action.payload.color || NOTE_PALETTE[0],
                updatedAt: Date.now(),
              }
            : n,
        ),
      };
    case 'NOTE_DELETE':
      return { ...space, notes: space.notes.filter((n) => n.id !== action.payload.id) };
    case 'NOTE_REORDER': {
      const { draggedId, targetId, insertAfter } = action.payload;
      if (draggedId === targetId) return space;
      // Sắp xếp theo order hiện tại để có 1 mảng tuyến tính nhất quán, rồi re-assign order 0..n-1.
      const ordered = [...space.notes].sort((a, b) => a.order - b.order);
      const fromIdx = ordered.findIndex((n) => n.id === draggedId);
      if (fromIdx === -1) return space;
      const [moved] = ordered.splice(fromIdx, 1);
      let toIdx = ordered.findIndex((n) => n.id === targetId);
      if (toIdx === -1) return space;
      if (insertAfter) toIdx += 1;
      ordered.splice(toIdx, 0, moved);
      const reindexed = ordered.map((n, idx) => ({ ...n, order: idx }));
      return { ...space, notes: reindexed };
    }
    case 'NOTE_TOGGLE_EXPANDED':
      return {
        ...space,
        notes: space.notes.map((n) => (n.id === action.payload.id ? { ...n, expanded: !n.expanded } : n)),
      };
    case 'NOTE_TOGGLE_CONTENT_HIDDEN':
      return {
        ...space,
        notes: space.notes.map((n) => (n.id === action.payload.id ? { ...n, hidden: !n.hidden } : n)),
      };
    default:
      return space;
  }
}
