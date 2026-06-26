import type { Habit, Space } from '../../types';

export type HabitAction =
  | { type: 'HABIT_CREATE'; payload: { title: string } }
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
        id: crypto.randomUUID(),
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
