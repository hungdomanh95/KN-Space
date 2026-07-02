import type { Space, Task } from '../../types';

/** Actions tác động lên dữ liệu Task trong 1 Space. TASK_SET_FILTER là UI-only, xử lý ở appReducer. */
export type TaskAction =
  | { type: 'TASK_CREATE'; payload: { title: string; content: string; date: string; time: string; createdBy?: string } }
  | { type: 'TASK_UPDATE'; payload: { id: string; title: string; content: string; date: string; time: string } }
  | { type: 'TASK_DELETE'; payload: { id: string } }
  | { type: 'TASK_TOGGLE_DONE'; payload: { id: string } }
  | { type: 'TASK_REORDER'; payload: { draggedId: string; targetId: string } };

export function tasksReducer(space: Space, action: TaskAction): Space {
  switch (action.type) {
    case 'TASK_CREATE': {
      // `order` nhỏ hơn mọi task hiện có (không phải lớn hơn) — sortTasksForDisplay sort tăng
      // dần theo order, nên việc mới luôn nổi lên ĐẦU danh sách (chưa-xong) ngay khi tạo, đúng
      // yêu cầu thực tế: vừa thêm là thấy ngay, không phải cuộn xuống cuối mới thấy.
      const minOrder = space.tasks.reduce((min, t) => Math.min(min, t.order), 0);
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: action.payload.title.trim() || 'Việc chưa đặt tên',
        content: action.payload.content,
        date: action.payload.date,
        time: action.payload.time,
        done: false,
        order: minOrder - 1,
        createdAt: new Date().toISOString(),
        ...(action.payload.createdBy ? { createdBy: action.payload.createdBy } : {}),
      };
      return { ...space, tasks: [...space.tasks, newTask] };
    }
    case 'TASK_UPDATE': {
      return {
        ...space,
        tasks: space.tasks.map((t) =>
          t.id === action.payload.id
            ? {
                ...t,
                title: action.payload.title.trim() || 'Việc chưa đặt tên',
                content: action.payload.content,
                date: action.payload.date,
                time: action.payload.time,
              }
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
    case 'TASK_REORDER': {
      const { draggedId, targetId } = action.payload;
      if (draggedId === targetId) return space;
      // Cùng pattern NOTE_REORDER: sort theo order hiện tại -> mảng tuyến tính -> re-assign 0..n-1.
      // Luôn chèn TRƯỚC targetId (đơn giản hơn bản note có insertAfter — danh sách task chỉ 1 cột,
      // không cần phân biệt nửa trên/nửa dưới của row).
      const ordered = [...space.tasks].sort((a, b) => a.order - b.order);
      const fromIdx = ordered.findIndex((t) => t.id === draggedId);
      if (fromIdx === -1) return space;
      const [moved] = ordered.splice(fromIdx, 1);
      const toIdx = ordered.findIndex((t) => t.id === targetId);
      if (toIdx === -1) return space;
      ordered.splice(toIdx, 0, moved);
      const reindexed = ordered.map((t, idx) => ({ ...t, order: idx }));
      return { ...space, tasks: reindexed };
    }
    default:
      return space;
  }
}
