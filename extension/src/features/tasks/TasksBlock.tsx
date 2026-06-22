import React, { useState } from 'react';
import { CheckSquare, Pencil, Plus, Trash2, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { TaskFormModal } from './TaskFormModal';
import type { Task, TaskFilter } from '../../types';

interface TasksBlockProps {
  style?: React.CSSProperties;
}

export function TasksBlock({ style }: TasksBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingTask, setEditingTask] = useState<Task | null | 'new'>(null);

  const collapsed = state.settings.collapsedBlocks.tasks;
  const filter = state.ui.taskFilter;

  let list = space.tasks;
  if (filter === 'pending') list = list.filter((t) => !t.done);
  if (filter === 'done') list = list.filter((t) => t.done);

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
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>Không có việc nào.</p>
        ) : (
          list.map((task) => {
            const meta = task.date ? `${task.date.slice(5)} ${task.time || ''}`.trim() : '';
            return (
              <div key={task.id} className={`task-row ${task.done ? 'done' : ''}`}>
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
                  <div className="row-title">{task.title}</div>
                  {meta && (
                    <div className="row-meta">
                      <span className="meta-tag">{meta}</span>
                    </div>
                  )}
                </div>
                <div className="row-tools">
                  <button className="icon-btn" title="Sửa việc" aria-label="Sửa việc" onClick={() => setEditingTask(task)}>
                    <Pencil className="icon" size={13} />
                  </button>
                  <button className="icon-btn" title="Xoá việc" aria-label="Xoá việc" onClick={() => handleDelete(task)}>
                    <Trash2 className="icon" size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </BlockShell>
  );
}
