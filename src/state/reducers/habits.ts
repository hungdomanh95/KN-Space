import type { Habit, Space } from '../../types';

/**
 * `HABIT_CREATE.payload.id` (optional) — mirror TASK_CREATE/LOG_CREATE
 * (`reducers/tasks.ts`/`reducers/logs.ts`): cho phép caller (`state/itemPersist.ts` qua
 * `smartDispatch`) tự sinh id TRƯỚC khi gọi reducer, dùng chung đúng id đó cho cả lượt tính
 * descriptor persist item-level lẫn lượt dispatch thật — tránh 2 lần `crypto.randomUUID()` ra 2 id
 * khác nhau cho cùng 1 habit vừa tạo (xem docs/features/item-level-entity-tables.md mục 4.2). Absent
 * = reducer tự sinh như cũ (mọi caller khác, vd test, HabitFormModal).
 */
export type HabitAction =
  | { type: 'HABIT_CREATE'; payload: { title: string; id?: string } }
  | { type: 'HABIT_UPDATE'; payload: { id: string; title: string } }
  | { type: 'HABIT_DELETE'; payload: { id: string } }
  | { type: 'HABIT_TOGGLE_TODAY'; payload: { id: string } };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function habitsReducer(space: Space, action: HabitAction): Space {
  switch (action.type) {
    case 'HABIT_CREATE': {
      const newHabit: Habit = {
        id: action.payload.id ?? crypto.randomUUID(),
        title: action.payload.title.trim() || 'Thói quen chưa đặt tên',
        completedDates: [],
      };
      return { ...space, habits: [...space.habits, newHabit] };
    }
    case 'HABIT_UPDATE':
      return {
        ...space,
        habits: space.habits.map((h) =>
          h.id === action.payload.id
            ? { ...h, title: action.payload.title.trim() || 'Thói quen chưa đặt tên' }
            : h,
        ),
      };
    case 'HABIT_DELETE':
      return { ...space, habits: space.habits.filter((h) => h.id !== action.payload.id) };
    case 'HABIT_TOGGLE_TODAY': {
      const today = todayStr();
      return {
        ...space,
        habits: space.habits.map((h) => {
          if (h.id !== action.payload.id) return h;
          const isDone = h.completedDates.includes(today);
          return {
            ...h,
            completedDates: isDone
              ? h.completedDates.filter((d) => d !== today)
              : [...h.completedDates, today],
          };
        }),
      };
    }
    default:
      return space;
  }
}
