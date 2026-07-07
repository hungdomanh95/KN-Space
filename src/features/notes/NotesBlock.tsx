import React, { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BookOpen, ChevronDown, EyeOff, Grid2x2, Plus, Rows2 } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { useCurrentUserId } from '../../state/useCurrentUserId';
import { useSpaceMembers } from '../../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';
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
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const [editingNote, setEditingNote] = useState<Note | null | 'new'>(null);
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const collapsed = state.settings.collapsedBlocks.notes;
  const { noteView } = state.settings;
  const { noteSearch, noteSortBy } = state.ui;

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

  function getNoteCreatorInfo(note: Note): { name: string; color: string } | undefined {
    if (!space.isShared || !note.createdBy || note.createdBy === currentUserId) return undefined;
    return {
      name: getMemberDisplayName(note.createdBy, members),
      color: getMemberColor(note.createdBy, members),
    };
  }

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
      className={`main-block max-sm:min-w-0 ${className ?? ''}`.trim()}
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
      <div className="notes-toolbar flex flex-none flex-wrap gap-2 border-b border-[color:var(--border)] px-4 py-2.5 max-sm:px-2.5 max-sm:py-2">
        <input
          type="text"
          placeholder="Tìm note..."
          value={noteSearch}
          onChange={(e) => dispatch({ type: 'NOTE_SET_SEARCH', payload: { search: e.target.value } })}
          className="min-w-[120px] flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--raised)] px-2.5
            py-1.5 text-[0.7812rem] text-[var(--text)] transition-[border-color] duration-150
            hover:border-[color:var(--accent)] focus:border-[color:var(--accent)] focus:outline-none"
        />
        <div className="flex flex-none gap-0.5 rounded-lg bg-[var(--bg)] p-[3px]" role="group" aria-label="Chế độ hiển thị note">
          <button
            className={`flex h-[26px] w-7 items-center justify-center rounded-md text-[var(--text-dim)] transition-[background,color] duration-150 hover:text-[var(--text)] ${
              noteView === 'grid' ? 'bg-[var(--raised)] text-[var(--accent)] shadow-[0_1px_3px_rgba(0,0,0,.08)]' : 'bg-transparent'
            }`}
            title="Lưới tự động (CSS grid)"
            aria-label="Chế độ lưới"
            aria-pressed={noteView === 'grid'}
            onClick={() => dispatch({ type: 'NOTE_SET_VIEW', payload: { view: 'grid' } })}
          >
            <Grid2x2 className="icon h-3.5 w-3.5" size={14} />
          </button>
          <button
            className={`flex h-[26px] w-7 items-center justify-center rounded-md text-[var(--text-dim)] transition-[background,color] duration-150 hover:text-[var(--text)] ${
              noteView === 'list' ? 'bg-[var(--raised)] text-[var(--accent)] shadow-[0_1px_3px_rgba(0,0,0,.08)]' : 'bg-transparent'
            }`}
            title="Danh sách (1 cột)"
            aria-label="Chế độ danh sách"
            aria-pressed={noteView === 'list'}
            onClick={() => dispatch({ type: 'NOTE_SET_VIEW', payload: { view: 'list' } })}
          >
            <Rows2 className="icon h-3.5 w-3.5" size={14} />
          </button>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--raised)]
                px-2.5 py-1.5 text-[0.7812rem] font-semibold text-[var(--text)] transition-[border-color,color] duration-150
                hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
            >
              <span>{SORT_OPTIONS.find((o) => o.value === noteSortBy)?.label}</span>
              <ChevronDown className="icon h-[11px] w-[11px] text-[var(--text-dim)]" size={11} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="space-menu-surface" style={{ minWidth: 190 }}>
              <DropdownMenu.RadioGroup
                value={noteSortBy}
                onValueChange={(v) => dispatch({ type: 'NOTE_SET_SORT', payload: { sortBy: v as NoteSortBy } })}
              >
                {SORT_OPTIONS.map((o) => (
                  <DropdownMenu.RadioItem
                    key={o.value}
                    value={o.value}
                    className="space-menu-item data-[state=checked]:font-bold data-[state=checked]:text-[var(--accent)]"
                  >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{o.label}</span>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="block-body">
        {list.length === 0 ? (
          space.notes.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Chưa có note nào"
              hint='Bấm "+ Thêm note" để ghi lại ý tưởng, mật khẩu hay danh sách cần nhớ.'
            />
          ) : (
            <EmptyState
              icon={EyeOff}
              title="Không tìm thấy note phù hợp"
              hint="Thử đổi từ khoá tìm kiếm hoặc xoá bộ lọc hiện tại."
            />
          )
        ) : noteView === 'list' ? (
          <div className="notes-list">
            {list.map((note) => (
              <NoteCard key={note.id} note={note} {...cardsProps} creatorInfo={getNoteCreatorInfo(note)} />
            ))}
          </div>
        ) : (
          <div className="notes-grid">
            {list.map((note) => (
              <NoteCard key={note.id} note={note} {...cardsProps} creatorInfo={getNoteCreatorInfo(note)} />
            ))}
          </div>
        )}
      </div>
    </BlockShell>
  );
}
