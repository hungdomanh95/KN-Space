import React, { useMemo } from 'react';
import { Bell, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { computeNotifications } from './computeNotifications';

interface NotificationsBlockProps {
  style?: React.CSSProperties;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NotificationsBlock({ style }: NotificationsBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();

  const collapsed = state.settings.collapsedBlocks.reminders;
  const rows = useMemo(() => computeNotifications(space, todayStr()), [space]);
  const newestIdx = rows.findIndex((r) => !r.done);

  function handleToggleSource(source: { type: 'task' | 'habit'; id: string }) {
    if (source.type === 'task') dispatch({ type: 'TASK_TOGGLE_DONE', payload: { id: source.id } });
    if (source.type === 'habit') dispatch({ type: 'HABIT_TOGGLE_TODAY', payload: { id: source.id } });
  }

  return (
    <BlockShell
      domId="block-reminders"
      icon={Bell}
      iconBg="rgba(255,93,122,.12)"
      iconColor="var(--reminder-color)"
      title="Thông báo"
      showGripHandle={false}
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'reminders' } })}
      style={style}
      className="main-block"
    >
      <div className="block-body">
        {rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Chưa có thông báo nào"
            hint="Thông báo sẽ tự tổng hợp từ Việc cần làm, Nhắc việc và Thói quen trong ngày."
          />
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.key}
              className={`reminder-row ${row.done ? 'done' : ''} ${row.isInfo ? 'info' : ''} ${idx === newestIdx ? 'newest-pending' : ''}`}
            >
              <span className="dot" />
              <div className="r-content">
                <span className="r-text">{row.title}</span>
                <span className="r-source">{row.label}</span>
              </div>
              {idx === newestIdx && <span className="new-badge">Mới</span>}
              {row.source && (
                <button className="r-toggle" onClick={() => handleToggleSource(row.source!)}>
                  {row.done ? (
                    <>
                      <Check className="icon" size={11} /> Đã xong
                    </>
                  ) : (
                    'Xong'
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </BlockShell>
  );
}
