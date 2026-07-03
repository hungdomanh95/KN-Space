import { useEffect, useState } from 'react';
import type React from 'react';
import { formatHomeClock, formatHomeDateShort, todayQuote } from '../home/homeContent';
import { useAppState } from '../../state/AppStateContext';

interface TodayBlockProps {
  style?: React.CSSProperties;
  className?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  draggable?: boolean;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

/**
 * Widget hiển thị thuần (giờ + ngày ngắn + quote 1 dòng) — không CRUD, không block-head
 * (giống DashboardCorner). Tham gia kéo-thả tự do như mọi khối khác, chiều cao resize được
 * bình thường (KHÔNG nằm trong HEIGHT_LOCKED_IDS, xem dashboardLayoutUtils.ts). Có thể
 * tắt/bật riêng theo từng Space qua EnabledBlocks.today (xem AppLayout ENABLED_BLOCKS_KEY),
 * giống 4 khối dữ liệu khác — khác Thông báo/Widget điều hướng (2 phần tử luôn hiện, không
 * thuộc EnabledBlocks).
 *
 * Style "trong suốt hơn" để lộ ảnh nền chung Home/Dashboard — khác hẳn .main-block/.sub-block:
 * nền alpha thấp (~40%) + blur nhẹ (~7px) + overlay gradient tối cố định (không đổi theo
 * theme) để đảm bảo contrast bất kể ảnh nền người dùng chọn sáng/tối thế nào. Chữ trắng cố
 * định + text-shadow, KHÔNG dùng var(--text) theo theme.
 */
export function TodayBlock({
  style,
  className,
  rootRef,
  draggable,
  onMouseDownCapture,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: TodayBlockProps) {
  const { state } = useAppState();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = formatHomeClock(now);
  const quote = todayQuote(state.settings.homeQuotes);

  return (
    <div
      id="today-block"
      ref={rootRef}
      role="group"
      aria-label="Giờ, ngày và câu trích dẫn hôm nay"
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={style}
      className={`relative z-[5] flex flex-none cursor-grab items-center gap-[clamp(8px,3cqw,16px)]
        overflow-hidden rounded-xl [container-type:inline-size]
        border border-white/15 bg-white/5 px-4 py-3
        shadow-[0_4px_16px_rgba(10,12,40,.10),0_1px_4px_rgba(10,12,40,.08)] active:cursor-grabbing
        ${className ?? ''}`.trim()}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(135deg,rgba(0,0,0,.18),rgba(0,0,0,.32))]"
        aria-hidden="true"
      />
      <div className="relative z-[1] flex flex-none items-baseline gap-1 text-white [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">
        <span className="text-[clamp(24px,11cqw,52px)] font-semibold leading-none tracking-[-.01em] [font-variant-numeric:tabular-nums]">
          {clock.hh}:{clock.mm}
        </span>
      </div>
      <div className="relative z-[1] h-[60%] w-px flex-none bg-white/30" aria-hidden="true" />
      <div className="relative z-[1] min-w-0 flex-1 text-white [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">
        <div className="whitespace-nowrap text-[clamp(11px,5.2cqw,20px)] font-bold opacity-95">
          {formatHomeDateShort(now)}
        </div>
        <div className="line-clamp-2 whitespace-normal text-[clamp(9px,3.6cqw,13.5px)] italic leading-snug opacity-85">
          {quote}
        </div>
      </div>
    </div>
  );
}
