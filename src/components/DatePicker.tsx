import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import type { DayButtonProps } from 'react-day-picker';
import { vi } from 'date-fns/locale/vi';
import { format } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * DatePicker tuỳ biến thay thế `<input type="date">` — xem spec đầy đủ ở
 * `docs/features/date-time-picker.md` (mục 3.1-3.2, 4, 5). API tối giản `{ value, onChange }`,
 * `value` giữ nguyên format `"YYYY-MM-DD"` (hoặc `""`) như state cha đang dùng.
 *
 * Không import `react-day-picker/style.css` — style 100% qua `classNames`/`components` (Tailwind
 * + biến CSS sẵn có), đúng nguyên tắc đã áp dụng cho Radix trong dự án.
 */

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
}

/** Parse `"YYYY-MM-DD"` -> `Date` local (KHÔNG dùng `new Date(string)` — hiểu chuỗi ISO là
 * UTC-midnight, có thể lệch ngày ở múi âm, xem mục 5 Edge Cases). Trả `undefined` nếu chuỗi rỗng,
 * sai định dạng, hoặc ngày không tồn tại thật (vd `"2026-02-31"` bị `Date` tự roll-over sang
 * tháng 3 — coi như hỏng, fallback rỗng thay vì hiển thị nhầm). */
function parseDateStr(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return undefined;
  return date;
}

/** Ngược lại: `Date` local -> `"YYYY-MM-DD"`, đọc `getFullYear/getMonth/getDate` (local), không
 * qua `toISOString()` (đó là UTC, có thể lệch ngày). */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function formatDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${mo}/${date.getFullYear()}`;
}

function todayStr(): string {
  return formatDateStr(new Date());
}

/** Header điều hướng tháng dùng lucide icon thay SVG mặc định — vẫn đi qua đúng cơ chế điều
 * hướng/focus có sẵn của react-day-picker (chỉ đổi icon hiển thị), không tự viết lại state
 * tháng/năm (mục 3.2, 4.2). */
function CustomChevron({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) {
  return orientation === 'right' ? (
    <ChevronRight className="icon" size={13} />
  ) : (
    <ChevronLeft className="icon" size={13} />
  );
}

/** Render số ngày + trạng thái selected/today/outside. Dùng inline `style` (không phải class có
 * thể bị cascade/specificity của class khác trong app đè, xem bài học Bug 1/3/4 ở
 * `docs/plan/radix-ui-migration-progress.md`) vì `classNames.selected/.today/.outside` của
 * react-day-picker chỉ áp được lên ô `<td>` cha, không áp trực tiếp lên `<button>` con — inline
 * style trên chính button là cách duy nhất chắc chắn không bị ghi đè bởi rule khác. Giữ nguyên
 * hành vi focus mặc định (auto-focus khi `modifiers.focused`) của `DayButton` gốc thư viện. */
function CustomDayButton({ day: _day, modifiers, children, style, ...rest }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const computedStyle: React.CSSProperties = { ...style };
  if (modifiers.selected) {
    computedStyle.background = 'var(--accent)';
    computedStyle.color = '#fff';
  } else if (modifiers.outside) {
    computedStyle.color = 'var(--text-dim)';
    computedStyle.opacity = 0.6;
  }

  return (
    <button ref={ref} style={computedStyle} {...rest}>
      <span className="relative flex h-full w-full items-center justify-center">
        {children}
        {modifiers.today && !modifiers.selected && (
          <span className="absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--accent)]" />
        )}
      </span>
    </button>
  );
}

function formatCaptionVi(month: Date): string {
  return `Tháng ${month.getMonth() + 1}, ${month.getFullYear()}`;
}

/** Tên thứ viết tắt kiểu VN "T2 T3 T4 T5 T6 T7 CN" (token `ccccc` = width "narrow" của date-fns,
 * cho đúng mảng `["CN","T2",...,"T7"]` — mặc định thư viện dùng width "short" ra "Th 2" không
 * khớp spec). */
function formatWeekdayNameVi(weekday: Date): string {
  return format(weekday, 'ccccc', { locale: vi });
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateStr(value);
  const display = selected ? formatDisplay(selected) : '';
  const triggerLabel = display ? `Ngày đã chọn: ${display}, bấm để đổi` : 'Chọn ngày';

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    onChange(formatDateStr(date));
    setOpen(false);
  }

  function handleToday() {
    onChange(todayStr());
    setOpen(false);
  }

  function handleClear() {
    onChange('');
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={triggerLabel}
          aria-label={triggerLabel}
          className="flex w-full items-center gap-2 rounded-[9px] border border-solid border-[color:var(--border)]
            bg-[var(--raised)] px-[11px] py-[9px] text-left text-[0.9375rem] text-[var(--text)] transition-colors
            duration-150 hover:border-[color:var(--accent)]"
        >
          <CalendarDays className="icon flex-none text-[var(--text-dim)]" size={15} />
          <span className={display ? '' : 'text-[var(--text-dim)]'}>{display || 'dd/mm/yyyy'}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="space-menu-surface z-[70] w-[296px]"
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={handleSelect}
            locale={vi}
            weekStartsOn={1}
            showOutsideDays
            formatters={{ formatCaption: formatCaptionVi, formatWeekdayName: formatWeekdayNameVi }}
            components={{ Chevron: CustomChevron, DayButton: CustomDayButton }}
            classNames={{
              months: 'flex flex-col',
              month: 'grid w-full grid-cols-[28px_1fr_28px] grid-rows-[auto_auto] items-center gap-y-1.5',
              button_previous: 'icon-btn col-start-1 row-start-1 justify-self-start',
              button_next: 'icon-btn col-start-3 row-start-1 justify-self-end',
              month_caption: 'col-start-2 row-start-1 flex items-center justify-center text-[0.875rem] font-semibold text-[var(--text)]',
              month_grid: 'col-span-3 row-start-2 w-full table-fixed border-collapse',
              weekdays: '',
              weekday: 'pb-1 text-[0.6875rem] font-semibold text-[var(--text-dim)]',
              day: 'p-[1px] text-center align-middle',
              day_button: 'flex h-9 w-9 items-center justify-center rounded-full text-[0.875rem] text-[var(--text)]'
                + ' transition-colors duration-150 hover:bg-[var(--raised)]',
            }}
          />
          <div className="mt-1.5 flex gap-2 border-t border-[color:var(--border)] pt-2">
            <button type="button" className="btn-ghost flex-1 !py-1 text-[0.8125rem]" onClick={handleToday}>
              Hôm nay
            </button>
            <button
              type="button"
              className="btn-ghost flex-1 !py-1 text-[0.8125rem]"
              disabled={!value}
              onClick={handleClear}
            >
              Xoá
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
