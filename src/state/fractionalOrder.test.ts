import { describe, it, expect } from 'vitest';
import { computeOrderBetween, computeOrderForInsertAt, DEFAULT_ORDER } from './fractionalOrder';

describe('computeOrderBetween', () => {
  it('chèn giữa 2 láng giềng thường — order mới là trung bình cộng', () => {
    expect(computeOrderBetween(1, 2)).toBe(1.5);
    expect(computeOrderBetween(0, 1)).toBe(0.5);
    expect(computeOrderBetween(-3, -1)).toBe(-2);
  });

  it('chèn lên đầu danh sách (không có láng giềng trước) — order mới = order(item đầu) - 1', () => {
    expect(computeOrderBetween(undefined, 5)).toBe(4);
    expect(computeOrderBetween(undefined, 0)).toBe(-1);
  });

  it('chèn xuống cuối danh sách (không có láng giềng sau) — order mới = order(item cuối) + 1', () => {
    expect(computeOrderBetween(5, undefined)).toBe(6);
    expect(computeOrderBetween(0, undefined)).toBe(1);
  });

  it('danh sách rỗng (không có láng giềng nào) — trả về DEFAULT_ORDER', () => {
    expect(computeOrderBetween(undefined, undefined)).toBe(DEFAULT_ORDER);
    expect(DEFAULT_ORDER).toBe(0);
  });
});

describe('computeOrderForInsertAt', () => {
  it('chèn vào giữa mảng — dùng đúng 2 láng giềng kề vị trí chèn', () => {
    // [0, 1, 2, 3], chèn ở index 2 -> giữa order=1 và order=2
    expect(computeOrderForInsertAt([0, 1, 2, 3], 2)).toBe(1.5);
  });

  it('chèn ở đầu mảng (insertIndex = 0)', () => {
    expect(computeOrderForInsertAt([0, 1, 2, 3], 0)).toBe(-1);
  });

  it('chèn ở cuối mảng (insertIndex = length)', () => {
    expect(computeOrderForInsertAt([0, 1, 2, 3], 4)).toBe(4);
  });

  it('mảng rỗng — item đầu tiên, trả về DEFAULT_ORDER', () => {
    expect(computeOrderForInsertAt([], 0)).toBe(DEFAULT_ORDER);
  });

  it('insertIndex vượt biên (âm hoặc lớn hơn length) — tự clamp về đầu/cuối hợp lệ', () => {
    expect(computeOrderForInsertAt([0, 1, 2], -5)).toBe(computeOrderForInsertAt([0, 1, 2], 0));
    expect(computeOrderForInsertAt([0, 1, 2], 99)).toBe(computeOrderForInsertAt([0, 1, 2], 3));
  });
});

describe('kéo lặp lại nhiều lần liên tiếp vào cùng 1 khoảng — không lỗi, giá trị vẫn hợp lệ', () => {
  it('20 lần kéo liên tiếp vào giữa 2 anchor cố định — mỗi lần vẫn nằm đúng giữa khoảng, không NaN/Infinity', () => {
    const low = 1;
    let high = 2;
    for (let i = 0; i < 20; i++) {
      const mid = computeOrderBetween(low, high);
      expect(Number.isFinite(mid)).toBe(true);
      expect(Number.isNaN(mid)).toBe(false);
      // Ở 20 lần lặp đầu, độ chính xác double precision còn dư dả — khoảng cách chưa cạn,
      // mid luôn PHẢI nằm chặt giữa low và high (không suy biến trùng biên).
      expect(mid).toBeGreaterThan(low);
      expect(mid).toBeLessThan(high);
      high = mid; // item vừa kéo trở thành láng giềng "sau" mới cho lượt kéo kế tiếp
    }
  });

  it('kéo xen kẽ đầu/cuối danh sách nhiều lần liên tiếp — order tăng/giảm dần đều, không lỗi', () => {
    let firstOrder = 0;
    let lastOrder = 0;
    for (let i = 0; i < 10; i++) {
      firstOrder = computeOrderBetween(undefined, firstOrder);
      lastOrder = computeOrderBetween(lastOrder, undefined);
    }
    expect(firstOrder).toBe(-10);
    expect(lastOrder).toBe(10);
    expect(Number.isFinite(firstOrder)).toBe(true);
    expect(Number.isFinite(lastOrder)).toBe(true);
  });
});

describe('giới hạn đã biết — độ chính xác double precision cạn dần sau rất nhiều lần chia đôi liên tiếp', () => {
  it('sau ~100 lần kéo liên tiếp vào cùng 1 khoảng, giá trị có thể suy biến trùng biên (không renumber tự động) nhưng KHÔNG crash/NaN', () => {
    // Kịch bản cố tình xấu: liên tục chèn "ngay sau low" (low cố định, high thu hẹp dần) —
    // đúng thao tác 1 user kéo lặp đi lặp lại 1 item vào sát cùng 1 vị trí hàng chục/trăm lần.
    const low = 1;
    let high = 2;
    let collapsedAt = -1;
    for (let i = 0; i < 200; i++) {
      const mid = computeOrderBetween(low, high);
      expect(Number.isFinite(mid)).toBe(true);
      expect(Number.isNaN(mid)).toBe(false);
      if (collapsedAt === -1 && mid === low) {
        collapsedAt = i;
      }
      high = mid;
    }
    // Ghi nhận rõ giới hạn đã biết: về lý thuyết cần renumber định kỳ để tránh suy biến này,
    // nhưng đã CHỐT không xử lý ở đợt này (rủi ro thấp, kéo-thả thủ công thực tế không lặp
    // hàng trăm lần vào đúng 1 khoảng) — test chỉ xác nhận hành vi ổn định, không crash, không
    // đòi hỏi phải renumber.
    expect(collapsedAt).toBeGreaterThan(-1);
    expect(high).toBe(low);
  });
});
