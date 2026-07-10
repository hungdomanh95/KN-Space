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

/**
 * Gom các dòng LIÊN TIẾP không có dòng trống xen giữa thành 1 "cụm" — giống Notion tách block
 * bằng 1 dòng Enter rỗng. Mỗi cụm sẽ có đúng 1 nút copy cho toàn bộ nội dung cụm đó (không phải
 * copy từng dòng riêng lẻ) — xem thảo luận UX khối Ghi chú (ví dụ: 1 cụm lệnh shell nhiều dòng
 * cần copy nguyên khối mới chạy đúng).
 */
function groupIntoBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

export function NoteViewModal({ note, onClose, onEdit }: NoteViewModalProps) {
  const { dispatch } = useAppState();
  const isHidden = note.hidden;
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  // maskContent() thay từng dòng bằng '***' nhưng GIỮ NGUYÊN vị trí dòng trống, nên gom cụm trên
  // bản mask ra đúng cùng ranh giới với bản thật — 2 mảng luôn khớp index với nhau.
  const realBlocks = groupIntoBlocks(note.content);
  const displayBlocks = groupIntoBlocks(isHidden ? maskContent(note.content) : note.content);

  // Copy CẢ CỤM (nhiều dòng) giá trị THẬT, kể cả khi đang ẩn (masked) — cho phép copy nguyên
  // khối lệnh/token mà không cần hiện ra màn hình trước.
  function handleCopyBlock(index: number) {
    const block = realBlocks[index];
    navigator.clipboard.writeText(block).then(() => {
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
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-0.5 py-1 text-[0.9375rem] leading-[1.65] text-[var(--text)]">
        {displayBlocks.map((block, i) => (
          <div key={i} className="group flex items-start gap-2">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{block}</span>
            <button
              type="button"
              className="icon-btn mt-0.5 flex-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
              title="Copy cụm này"
              aria-label="Copy cụm này"
              onClick={() => handleCopyBlock(i)}
            >
              {copiedIndex === i ? <Check className="icon" size={13} /> : <Copy className="icon" size={13} />}
            </button>
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
