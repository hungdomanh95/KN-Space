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
      className={`task-row ${task.done ? 'done' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drag-over' : ''}`.trim()}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span
        className="card-grip"
        title="Kéo để đổi thứ tự"
        aria-label="Kéo để đổi thứ tự việc"
        onMouseDown={armDraggable}
      >
        <GripVertical className="icon" size={13} />
      </span>
      <span
        className={`check ${task.done ? 'checked' : ''}`}
        role="checkbox"
        aria-checked={task.done}
        tabIndex={0}
        title={task.done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
        onClick={() => dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: task.id } })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: task.id } });
          }
        }}
      >
        <Check className="icon" size={11} strokeWidth={3} />
      </span>
      <div className="row-main">
        <div className="row-title">
          {task.title}
          {hasContent && (
            <span title="Có nội dung chi tiết" aria-label="Có nội dung chi tiết">
              <FileText className="icon" size={11} />
            </span>
          )}
        </div>
        {meta && (
          <div className="row-meta">
            <span className="meta-tag">{meta}</span>
          </div>
        )}
      </div>
      <div className="row-tools">
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

export function TasksBlock({ style }: TasksBlockProps) {
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
      domId="sub-tasks"
      icon={CheckSquare}
      iconBg="rgba(var(--accent-rgb),.12)"
      iconColor="var(--accent)"
      title="Việc cần làm"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'tasks' } })}
      style={style}
      modals={
        editingTask && (
          <TaskFormModal task={editingTask === 'new' ? null : editingTask} onClose={() => setEditingTask(null)} />
        )
      }
      headerActions={
        <>
          <div className="filter-tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              Tất cả
            </button>
            <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
              Chưa xong
            </button>
            <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
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
