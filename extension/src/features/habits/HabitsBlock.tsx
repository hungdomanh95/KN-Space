import React, { useState } from 'react';
import { Flame, Pencil, Plus, Trash2, Check } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { HabitFormModal } from './HabitFormModal';
import { computeStreak, dateOffset, DAY_LABELS, isHabitDoneToday } from './habitUtils';
import type { Habit } from '../../types';

interface HabitsBlockProps {
  style?: React.CSSProperties;
}

export function HabitsBlock({ style }: HabitsBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const [editingHabit, setEditingHabit] = useState<Habit | null | 'new'>(null);

  const collapsed = state.settings.collapsedBlocks.habits;

  function handleDelete(habit: Habit) {
    showConfirm('Xoá thói quen?', 'Xoá thói quen này? Hành động không thể hoàn tác.', () =>
      dispatch({ type: 'HABIT_DELETE', payload: { id: habit.id } }),
    );
  }

  return (
    <BlockShell
      domId="sub-habits"
      icon={Flame}
      iconBg="rgba(255,138,61,.14)"
      iconColor="var(--habit-color)"
      title="Thói quen"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'habits' } })}
      style={style}
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
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>Chưa có thói quen nào.</p>
        ) : (
          space.habits.map((habit) => {
            const streak = computeStreak(habit);
            const week = [6, 5, 4, 3, 2, 1, 0].map((n) => habit.completedDates.includes(dateOffset(n)));
            const todayIdx = week.length - 1;
            const doneToday = isHabitDoneToday(habit);
            return (
              <div key={habit.id} className="habit-row">
                <div className={`habit-top ${doneToday ? 'done' : ''}`}>
                  <span
                    className="habit-left"
                    role="checkbox"
                    aria-checked={doneToday}
                    tabIndex={0}
                    title={doneToday ? 'Đánh dấu chưa hoàn thành hôm nay' : 'Đánh dấu đã hoàn thành hôm nay'}
                    onClick={() => dispatch({ type: 'HABIT_TOGGLE_TODAY', payload: { id: habit.id } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        dispatch({ type: 'HABIT_TOGGLE_TODAY', payload: { id: habit.id } });
                      }
                    }}
                  >
                    <span className={`check ${doneToday ? 'checked' : ''}`}>
                      <Check className="icon" size={11} strokeWidth={3} />
                    </span>
                    <span className="habit-title">{habit.title}</span>
                  </span>
                  <span className="habit-right">
                    <span className="streak-pill">
                      <Flame className="icon" size={12} /> {streak} ngày liên tiếp
                    </span>
                    <span className="row-tools">
                      <button className="icon-btn" title="Sửa thói quen" aria-label="Sửa thói quen" onClick={() => setEditingHabit(habit)}>
                        <Pencil className="icon" size={13} />
                      </button>
                      <button className="icon-btn" title="Xoá thói quen" aria-label="Xoá thói quen" onClick={() => handleDelete(habit)}>
                        <Trash2 className="icon" size={13} />
                      </button>
                    </span>
                  </span>
                </div>
                <div className="week-track">
                  {week.map((done, i) => (
                    <span
                      key={i}
                      className={`week-dot ${done ? 'filled' : ''} ${i === todayIdx ? 'today' : ''}`}
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
