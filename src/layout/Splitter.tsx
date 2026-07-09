import React from 'react';

interface SplitterProps {
  /** 'row' = kéo đổi chiều cao (đường ngang ẩn đè giữa gap dọc), 'col' = kéo đổi chiều rộng. */
  axis: 'row' | 'col';
  /** Vị trí tâm (px, đã trừ offset cha) — tính ở pass đo rect thật, xem useDashboardLayout. */
  position: number;
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  /**
   * `title`/`aria-label` gán TƯỜNG MINH tại từng vị trí gọi `<Splitter>` trong AppLayout.tsx,
   * KHÔNG derive từ `axis`: splitter `axis="col"` có 2 phạm vi lưu trữ khác nhau (subcol
   * ghép-ngang-trong-cột vs cột lớn ngoài cùng) render y hệt nhau về mặt hình ảnh nhưng khác hẳn
   * phạm vi ảnh hưởng — bắt buộc truyền đúng theo từng vị trí gọi.
   */
  title: string;
}

/**
 * Splitter ẨN — đè lên đúng giữa khoảng gap 12px sẵn có giữa 2 khối/cột (KHÔNG thay thế gap).
 * Vùng bắt chuột rộng 20px để dễ kéo; phần hiển thị (đường kẻ accent) mặc định trong suốt,
 * chỉ sáng lên khi hover/đang kéo — port đúng .col-splitter/.row-splitter trong
 * docs/demo-layout-options/index.html.
 */
export function Splitter({ axis, position, active, onMouseDown, title }: SplitterProps) {
  const isCol = axis === 'col';
  return (
    <div
      className={`splitter-hidden absolute z-[5] ${
        isCol ? 'top-0 bottom-0 -ml-[10px] w-5 cursor-col-resize' : 'left-0 right-0 -mt-[10px] h-5 cursor-row-resize'
      }`}
      style={isCol ? { left: `${position}px` } : { top: `${position}px` }}
      onMouseDown={onMouseDown}
      title={title}
      aria-label={title}
    >
      <span
        className={`splitter-hidden-line pointer-events-none absolute rounded-full bg-transparent transition-[background-color,width,height] duration-150 ${
          isCol
            ? 'left-1/2 top-[8%] bottom-[8%] w-[2px] -translate-x-1/2'
            : 'top-1/2 left-[8%] right-[8%] h-[2px] -translate-y-1/2'
        } ${active ? (isCol ? '!w-[3px] !bg-[var(--accent)]' : '!h-[3px] !bg-[var(--accent)]') : ''}`}
      />
    </div>
  );
}
