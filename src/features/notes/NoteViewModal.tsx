import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { maskContent } from './noteUtils';
import type { Note } from '../../types';

interface NoteViewModalProps {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
}

const COPIED_FEEDBACK_MS = 1200;

export function NoteViewModal({ note, onClose, onEdit }: NoteViewModalProps) {
  const { dispatch } = useAppState();
  const isHidden = note.hidden;
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const realLines = note.content.split('\n');
  const displayLines = (isHidden ? maskContent(note.content) : note.content).split('\n');

  // Copy đúng dòng THẬT (realLines[i]), kể cả khi đang ẩn (masked) — cho phép copy mật khẩu/token
  // mà không cần hiện ra màn hình trước (xem thảo luận UX khối Ghi chú).
  function handleCopyLine(index: number) {
    const line = realLines[index];
    navigator.clipboard.writeText(line).then(() => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedIndex(index);
      copiedTimerRef.current = setTimeout(() => setCopiedIndex(null), COPIED_FEEDBACK_MS);
    });
  }

  return (
    <Modal onClose={onClose} className="modal-note-view w-[720px] max-w-[92vw] max-h-[88vh] max-md:w-[94vw]">
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
      <div className="max-h-[60vh] overflow-y-auto px-0.5 py-1 text-[0.9375rem] leading-[1.65] text-[var(--text)]">
        {displayLines.map((line, i) => (
          <div key={i} className="group flex min-h-[1.65em] items-start gap-2">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line || ' '}</span>
            {line.trim() && (
              <button
                type="button"
                className="icon-btn mt-0.5 flex-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
                title="Copy dòng này"
                aria-label="Copy dòng này"
                onClick={() => handleCopyLine(i)}
              >
                {copiedIndex === i ? <Check className="icon" size={13} /> : <Copy className="icon" size={13} />}
              </button>
            )}
          </div>
        ))}
      </div>
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
