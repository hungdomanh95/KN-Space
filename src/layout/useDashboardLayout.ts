import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { resolveDashboardCols } from '../storage/normalize';
import type { DashboardLayout, LayoutBlockKey } from '../types';
import {
  dropOnColumnEnd,
  dropOnTarget,
  resizeColSplitter,
  resizeRowSplitter,
  resizeSubColSplitter,
  slotHeightIfContains,
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
 * `Settings.dashboardLayout` (1 object đơn, lịch sử) đã tách thành 2 field phạm vi khác nhau
 * (xem docs/requirements.md mục 11):
 * - `colWidths` (`settings.dashboardColWidths`) — DÙNG CHUNG mọi Space của user, KHÔNG phụ
 *   thuộc `currentSpaceId`. Đổi Space không đổi khung 3 cột.
 * - `cols` (`settings.dashboardCols[spaceId]`) — RIÊNG theo TỪNG Space, đọc qua
 *   `resolveDashboardCols()` (thứ tự fallback: entry riêng -> mặc định hệ thống — KHÔNG qua
 *   `dashboardLayout.cols` cũ, xem lý do ở `resolveDashboardCols` trong `storage/normalize.ts`).
 *   Đổi Space đổi nội dung bên trong 3 cột.
 *
 * Local state `layout` vẫn giữ dạng `DashboardLayout` gộp (colWidths + cols) vì toàn bộ thuật
 * toán kéo-thả/resize trong `dashboardLayoutUtils.ts` thao tác trên object gộp này — chỉ tách
 * ra 2 luồng ĐỌC (persistedColWidths/persistedCols) và 2 luồng GHI (SETTINGS_SET_COL_WIDTHS
 * cho `colWidths`, SETTINGS_SET_DASHBOARD_COLS cho `cols`) ở biên ngoài cùng của hook.
 *
 * Quyết định kỹ thuật khác demo: demo mutate trực tiếp `colsState` và gọi `renderCols()` mỗi
 * lần `mousemove` (vanilla, không qua reducer). Ở đây dùng 1 state LOCAL `layout` (mirror từ
 * dữ liệu đã persist) để cập nhật mượt trong lúc kéo-resize, chỉ DISPATCH xuống reducer toàn
 * cục (kéo theo lưu storage) lúc `mouseup` — tránh dispatch/scheduleSave dồn dập theo từng
 * pixel di chuyển trong lúc kéo (resize có thể bắn hàng chục lần/giây).
 * Kéo-thả đổi vị trí (dropOnTarget/dropOnColumnEnd) ít tần suất hơn (1 lần/lượt thả) nên
 * dispatch ngay khi drop, không cần đợi mouseup riêng.
 *
 * Rủi ro implementation đã xử lý (mục 11.7 spec, kế thừa nguyên vẹn từ phân tích trước khi tách
 * field — chỉ còn áp dụng cho phần `cols`, KHÔNG áp dụng cho `colWidths` vì không khoá spaceId):
 * 1. Race đổi Space giữa lúc đang kéo dọc/kéo-thả: `pendingColsSpaceIdRef` chốt `currentSpaceId`
 *    tại thời điểm BẮT ĐẦU thao tác (`beginRowResize`/`beginSubColResize`/`setDraggedId`), dùng
 *    ref đó khi commit — không đọc `currentSpaceId` sống lúc dispatch (mousedown có thể xảy ra ở
 *    Space A, user đổi qua Space B giữa chừng lúc đang kéo trước khi mouseup).
 * 2. `activeKindRef` (row/col/subcol) cũng chốt qua ref cùng lý do: `endResize` có thể được gọi
 *    từ 1 closure "cũ" (tạo tại render lúc mousedown, TRƯỚC khi `setActiveSplitter` áp dụng) —
 *    đọc thẳng state `activeSplitter` trong thân `endResize` sẽ luôn thấy giá trị `null` của
 *    render cũ đó (state update không đồng bộ ngay trong cùng tick). Dùng ref (luôn là 1 object
 *    duy nhất, `.current` luôn phản ánh giá trị mới nhất bất kể closure nào đọc nó) để tránh bug
 *    này — cùng kỹ thuật đã dùng cho `layoutRef` từ trước.
 * 3. Referential-stability của fallback: `resolveDashboardCols()`/object `persistedLayout` được
 *    bọc `useMemo` — nhánh fallback sâu nhất `defaultDashboardLayout()` là factory (trả object
 *    MỚI mỗi lần gọi dù nội dung giống hệt); nếu không memo, effect đồng bộ lại `layout` (dep
 *    `[persistedLayout]`, so sánh reference) sẽ chạy lại ở MỌI re-render dù dữ liệu không đổi.
 * 4. Ngoại lệ mục 11.10 (chiều cao khối `settings`/`reminders` dùng CHUNG mọi Space —
 *    `settings.dashboardCornerHeight`/`settings.dashboardReminderHeight` — khác `h` mọi khối khác
 *    vẫn riêng theo Space): `resolveDashboardCols()` đã tự
 *    OVERRIDE cả 2 giá trị này khi ĐỌC (xem storage/normalize.ts) nên `persistedCols`/`layout`
 *    local ở hook này luôn phản ánh đúng, không cần xử lý gì thêm ở phần đọc. Phần GHI mới cần
 *    thêm ở đây: khi kết thúc splitter DỌC (`row`, đổi `h`) liền kề 1 trong 2 khối này, `endResize`
 *    dispatch THÊM `SETTINGS_SET_CORNER_HEIGHT`/`SETTINGS_SET_REMINDER_HEIGHT` (không kèm
 *    `spaceId`, độc lập nhau — 1 slot chỉ khớp đúng 1 trong 2) SONG SONG với
 *    `SETTINGS_SET_DASHBOARD_COLS` bình thường (vẫn ghi luôn cả `h` của 2 khối này vào entry
 *    per-Space — vô hại vì luôn bị override khi đọc, chỉ 2 dispatch bổ sung mới là nguồn giá trị
 *    thật) — 1 thao tác kéo giữa `settings`/`reminders` có thể ra 3 dispatch cùng lúc
 *    (`SETTINGS_SET_DASHBOARD_COLS` + cả 2 action dùng-chung). `subcol` (đổi `w`, không đổi `h`)
 *    không liên quan ngoại lệ này dù 2 khối trên có thể tham gia ghép ngang.
 */
export function useDashboardLayout() {
  const { state, dispatch } = useAppState();
  const currentSpaceId = state.currentSpaceId;

  // `colWidths` — dùng chung mọi Space, không phụ thuộc currentSpaceId.
  const persistedColWidths = state.settings.dashboardColWidths;
  // `cols` — riêng theo Space, useMemo để giữ ổn định reference khi rơi vào fallback (xem
  // rủi ro #3 ở comment trên).
  const persistedCols = useMemo(
    () => resolveDashboardCols(state.settings, currentSpaceId),
    // `dashboardCornerHeight`/`dashboardReminderHeight` PHẢI có trong deps — `resolveDashboardCols()`
    // override `h` của khối `settings`/`reminders` bằng 2 giá trị này (mục 11.10); thiếu dep sẽ
    // khiến đổi chiều cao 2 khối này ở nơi khác (vd sau reload/từ máy khác) không kích hoạt tính
    // lại `persistedCols`.
    [state.settings.dashboardCols, state.settings.dashboardCornerHeight, state.settings.dashboardReminderHeight, currentSpaceId],
  );
  const persistedLayout = useMemo<DashboardLayout>(
    () => ({ colWidths: persistedColWidths, cols: persistedCols }),
    [persistedColWidths, persistedCols],
  );

  const [layout, setLayout] = useState<DashboardLayout>(persistedLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [draggedId, setDraggedIdState] = useState<LayoutBlockKey | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: LayoutBlockKey; zone: DragZone } | null>(null);
  const [activeSplitter, setActiveSplitter] = useState<ActiveSplitter | null>(null);

  // Đồng bộ lại từ storage khi đổi Space, đổi từ máy khác (load-on-open), hoặc sau khi reset
  // layout — KHÔNG đồng bộ trong lúc đang kéo-resize (draggingRef true) để tránh giật ngược giá
  // trị đang kéo mượt ở state local.
  const draggingRef = useRef(false);
  useEffect(() => {
    if (draggingRef.current) return;
    setLayout(persistedLayout);
  }, [persistedLayout]);

  // spaceId chốt tại thời điểm BẮT ĐẦU 1 thao tác đổi `cols` (kéo dọc/kéo-thả ghép ngang/kéo-thả
  // đổi vị trí khối) — xem rủi ro #1 ở comment đầu file.
  const pendingColsSpaceIdRef = useRef(currentSpaceId);
  // Splitter đang active (kind + ci/si), chốt qua ref cùng thời điểm với `setActiveSplitter` —
  // xem rủi ro #2 ở comment đầu file (KHÔNG đọc state `activeSplitter` trong `endResize`, có thể
  // là closure "cũ" trước khi state kịp cập nhật). Lưu cả `ci`/`si` (không chỉ `kind` như bản
  // trước tính năng 11.10) — cần để xác định 2 slot bị resize khi kết thúc splitter DỌC (`row`),
  // phục vụ ngoại lệ mục 11.10 (xem `endResize` bên dưới).
  const activeSplitterRef = useRef<ActiveSplitter | null>(null);

  const commitCols = useCallback(
    (nextCols: DashboardLayout['cols'], spaceId: string) => {
      setLayout((prev) => ({ ...prev, cols: nextCols }));
      dispatch({ type: 'SETTINGS_SET_DASHBOARD_COLS', payload: { spaceId, cols: nextCols } });
    },
    [dispatch],
  );

  // Wrapper quanh setState gốc: chốt `pendingColsSpaceIdRef` đúng lúc BẮT ĐẦU kéo-thả (dragstart),
  // trước khi có bất kỳ khoảng thời gian nào user có thể đổi Space giữa chừng.
  function setDraggedId(id: LayoutBlockKey | null) {
    if (id != null) pendingColsSpaceIdRef.current = currentSpaceId;
    setDraggedIdState(id);
  }

  function handleDrop(targetId: LayoutBlockKey, zone: DragZone) {
    if (!draggedId) return;
    commitCols(dropOnTarget(layout, draggedId, targetId, zone).cols, pendingColsSpaceIdRef.current);
    setDraggedIdState(null);
    setDragOverTarget(null);
  }

  function handleDropOnColumn(ci: number) {
    if (!draggedId) return;
    commitCols(dropOnColumnEnd(layout, draggedId, ci).cols, pendingColsSpaceIdRef.current);
    setDraggedIdState(null);
    setDragOverTarget(null);
  }

  function beginRowResize(ci: number, si: number) {
    draggingRef.current = true;
    pendingColsSpaceIdRef.current = currentSpaceId;
    activeSplitterRef.current = { kind: 'row', ci, si };
    setActiveSplitter({ kind: 'row', ci, si });
  }
  function beginColResize(ci: number) {
    draggingRef.current = true;
    activeSplitterRef.current = { kind: 'col', ci };
    setActiveSplitter({ kind: 'col', ci });
  }
  function beginSubColResize(ci: number, si: number) {
    draggingRef.current = true;
    pendingColsSpaceIdRef.current = currentSpaceId;
    activeSplitterRef.current = { kind: 'subcol', ci, si };
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
    const active = activeSplitterRef.current;
    activeSplitterRef.current = null;
    setActiveSplitter(null);
    if (!active) return;

    // Commit giá trị local (đã cập nhật mượt trong lúc kéo, đọc qua ref để tránh dispatch bên
    // trong updater của setState — gây warning "Cannot update a component while rendering a
    // different component") xuống đúng field tương ứng.
    if (active.kind === 'col') {
      dispatch({ type: 'SETTINGS_SET_COL_WIDTHS', payload: { colWidths: layoutRef.current.colWidths } });
      return;
    }

    // row hoặc subcol -> cols riêng theo Space, dùng spaceId đã chốt lúc begin*Resize — KHÔNG đọc
    // `currentSpaceId` sống ở đây (rủi ro #1). Đúng ngay cả khi 1 trong 2 slot resize là
    // `settings`/`reminders` — VỊ TRÍ 2 khối này vẫn riêng theo Space (mục 11.10.3), chỉ `h` là
    // ngoại lệ dùng chung. `h` của 2 slot này lưu trong entry này có thể tạm thời khác
    // `dashboardCornerHeight`/`dashboardReminderHeight` — vô hại, luôn bị override khi đọc
    // (`resolveDashboardCols`).
    dispatch({
      type: 'SETTINGS_SET_DASHBOARD_COLS',
      payload: { spaceId: pendingColsSpaceIdRef.current, cols: layoutRef.current.cols },
    });

    // Ngoại lệ mục 11.10 (cả 2 khối `settings`/`reminders`) — splitter DỌC (row, đổi `h`) liền kề
    // `settings`/`reminders`: ghi THÊM `h` mới vào field DÙNG CHUNG tương ứng, tách biệt khỏi
    // entry per-Space vừa ghi ở trên (1 thao tác kéo -> tối đa 3 đích lưu trữ, xem comment đầu file
    // điểm 4). 2 khối kiểm tra ĐỘC LẬP (không phải else-if) — 1 slot chỉ khớp đúng 1 trong 2 id nên
    // không xung đột, nhưng viết tách riêng để đúng với khả năng slot A/B đổi vai trò tuỳ layout
    // thực tế của Space đó. `subcol` đổi `w` (không đổi `h`) nên không liên quan tới ngoại lệ này
    // dù 2 khối trên có thể tham gia ghép ngang.
    if (active.kind === 'row') {
      const col = layoutRef.current.cols[active.ci];
      const cornerH =
        slotHeightIfContains(col?.[active.si], 'settings') ?? slotHeightIfContains(col?.[active.si + 1], 'settings');
      if (cornerH != null) {
        dispatch({ type: 'SETTINGS_SET_CORNER_HEIGHT', payload: { h: cornerH } });
      }
      const reminderH =
        slotHeightIfContains(col?.[active.si], 'reminders') ?? slotHeightIfContains(col?.[active.si + 1], 'reminders');
      if (reminderH != null) {
        dispatch({ type: 'SETTINGS_SET_REMINDER_HEIGHT', payload: { h: reminderH } });
      }
    }
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
