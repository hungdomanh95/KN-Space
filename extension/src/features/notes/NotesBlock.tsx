import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Grid2x2, Plus, Rows2 } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { NoteCard } from './NoteCard';
import { NoteFormModal } from './NoteFormModal';
import { NoteViewModal } from './NoteViewModal';
import type { Note, NoteSortBy } from '../../types';

interface NotesBlockProps {
  style?: React.CSSProperties;
  className?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  draggable?: boolean;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

const SORT_OPTIONS: { value: NoteSortBy; label: string }[] = [
  { value: 'order', label: 'Thứ tự thủ công' },
  { value: 'title', label: 'Tên A-Z' },
  { value: 'recent', label: 'Mới sửa gần nhất' },
];

export function NotesBlock({
  style,
  className,
  rootRef,
  draggable,
  onMouseDownCapture,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: NotesBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingNote, setEditingNote] = useState<Note | null | 'new'>(null);
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const sortWrapRef = useRef<HTMLDivElement>(null);

  const collapsed = state.settings.collapsedBlocks.notes;
  const { noteView } = state.settings;
  const { noteSearch, noteSortBy } = state.ui;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (sortWrapRef.current && !sortWrapRef.current.contains(e.target as Node)) setSortMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Disarm draggable trên mọi card khi nhấc chuột ra, dù không drop đúng chỗ.
  useEffect(() => {
    function onMouseUp() {
      document.querySelectorAll<HTMLElement>('.note-card').forEach((el) => {
        if (!el.classList.contains('dragging')) el.draggable = false;
      });
    }
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  let list = space.notes;
  if (noteSearch) {
    const q = noteSearch.toLowerCase();
    list = list.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }
  if (noteSortBy === 'order') list = [...list].sort((a, b) => a.order - b.order);
  else if (noteSortBy === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (noteSortBy === 'recent') list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);

  function handleDelete(note: Note) {
    showConfirm('Xoá note?', 'Xoá card note này? Hành động không thể hoàn tác.', () =>
      dispatch({ type: 'NOTE_DELETE', payload: { id: note.id } }),
    );
  }

  const viewingNote = viewingNoteId ? space.notes.find((n) => n.id === viewingNoteId) ?? null : null;

  const cardsProps = {
    sortBy: noteSortBy,
    view: noteView,
    onOpenView: (id: string) => setViewingNoteId(id),
    onEdit: (note: Note) => setEditingNote(note),
    onDelete: handleDelete,
    onDragStart: (id: string) => setDraggedId(id),
    onDragEndAll: () => setDraggedId(null),
    draggedId,
  };

  return (
    <BlockShell
      domId="block-notes"
      icon={BookOpen}
      iconBg="rgba(139,92,246,.12)"
      iconColor="var(--note-color)"
      title="Ghi chú"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'notes' } })}
      style={style}
      className={`main-block ${className ?? ''}`.trim()}
      rootRef={rootRef}
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      modals={
        <>
          {editingNote && (
            <NoteFormModal
              note={editingNote === 'new' ? null : editingNote}
              noteCount={space.notes.length}
              onClose={() => setEditingNote(null)}
            />
          )}
          {viewingNote && (
            <NoteViewModal
              note={viewingNote}
              onClose={() => setViewingNoteId(null)}
              onEdit={() => {
                setViewingNoteId(null);
                setEditingNote(viewingNote);
              }}
            />
          )}
        </>
      }
      headerActions={
        <button className="add-link" onClick={() => setEditingNote('new')}>
          <Plus className="icon" size={13} /> Thêm note
        </button>
      }
    >
      <div className="notes-toolbar">
        <input
          type="text"
          placeholder="Tìm note..."
          value={noteSearch}
          onChange={(e) => dispatch({ type: 'NOTE_SET_SEARCH', payload: { search: e.target.value } })}
        />
        <div className="note-view-toggle" role="group" aria-label="Chế độ hiển thị note">
          <button
            className={noteView === 'grid' ? 'active' : ''}
            title="Lưới tự động (CSS grid)"
            aria-label="Chế độ lưới"
            aria-pressed={noteView === 'grid'}
            onClick={() => dispatch({ type: 'NOTE_SET_VIEW', payload: { view: 'grid' } })}
          >
            <Grid2x2 className="icon" size={14} />
          </button>
          <button
            className={noteView === 'list' ? 'active' : ''}
            title="Danh sách (1 cột)"
            aria-label="Chế độ danh sách"
            aria-pressed={noteView === 'list'}
            onClick={() => dispatch({ type: 'NOTE_SET_VIEW', payload: { view: 'list' } })}
          >
            <Rows2 className="icon" size={14} />
          </button>
        </div>
        <div className="sort-switcher" ref={sortWrapRef}>
          <button className="sort-switcher-btn" onClick={() => setSortMenuOpen((v) => !v)}>
            <span>{SORT_OPTIONS.find((o) => o.value === noteSortBy)?.label}</span>
            <ChevronDown className="icon" size={11} />
          </button>
          {sortMenuOpen && (
            <div className="space-menu" id="sort-menu">
              {SORT_OPTIONS.map((o) => (
                <div
                  key={o.value}
                  className={`space-menu-item ${o.value === noteSortBy ? 'active' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'NOTE_SET_SORT', payload: { sortBy: o.value } });
                    setSortMenuOpen(false);
                  }}
                >
                  <span className="space-name">{o.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="block-body">
        {list.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>
            {space.notes.length === 0 ? 'Chưa có card nào.' : 'Không tìm thấy note phù hợp.'}
          </p>
        ) : noteView === 'list' ? (
          <div className="notes-list">
            {list.map((note) => (
              <NoteCard key={note.id} note={note} {...cardsProps} />
            ))}
          </div>
        ) : (
          <div className="notes-grid">
            {list.map((note) => (
              <NoteCard key={note.id} note={note} {...cardsProps} />
            ))}
          </div>
        )}
      </div>
    </BlockShell>
  );
}
