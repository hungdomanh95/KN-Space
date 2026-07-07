import React, { useMemo } from 'react';
import { Bell, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { computeNotifications } from './computeNotifications';

interface NotificationsBlockProps {
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NotificationsBlock({
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
}: NotificationsBlockProps) {
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
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'reminders' } })}
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
    >
      <div className="block-body">
        {rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Chưa có thông báo nào"
            hint="Thông báo sẽ tự tổng hợp từ Việc cần làm, Nhắc việc và Thói quen trong ngày."
          />
        ) : (
          rows.map((row, idx) => {
            const isNewest = idx === newestIdx;
            return (
              <div
                key={row.key}
                className={`flex items-start gap-2 border-b border-[color:var(--border)] py-[9px] text-[0.875rem] last:border-b-0
                  ${row.done ? '[&_.r-text]:text-[var(--text-dim)] [&_.r-text]:line-through' : ''}
                  ${
                    isNewest
                      ? 'mx-[-8px] animate-newestPulse rounded-lg border-l-[3px] border-l-[color:var(--accent)] py-[9px] pl-1.5 pr-2'
                      : ''
                  }`}
              >
                <span
                  className={`mt-1.5 h-[7px] w-[7px] flex-none rounded-full bg-[var(--reminder-color)]
                    ${row.done ? 'bg-[var(--done)]' : ''} ${row.isInfo ? 'bg-[var(--recurring-color)]' : ''}
                    ${isNewest ? 'bg-[var(--accent)] shadow-[0_0_6px_rgba(var(--accent-rgb),.7)]' : ''}`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`r-text text-[0.875rem] text-[var(--text)] ${isNewest ? 'font-semibold' : ''}`}>
                    {row.title}
                  </span>
                  <span className="text-[0.7188rem] text-[var(--text-dim)]">{row.label}</span>
                </div>
                {isNewest && (
                  <span className="mt-px flex-none self-start rounded-[10px] bg-[var(--accent)] px-[7px] py-0.5 text-[0.625rem] font-extrabold uppercase tracking-[.03em] text-white shadow-[0_0_10px_rgba(var(--accent-rgb),.55)]">
                    Mới
                  </span>
                )}
                {row.source && (
                  <button
                    className={`inline-flex flex-none items-center gap-1 rounded-[7px] border border-[color:var(--border)]
                      bg-[var(--raised)] px-[9px] py-1 text-[0.7812rem] font-semibold text-[var(--text-dim)]
                      ${row.done ? 'border-[color:var(--done)] bg-[rgba(31,184,116,.08)] text-[var(--done)]' : ''}`}
                    onClick={() => handleToggleSource(row.source!)}
                  >
                    {row.done ? (
                      <>
                        <Check className="icon h-[11px] w-[11px]" size={11} /> Đã xong
                      </>
                    ) : (
                      'Xong'
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </BlockShell>
  );
}
