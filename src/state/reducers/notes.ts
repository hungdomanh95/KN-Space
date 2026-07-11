import type { Note, Space } from '../../types';
import { computeOrderForInsertAt } from '../fractionalOrder';

export const NOTE_PALETTE = ['#8b5cf6', '#0ea5e9', '#22c55e', '#f97316', '#ec4899', '#64748b'];

export function defaultNoteColor(noteCount: number): string {
  return NOTE_PALETTE[noteCount % NOTE_PALETTE.length];
}

export type NoteAction =
  | { type: 'NOTE_CREATE'; payload: { title: string; content: string; color: string; createdBy?: string; id?: string } }
  | { type: 'NOTE_UPDATE'; payload: { id: string; title: string; content: string; color: string } }
  | { type: 'NOTE_DELETE'; payload: { id: string } }
  | { type: 'NOTE_REORDER'; payload: { draggedId: string; targetId: string; insertAfter: boolean } }
  | { type: 'NOTE_TOGGLE_CONTENT_HIDDEN'; payload: { id: string } };

export function notesReducer(space: Space, action: NoteAction): Space {
  switch (action.type) {
    case 'NOTE_CREATE': {
      const maxOrder = space.notes.reduce((max, n) => Math.max(max, n.order), -1);
      const newNote: Note = {
        id: action.payload.id ?? crypto.randomUUID(),
        title: action.payload.title.trim() || 'Note chưa đặt tên',
        content: action.payload.content,
        color: action.payload.color || NOTE_PALETTE[0],
        updatedAt: Date.now(),
        order: maxOrder + 1,
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
      // Fractional-index (docs/features/item-level-entity-tables.md mục 5): CHỈ tính lại `order`
      // của ĐÚNG note vừa kéo (draggedId) — KHÔNG reindex toàn mảng `0..n-1` như trước. Mọi note
      // khác giữ nguyên `order` -> khi tách bảng item-level (kn_private_notes/kn_shared_notes), 1
      // lần kéo-thả chỉ cần UPDATE đúng 1 dòng thay vì N dòng. Mirror CHÍNH XÁC `TASK_REORDER`
      // (`state/reducers/tasks.ts`), chỉ khác Note CÓ phân biệt nửa trên/dưới (`insertAfter`).
      const ordered = [...space.notes].sort((a, b) => a.order - b.order);
      const fromIdx = ordered.findIndex((n) => n.id === draggedId);
      if (fromIdx === -1) return space;
      ordered.splice(fromIdx, 1); // loại note đang kéo khỏi mảng tham chiếu láng giềng
      let toIdx = ordered.findIndex((n) => n.id === targetId);
      if (toIdx === -1) return space;
      // Giữ NGUYÊN ý nghĩa `insertAfter` cũ: chèn TRƯỚC targetId (mặc định) hoặc NGAY SAU targetId
      // (kéo thả vào nửa dưới của item) — chỉ khác cách tính: lấy 2 láng giềng kề tại đúng vị trí
      // chèn thay vì gán lại toàn bộ chỉ số mảng.
      if (insertAfter) toIdx += 1;
      const existingOrders = ordered.map((n) => n.order);
      const newOrder = computeOrderForInsertAt(existingOrders, toIdx);
      return {
        ...space,
        notes: space.notes.map((n) => (n.id === draggedId ? { ...n, order: newOrder } : n)),
      };
    }
    case 'NOTE_TOGGLE_CONTENT_HIDDEN':
      return {
        ...space,
        notes: space.notes.map((n) => (n.id === action.payload.id ? { ...n, hidden: !n.hidden } : n)),
      };
    default:
      return space;
  }
}
