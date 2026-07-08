import { useEffect, useState } from 'react';
import type React from 'react';
import { formatHomeClock, formatHomeDateShort, todayQuote } from '../features/home/homeContent';
import { useAppState } from '../state/AppStateContext';
import { DashboardCornerNav } from './DashboardCorner';

interface DashboardCornerBlockProps {
  onGoHome: () => void;
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
 * Khối gộp "Widget điều hướng + Hôm nay" (`docs/requirements.md` mục 4.1, gộp 2026-07-08) — 1
 * card duy nhất, 2 hàng dọc, tham gia layout tự do như 1 khối bình thường (kéo-thả/resize được
 * qua `style`/`className`/drag handlers do `AppLayout.renderBlock()` truyền vào, giữ id
 * `#dashboard-corner` để tái dùng nguyên hiệu ứng kéo-thả `.dragging`/`.drag-over`/`.zone-side`
 * đã có sẵn trong `styles/components.css`). Luôn hiện, không thuộc `enabledBlocks` của Space nào.
 *
 * - **Hàng nav** (trên, tái dùng `DashboardCornerNav`): Home/Space-switcher/Settings — chiều cao
 *   khoá cứng ở cấp CSS nội bộ (`flex-none`), KHÔNG còn khoá cứng ở cấp layout-engine
 *   (`HEIGHT_LOCKED_IDS` đã bỏ `'settings'`, xem `dashboardLayoutUtils.ts`) — AC2.
 * - **Hàng ambient** (dưới, nội dung y hệt `TodayBlock.tsx` cũ — file đó đã bị xoá, logic đồng
 *   hồ/quote chuyển thẳng vào đây): đồng hồ/ngày/quote thuần hiển thị, `flex-1 min-h-0` ăn hết
 *   phần chiều cao còn lại sau hàng nav, resize tự do theo trọng số `h` của cả khối.
 *
 * Style hợp nhất nav + ambient (AC8, cập nhật 2026-07-08 — thay AC8 cũ "2 hàng không dung hoà"):
 * cả khối dùng chung đúng 1 lớp overlay gradient đen dọc (`180deg`, `.14`→`.32`), không đổi theo
 * theme, cùng `backdrop-filter: blur(8px)` — hàng nav không còn nền `color-mix(panel-bg)` riêng.
 * 3 control (Home/Space-switcher/Settings) dùng biến thể "dark glass pill" riêng cho ngữ cảnh nổi
 * trên ảnh nền (`onPhoto`, cập nhật 2026-07-08 — sửa lỗi nổi trắng đục lệch tông trên nền tối),
 * KHÔNG dùng nền `--raised` theme-adaptive mặc định như mọi nơi khác — xem
 * `DashboardCornerNavProps.onPhoto` trong `DashboardCorner.tsx`. Hàng nav có thêm
 * `id="dashboard-corner-nav"` riêng để `SpaceSwitcher` định vị popover đúng theo đáy hàng nav
 * (không phải đáy cả khối 2 hàng) — xem `SpaceSwitcher.tsx`.
 *
 * Bấm-giữ bất kỳ đâu trong khối (trừ nút Home/Settings/dropdown Space, tự chặn qua `stopPropagation`
 * click bên trong các control đó) đều kéo-thả được — kế thừa đúng hành vi cũ của cả 2 khối gốc
 * (không có `.block-head`, xem `armBlock()` trong `AppLayout.tsx`) — AC7.
 */
export function DashboardCornerBlock({
  onGoHome,
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
}: DashboardCornerBlockProps) {
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
      id="dashboard-corner"
      ref={rootRef}
      role="group"
      aria-label="Về Home, chuyển space, cài đặt và xem giờ/ngày/trích dẫn hôm nay"
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={style}
      className={`relative z-[5] flex flex-col overflow-hidden rounded-xl border border-[color:var(--border-hairline)]
        [backdrop-filter:blur(8px)] shadow-[0_4px_16px_rgba(10,12,40,.10),0_1px_4px_rgba(10,12,40,.08)] ${className ?? ''}`.trim()}
    >
      {/* Overlay hợp nhất — 1 lớp gradient đen dọc DUY NHẤT phủ suốt cả khối (nav + ambient), AC8.
          Con trực tiếp của root, z thấp hơn 2 hàng nội dung để không che control. */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(0,0,0,.14),rgba(0,0,0,.32))]"
        aria-hidden="true"
      />

      {/* Hàng nav — khoá cứng chiều cao (flex-none), id riêng cho SpaceSwitcher đo vị trí popover. */}
      <div
        id="dashboard-corner-nav"
        className="relative z-[5] flex flex-none items-center gap-2 justify-between px-[9px] py-[7px]"
      >
        <DashboardCornerNav onGoHome={onGoHome} onPhoto />
      </div>

      {/* Hàng ambient — resize tự do (flex-1 min-h-0). */}
      <div
        className="relative z-[5] flex flex-1 min-h-0 cursor-grab items-center gap-[clamp(8px,3cqw,16px)]
          overflow-hidden [container-type:inline-size] px-4 py-3 active:cursor-grabbing"
      >
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
    </div>
  );
}
