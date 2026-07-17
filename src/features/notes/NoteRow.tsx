import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { useMobileLayout } from '../../layout/useMobileLayout';
import { MemberAvatar } from '../../components/MemberAvatar';
import { formatNoteDate, notePreviewText } from './noteUtils';
import type { Note, NoteSortBy } from '../../types';

interface NoteRowProps {
  note: Note;
  sortBy: NoteSortBy;
  onOpenView: (id: string) => void;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onDragStart: (id: string) => void;
  onDragEndAll: () => void;
  draggedId: string | null;
  /** Chỉ truyền khi shared space + note của người khác */
  creatorInfo?: { name: string; color: string };
}

const COPIED_FEEDBACK_MS = 1200;

/**
 * 1 hàng trong danh sách Ghi chú — thay cho `NoteCard` dạng lưới cũ (xem thảo luận redesign:
 * dữ liệu thật chủ yếu là link/tài khoản/lệnh tham khảo, list dày đặc quét nhanh hơn card màu).
 * Kéo-thả port đúng kỹ thuật cũ: draggable chỉ bật khi bấm-giữ đúng icon grip (mousedown), disarm
 * khi mouseup ở document (xem `NotesBlock.tsx`).
 */
export function NoteRow({
  note,
  sortBy,
  onOpenView,
  onEdit,
  onDelete,
  onDragStart,
  onDragEndAll,
  draggedId,
  creatorInfo,
}: NoteRowProps) {
  const { dispatch } = useAppState();
  // Ẩn kéo-thả trên mobile (docs/features/an-keo-tha-tren-mobile.md, phương án (b) — dropdown sort
  // giữ nguyên "Thứ tự thủ công", chỉ ẩn grip khi ở mô hình UI mobile).
  const isMobileBlocksOnly = useMobileLayout();
  const rowRef = useRef<HTMLDivElement>(null);
  const [dropHint, setDropHint] = useState<'before' | 'after' | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const isHidden = note.hidden;
  const isDragging = draggedId === note.id;
  const isDragSource = draggedId !== null && draggedId !== note.id;

  function armDraggable() {
    if (rowRef.current) rowRef.current.draggable = true;
  }

  function handleDragStart(e: React.DragEvent) {
    onDragStart(note.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    if (rowRef.current) rowRef.current.draggable = false;
    setDropHint(null);
    onDragEndAll();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (isDragSource) {
      const rect = rowRef.current?.getBoundingClientRect();
      if (rect) setDropHint(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    }
  }

  function handleDragLeave() {
    setDropHint(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const insertAfter = dropHint === 'after';
    setDropHint(null);
    if (!draggedId || draggedId === note.id) return;
    dispatch({ type: 'NOTE_REORDER', payload: { draggedId, targetId: note.id, insertAfter } });
  }

  function handleRowClick() {
    // Bôi đen để copy text trong hàng cũng kết thúc bằng 1 click — chỉ mở modal detail khi
    // không có vùng text nào đang được chọn.
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    onOpenView(note.id);
  }

  function handleCopyWhole() {
    navigator.clipboard.writeText(note.content).then(() => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    });
  }

  const dropClass = dropHint === 'before' ? 'drop-before' : dropHint === 'after' ? 'drop-after' : '';

  return (
    <div
      ref={rowRef}
      className={`note-row ${isDragging ? 'dragging' : ''} ${dropClass}`.trim()}
      data-id={note.id}
      onClick={handleRowClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {sortBy === 'order' && !isMobileBlocksOnly && (
        <span className="nr-grip" title="Kéo để đổi thứ tự" aria-label="Kéo để đổi thứ tự" onMouseDown={armDraggable} onClick={(e) => e.stopPropagation()}>
          <GripVertical className="icon h-[13px] w-[13px]" size={13} />
        </span>
      )}
      <span className="nr-dot" style={{ background: note.color }} />
      <div className="nr-main">
        <span className="nr-title" title={note.title}>{note.title}</span>
        <div className="nr-preview" title={isHidden ? undefined : notePreviewText(isHidden, note.content)}>
          {notePreviewText(isHidden, note.content)}
        </div>
      </div>
      {creatorInfo && (
        <span onClick={(e) => e.stopPropagation()}>
          <MemberAvatar name={creatorInfo.name} color={creatorInfo.color} size={18} />
        </span>
      )}
      <div className="nr-trailing">
        {note.updatedAt > 0 && <span className="nr-date">{formatNoteDate(note.updatedAt)}</span>}
        <div className="nr-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="Copy nội dung" aria-label="Copy nội dung" onClick={handleCopyWhole}>
            {copied ? <Check className="icon" size={13} /> : <Copy className="icon" size={13} />}
          </button>
          <button
            className="icon-btn"
            title={isHidden ? 'Hiện nội dung' : 'Ẩn nội dung'}
            aria-label={isHidden ? 'Hiện nội dung' : 'Ẩn nội dung'}
            onClick={() => dispatch({ type: 'NOTE_TOGGLE_CONTENT_HIDDEN', payload: { id: note.id } })}
          >
            {isHidden ? <Eye className="icon" size={13} /> : <EyeOff className="icon" size={13} />}
          </button>
          <button className="icon-btn" title="Sửa note" aria-label="Sửa note" onClick={() => onEdit(note)}>
            <Pencil className="icon" size={13} />
          </button>
          <button className="icon-btn" title="Xoá note" aria-label="Xoá note" onClick={() => onDelete(note)}>
            <Trash2 className="icon" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
