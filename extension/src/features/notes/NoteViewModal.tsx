import { Eye, EyeOff } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { maskContent } from './noteUtils';
import type { Note } from '../../types';

interface NoteViewModalProps {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
}

export function NoteViewModal({ note, onClose, onEdit }: NoteViewModalProps) {
  const { state, dispatch } = useAppState();
  const isHidden = state.ui.hiddenNoteContentIds.has(note.id);

  return (
    <Modal onClose={onClose} className="modal-note-view">
      <div className="note-modal-head">
        <h2>{note.title}</h2>
        <button
          className="icon-btn"
          title={isHidden ? 'Hiện nội dung' : 'Ẩn nội dung'}
          aria-label={isHidden ? 'Hiện nội dung' : 'Ẩn nội dung'}
          onClick={() => dispatch({ type: 'NOTE_TOGGLE_CONTENT_HIDDEN', payload: { id: note.id } })}
        >
          {isHidden ? <Eye className="icon" size={13} /> : <EyeOff className="icon" size={13} />}
        </button>
      </div>
      <div className="note-view-body">{isHidden ? maskContent(note.content) : note.content}</div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Đóng
        </button>
        <button className="btn-primary" onClick={onEdit}>
          Sửa
        </button>
      </div>
    </Modal>
  );
}
