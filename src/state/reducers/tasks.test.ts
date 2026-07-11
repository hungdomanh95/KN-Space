import { describe, it, expect } from 'vitest';
import { tasksReducer } from './tasks';
import type { Space } from '../../types';

function emptySpace(): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true, expenseTracking: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
    logs: [],
  };
}

describe('tasksReducer — assigneeIds', () => {
  it('TASK_CREATE mặc định assigneeIds rỗng nếu không truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '' },
    });
    expect(next.tasks[0].assigneeIds).toEqual([]);
  });

  it('TASK_CREATE lưu đúng assigneeIds được truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1', 'u2'] },
    });
    expect(next.tasks[0].assigneeIds).toEqual(['u1', 'u2']);
  });

  it('TASK_UPDATE thay thế toàn bộ assigneeIds', () => {
    const created = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1'] },
    });
    const updated = tasksReducer(created, {
      type: 'TASK_UPDATE',
      payload: { id: created.tasks[0].id, title: 'A', content: '', date: '', time: '', assigneeIds: ['u2', 'u3'] },
    });
    expect(updated.tasks[0].assigneeIds).toEqual(['u2', 'u3']);
  });

  it('TASK_CREATE dùng đúng id được truyền vào (không tự sinh id mới)', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', id: 'fixed-id-123' },
    });
    expect(next.tasks[0].id).toBe('fixed-id-123');
  });
});

// =============================================================================
// TASK_REORDER — fractional-index (docs/features/item-level-entity-tables.md mục 5,
// tích hợp Bước 4). Trước đây reducer reindex TOÀN MẢNG `order = 0..n-1` mỗi lần kéo-thả; giờ CHỈ
// tính lại `order` của ĐÚNG task vừa kéo, các task khác giữ NGUYÊN `order` gốc. Bộ test dưới đây
// xác nhận: dù giá trị `order` số học khác hẳn thuật toán cũ (không còn là dãy 0..n-1 liên tục), THỨ
// TỰ HIỂN THỊ (sort theo `order` tăng dần) phải giống hệt kết quả thuật toán cũ.
// =============================================================================
function taskSpaceWithOrders(entries: { id: string; order: number }[]): Space {
  return {
    ...emptySpace(),
    tasks: entries.map(({ id, order }) => ({
      id,
      title: id,
      content: '',
      date: '',
      time: '',
      done: false,
      order,
      assigneeIds: [],
    })),
  };
}

function displayOrderIds(space: Space): string[] {
  return [...space.tasks].sort((a, b) => a.order - b.order).map((t) => t.id);
}

describe('tasksReducer — TASK_REORDER (fractional-index)', () => {
  it('kéo vào GIỮA danh sách — thứ tự hiển thị giống hệt thuật toán reindex cũ (chèn trước targetId)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo A tới trước C -> thuật toán cũ ra B,A,C,D (reindex 0..3).
    const space = taskSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'A', targetId: 'C' } });
    expect(displayOrderIds(next)).toEqual(['B', 'A', 'C', 'D']);
    // order KHÔNG còn là dãy nguyên liên tục 0..3 — chỉ task A đổi, B/C/D giữ nguyên.
    expect(next.tasks.find((t) => t.id === 'A')!.order).toBe(1.5); // giữa order(B)=1 và order(C)=2
    expect(next.tasks.find((t) => t.id === 'B')!.order).toBe(1);
    expect(next.tasks.find((t) => t.id === 'C')!.order).toBe(2);
    expect(next.tasks.find((t) => t.id === 'D')!.order).toBe(3);
  });

  it('kéo lên ĐẦU danh sách (targetId là item đầu tiên) — order mới nhỏ hơn mọi order còn lại', () => {
    // Trước: A,B,C (order 0,1,2). Kéo C lên đầu (target = A) -> thuật toán cũ ra C,A,B.
    const space = taskSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
    ]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'C', targetId: 'A' } });
    expect(displayOrderIds(next)).toEqual(['C', 'A', 'B']);
    expect(next.tasks.find((t) => t.id === 'C')!.order).toBe(-1); // không có láng giềng trước -> order(A) - 1
    expect(next.tasks.find((t) => t.id === 'A')!.order).toBe(0);
    expect(next.tasks.find((t) => t.id === 'B')!.order).toBe(1);
  });

  it('kéo tới ngay TRƯỚC item cuối cùng — thứ tự hiển thị giống thuật toán cũ, chỉ 1 task đổi order', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo A tới trước D (item cuối) -> thuật toán cũ ra B,C,A,D.
    const space = taskSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'A', targetId: 'D' } });
    expect(displayOrderIds(next)).toEqual(['B', 'C', 'A', 'D']);
    expect(next.tasks.find((t) => t.id === 'A')!.order).toBe(2.5); // giữa order(C)=2 và order(D)=3
    expect(next.tasks.find((t) => t.id === 'B')!.order).toBe(1); // không đổi
    expect(next.tasks.find((t) => t.id === 'C')!.order).toBe(2); // không đổi
    expect(next.tasks.find((t) => t.id === 'D')!.order).toBe(3); // không đổi
  });

  it('draggedId === targetId — trả nguyên space, không đổi gì', () => {
    const space = taskSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'A', targetId: 'A' } });
    expect(next).toBe(space);
  });

  it('draggedId không tồn tại — trả nguyên space, không đổi gì', () => {
    const space = taskSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'ghost', targetId: 'B' } });
    expect(next).toBe(space);
  });

  it('targetId không tồn tại — trả nguyên space, không đổi gì', () => {
    const space = taskSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'A', targetId: 'ghost' } });
    expect(next).toBe(space);
  });

  it('kéo-thả lặp lại nhiều lần liên tiếp vào cùng 1 vị trí — vẫn ra đúng thứ tự hiển thị, không NaN/crash', () => {
    let space = taskSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
    ]);
    // Kéo C lên trước B, rồi lại kéo C lên trước A, lặp lại vài lần — mirror thao tác user kéo-thả
    // qua lại nhiều lần trong 1 phiên làm việc.
    for (let i = 0; i < 5; i++) {
      space = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'C', targetId: 'B' } });
      expect(displayOrderIds(space)).toEqual(['A', 'C', 'B']);
      space = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'C', targetId: 'A' } });
      expect(displayOrderIds(space)).toEqual(['C', 'A', 'B']);
    }
    space.tasks.forEach((t) => {
      expect(Number.isFinite(t.order)).toBe(true);
      expect(Number.isNaN(t.order)).toBe(false);
    });
  });

  it('kéo đi rồi kéo NGAY VỀ đúng vị trí cũ — order khôi phục đúng giá trị số học ban đầu (idempotent)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo B ra cuối (trước D) rồi kéo B NGAY VỀ lại vị trí cũ
    // (trước C, láng giềng gốc của nó) — vì 2 láng giềng A(0)/C(2) không hề đổi trong lúc B "đi
    // vắng", công thức trung bình cộng phải cho ra ĐÚNG giá trị order ban đầu của B (1), không phải
    // chỉ giống về THỨ TỰ HIỂN THỊ như các test trên.
    const space = taskSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const moved = tasksReducer(space, { type: 'TASK_REORDER', payload: { draggedId: 'B', targetId: 'D' } });
    expect(displayOrderIds(moved)).toEqual(['A', 'C', 'B', 'D']);
    expect(moved.tasks.find((t) => t.id === 'B')!.order).toBe(2.5); // giữa order(C)=2 và order(D)=3

    const restored = tasksReducer(moved, { type: 'TASK_REORDER', payload: { draggedId: 'B', targetId: 'C' } });
    expect(displayOrderIds(restored)).toEqual(['A', 'B', 'C', 'D']);
    // Khôi phục đúng giá trị số học ban đầu (1), không chỉ đúng vị trí hiển thị.
    expect(restored.tasks.find((t) => t.id === 'B')!.order).toBe(1);
    expect(restored.tasks.find((t) => t.id === 'A')!.order).toBe(0);
    expect(restored.tasks.find((t) => t.id === 'C')!.order).toBe(2);
    expect(restored.tasks.find((t) => t.id === 'D')!.order).toBe(3);
  });
});
