import { describe, it, expect } from 'vitest';
import { notesReducer } from './notes';
import type { Note, Space } from '../../types';

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

describe('notesReducer — NOTE_CREATE', () => {
  it('dùng đúng id được truyền vào (không tự sinh id mới)', () => {
    const next = notesReducer(emptySpace(), {
      type: 'NOTE_CREATE',
      payload: { title: 'A', content: '', color: '#8b5cf6', id: 'fixed-id-123' },
    });
    expect(next.notes[0].id).toBe('fixed-id-123');
  });

  it('không truyền id -> tự sinh UUID mới', () => {
    const next = notesReducer(emptySpace(), {
      type: 'NOTE_CREATE',
      payload: { title: 'A', content: '', color: '#8b5cf6' },
    });
    expect(next.notes[0].id).toBeTruthy();
    expect(typeof next.notes[0].id).toBe('string');
  });
});

// =============================================================================
// NOTE_REORDER — fractional-index (docs/features/item-level-entity-tables.md mục 5, tích hợp Bước
// 5, mirror TASK_REORDER — Bước 4). Trước đây reducer reindex TOÀN MẢNG `order = 0..n-1` mỗi lần
// kéo-thả; giờ CHỈ tính lại `order` của ĐÚNG note vừa kéo, các note khác giữ NGUYÊN `order` gốc.
// KHÁC Task: Note phân biệt nửa trên/dưới của item đích (`insertAfter`) — bộ test dưới đây phủ cả 2
// biến thể `insertAfter=false` (chèn TRƯỚC targetId, mặc định) và `insertAfter=true` (chèn NGAY SAU
// targetId).
// =============================================================================
function noteSpaceWithOrders(entries: { id: string; order: number }[]): Space {
  return {
    ...emptySpace(),
    notes: entries.map(({ id, order }): Note => ({
      id,
      title: id,
      content: '',
      color: '#8b5cf6',
      updatedAt: 1000,
      order,
      hidden: false,
    })),
  };
}

function displayOrderIds(space: Space): string[] {
  return [...space.notes].sort((a, b) => a.order - b.order).map((n) => n.id);
}

describe('notesReducer — NOTE_REORDER (fractional-index)', () => {
  it('insertAfter=false — kéo vào GIỮA danh sách, chèn TRƯỚC targetId (giống thuật toán reindex cũ)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo A tới trước C -> thuật toán cũ ra B,A,C,D.
    const space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'A', targetId: 'C', insertAfter: false },
    });
    expect(displayOrderIds(next)).toEqual(['B', 'A', 'C', 'D']);
    // order KHÔNG còn là dãy nguyên liên tục 0..3 — chỉ note A đổi, B/C/D giữ nguyên.
    expect(next.notes.find((n) => n.id === 'A')!.order).toBe(1.5); // giữa order(B)=1 và order(C)=2
    expect(next.notes.find((n) => n.id === 'B')!.order).toBe(1);
    expect(next.notes.find((n) => n.id === 'C')!.order).toBe(2);
    expect(next.notes.find((n) => n.id === 'D')!.order).toBe(3);
  });

  it('insertAfter=true — kéo vào NGAY SAU targetId (khác vị trí so với insertAfter=false)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo D tới NGAY SAU A -> kỳ vọng A,D,B,C.
    const space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'D', targetId: 'A', insertAfter: true },
    });
    expect(displayOrderIds(next)).toEqual(['A', 'D', 'B', 'C']);
    expect(next.notes.find((n) => n.id === 'D')!.order).toBe(0.5); // giữa order(A)=0 và order(B)=1
    expect(next.notes.find((n) => n.id === 'A')!.order).toBe(0);
    expect(next.notes.find((n) => n.id === 'B')!.order).toBe(1);
    expect(next.notes.find((n) => n.id === 'C')!.order).toBe(2);
  });

  it('insertAfter=false — kéo lên ĐẦU danh sách (targetId là item đầu tiên)', () => {
    // Trước: A,B,C (order 0,1,2). Kéo C lên đầu (target = A) -> thuật toán cũ ra C,A,B.
    const space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
    ]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'C', targetId: 'A', insertAfter: false },
    });
    expect(displayOrderIds(next)).toEqual(['C', 'A', 'B']);
    expect(next.notes.find((n) => n.id === 'C')!.order).toBe(-1); // không có láng giềng trước -> order(A) - 1
  });

  it('insertAfter=true — kéo tới CUỐI danh sách (targetId là item cuối cùng)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo A tới NGAY SAU D (item cuối) -> kỳ vọng B,C,D,A.
    const space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'A', targetId: 'D', insertAfter: true },
    });
    expect(displayOrderIds(next)).toEqual(['B', 'C', 'D', 'A']);
    expect(next.notes.find((n) => n.id === 'A')!.order).toBe(4); // không có láng giềng sau -> order(D) + 1
  });

  it('draggedId === targetId — trả nguyên space, không đổi gì', () => {
    const space = noteSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'A', targetId: 'A', insertAfter: false },
    });
    expect(next).toBe(space);
  });

  it('draggedId không tồn tại — trả nguyên space, không đổi gì', () => {
    const space = noteSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'ghost', targetId: 'B', insertAfter: false },
    });
    expect(next).toBe(space);
  });

  it('targetId không tồn tại — trả nguyên space, không đổi gì', () => {
    const space = noteSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'A', targetId: 'ghost', insertAfter: false },
    });
    expect(next).toBe(space);
  });

  it('kéo-thả lặp lại nhiều lần liên tiếp vào cùng 1 vị trí — vẫn ra đúng thứ tự hiển thị, không NaN/crash', () => {
    let space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
    ]);
    // Kéo C lên trước B, rồi lại kéo C lên trước A, lặp lại vài lần — mirror thao tác user kéo-thả
    // qua lại nhiều lần trong 1 phiên làm việc.
    for (let i = 0; i < 5; i++) {
      space = notesReducer(space, { type: 'NOTE_REORDER', payload: { draggedId: 'C', targetId: 'B', insertAfter: false } });
      expect(displayOrderIds(space)).toEqual(['A', 'C', 'B']);
      space = notesReducer(space, { type: 'NOTE_REORDER', payload: { draggedId: 'C', targetId: 'A', insertAfter: false } });
      expect(displayOrderIds(space)).toEqual(['C', 'A', 'B']);
    }
    space.notes.forEach((n) => {
      expect(Number.isFinite(n.order)).toBe(true);
      expect(Number.isNaN(n.order)).toBe(false);
    });
  });

  it('kéo đi rồi kéo NGAY VỀ đúng vị trí cũ — order khôi phục đúng giá trị số học ban đầu (idempotent)', () => {
    // Trước: A,B,C,D (order 0,1,2,3). Kéo B ra cuối (sau D) rồi kéo B NGAY VỀ lại vị trí cũ (trước
    // C, láng giềng gốc của nó) — vì 2 láng giềng A(0)/C(2) không hề đổi trong lúc B "đi vắng", công
    // thức trung bình cộng phải cho ra ĐÚNG giá trị order ban đầu của B (1), không phải chỉ giống về
    // THỨ TỰ HIỂN THỊ như các test trên.
    const space = noteSpaceWithOrders([
      { id: 'A', order: 0 },
      { id: 'B', order: 1 },
      { id: 'C', order: 2 },
      { id: 'D', order: 3 },
    ]);
    const moved = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'B', targetId: 'D', insertAfter: true },
    });
    expect(displayOrderIds(moved)).toEqual(['A', 'C', 'D', 'B']);
    expect(moved.notes.find((n) => n.id === 'B')!.order).toBe(4); // không có láng giềng sau -> order(D) + 1

    const restored = notesReducer(moved, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'B', targetId: 'C', insertAfter: false },
    });
    expect(displayOrderIds(restored)).toEqual(['A', 'B', 'C', 'D']);
    // Khôi phục đúng giá trị số học ban đầu (1), không chỉ đúng vị trí hiển thị.
    expect(restored.notes.find((n) => n.id === 'B')!.order).toBe(1);
    expect(restored.notes.find((n) => n.id === 'A')!.order).toBe(0);
    expect(restored.notes.find((n) => n.id === 'C')!.order).toBe(2);
    expect(restored.notes.find((n) => n.id === 'D')!.order).toBe(3);
  });

  it('KHÔNG đổi updatedAt của note bị kéo (mốc "sửa nội dung lần cuối" phải giữ nguyên khi chỉ kéo-thả)', () => {
    const space = noteSpaceWithOrders([{ id: 'A', order: 0 }, { id: 'B', order: 1 }]);
    const originalUpdatedAt = space.notes.find((n) => n.id === 'A')!.updatedAt;
    const next = notesReducer(space, {
      type: 'NOTE_REORDER',
      payload: { draggedId: 'A', targetId: 'B', insertAfter: true },
    });
    expect(next.notes.find((n) => n.id === 'A')!.updatedAt).toBe(originalUpdatedAt);
  });
});

describe('notesReducer — NOTE_TOGGLE_CONTENT_HIDDEN', () => {
  it('chỉ đổi field hidden, KHÔNG đổi updatedAt (mốc "sửa nội dung lần cuối" phải giữ nguyên khi ẩn/hiện)', () => {
    const space = noteSpaceWithOrders([{ id: 'A', order: 0 }]);
    const originalUpdatedAt = space.notes[0].updatedAt;
    const next = notesReducer(space, { type: 'NOTE_TOGGLE_CONTENT_HIDDEN', payload: { id: 'A' } });
    expect(next.notes[0].hidden).toBe(true);
    expect(next.notes[0].updatedAt).toBe(originalUpdatedAt);
  });
});
