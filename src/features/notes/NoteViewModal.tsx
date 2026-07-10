import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { groupLinesIntoBlocks, looksLikeCode, maskLine } from './noteUtils';
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

  // Gom cụm LUÔN dựa trên dòng THẬT (giữ đúng ranh giới cụm giống Notion — dòng trống giữa 1 khối
  // ngoặc/`do...end` chưa đóng không tách cụm, xem `groupLinesIntoBlocks`). Bản hiển thị khi đang
  // ẩn chỉ mask TỪNG DÒNG sau khi đã gom xong, để 2 mảng luôn khớp index — mask trước rồi mới gom
  // sẽ làm mất hết ký tự cú pháp ({}/do/end) khiến ranh giới cụm bị lệch so với nội dung thật.
  const lineGroups = groupLinesIntoBlocks(note.content.split('\n'));
  const realBlocks = lineGroups.map((g) => g.join('\n'));
  const displayBlocks = lineGroups.map((g) => (isHidden ? g.map(maskLine).join('\n') : g.join('\n')));

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
      <div className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto px-0.5 py-1 text-[0.9375rem] leading-[1.65] text-[var(--text)]">
        {displayBlocks.map((block, i) => {
          const isCode = looksLikeCode(realBlocks[i]);
          return (
            <div
              key={i}
              className={`group flex items-start gap-2 rounded-lg border border-[color:var(--border-hairline)] bg-[var(--raised)] px-3 py-2 ${
                isCode ? 'font-mono text-[0.8125rem] leading-[1.55]' : ''
              }`}
            >
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
          );
        })}
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
