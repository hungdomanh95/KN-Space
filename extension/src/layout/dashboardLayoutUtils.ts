import type { DashboardLayout, LayoutBlockKey, LayoutSlot } from '../types';

/**
 * Port thuần thuật toán kéo-thả/ghép ngang tự do từ demo
 * `docs/demo-layout-options/index.html` (xem findLocation/removeId/dropOnTarget/getZone/
 * isHeightLocked trong file đó) sang TypeScript thuần — không phụ thuộc DOM, dùng được cả
 * trong reducer/hook React. Mọi hàm ở đây là PURE, luôn trả `DashboardLayout` mới (không
 * mutate tham số) để tương thích với React state immutability.
 */

/** Khối có chiều cao LUÔN cố định theo nội dung thật (flex: 0 0 auto), không theo trọng số `h`. */
export const HEIGHT_LOCKED_IDS = new Set<LayoutBlockKey>(['settings']);

export type DragZone = 'top' | 'bottom' | 'left' | 'right';

export interface SlotLocation {
  ci: number;
  si: number;
  sub: number | null;
}

export function isHeightLocked(slot: LayoutSlot): boolean {
  return slot.type === 'single' && HEIGHT_LOCKED_IDS.has(slot.id);
}

export function defaultHFor(id: LayoutBlockKey): number {
  return HEIGHT_LOCKED_IDS.has(id) ? 14 : 30;
}

export function findLocation(layout: DashboardLayout, id: LayoutBlockKey): SlotLocation | null {
  for (let ci = 0; ci < layout.cols.length; ci++) {
    const col = layout.cols[ci];
    for (let si = 0; si < col.length; si++) {
      const slot = col[si];
      if (slot.type === 'single' && slot.id === id) return { ci, si, sub: null };
      if (slot.type === 'row') {
        const subIdx = slot.items.findIndex((it) => it.id === id);
        if (subIdx !== -1) return { ci, si, sub: subIdx };
      }
    }
  }
  return null;
}

/** Tính zone thả dựa trên vị trí con trỏ tương đối trong rect của khối target (đo bằng getBoundingClientRect). */
export function getZone(rect: { left: number; top: number; width: number; height: number }, x: number, y: number, allowSide: boolean): DragZone {
  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;
  if (allowSide) {
    if (relX < 0.25) return 'left';
    if (relX > 0.75) return 'right';
  }
  return relY < 0.5 ? 'top' : 'bottom';
}

/** Xoá 1 khối khỏi layout (deep-clone trước khi sửa) — trả về layout MỚI + cols đã rút gọn row 1-phần-tử về single. */
function removeIdFromLayout(layout: DashboardLayout, id: LayoutBlockKey): DashboardLayout {
  const loc = findLocation(layout, id);
  if (!loc) return layout;
  const cols = layout.cols.map((col) => col.map((slot) => (slot.type === 'row' ? { ...slot, items: [...slot.items] } : { ...slot } )));
  const col = cols[loc.ci];
  const slot = col[loc.si];
  if (slot.type === 'single') {
    col.splice(loc.si, 1);
  } else if (loc.sub != null) {
    slot.items.splice(loc.sub, 1);
    if (slot.items.length === 1) {
      col[loc.si] = { type: 'single', id: slot.items[0].id, h: slot.h };
    }
  }
  return { ...layout, cols };
}

/**
 * Thả `draggedId` vào `targetId` theo `zone`. Port đúng dropOnTarget() demo: remove trước,
 * TÌM LẠI vị trí target SAU khi remove (vị trí có thể đã đổi do remove làm cột rút ngắn),
 * rồi chèn dọc (top/bottom) hoặc ghép ngang (left/right, chỉ áp dụng khi target là slot đơn).
 */
export function dropOnTarget(layout: DashboardLayout, draggedId: LayoutBlockKey, targetId: LayoutBlockKey, zone: DragZone): DashboardLayout {
  if (draggedId === targetId) return layout;
  const afterRemove = removeIdFromLayout(layout, draggedId);
  const loc = findLocation(afterRemove, targetId);
  if (!loc) return layout;
  const cols = afterRemove.cols.map((col) => col.map((slot) => (slot.type === 'row' ? { ...slot, items: [...slot.items] } : { ...slot })));
  const col = cols[loc.ci];

  if (loc.sub == null && (zone === 'left' || zone === 'right')) {
    const slot = col[loc.si] as { type: 'single'; id: LayoutBlockKey; h: number };
    col[loc.si] =
      zone === 'left'
        ? { type: 'row', items: [{ id: draggedId, w: 50 }, { id: slot.id, w: 50 }], h: slot.h }
        : { type: 'row', items: [{ id: slot.id, w: 50 }, { id: draggedId, w: 50 }], h: slot.h };
  } else {
    const at = zone === 'top' ? loc.si : loc.si + 1;
    col.splice(at, 0, { type: 'single', id: draggedId, h: defaultHFor(draggedId) });
  }
  return { ...afterRemove, cols };
}

/** Thả `draggedId` vào cuối 1 cột (drop trên vùng trống của cột, không đè lên khối nào). */
export function dropOnColumnEnd(layout: DashboardLayout, draggedId: LayoutBlockKey, ci: number): DashboardLayout {
  const afterRemove = removeIdFromLayout(layout, draggedId);
  const cols = afterRemove.cols.map((col) => col.map((slot) => (slot.type === 'row' ? { ...slot, items: [...slot.items] } : { ...slot })));
  cols[ci] = [...cols[ci], { type: 'single', id: draggedId, h: defaultHFor(draggedId) }];
  return { ...afterRemove, cols };
}

/**
 * Đảm bảo mọi id trong `requiredIds` đều có vị trí trong layout — id nào chưa có (vd vừa copy
 * bố cục từ 1 Space có tập khối khác, thiếu hẳn entry cho khối Space đích đang bật) thì chèn
 * vào cuối cột đầu tiên (cột 0), KHÔNG đè/xoá gì khác. Dùng khi copy bố cục giữa 2 Space có tập
 * khối hiển thị khác nhau — id dư (có trong layout nguồn nhưng Space đích không bật) không cần
 * xử lý gì thêm vì `deriveVisibleLayout` đã tự lọc ẩn lúc render, không lỗi gì nếu giữ lại.
 */
export function ensureBlocksPresent(layout: DashboardLayout, requiredIds: LayoutBlockKey[]): DashboardLayout {
  let result = layout;
  for (const id of requiredIds) {
    if (!findLocation(result, id)) {
      result = dropOnColumnEnd(result, id, 0);
    }
  }
  return result;
}

/**
 * Đổi trọng số `h` của 2 slot liền kề trong 1 cột (kéo splitter dọc).
 * QUAN TRỌNG: nhận giá trị TUYỆT ĐỐI `newAH`/`newBH` (đã tính từ baseline cố định lúc
 * mousedown + delta hiện tại, xem AppLayout.onRowSplitterMouseDown), KHÔNG nhận delta rồi
 * tự cộng vào `h` hiện tại — vì `h` hiện tại đã phản ánh lần gọi trước, cộng delta cumulative
 * (tính từ mousedown) lên trên giá trị đã cộng dồn trước đó sẽ khiến resize nhảy loạn theo
 * cấp số nhân mỗi lần mousemove (bug đã gặp thực tế: kéo nhẹ mà giá trị nhảy vọt rất xa).
 */
export function resizeRowSplitter(layout: DashboardLayout, ci: number, si: number, newAH: number, newBH: number): DashboardLayout {
  const cols = layout.cols.map((col, idx) => (idx === ci ? col.map((slot) => ({ ...slot })) : col));
  const col = cols[ci];
  const a = col[si];
  const b = col[si + 1];
  if (!a || !b) return layout;
  if (!isHeightLocked(a)) (a as { h: number }).h = Math.max(8, newAH);
  if (!isHeightLocked(b)) (b as { h: number }).h = Math.max(8, newBH);
  return { ...layout, cols };
}

/** Đổi % chiều rộng 2 cột liền kề (kéo splitter cột) — nhận giá trị TUYỆT ĐỐI, xem lý do ở resizeRowSplitter. */
export function resizeColSplitter(layout: DashboardLayout, ci: number, newAWidth: number, newBWidth: number): DashboardLayout {
  const colWidths = [...layout.colWidths];
  if (colWidths[ci] == null || colWidths[ci + 1] == null) return layout;
  colWidths[ci] = Math.max(10, newAWidth);
  colWidths[ci + 1] = Math.max(10, newBWidth);
  return { ...layout, colWidths };
}

/** Đổi trọng số `w` của 2 khối ghép ngang trong cùng 1 row-slot — nhận giá trị TUYỆT ĐỐI, xem lý do ở resizeRowSplitter. */
export function resizeSubColSplitter(layout: DashboardLayout, ci: number, si: number, newAW: number, newBW: number): DashboardLayout {
  const cols = layout.cols.map((col, idx) => (idx === ci ? col.map((slot) => (slot.type === 'row' ? { ...slot, items: slot.items.map((it) => ({ ...it })) } : slot)) : col));
  const slot = cols[ci][si];
  if (slot.type !== 'row' || slot.items.length !== 2) return layout;
  slot.items[0].w = Math.max(10, newAW);
  slot.items[1].w = Math.max(10, newBW);
  return { ...layout, cols };
}

/**
 * Tính layout CHỈ DÙNG ĐỂ RENDER — lọc bỏ slot/cột không còn khối nào hiển thị (theo
 * `isVisible(id)`, vd. theo `space.enabledBlocks`), để flexbox không giữ flex-item rỗng
 * chiếm trọng số `h`/`w`/`colWidths%` (gây "khối còn lại trong row to bất thường" hoặc cột
 * trống vô lý — xem bug report). KHÔNG dùng kết quả hàm này cho `findLocation`/
 * `dropOnTarget`/lưu storage — luôn thao tác trên layout ĐẦY ĐỦ gốc để giữ đúng vị trí khối
 * đang ẩn, chỉ bật lại đúng chỗ cũ khi enabledBlocks đổi lại.
 *
 * Quy tắc lọc (xem yêu cầu — việc 2):
 * - `single` có khối ẩn -> bỏ hẳn slot khỏi cây render.
 * - `row` có 1/2 khối ẩn -> hạ về `single` với khối còn hiển thị (giữ nguyên `h` của slot).
 * - `row` có cả 2 khối ẩn -> bỏ hẳn slot.
 * - Cột không còn slot nào sau khi lọc -> bỏ hẳn cột (không giữ `colWidths%`).
 */
export interface VisibleLayoutResult {
  layout: DashboardLayout;
  /** map[ci visible] = ci gốc trong layout đầy đủ — dùng để resolve splitter resize/đo rect về đúng vị trí gốc. */
  colMap: number[];
  /** map[ci visible][si visible] = si gốc trong cột đó (layout đầy đủ). */
  slotMap: number[][];
}

export function deriveVisibleLayout(layout: DashboardLayout, isVisible: (id: LayoutBlockKey) => boolean): VisibleLayoutResult {
  const colWidths: number[] = [];
  const cols: LayoutSlot[][] = [];
  const colMap: number[] = [];
  const slotMap: number[][] = [];

  layout.cols.forEach((col, ci) => {
    const visibleSlots: LayoutSlot[] = [];
    const visibleSlotOrigIdx: number[] = [];
    col.forEach((slot, si) => {
      if (slot.type === 'single') {
        if (isVisible(slot.id)) {
          visibleSlots.push(slot);
          visibleSlotOrigIdx.push(si);
        }
        return;
      }
      const visibleItems = slot.items.filter((it) => isVisible(it.id));
      if (visibleItems.length === 2) {
        visibleSlots.push(slot);
        visibleSlotOrigIdx.push(si);
      } else if (visibleItems.length === 1) {
        visibleSlots.push({ type: 'single', id: visibleItems[0].id, h: slot.h });
        visibleSlotOrigIdx.push(si);
      }
      // visibleItems.length === 0 -> bỏ hẳn slot, không push gì.
    });

    if (visibleSlots.length > 0) {
      colWidths.push(layout.colWidths[ci]);
      cols.push(visibleSlots);
      colMap.push(ci);
      slotMap.push(visibleSlotOrigIdx);
    }
  });

  return { layout: { colWidths, cols }, colMap, slotMap };
}
