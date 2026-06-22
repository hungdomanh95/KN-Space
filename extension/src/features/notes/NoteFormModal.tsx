import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { defaultNoteColor, NOTE_PALETTE } from '../../state/reducers/notes';
import type { Note } from '../../types';

interface NoteFormModalProps {
  note: Note | null; // null = tạo mới
  noteCount: number;
  onClose: () => void;
}

export function NoteFormModal({ note, noteCount, onClose }: NoteFormModalProps) {
  const { dispatch } = useAppState();
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [color, setColor] = useState(note?.color ?? defaultNoteColor(noteCount));

  function handleSave() {
    if (note) {
      dispatch({ type: 'NOTE_UPDATE', payload: { id: note.id, title, content, color } });
    } else {
      dispatch({ type: 'NOTE_CREATE', payload: { title, content, color } });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} className="modal-note">
      <div className="note-modal-head">
        <h2>{note ? 'Sửa card' : 'Note mới'}</h2>
        <div className="color-palette">
          {NOTE_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'active' : ''}`}
              style={{ background: c }}
              title="Chọn màu thẻ"
              aria-label={`Chọn màu thẻ ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label>Tên card</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Nội dung</label>
        <textarea className="note-content-field" value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn-primary" onClick={handleSave}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
