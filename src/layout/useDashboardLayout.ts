import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { DashboardLayout, LayoutBlockKey } from '../types';
import {
  dropOnColumnEnd,
  dropOnTarget,
  resizeColSplitter,
  resizeRowSplitter,
  resizeSubColSplitter,
} from './dashboardLayoutUtils';
import type { DragZone } from './dashboardLayoutUtils';

export type ActiveSplitter =
  | { kind: 'row'; ci: number; si: number }
  | { kind: 'col'; ci: number }
  | { kind: 'subcol'; ci: number; si: number };

/**
 * State + handlers cho layout Dashboard tự do (kéo-thả chèn trên/dưới/ghép ngang + resize
 * splitter ẩn) — port thuật toán từ docs/demo-layout-options/index.html sang React.
 *
 * Bố cục DÙNG CHUNG cho mọi Space (`settings.dashboardLayout`, xem requirements mục 4: "Lưu tỉ
 * lệ layout + thứ tự khối vào storage, dùng chung cho mọi Space") — không còn lưu riêng theo
 * từng Space, nên không cần đồng bộ lại khi đổi Space như trước.
 *
 * Quyết định kỹ thuật khác demo: demo mutate trực tiếp `colsState` và gọi `renderCols()` mỗi
 * lần `mousemove` (vanilla, không qua reducer). Ở đây dùng 1 state LOCAL `layout` (mirror từ
 * `settings.dashboardLayout`) để cập nhật mượt trong lúc kéo-resize, chỉ DISPATCH xuống reducer
 * toàn cục (kéo theo lưu storage) lúc `mouseup` — tránh dispatch/scheduleSave dồn dập theo từng
 * pixel di chuyển trong lúc kéo (resize có thể bắn hàng chục lần/giây).
 * Kéo-thả đổi vị trí (dropOnTarget/dropOnColumnEnd) ít tần suất hơn (1 lần/lượt thả) nên
 * dispatch ngay khi drop, không cần đợi mouseup riêng.
 */
export function useDashboardLayout() {
  const { state, dispatch } = useAppState();
  const persistedLayout = state.settings.dashboardLayout;
  const [layout, setLayout] = useState<DashboardLayout>(persistedLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [draggedId, setDraggedId] = useState<LayoutBlockKey | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: LayoutBlockKey; zone: DragZone } | null>(null);
  const [activeSplitter, setActiveSplitter] = useState<ActiveSplitter | null>(null);

  // Đồng bộ lại từ storage khi đổi từ máy khác (chrome.storage.onChanged -> HYDRATE) hoặc sau
  // khi reset layout — KHÔNG đồng bộ trong lúc đang kéo-resize (draggingRef true) để tránh giật
  // ngược giá trị đang kéo mượt ở state local.
  const draggingRef = useRef(false);
  useEffect(() => {
    if (draggingRef.current) return;
    setLayout(persistedLayout);
  }, [persistedLayout]);

  const commit = useCallback(
    (next: DashboardLayout) => {
      setLayout(next);
      dispatch({ type: 'SETTINGS_SET_DASHBOARD_LAYOUT', payload: { layout: next } });
    },
    [dispatch],
  );

  function handleDrop(targetId: LayoutBlockKey, zone: DragZone) {
    if (!draggedId) return;
    commit(dropOnTarget(layout, draggedId, targetId, zone));
    setDraggedId(null);
    setDragOverTarget(null);
  }

  function handleDropOnColumn(ci: number) {
    if (!draggedId) return;
    commit(dropOnColumnEnd(layout, draggedId, ci));
    setDraggedId(null);
    setDragOverTarget(null);
  }

  function beginRowResize(ci: number, si: number) {
    draggingRef.current = true;
    setActiveSplitter({ kind: 'row', ci, si });
  }
  function beginColResize(ci: number) {
    draggingRef.current = true;
    setActiveSplitter({ kind: 'col', ci });
  }
  function beginSubColResize(ci: number, si: number) {
    draggingRef.current = true;
    setActiveSplitter({ kind: 'subcol', ci, si });
  }

  // newA/newB là giá trị TUYỆT ĐỐI (caller tính từ baseline cố định lúc mousedown + delta hiện
  // tại) — KHÔNG phải delta cộng dồn, xem chú thích trong dashboardLayoutUtils.ts.
  function applyRowResize(ci: number, si: number, newAH: number, newBH: number) {
    setLayout((prev) => resizeRowSplitter(prev, ci, si, newAH, newBH));
  }
  function applyColResize(ci: number, newAWidth: number, newBWidth: number) {
    setLayout((prev) => resizeColSplitter(prev, ci, newAWidth, newBWidth));
  }
  function applySubColResize(ci: number, si: number, newAW: number, newBW: number) {
    setLayout((prev) => resizeSubColSplitter(prev, ci, si, newAW, newBW));
  }

  function endResize() {
    draggingRef.current = false;
    setActiveSplitter(null);
    // Commit giá trị local (đã cập nhật mượt trong lúc kéo, đọc qua ref để tránh dispatch
    // bên trong updater của setState — gây warning "Cannot update a component while
    // rendering a different component") xuống reducer toàn cục 1 lần.
    dispatch({ type: 'SETTINGS_SET_DASHBOARD_LAYOUT', payload: { layout: layoutRef.current } });
  }

  return {
    layout,
    draggedId,
    setDraggedId,
    dragOverTarget,
    setDragOverTarget,
    activeSplitter,
    handleDrop,
    handleDropOnColumn,
    beginRowResize,
    beginColResize,
    beginSubColResize,
    applyRowResize,
    applyColResize,
    applySubColResize,
    endResize,
  };
}
