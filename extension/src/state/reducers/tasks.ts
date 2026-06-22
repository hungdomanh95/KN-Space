import type { Space, Task } from '../../types';

/** Actions tác động lên dữ liệu Task trong 1 Space. TASK_SET_FILTER là UI-only, xử lý ở appReducer. */
export type TaskAction =
  | { type: 'TASK_CREATE'; payload: { title: string; date: string; time: string } }
  | { type: 'TASK_UPDATE'; payload: { id: string; title: string; date: string; time: string } }
  | { type: 'TASK_DELETE'; payload: { id: string } }
  | { type: 'TASK_TOGGLE_DONE'; payload: { id: string } };

export function tasksReducer(space: Space, action: TaskAction): Space {
  switch (action.type) {
    case 'TASK_CREATE': {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: action.payload.title.trim() || 'Việc chưa đặt tên',
        date: action.payload.date,
        time: action.payload.time,
        done: false,
      };
      return { ...space, tasks: [...space.tasks, newTask] };
    }
    case 'TASK_UPDATE': {
      return {
        ...space,
        tasks: space.tasks.map((t) =>
          t.id === action.payload.id
            ? { ...t, title: action.payload.title.trim() || 'Việc chưa đặt tên', date: action.payload.date, time: action.payload.time }
            : t,
        ),
      };
    }
    case 'TASK_DELETE':
      return { ...space, tasks: space.tasks.filter((t) => t.id !== action.payload.id) };
    case 'TASK_TOGGLE_DONE':
      return {
        ...space,
        tasks: space.tasks.map((t) => (t.id === action.payload.id ? { ...t, done: !t.done } : t)),
      };
    default:
      return space;
  }
}
