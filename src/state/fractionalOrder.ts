/**
 * Fractional-index cho field `order` (Task/Note — 2 entity DUY NHẤT hỗ trợ kéo-thả thủ công).
 *
 * Thiết kế theo `docs/features/item-level-entity-tables.md` mục 5: khi tách Task/Note thành bảng
 * riêng theo item, reindex TOÀN MẢNG mỗi lần kéo-thả (`map((x, idx) => ({ ...x, order: idx }))`,
 * cách `TASK_REORDER`/`NOTE_REORDER` hiện đang làm) sẽ biến 1 lần kéo-thả thành UPDATE hàng loạt N
 * dòng DB — không còn phù hợp. Module này thay bằng: `order` là số thực, kéo 1 item vào vị trí mới
 * chỉ cần tính lại `order` của ĐÚNG item đó (trung bình cộng 2 láng giềng kề), mọi item khác giữ
 * nguyên `order`.
 *
 * LƯU Ý: module này CHỈ chứa logic thuần (không side-effect, không đụng reducer/DB). Việc tích hợp
 * vào `TASK_REORDER`/`NOTE_REORDER` thật sự sẽ làm ở bước kế tiếp (khi code storage layer cho Task).
 */

/** Order mặc định khi danh sách đang rỗng (item đầu tiên chưa có láng giềng nào để tham chiếu). */
export const DEFAULT_ORDER = 0;

/** Khoảng cách mặc định cộng/trừ khi item chỉ có 1 láng giềng (đầu hoặc cuối danh sách). */
const EDGE_STEP = 1;

/**
 * Tính `order` mới cho 1 item dựa trên `order` của 2 láng giềng kề tại vị trí nó vừa được kéo tới.
 *
 * - `before`/`after` đều có: chèn vào giữa 2 item — order mới = trung bình cộng.
 * - Chỉ có `after` (kéo lên đầu danh sách, không có láng giềng trước): order mới = after - 1.
 * - Chỉ có `before` (kéo xuống cuối danh sách, không có láng giềng sau): order mới = before + 1.
 * - Cả 2 đều không có (danh sách rỗng — item đầu tiên): trả về `DEFAULT_ORDER`.
 */
export function computeOrderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return DEFAULT_ORDER;
  if (before === undefined) return (after as number) - EDGE_STEP;
  if (after === undefined) return before + EDGE_STEP;
  return (before + after) / 2;
}

/**
 * Helper tiện dụng ở mức "vị trí chèn trong danh sách" thay vì tự tay lấy láng giềng.
 *
 * `existingOrders`: mảng `order` hiện có, ĐÃ sort tăng dần, KHÔNG bao gồm item đang được kéo (đã bị
 * loại khỏi mảng trước khi gọi hàm này — mirror bước `splice(fromIdx, 1)` hiện có trong
 * `TASK_REORDER`/`NOTE_REORDER`).
 * `insertIndex`: vị trí (0-based) muốn chèn item vào, tính trên `existingOrders` sau khi đã loại item
 * đang kéo — `0` nghĩa là đầu danh sách, `existingOrders.length` nghĩa là cuối danh sách.
 */
export function computeOrderForInsertAt(existingOrders: number[], insertIndex: number): number {
  const clampedIndex = Math.max(0, Math.min(insertIndex, existingOrders.length));
  const before = clampedIndex > 0 ? existingOrders[clampedIndex - 1] : undefined;
  const after = clampedIndex < existingOrders.length ? existingOrders[clampedIndex] : undefined;
  return computeOrderBetween(before, after);
}
