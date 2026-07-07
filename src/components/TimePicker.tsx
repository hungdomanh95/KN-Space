import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Clock } from 'lucide-react';

/**
 * TimePicker tuỳ biến thay thế `<input type="time">` — xem spec đầy đủ ở
 * `docs/features/date-time-picker.md` (mục 3.3-3.4, 4, 5). API tối giản `{ value, onChange }`,
 * `value` giữ nguyên format `"HH:MM"` (hoặc `""`) như state cha đang dùng.
 *
 * Phần 2 cột giờ/phút cuộn là phần DUY NHẤT trong bộ DatePicker/TimePicker tự viết tay accessibility
 * (react-day-picker/Radix Popover lo phần còn lại) — xem mục 4.2.
 */

interface TimePickerProps {
  value: string;
  onChange: (v: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** `"HH:MM"` hợp lệ (giờ 00-23, phút 00-59) — dữ liệu hỏng/méo (mục 5 Edge Cases) coi như rỗng. */
function isValidTimeStr(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function currentHourStr(): string {
  return String(new Date().getHours()).padStart(2, '0');
}

/** 1 cột cuộn (Giờ hoặc Phút) — `role="listbox"` + `role="option"` tự viết tay, roving tabIndex,
 * ArrowUp/ArrowDown di chuyển focus trong cột, Enter/Space chọn (mục 4.2). `scrollTarget` khác
 * `selected`: dùng làm vị trí cuộn/focus ban đầu khi mở popover (kể cả khi chưa có `selected` nào —
 * mục 3.4, không tự gán giá trị, chỉ định vị cuộn). */
function TimeColumn({
  label,
  options,
  selected,
  scrollTarget,
  onPick,
}: {
  label: string;
  options: string[];
  selected: string | null;
  scrollTarget: string;
  onPick: (v: string) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialIndex = Math.max(options.indexOf(scrollTarget), 0);
  const [focusIndex, setFocusIndex] = useState(initialIndex);

  useEffect(() => {
    itemRefs.current[initialIndex]?.scrollIntoView({ block: 'center' });
    // Chỉ chạy 1 lần lúc mount (mỗi lần popover mở là 1 instance mới, xem DatePicker/TimePicker
    // không giữ mounted khi đóng — Radix Popover.Content mặc định unmount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveFocus(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), options.length - 1);
    setFocusIndex(clamped);
    itemRefs.current[clamped]?.focus();
    itemRefs.current[clamped]?.scrollIntoView({ block: 'nearest' });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(focusIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(focusIndex - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(options[focusIndex]);
    }
  }

  return (
    <div
      role="listbox"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="flex max-h-[200px] w-[64px] flex-col gap-0.5 overflow-y-auto"
    >
      {options.map((opt, i) => {
        const isSelected = opt === selected;
        return (
          <button
            key={opt}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={i === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(i)}
            onClick={() => {
              setFocusIndex(i);
              onPick(opt);
            }}
            className={`flex h-8 w-full flex-none items-center justify-center rounded-[6px] text-[0.875rem]
              transition-colors duration-150 ${
                isSelected ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)] hover:bg-[var(--raised)]'
              }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const valid = isValidTimeStr(value);
  const display = valid ? value : '';
  const triggerLabel = display ? `Giờ đã chọn: ${display}, bấm để đổi` : 'Chọn giờ';

  const parsedHour = valid ? value.slice(0, 2) : null;
  const parsedMinute = valid ? value.slice(3, 5) : null;
  const selectedMinute = parsedMinute && MINUTES.includes(parsedMinute) ? parsedMinute : null;

  function handlePickHour(h: string) {
    onChange(`${h}:${parsedMinute ?? '00'}`);
  }

  function handlePickMinute(m: string) {
    onChange(`${parsedHour ?? currentHourStr()}:${m}`);
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
          <Clock className="icon flex-none text-[var(--text-dim)]" size={15} />
          <span className={display ? '' : 'text-[var(--text-dim)]'}>{display || '--:--'}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="space-menu-surface z-[70] w-[160px] min-w-[160px]"
        >
          <div className="flex items-start justify-center gap-1">
            <TimeColumn
              label="Giờ"
              options={HOURS}
              selected={parsedHour}
              scrollTarget={parsedHour ?? currentHourStr()}
              onPick={handlePickHour}
            />
            <span className="pt-2 text-[0.9375rem] font-semibold text-[var(--text-dim)]">:</span>
            <TimeColumn
              label="Phút"
              options={MINUTES}
              selected={selectedMinute}
              scrollTarget={selectedMinute ?? '00'}
              onPick={handlePickMinute}
            />
          </div>
          <div className="mt-2 flex gap-2 border-t border-[color:var(--border)] pt-2">
            <button type="button" className="btn-ghost flex-1 !py-1 text-[0.8125rem]" onClick={() => setOpen(false)}>
              Xong
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
