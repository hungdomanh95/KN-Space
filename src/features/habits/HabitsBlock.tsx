import React, { useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Flame, Pencil, Plus, Trash2, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { HabitFormModal } from './HabitFormModal';
import { computeStreak, dateOffset, DAY_LABELS, isHabitDoneToday } from './habitUtils';
import type { Habit } from '../../types';

interface HabitsBlockProps {
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

export function HabitsBlock({
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
}: HabitsBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingHabit, setEditingHabit] = useState<Habit | null | 'new'>(null);

  const collapsed = state.settings.collapsedBlocks.habits;

  // Habits không có ý nghĩa trong shared space (không thể track streak cá nhân
  // khi nhiều người cùng sử dụng một space). Ẩn hoàn toàn, không render.
  if (space.isShared) return null;

  function handleDelete(habit: Habit) {
    showConfirm('Xoá thói quen?', 'Xoá thói quen này? Hành động không thể hoàn tác.', () =>
      dispatch({ type: 'HABIT_DELETE', payload: { id: habit.id } }),
    );
  }

  return (
    <BlockShell
      domId="block-habits"
      className={`main-block max-sm:min-w-0 ${className ?? ''}`.trim()}
      icon={Flame}
      iconBg="rgba(255,138,61,.14)"
      iconColor="var(--habit-color)"
      title="Thói quen"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'habits' } })}
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
        editingHabit && (
          <HabitFormModal habit={editingHabit === 'new' ? null : editingHabit} onClose={() => setEditingHabit(null)} />
        )
      }
      headerActions={
        <button className="add-link" onClick={() => setEditingHabit('new')}>
          <Plus className="icon" size={13} /> Thêm
        </button>
      }
    >
      <div className="block-body">
        {space.habits.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="Chưa có thói quen"
            hint="Thêm thói quen muốn duy trì để theo dõi streak hàng ngày."
          />
        ) : (
          space.habits.map((habit) => {
            const streak = computeStreak(habit);
            const week = [6, 5, 4, 3, 2, 1, 0].map((n) => habit.completedDates.includes(dateOffset(n)));
            const todayIdx = week.length - 1;
            const doneToday = isHabitDoneToday(habit);
            return (
              <div
                key={habit.id}
                className="group flex flex-col gap-[9px] border-b border-[color:var(--border)] py-3 last:border-b-0"
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-[0.875rem] ${
                    doneToday ? '[&_.habit-title]:text-[var(--done)]' : ''
                  }`}
                >
                  <Checkbox.Root
                    checked={doneToday}
                    onCheckedChange={() => dispatch({ type: 'HABIT_TOGGLE_TODAY', payload: { id: habit.id } })}
                    className="flex min-w-0 flex-[1_1_120px] cursor-pointer items-center gap-[9px]"
                    title={doneToday ? 'Đánh dấu chưa hoàn thành hôm nay' : 'Đánh dấu đã hoàn thành hôm nay'}
                  >
                    <span
                      className={`mt-px flex h-[17px] w-[17px] flex-none items-center justify-center
                        rounded-[6px] border-[1.6px] transition-all duration-150 ${
                          doneToday
                            ? 'bg-[var(--done)] border-[color:var(--done)]'
                            : 'bg-[var(--raised)] border-[color:var(--border-control)]'
                        }`}
                    >
                      <Checkbox.Indicator>
                        <Check className="icon h-[11px] w-[11px] text-white" size={11} strokeWidth={3} />
                      </Checkbox.Indicator>
                    </span>
                    <span className="habit-title overflow-hidden text-ellipsis whitespace-nowrap">{habit.title}</span>
                  </Checkbox.Root>
                  <span className="flex flex-none items-center gap-1.5">
                    <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[20px] bg-[rgba(255,138,61,.12)] px-[9px] py-1 text-[0.7812rem] font-bold text-[var(--habit-color)]">
                      <Flame className="icon h-3 w-3" size={12} /> {streak} ngày liên tiếp
                    </span>
                    <span className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <button className="icon-btn" title="Sửa thói quen" aria-label="Sửa thói quen" onClick={() => setEditingHabit(habit)}>
                        <Pencil className="icon" size={13} />
                      </button>
                      <button className="icon-btn" title="Xoá thói quen" aria-label="Xoá thói quen" onClick={() => handleDelete(habit)}>
                        <Trash2 className="icon" size={13} />
                      </button>
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-[7px]">
                  {week.map((done, i) => (
                    <span
                      key={i}
                      className={`h-[13px] w-[13px] flex-[0_0_13px] cursor-default rounded-full border-[1.5px] ${
                        i === todayIdx ? 'shadow-[0_0_0_3px_rgba(255,138,61,.25)]' : ''
                      }`}
                      style={done
                        ? { background: 'var(--habit-color)', borderColor: 'var(--habit-color)' }
                        : { background: 'var(--raised)', borderColor: 'var(--border-control)' }}
                      title={`${DAY_LABELS[i]}${i === todayIdx ? ' (hôm nay)' : ''}: ${done ? 'đã hoàn thành' : 'chưa hoàn thành'}`}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </BlockShell>
  );
}
