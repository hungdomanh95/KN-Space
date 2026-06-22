import React, { useState } from 'react';
import { Bell, Pencil, Pin, Plus, Repeat, Trash2 } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { ReminderFormModal } from './ReminderFormModal';
import { freqText } from './reminderUtils';
import type { ReminderDefinition } from '../../types';

interface RemindersBlockProps {
  style?: React.CSSProperties;
}

export function RemindersBlock({ style }: RemindersBlockProps) {
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
      domId="sub-reminder"
      icon={Bell}
      iconBg="rgba(20,184,166,.12)"
      iconColor="var(--recurring-color)"
      title="Nhắc việc"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'reminder' } })}
      style={style}
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
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>Chưa có nhắc việc nào.</p>
        ) : (
          space.reminders.map((r) => (
            <div key={r.id} className="reminder-item-row">
              <div className="row-main">
                <div className="row-title">{r.title}</div>
                <div className="row-meta">
                  {r.type === 'once' ? (
                    <>
                      <span className="meta-tag tag-once">
                        <Pin className="icon" size={10} /> 1 lần
                      </span>
                      <span className="meta-tag">
                        {(r.date || '').slice(5)} {r.time || ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="meta-tag tag-recurring">
                        <Repeat className="icon" size={10} /> {freqText(r)}
                      </span>
                      {r.time && <span className="meta-tag">lúc {r.time}</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="row-tools">
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
