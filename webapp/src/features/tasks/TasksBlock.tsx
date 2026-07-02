import React, { useRef, useState } from 'react';
import { CheckSquare, FileText, GripVertical, Pencil, Plus, Trash2, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { TaskFormModal } from './TaskFormModal';
import type { Task, TaskFilter } from '../../types';

interface TasksBlockProps {
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

/**
 * Sắp xếp hiển thị theo filter:
 * - 'all': tách 2 nhóm (chưa-xong / đã-xong), mỗi nhóm sort theo `order` riêng, rồi nối
 *   chưa-xong trước + đã-xong sau. KHÔNG đổi field `order` lưu trữ khi tick done — chỉ
 *   ảnh hưởng thứ tự hiển thị (xem TASK_TOGGLE_DONE trong tasks.ts, không đụng order).
 * - 'pending'/'done': đã là 1 nhóm đồng nhất, sort thẳng theo `order`.
 */
function sortTasksForDisplay(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === 'pending') return tasks.filter((t) => !t.done).sort((a, b) => a.order - b.order);
  if (filter === 'done') return tasks.filter((t) => t.done).sort((a, b) => a.order - b.order);
  const pending = tasks.filter((t) => !t.done).sort((a, b) => a.order - b.order);
  const done = tasks.filter((t) => t.done).sort((a, b) => a.order - b.order);
  return [...pending, ...done];
}

interface TaskRowProps {
  task: Task;
  draggedId: string | null;
  onDragStartId: (id: string) => void;
  onDragEndAll: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** 1 dòng task — kéo-thả qua icon grip, cùng kỹ thuật armDraggable/imperative ref như NoteCard. */
function TaskRow({ task, draggedId, onDragStartId, onDragEndAll, onEdit, onDelete }: TaskRowProps) {
  const { dispatch } = useAppState();
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const isDragging = draggedId === task.id;
  const isDropTarget = dragOver && draggedId !== null && draggedId !== task.id;
  const meta = task.date ? `${task.date.slice(5)} ${task.time || ''}`.trim() : '';
  const hasContent = task.content.trim().length > 0;

  function armDraggable() {
    if (rowRef.current) rowRef.current.draggable = true;
  }

  function handleDragStart(e: React.DragEvent) {
    onDragStartId(task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    if (rowRef.current) rowRef.current.draggable = false;
    setDragOver(false);
    onDragEndAll();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (draggedId && draggedId !== task.id) setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!draggedId || draggedId === task.id) return;
    dispatch({ type: 'TASK_REORDER', payload: { draggedId, targetId: task.id } });
  }

  return (
    <div
      ref={rowRef}
      className={`group flex items-start gap-2.5 border-b border-[color:var(--border)] py-[9px] text-[0.875rem]
        transition-opacity duration-150 [transition-timing-function:var(--ease-standard)] last:border-b-0
        ${task.done ? '[&_.row-title]:text-[var(--text-dim)] [&_.row-title]:line-through' : ''}
        ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'shadow-[inset_0_2px_0_0_var(--accent)]' : ''}`.trim()}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span
        className="flex h-6 w-6 flex-none cursor-grab items-center justify-center text-[var(--text-dim)] active:cursor-grabbing"
        title="Kéo để đổi thứ tự"
        aria-label="Kéo để đổi thứ tự việc"
        onMouseDown={armDraggable}
      >
        <GripVertical className="icon h-[13px] w-[13px]" size={13} />
      </span>
      <span
        className={`mt-px flex h-[17px] w-[17px] flex-none cursor-pointer items-center justify-center rounded-[6px]
          border-[1.6px] transition-all duration-150
          [&_.icon]:opacity-0 [&_.icon]:transition-opacity [&_.icon]:duration-100
          max-md:h-[26px] max-md:w-[26px] max-md:rounded-[8px]
          ${task.done ? '[&_.icon]:opacity-100' : ''}`}
        style={task.done
          ? { background: 'var(--done)', borderColor: 'var(--done)' }
          : { background: 'var(--raised)', borderColor: 'var(--border-control)' }}
        role="checkbox"
        aria-checked={task.done}
        tabIndex={0}
        title={task.done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
        onTouchEnd={(e) => { e.preventDefault(); dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: task.id } }); }}
        onClick={() => dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: task.id } })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: task.id } });
          }
        }}
      >
        <Check className="icon text-white max-md:!h-[15px] max-md:!w-[15px]" size={11} strokeWidth={3} />
      </span>
      <div className="flex-1">
        <div className="row-title font-medium">
          {task.title}
          {hasContent && (
            <span title="Có nội dung chi tiết" aria-label="Có nội dung chi tiết">
              <FileText className="icon" size={11} />
            </span>
          )}
        </div>
        {meta && (
          <div className="mt-1 flex gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--raised)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--text-dim)]">
              {meta}
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button className="icon-btn" title="Sửa việc" aria-label="Sửa việc" onClick={() => onEdit(task)}>
          <Pencil className="icon" size={13} />
        </button>
        <button className="icon-btn" title="Xoá việc" aria-label="Xoá việc" onClick={() => onDelete(task)}>
          <Trash2 className="icon" size={13} />
        </button>
      </div>
    </div>
  );
}

export function TasksBlock({
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
}: TasksBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingTask, setEditingTask] = useState<Task | null | 'new'>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const collapsed = state.settings.collapsedBlocks.tasks;
  const filter = state.ui.taskFilter;

  const list = sortTasksForDisplay(space.tasks, filter);

  function setFilter(f: TaskFilter) {
    dispatch({ type: 'TASK_SET_FILTER', payload: { filter: f } });
  }

  function handleDelete(task: Task) {
    showConfirm('Xoá việc?', 'Xoá việc này khỏi danh sách? Hành động không thể hoàn tác.', () =>
      dispatch({ type: 'TASK_DELETE', payload: { id: task.id } }),
    );
  }

  return (
    <BlockShell
      domId="block-tasks"
      icon={CheckSquare}
      iconBg="rgba(var(--accent-rgb),.12)"
      iconColor="var(--accent)"
      title="Việc cần làm"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'tasks' } })}
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
        editingTask && (
          <TaskFormModal task={editingTask === 'new' ? null : editingTask} onClose={() => setEditingTask(null)} />
        )
      }
      headerActions={
        <>
          <div className="flex gap-[3px] rounded-lg bg-[var(--bg)] p-[3px]">
            <button
              className={`rounded-md px-[9px] py-1 text-[0.7812rem] font-semibold text-[var(--text-dim)] ${
                filter === 'all' ? 'bg-[rgba(var(--accent-rgb),.12)] text-[var(--accent)]' : 'bg-transparent'
              }`}
              onClick={() => setFilter('all')}
            >
              Tất cả
            </button>
            <button
              className={`rounded-md px-[9px] py-1 text-[0.7812rem] font-semibold text-[var(--text-dim)] ${
                filter === 'pending' ? 'bg-[rgba(var(--accent-rgb),.12)] text-[var(--accent)]' : 'bg-transparent'
              }`}
              onClick={() => setFilter('pending')}
            >
              Chưa xong
            </button>
            <button
              className={`rounded-md px-[9px] py-1 text-[0.7812rem] font-semibold text-[var(--text-dim)] ${
                filter === 'done' ? 'bg-[rgba(var(--accent-rgb),.12)] text-[var(--accent)]' : 'bg-transparent'
              }`}
              onClick={() => setFilter('done')}
            >
              Đã xong
            </button>
          </div>
          <button className="add-link" onClick={() => setEditingTask('new')}>
            <Plus className="icon" size={13} /> Thêm
          </button>
        </>
      }
    >
      <div className="block-body">
        {list.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="Chưa có việc cần làm"
            hint='Bấm "+ Thêm" ở góc trên để tạo việc đầu tiên.'
          />
        ) : (
          list.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              draggedId={draggedId}
              onDragStartId={setDraggedId}
              onDragEndAll={() => setDraggedId(null)}
              onEdit={setEditingTask}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </BlockShell>
  );
}
