import React, { useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, Maximize2, Minimize2, Pencil, Trash2 } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { formatNoteDate, hexToRgba, maskContent } from './noteUtils';
import type { Note, NoteSortBy, NoteView } from '../../types';

interface NoteCardProps {
  note: Note;
  sortBy: NoteSortBy;
  view: NoteView;
  onOpenView: (id: string) => void;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onDragStart: (id: string) => void;
  onDragEndAll: () => void;
  draggedId: string | null;
}

/**
 * Kéo-thả note card — port đúng kỹ thuật mockup: draggable chỉ bật khi
 * bấm-giữ đúng vào icon grip (mousedown), disarm khi mouseup ở document.
 * Làm qua ref imperatively (KHÔNG qua state) để tránh race batched/async.
 */
export function NoteCard({
  note,
  sortBy,
  view,
  onOpenView,
  onEdit,
  onDelete,
  onDragStart,
  onDragEndAll,
  draggedId,
}: NoteCardProps) {
  const { dispatch } = useAppState();
  const cardRef = useRef<HTMLDivElement>(null);
  const [dropHint, setDropHint] = useState<'before' | 'after' | null>(null);

  const isHidden = note.hidden;
  const isExpanded = view === 'list' && note.expanded;
  const noteAlpha = document.body.getAttribute('data-theme') === 'dark' ? 0.24 : 0.1;
  const bgStyle = hexToRgba(note.color, noteAlpha);
  const isDragging = draggedId === note.id;
  const isDragSource = draggedId !== null && draggedId !== note.id;

  function armDraggable() {
    if (cardRef.current) cardRef.current.draggable = true;
  }

  function handleDragStart(e: React.DragEvent) {
    onDragStart(note.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    if (cardRef.current) cardRef.current.draggable = false;
    setDropHint(null);
    onDragEndAll();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (view === 'list' && isDragSource) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        setDropHint(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }
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
    dispatch({
      type: 'NOTE_REORDER',
      payload: { draggedId, targetId: note.id, insertAfter: view === 'list' ? insertAfter : false },
    });
  }

  const dropClass = dropHint === 'before' ? 'drop-before' : dropHint === 'after' ? 'drop-after' : '';

  function handleCardClick() {
    // Bôi đen để copy text trong card cũng kết thúc bằng 1 click — chỉ mở modal
    // detail khi không có vùng text nào đang được chọn.
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    onOpenView(note.id);
  }

  return (
    <div
      ref={cardRef}
      className={`note-card ${isDragging ? 'dragging' : ''} ${dropClass} ${isExpanded ? 'expanded' : ''}`.trim()}
      data-id={note.id}
      style={{ borderLeftColor: note.color, background: bgStyle }}
      onClick={handleCardClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="nc-head">
        <div className="nc-tools" onClick={(e) => e.stopPropagation()}>
          {sortBy === 'order' && (
            <span
              className="card-grip"
              title="Kéo để đổi thứ tự"
              aria-label="Kéo để đổi thứ tự card"
              onMouseDown={armDraggable}
            >
              <GripVertical className="icon h-[13px] w-[13px]" size={13} />
            </span>
          )}
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
          {view === 'list' && (
            <button
              className="icon-btn"
              title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
              aria-label={isExpanded ? 'Thu gọn card' : 'Mở rộng card'}
              aria-pressed={isExpanded}
              onClick={() => dispatch({ type: 'NOTE_TOGGLE_EXPANDED', payload: { id: note.id } })}
            >
              {isExpanded ? <Minimize2 className="icon" size={13} /> : <Maximize2 className="icon" size={13} />}
            </button>
          )}
        </div>
      </div>
      <p className="nc-title">{note.title}</p>
      <p className="nc-content">{isHidden ? maskContent(note.content) : note.content}</p>
      {note.updatedAt > 0 && <span className="nc-date">{formatNoteDate(note.updatedAt)}</span>}
    </div>
  );
}
