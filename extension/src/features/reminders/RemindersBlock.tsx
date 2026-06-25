import React, { useState } from 'react';
import { Bell, Pencil, Pin, Plus, Repeat, Trash2 } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { ReminderFormModal } from './ReminderFormModal';
import { freqText } from './reminderUtils';
import type { ReminderDefinition } from '../../types';

interface RemindersBlockProps {
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

export function RemindersBlock({
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
}: RemindersBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingReminder, setEditingReminder] = useState<ReminderDefinition | null | 'new'>(null);

  const collapsed = state.settings.collapsedBlocks.reminder;

  function handleDelete(reminder: ReminderDefinition) {
    showConfirm('Xoá nhắc việc?', 'Xoá nhắc việc này? Hành động không thể hoàn tác.', () =>
      dispatch({ type: 'REMINDER_DELETE', payload: { id: reminder.id } }),
    );
  }

  return (
    <BlockShell
      domId="block-reminder"
      className={`main-block max-sm:min-w-0 ${className ?? ''}`.trim()}
      icon={Bell}
      iconBg="rgba(20,184,166,.12)"
      iconColor="var(--recurring-color)"
      title="Nhắc việc"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'reminder' } })}
      style={style}
      rootRef={rootRef}
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      modals={
        editingReminder && (
          <ReminderFormModal
            reminder={editingReminder === 'new' ? null : editingReminder}
            onClose={() => setEditingReminder(null)}
          />
        )
      }
      headerActions={
        <button className="add-link" onClick={() => setEditingReminder('new')}>
          <Plus className="icon" size={13} /> Thêm
        </button>
      }
    >
      <div className="block-body">
        {space.reminders.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Chưa có nhắc việc"
            hint="Tạo nhắc việc 1 lần hoặc lặp lại để không bỏ sót việc quan trọng."
          />
        ) : (
          space.reminders.map((r) => (
            <div
              key={r.id}
              className="group flex items-center gap-2.5 border-b border-[color:var(--border)] py-2.5 text-[0.875rem] last:border-b-0"
            >
              <div className="flex-1">
                <div className="font-medium">{r.title}</div>
                <div className="mt-1 flex gap-1.5">
                  {r.type === 'once' ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(var(--accent-rgb),.1)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--accent)]">
                        <Pin className="icon h-2.5 w-2.5" size={10} /> 1 lần
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--raised)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--text-dim)]">
                        {(r.date || '').slice(5)} {r.time || ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(20,184,166,.12)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--recurring-color)]">
                        <Repeat className="icon h-2.5 w-2.5" size={10} /> {freqText(r)}
                      </span>
                      {r.time && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--raised)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--text-dim)]">
                          lúc {r.time}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <button className="icon-btn" title="Sửa nhắc việc" aria-label="Sửa nhắc việc" onClick={() => setEditingReminder(r)}>
                  <Pencil className="icon" size={13} />
                </button>
                <button className="icon-btn" title="Xoá nhắc việc" aria-label="Xoá nhắc việc" onClick={() => handleDelete(r)}>
                  <Trash2 className="icon" size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </BlockShell>
  );
}
