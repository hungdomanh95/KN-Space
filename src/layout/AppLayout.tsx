import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CheckSquare, ChevronUp, MessageCircle, ListChecks, ScrollText, type LucideIcon } from 'lucide-react';
import { MobileChatScreen } from './MobileChatScreen';
import { useCurrentSpace } from '../state/AppStateContext';
import { TasksBlock } from '../features/tasks/TasksBlock';
import { RemindersBlock } from '../features/reminders/RemindersBlock';
import { HabitsBlock } from '../features/habits/HabitsBlock';
import { NotesBlock } from '../features/notes/NotesBlock';
import { LogsBlock } from '../features/logs/LogsBlock';
import { NotificationsBlock } from '../features/notifications/NotificationsBlock';
import { DashboardCorner } from '../components/DashboardCorner';
import { DashboardCornerBlock } from '../components/DashboardCornerBlock';
import { useDashboardLayout } from './useDashboardLayout';
import { deriveVisibleLayout, getZone, isHeightLocked } from './dashboardLayoutUtils';
import { Splitter } from './Splitter';
import { useMediaQuery } from './useMediaQuery';
import { useMobileLayout } from './useMobileLayout';
import type { EnabledBlocks, LayoutBlockKey, LayoutSlot } from '../types';

/** Dưới breakpoint useMobileLayout (kể cả desktop resize cửa sổ hẹp lại, không riêng điện
 * thoại), chuyển hẳn sang UI mobile (Chat-first + tab Chi tiết) — chỉ hiện 3 khối chính dùng để
 * note nhanh/xem việc cần làm/xem nhật ký (2026-07-08: thêm `logs`, xem
 * docs/features/nhat-ky-nhanh.md mục 5.2.2). Hệ layout cột tự do của desktop (kéo-thả/resize/
 * splitter) nhìn rất kỳ khi bị bóp vào khung hẹp dưới 1000px (cột chồng lên nhau, splitter/
 * drag-handle không còn hợp lý) — dưới mốc này dùng hẳn UI mobile thay vì cố nhồi layout desktop
 * vào khung hẹp. KHÔNG đụng tới `space.enabledBlocks` (cài đặt ẩn/hiện khối của desktop, đồng bộ
 * mọi máy) — đây là 1 lớp lọc RENDER riêng, tách biệt hoàn toàn. */
const MOBILE_VISIBLE_BLOCKS = new Set<LayoutBlockKey>(['tasks', 'notes', 'logs']);

/** 3 khối tham gia accordion mobile tab "Chi tiết" (xem `isMobileBlocksOnly` bên dưới) — tách
 * riêng khỏi `MOBILE_VISIBLE_BLOCKS` (dùng cho mục đích lọc RENDER chung) vì accordion cần thêm
 * thứ tự hiển thị cố định + icon/label/màu tóm tắt cho từng khối, `settings` không tham gia. */
type MobileAccordionBlockId = 'tasks' | 'notes' | 'logs';
const MOBILE_ACCORDION_ORDER: MobileAccordionBlockId[] = ['tasks', 'notes', 'logs'];
const MOBILE_ACCORDION_DEFS: Record<MobileAccordionBlockId, { icon: LucideIcon; iconBg: string; iconColor: string; label: string }> = {
  tasks: { icon: CheckSquare, iconBg: 'rgba(var(--accent-rgb),.12)', iconColor: 'var(--accent)', label: 'Việc cần làm' },
  notes: { icon: BookOpen, iconBg: 'rgba(139,92,246,.12)', iconColor: 'var(--note-color)', label: 'Ghi chú' },
  logs: { icon: ScrollText, iconBg: 'rgba(138,143,152,.14)', iconColor: 'var(--log-color)', label: 'Nhật ký' },
};

interface AppLayoutProps {
  onGoHome: () => void;
}

/**
 * 7 phần tử tham gia layout tự do. `tasks`/`reminder`/`habits`/`notes`/`logs` bị ẩn theo
 * `space.enabledBlocks` của Space hiện tại (chỉ KHÔNG RENDER — vị trí trong cấu trúc layout
 * ĐÃ LƯU vẫn giữ nguyên để bật lại đúng chỗ cũ, xem `deriveVisibleLayout` dùng riêng cho
 * RENDER). `reminders` (Thông báo) và `settings` (khối gộp Widget điều hướng + Hôm nay,
 * `DashboardCornerBlock`) LUÔN hiển thị, không tắt theo Space (xem requirements mục 4/4.1).
 */
const ENABLED_BLOCKS_KEY: Partial<Record<LayoutBlockKey, keyof EnabledBlocks>> = {
  tasks: 'tasks',
  reminder: 'reminder',
  habits: 'habits',
  notes: 'notes',
  logs: 'logs',
};

// `ci`/`si` = chỉ số trong layout ĐANG HIỂN THỊ (DOM refs/key dùng chỉ số này); `origCi`/`origSi`
// = chỉ số tương ứng trong layout ĐẦY ĐỦ gốc (dùng để gọi applyRowResize/applyColResize/... —
// các hàm này thao tác trực tiếp trên layout gốc, xem dashboardLayoutUtils.ts).
interface RowSplitterGeom {
  ci: number;
  si: number;
  origCi: number;
  origSiA: number;
  origSiB: number;
  top: number;
}
interface ColSplitterGeom {
  ci: number;
  origCiA: number;
  origCiB: number;
  left: number;
}
interface SubColSplitterGeom {
  ci: number;
  si: number;
  origCi: number;
  origSi: number;
  left: number;
}

/**
 * Layout Dashboard tự do — port thuật toán kéo-thả (chèn trên/dưới/ghép ngang) + resize qua
 * splitter ẩn từ `docs/demo-layout-options/index.html` sang React. 2-pass render:
 * - Pass 1 (JSX bên dưới): dựng cột/slot/block theo flex bình thường.
 * - Pass 2 (`useLayoutEffect`): đo rect THẬT bằng `getBoundingClientRect()` sau khi flex đã
 *   tính xong, đặt splitter ẨN đè giữa khoảng gap 12px sẵn có (không thay thế gap).
 */
export function AppLayout({ onGoHome }: AppLayoutProps) {
  const space = useCurrentSpace();
  const {
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
  } = useDashboardLayout();

  const wrapRef = useRef<HTMLDivElement>(null);
  const mobileWrapRef = useRef<HTMLDivElement>(null);
  const mobileTabBarRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const subRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const blockRefs = useRef<Map<LayoutBlockKey, HTMLDivElement>>(new Map());

  const [rowSplitters, setRowSplitters] = useState<RowSplitterGeom[]>([]);
  const [colSplitters, setColSplitters] = useState<ColSplitterGeom[]>([]);
  const [subColSplitters, setSubColSplitters] = useState<SubColSplitterGeom[]>([]);

  // Dưới breakpoint `lg` (980px, xem tailwind.config.js + `max-lg:flex-col` ở #cols-wrap), các
  // cột dồn xuống xếp dọc — splitter kéo đổi ĐỘ RỘNG giữa 2 cột không còn ý nghĩa gì (2 cột
  // không còn nằm cạnh nhau), nhưng vẫn được đo/render đè dọc suốt chiều cao trang nếu không
  // chặn riêng, gây ra 1 đường kẻ dọc vô nghĩa xuyên qua toàn bộ Dashboard (nặng hơn trên màn
  // cảm ứng vì thiếu sự kiện mouseleave nên dễ dính trạng thái `:hover` làm đường kẻ luôn hiện).
  const isStackedLayout = useMediaQuery('(max-width: 979px)');
  // Dưới ~1000px (có hysteresis chống nhảy mốc, xem useMobileLayout.ts) — thu hẹp số khối hiện
  // ra, xem MOBILE_VISIBLE_BLOCKS phía trên.
  const isMobileBlocksOnly = useMobileLayout();
  // Accordion mobile: khối nào đang mở 80% (khối còn lại thu nhỏ 20%) — mặc định "Việc cần
  // làm" vì đây là khối hành động, ưu tiên kiểm tra trước khi ghi note (đã chốt với chủ dự án).
  // MỞ RỘNG 2→3 khối (2026-07-08, xem docs/features/nhat-ky-nhanh.md mục 5.2.2): thêm "Nhật ký
  // nhanh" — dùng danh sách `MOBILE_ACCORDION_ORDER`/`MOBILE_ACCORDION_DEFS` bên dưới thay vì
  // 2 biến `tasksExpanded`/`notesExpanded` cứng như trước, để không phải lặp lại y hệt logic
  // nếu sau này thêm/bớt khối trong accordion này.
  const [mobileExpanded, setMobileExpanded] = useState<MobileAccordionBlockId>('tasks');
  // Mobile có 2 tab riêng: "Trò chuyện" (MobileChatScreen — màn chính, thay Home) và "Chi tiết"
  // (accordion Task/Notes đầy đủ y như trước). Mặc định mở Chat — đúng yêu cầu "gõ nhanh là
  // việc đầu tiên thấy khi mở app", không qua Home/accordion nữa (xem App.tsx bỏ Home hẳn
  // trên mobile).
  const [mobileTab, setMobileTab] = useState<'chat' | 'details'>('chat');

  function isBlockVisible(id: LayoutBlockKey): boolean {
    // `settings` (DashboardCorner) là chrome điều hướng (home/space/cài đặt), không phải khối
    // nội dung — luôn hiện cả trên mobile, không tính vào MOBILE_VISIBLE_BLOCKS.
    if (isMobileBlocksOnly && id !== 'settings' && !MOBILE_VISIBLE_BLOCKS.has(id)) return false;
    const key = ENABLED_BLOCKS_KEY[id];
    if (!key) return true; // reminders/settings luôn hiện, không theo Space
    return space.enabledBlocks[key];
  }

  /**
   * Layout CHỈ DÙNG ĐỂ RENDER — lọc bỏ slot/cột không còn khối nào hiển thị (xem
   * `deriveVisibleLayout`), để flexbox không giữ flex-item rỗng chiếm trọng số `h`/`w`/
   * `colWidths%` khi 1 khối trong row/single bị ẩn theo `space.enabledBlocks`. `layout` GỐC
   * (đầy đủ, từ `useDashboardLayout`) vẫn được dùng cho mọi thao tác kéo-thả/resize/lưu
   * storage — KHÔNG dùng `visibleLayout` cho các thao tác đó, để giữ đúng vị trí khối đang ẩn.
   * `colMap`/`slotMap` resolve chỉ số cột/slot ĐANG HIỂN THỊ về đúng chỉ số trong `layout` gốc
   * (cần cho splitter resize — xem onRowSplitterMouseDown/onColSplitterMouseDown/...).
   */
  const { layout: visibleLayout, colMap, slotMap } = useMemo(
    () => deriveVisibleLayout(layout, isBlockVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, space.enabledBlocks],
  );

  // ---- PASS 2: đo rect thật, đặt splitter đè giữa gap 12px sẵn có (port renderCols() PASS 2). ----
  useLayoutEffect(() => {
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;

    function measure() {
      if (!wrapEl) return;
      const wrapRect = wrapEl.getBoundingClientRect();
      const nextRow: RowSplitterGeom[] = [];
      const nextCol: ColSplitterGeom[] = [];
      const nextSubCol: SubColSplitterGeom[] = [];

      visibleLayout.cols.forEach((col, ci) => {
        const colEl = colRefs.current.get(ci);
        if (!colEl) return;
        const colRect = colEl.getBoundingClientRect();
        const origCi = colMap[ci];

        for (let si = 0; si < col.length - 1; si++) {
          const aEl = slotRefs.current.get(`${ci}:${si}`);
          const bEl = slotRefs.current.get(`${ci}:${si + 1}`);
          if (!aEl || !bEl) continue;
          const aRect = aEl.getBoundingClientRect();
          const bRect = bEl.getBoundingClientRect();
          const top = (aRect.bottom + bRect.top) / 2 - colRect.top;
          nextRow.push({ ci, si, origCi, origSiA: slotMap[ci][si], origSiB: slotMap[ci][si + 1], top });
        }

        if (!isStackedLayout && ci < visibleLayout.cols.length - 1) {
          const nextColEl = colRefs.current.get(ci + 1);
          if (nextColEl) {
            const nextColRect = nextColEl.getBoundingClientRect();
            const left = (colRect.right + nextColRect.left) / 2 - wrapRect.left;
            nextCol.push({ ci, origCiA: origCi, origCiB: colMap[ci + 1], left });
          }
        }

        col.forEach((slot, si) => {
          if (slot.type !== 'row') return;
          const slotEl = slotRefs.current.get(`${ci}:${si}`);
          const aEl = subRefs.current.get(`${ci}:${si}:0`);
          const bEl = subRefs.current.get(`${ci}:${si}:1`);
          if (!slotEl || !aEl || !bEl) return;
          const slotRect = slotEl.getBoundingClientRect();
          const aRect = aEl.getBoundingClientRect();
          const bRect = bEl.getBoundingClientRect();
          const left = (aRect.right + bRect.left) / 2 - slotRect.left;
          nextSubCol.push({ ci, si, origCi, origSi: slotMap[ci][si], left });
        });
      });

      setRowSplitters(nextRow);
      setColSplitters(nextCol);
      setSubColSplitters(nextSubCol);
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapEl);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visibleLayout, colMap, slotMap, isStackedLayout]);

  function armBlock(id: LayoutBlockKey, e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    // Khối có .block-head (6 khối dữ liệu) chỉ "arm" khi mousedown đúng vào phần header (để
    // không xung đột với kéo-thả note/task con bên trong). `settings` (khối gộp Widget điều
    // hướng + Hôm nay) không có block-head — mousedown bất kỳ đâu trên cả khối đều arm được
    // (xem docs/requirements.md mục 4.1 AC7).
    const hasBlockHead = !!target.closest('.main-block, .sub-block')?.querySelector('.block-head');
    if (hasBlockHead && !target.closest('.block-head')) return;
    const el = blockRefs.current.get(id);
    if (el) el.draggable = true;
  }

  useLayoutEffect(() => {
    function disarmAll() {
      blockRefs.current.forEach((el) => {
        el.draggable = false;
      });
    }
    document.addEventListener('mouseup', disarmAll);
    return () => document.removeEventListener('mouseup', disarmAll);
  }, []);

  // Keyboard iOS: khi keyboard mở, layout viewport không co lại (fixed inset-0 vẫn full màn).
  // Dùng visualViewport.height để tính keyboard height và áp padding-bottom cho mobile wrapper —
  // flex children (DashboardCorner + chat + tabbar) chỉ chia nhau phần còn lại trên keyboard.
  // Chỉ chạy trên mobile (isMobileBlocksOnly). Direct DOM style, không re-render.
  useLayoutEffect(() => {
    if (!isMobileBlocksOnly) return;
    const vv = window.visualViewport;
    if (!vv) return;
    function adjust() {
      const el = mobileWrapRef.current;
      if (!el) return;
      const kh = Math.max(0, window.innerHeight - vv!.height);
      el.style.paddingBottom = kh > 0 ? `${kh}px` : '';
      // Ẩn tab bar khi keyboard mở — tránh nó kẹp giữa input và keyboard
      const tabEl = mobileTabBarRef.current;
      if (tabEl) tabEl.style.display = kh > 0 ? 'none' : '';
    }
    adjust();
    vv.addEventListener('resize', adjust);
    return () => vv.removeEventListener('resize', adjust);
  }, [isMobileBlocksOnly]);

  function dragHandlersFor(id: LayoutBlockKey, allowSide: boolean) {
    return {
      onMouseDownCapture: (e: React.MouseEvent<HTMLDivElement>) => armBlock(id, e),
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
        if (e.target !== blockRefs.current.get(id)) return;
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: (e: React.DragEvent<HTMLDivElement>) => {
        if (e.target !== blockRefs.current.get(id)) return;
        const el = blockRefs.current.get(id);
        if (el) el.draggable = false;
        setDraggedId(null);
        setDragOverTarget(null);
      },
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (!draggedId) return;
        e.preventDefault();
        e.stopPropagation();
        const el = blockRefs.current.get(id);
        if (!el) return;
        const zone = getZone(el.getBoundingClientRect(), e.clientX, e.clientY, allowSide && draggedId !== id);
        setDragOverTarget({ id, zone });
      },
      onDragLeave: () => setDragOverTarget((prev) => (prev?.id === id ? null : prev)),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragOverTarget || dragOverTarget.id !== id) return;
        handleDrop(id, dragOverTarget.zone);
      },
    };
  }

  function blockModifierClass(id: LayoutBlockKey): string {
    const isOver = dragOverTarget?.id === id && draggedId !== id;
    const zoneSide = isOver && (dragOverTarget?.zone === 'left' || dragOverTarget?.zone === 'right');
    return [draggedId === id ? 'dragging' : '', isOver ? 'drag-over' : '', zoneSide ? 'zone-side' : ''].filter(Boolean).join(' ');
  }

  function setBlockRef(id: LayoutBlockKey) {
    return (el: HTMLDivElement | null) => {
      if (el) blockRefs.current.set(id, el);
      else blockRefs.current.delete(id);
    };
  }

  /** flexValue luôn '1' ở đây — flex-grow thật sự được áp ở slot cha (renderSlot), khối con chỉ cần lấp đầy slot. */
  function renderBlock(id: LayoutBlockKey, allowSide: boolean): React.ReactNode {
    if (!isBlockVisible(id)) return null;
    const style: React.CSSProperties = { flex: '1 1 auto', minHeight: 0, minWidth: 0 };
    const className = blockModifierClass(id);
    const handlers = dragHandlersFor(id, allowSide);

    switch (id) {
      case 'tasks':
        return <TasksBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'reminder':
        return <RemindersBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'habits':
        return <HabitsBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'notes':
        return <NotesBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'logs':
        return <LogsBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'reminders':
        return <NotificationsBlock key={id} style={style} className={className} rootRef={setBlockRef(id)} draggable={false} {...handlers} />;
      case 'settings':
        return (
          <DashboardCornerBlock
            key={id}
            onGoHome={onGoHome}
            style={style}
            className={className}
            rootRef={setBlockRef(id)}
            draggable={false}
            {...handlers}
          />
        );
      default:
        return null;
    }
  }

  function setSlotRef(ci: number, si: number) {
    return (el: HTMLDivElement | null) => {
      const key = `${ci}:${si}`;
      if (el) slotRefs.current.set(key, el);
      else slotRefs.current.delete(key);
    };
  }
  function setSubRef(ci: number, si: number, subIdx: number) {
    return (el: HTMLDivElement | null) => {
      const key = `${ci}:${si}:${subIdx}`;
      if (el) subRefs.current.set(key, el);
      else subRefs.current.delete(key);
    };
  }

  function renderSlot(slot: LayoutSlot, ci: number, si: number): React.ReactNode {
    const flexStyle: React.CSSProperties = isHeightLocked(slot) ? { flex: '0 0 auto' } : { flex: `${slot.h} 1 0`, minHeight: 0 };

    if (slot.type === 'single') {
      return (
        <div key={`${ci}-${si}`} ref={setSlotRef(ci, si)} className="flex min-h-0 min-w-0 flex-col" style={flexStyle}>
          {renderBlock(slot.id, true)}
        </div>
      );
    }

    return (
      <div key={`${ci}-${si}`} ref={setSlotRef(ci, si)} className="slot-row relative flex min-h-0 min-w-0 gap-3" style={flexStyle}>
        {slot.items.map((item, subIdx) => (
          <div
            key={item.id}
            ref={setSubRef(ci, si, subIdx)}
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flex: `${item.w} 1 0`, minWidth: 0 }}
          >
            {renderBlock(item.id, false)}
          </div>
        ))}
      </div>
    );
  }

  function setColRef(ci: number) {
    return (el: HTMLDivElement | null) => {
      if (el) colRefs.current.set(ci, el);
      else colRefs.current.delete(ci);
    };
  }

  function handleColumnDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !draggedId) return;
    e.preventDefault();
  }
  function handleColumnDrop(ci: number, e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !draggedId) return;
    e.preventDefault();
    handleDropOnColumn(ci);
  }

  // ---- Splitter chiều cao giữa 2 slot liền kề trong 1 cột ----
  // `ci`/`si` ở đây là chỉ số layout HIỂN THỊ (dùng để đo rect DOM qua colRefs/slotRefs);
  // `origCi`/`origSiA`/`origSiB` là chỉ số tương ứng trong layout ĐẦY ĐỦ gốc — bắt buộc dùng
  // để đọc `h` gốc + gọi applyRowResize/beginRowResize (các hàm này thao tác trên layout gốc).
  function onRowSplitterMouseDown(ci: number, origCi: number, origSiA: number, origSiB: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      beginRowResize(origCi, origSiA);
      const colEl = colRefs.current.get(ci);
      if (!colEl) return;
      const startY = e.clientY;
      const liveColRect = colEl.getBoundingClientRect();
      const col = layout.cols[origCi];
      const startA = col[origSiA].h;
      const startB = col[origSiB].h;
      function onMove(ev: MouseEvent) {
        const dPct = ((ev.clientY - startY) / liveColRect.height) * (startA + startB);
        applyRowResize(origCi, origSiA, startA + dPct, startB - dPct);
      }
      function onUp() {
        endResize();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // ---- Splitter chiều rộng giữa 2 cột ----
  function onColSplitterMouseDown(origCiA: number, origCiB: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      beginColResize(origCiA);
      const wrapEl = wrapRef.current;
      if (!wrapEl) return;
      const startX = e.clientX;
      const liveWrapRect = wrapEl.getBoundingClientRect();
      const startA = layout.colWidths[origCiA];
      const startB = layout.colWidths[origCiB];
      function onMove(ev: MouseEvent) {
        const dPct = ((ev.clientX - startX) / liveWrapRect.width) * 100;
        applyColResize(origCiA, startA + dPct, startB - dPct);
      }
      function onUp() {
        endResize();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // ---- Splitter chiều rộng giữa 2 khối ghép ngang trong cùng 1 row-slot ----
  function onSubColSplitterMouseDown(ci: number, si: number, origCi: number, origSi: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      beginSubColResize(origCi, origSi);
      const slotEl = slotRefs.current.get(`${ci}:${si}`);
      if (!slotEl) return;
      const startX = e.clientX;
      const liveSlotRect = slotEl.getBoundingClientRect();
      const slot = layout.cols[origCi][origSi];
      if (slot.type !== 'row') return;
      const startA = slot.items[0].w;
      const startB = slot.items[1].w;
      function onMove(ev: MouseEvent) {
        const dPct = ((ev.clientX - startX) / liveSlotRect.width) * (startA + startB);
        applySubColResize(origCi, origSi, startA + dPct, startB - dPct);
      }
      function onUp() {
        endResize();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  /** Số lượng hiển thị trên thanh tóm tắt khi 1 khối accordion mobile đang thu nhỏ (xem
   * MobileCollapsedSummary) — "Việc cần làm" đếm số CHƯA xong (giống trước), "Ghi chú"/"Nhật ký"
   * đếm tổng số item. */
  function accordionCount(id: MobileAccordionBlockId): number {
    if (id === 'tasks') return space.tasks.filter((t) => !t.done).length;
    if (id === 'notes') return space.notes.length;
    return space.logs.length;
  }

  // Mobile thật: KHÔNG dùng hệ thống cột tự do bên dưới (3 cột desktop chia đều 1/3 chiều cao
  // khi dồn dọc, kể cả cột chỉ chứa "settings" cao vài chục px — để lại khoảng trống lớn lộ
  // background phía dưới, xem ảnh lỗi thực tế khi test). Dựng riêng 1 layout tĩnh: thanh
  // Space-switcher dính TRÊN cùng; "Việc cần làm"/"Ghi chú"/"Nhật ký nhanh" hoạt động dạng
  // accordion (2026-07-08: mở rộng 2→3 khối, xem docs/features/nhat-ky-nhanh.md mục 5.2.2) —
  // khối đang mở chiếm 80% chiều cao, các khối còn lại thu nhỏ về thanh tóm tắt (tiêu đề + số
  // lượng), bấm vào để đổi chỗ — KHÔNG ẩn hẳn 0%, để không mất hoàn toàn context của khối kia
  // (đã cân nhắc với uiux, xem record quyết định kèm câu hỏi này). Chỉ đúng 1 khối mở tại 1 thời
  // điểm dù có 2 hay 3 khối — khi chỉ còn ≤1 khối hiển thị (do tắt bớt qua enabledBlocks), khối
  // còn lại luôn coi là "mở" (không có gì để accordion nữa).
  if (isMobileBlocksOnly) {
    const visibleAccordionBlocks = MOBILE_ACCORDION_ORDER.filter(isBlockVisible);
    const effectiveExpanded = visibleAccordionBlocks.includes(mobileExpanded)
      ? mobileExpanded
      : visibleAccordionBlocks[0];

    return (
      // max-w-[560px] + mx-auto: UI mobile gốc thiết kế cho màn điện thoại hẹp (~375-414px) —
      // khi hiện trên cửa sổ desktop bị resize hẹp (đúng vùng kích hoạt UI này, xem
      // useMobileLayout.ts) thì full-width nhìn lạc lõng (bong bóng chat/accordion kéo giãn quá
      // rộng, nhiều khoảng trắng 2 bên). max-width tự nhiên KHÔNG ảnh hưởng màn điện thoại thật
      // (vốn đã hẹp hơn 560px, max-width không bị "chạm" tới) — không cần check thêm điều kiện
      // theo JS, thuần CSS (theo khuyến nghị uiux: canh giữa nội dung, không giả khung điện thoại).
      <div ref={mobileWrapRef} className="mx-auto flex h-full min-h-0 w-full max-w-[560px] flex-1 flex-col">
        <DashboardCorner onGoHome={onGoHome} compact />

        {mobileTab === 'chat' ? (
          <MobileChatScreen />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 py-2">
            {visibleAccordionBlocks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center text-[0.875rem] text-[var(--text-dim)]">
                <span>Space này đã tắt cả {MOBILE_ACCORDION_ORDER.length} khối hiện trên mobile.</span>
                <span>Vào Settings trên desktop để bật lại Việc cần làm, Ghi chú hoặc Nhật ký nhanh.</span>
              </div>
            ) : (
              visibleAccordionBlocks.map((id) => {
                const expanded = visibleAccordionBlocks.length <= 1 || effectiveExpanded === id;
                const def = MOBILE_ACCORDION_DEFS[id];
                return expanded ? (
                  <div key={id} id={`mobile-block-${id}`} className="flex min-h-0 flex-[4] flex-col transition-[flex-grow] duration-200 ease-out">
                    {renderBlock(id, false)}
                  </div>
                ) : (
                  <MobileCollapsedSummary
                    key={id}
                    icon={def.icon}
                    iconBg={def.iconBg}
                    iconColor={def.iconColor}
                    label={def.label}
                    expandedId={`mobile-block-${id}`}
                    count={accordionCount(id)}
                    onClick={() => setMobileExpanded(id)}
                  />
                );
              })
            )}
          </div>
        )}

        <MobileTabBar activeTab={mobileTab} onChange={setMobileTab} rootRef={mobileTabBarRef} />
      </div>
    );
  }

  return (
    // Nhánh desktop này chỉ render khi !isMobile (useMobileLayout, ngưỡng ~999-1010px) — nhánh
    // mobile ở trên đã return sớm cho mọi viewport hẹp hơn. Do đó max-sm (≤479px, xem
    // tailwind.config.js screens.sm) không bao giờ khớp ở đây; đã bỏ 2 class chết
    // max-sm:gap-2/max-sm:p-2 (mục L3, docs/features/ui-audit-2026-07.md).
    <div id="dashboard" className="flex min-h-0 flex-1 gap-3 bg-transparent p-3.5">
      <div ref={wrapRef} id="cols-wrap" className="relative flex h-full min-h-0 min-w-0 w-full flex-1 gap-3 max-lg:flex-col">
        {visibleLayout.cols.map((col, ci) => (
          <div
            key={ci}
            ref={setColRef(ci)}
            // shrink:1 (không phải 0) — BẮT BUỘC để cột co lại đủ chỗ cho `gap` của #cols-wrap.
            // Với flex-basis tính bằng %, nếu tổng % = 100 thì gap luôn cộng THÊM ra ngoài
            // (basis% không tự trừ gap), nên có shrink:0 sẽ luôn tràn ra ngoài đúng bằng tổng
            // độ rộng gap dù colWidths hoàn toàn hợp lệ (không phải do dữ liệu lỗi) — đã xác
            // nhận bằng Playwright: cột cuối lệch phải đúng bằng 2 × gap-3 (24px).
            className="relative flex min-h-0 min-w-0 flex-col gap-3 max-lg:!flex-1"
            style={{ flex: `0 1 ${visibleLayout.colWidths[ci]}%` }}
            onDragOver={handleColumnDragOver}
            onDrop={(e) => handleColumnDrop(colMap[ci], e)}
          >
            {col.map((slot, si) => renderSlot(slot, ci, si))}

            {/* Splitter chiều cao — render TRONG cột vì `top` được tính tương đối theo colRect.top. */}
            {rowSplitters
              .filter((rs) => rs.ci === ci)
              .map((rs) => (
                <Splitter
                  key={`row-${rs.ci}-${rs.si}`}
                  axis="row"
                  position={rs.top}
                  active={
                    activeSplitter?.kind === 'row' && activeSplitter.ci === rs.origCi && activeSplitter.si === rs.origSiA
                  }
                  onMouseDown={onRowSplitterMouseDown(rs.ci, rs.origCi, rs.origSiA, rs.origSiB)}
                  title="Đổi kích thước khối — chỉ áp dụng cho Space này"
                />
              ))}

            {/* Splitter chiều rộng ghép ngang — render trong slot-row tương ứng (left tính theo slotRect.left). */}
            {subColSplitters
              .filter((sc) => sc.ci === ci)
              .map((sc) => {
                const slotEl = slotRefs.current.get(`${sc.ci}:${sc.si}`);
                if (!slotEl) return null;
                return (
                  <SubColSplitterPortal key={`subcol-${sc.ci}-${sc.si}`} targetEl={slotEl}>
                    <Splitter
                      axis="col"
                      position={sc.left}
                      active={
                        activeSplitter?.kind === 'subcol' &&
                        activeSplitter.ci === sc.origCi &&
                        activeSplitter.si === sc.origSi
                      }
                      onMouseDown={onSubColSplitterMouseDown(sc.ci, sc.si, sc.origCi, sc.origSi)}
                      title="Đổi kích thước khối — chỉ áp dụng cho Space này"
                    />
                  </SubColSplitterPortal>
                );
              })}
          </div>
        ))}

        {/* Splitter chiều rộng giữa cột — render ở #cols-wrap vì `left` tính tương đối theo wrapRect.left.
            Ẩn hẳn khi đang dồn cột (isStackedLayout) — xem giải thích ở khai báo isStackedLayout phía trên. */}
        {!isStackedLayout && colSplitters.map(({ ci, origCiA, origCiB, left }) => (
          <Splitter
            key={`col-${ci}`}
            axis="col"
            position={left}
            active={activeSplitter?.kind === 'col' && activeSplitter.ci === origCiA}
            onMouseDown={onColSplitterMouseDown(origCiA, origCiB)}
            title="Đổi độ rộng cột — áp dụng cho mọi Space của bạn"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Splitter ghép ngang (giữa 2 khối trong cùng 1 row-slot) cần `left` tính tương đối theo
 * `.slot-row` (đã `position:relative` qua class) — portal trực tiếp vào DOM node đó để tránh
 * phải xuyên props `position:relative` qua nhiều cấp component.
 */
function SubColSplitterPortal({ targetEl, children }: { targetEl: HTMLElement; children: React.ReactNode }) {
  return createPortal(children, targetEl);
}

/**
 * Thanh tóm tắt cho khối "Việc cần làm"/"Ghi chú" khi đang thu nhỏ (accordion mobile, xem
 * isMobileBlocksOnly trong AppLayout) — chỉ icon + tên + số lượng, bấm để mở rộng khối này
 * (đồng thời tự thu nhỏ khối đang mở kia, vì luôn chỉ đúng 1 khối mở tại 1 thời điểm). Cố ý
 * KHÔNG có dòng preview nội dung — quá tốn chiều cao so với giá trị mang lại (đã bỏ theo
 * phản hồi thực tế khi test: thanh thu nhỏ chiếm diện tích quá lớn).
 */
function MobileCollapsedSummary({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  count,
  expandedId,
  onClick,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  count: number;
  /** Id của khối SẼ mở khi bấm — dùng cho aria-controls (đây là accordion trigger). */
  expandedId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      aria-controls={expandedId}
      className="flex flex-none items-center gap-2.5 rounded-xl border border-[color:var(--border-hairline)]
        bg-[var(--raised)] px-3 py-3.5 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full" style={{ background: iconBg }}>
        <Icon className="icon h-[15px] w-[15px]" size={15} style={{ color: iconColor }} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[0.875rem] font-semibold text-[var(--text)]">{label}</span>
        <span className="flex-none rounded-full bg-[var(--accent)] px-[7px] py-px text-[0.6875rem] font-bold text-white">
          {count}
        </span>
      </span>
      <ChevronUp className="icon h-4 w-4 flex-none text-[var(--text-dim)]" size={16} />
    </button>
  );
}

/** Tab bar dính đáy mobile — chuyển giữa "Trò chuyện" (MobileChatScreen, màn chính) và
 * "Chi tiết" (accordion Task/Notes đầy đủ). Đặt ở đáy vì đỉnh đã có DashboardCorner
 * (Space-switcher + Settings) — tách 2 hệ điều hướng riêng biệt, không chồng chéo. */
function MobileTabBar({
  activeTab,
  onChange,
  rootRef,
}: {
  activeTab: 'chat' | 'details';
  onChange: (tab: 'chat' | 'details') => void;
  rootRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label="Chuyển màn Trò chuyện/Chi tiết"
      className="flex flex-none border-t border-[color:var(--border-hairline)]
        bg-[color-mix(in_srgb,var(--panel-bg)_88%,transparent)] [backdrop-filter:blur(14px)_saturate(1.15)]
        dark:bg-[color-mix(in_srgb,var(--panel-bg)_90%,transparent)]
        [padding-bottom:env(safe-area-inset-bottom,0px)]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'chat'}
        onClick={() => onChange('chat')}
        className={`flex flex-1 flex-col items-center gap-1 py-3.5 text-[0.75rem] font-semibold ${
          activeTab === 'chat' ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'
        }`}
      >
        <MessageCircle className="icon h-5 w-5" size={20} />
        Trò chuyện
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'details'}
        onClick={() => onChange('details')}
        className={`flex flex-1 flex-col items-center gap-1 py-3.5 text-[0.75rem] font-semibold ${
          activeTab === 'details' ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'
        }`}
      >
        <ListChecks className="icon h-5 w-5" size={20} />
        Chi tiết
      </button>
    </div>
  );
}
