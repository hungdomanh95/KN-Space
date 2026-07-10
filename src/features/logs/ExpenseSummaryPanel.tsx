import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ban, ChevronDown, Lock } from 'lucide-react';
import type { LogEntry, SharedSpaceMember } from '../../types';
import { useAppState } from '../../state/AppStateContext';
import {
  ALL_CATEGORY_NAMES,
  categorizeContent,
  categoryColor,
  fmtVND,
  formatExpenseDateLabel,
  getExpenseAuthorLabel,
  getLogCategory,
  getLogExpenseDate,
  isDateInRange,
  isOwnExpenseLog,
  parseAmount,
} from './expenseUtils';
import type { ExpenseRange } from './expenseUtils';

interface ExpenseSummaryPanelProps {
  logs: LogEntry[];
  members: SharedSpaceMember[];
  currentUserId: string | null;
}

interface ComputedRow {
  log: LogEntry;
  amount: number | null;
  category: string;
}

interface AggRow {
  key: string;
  name: string;
  color: string;
  amount: number;
  count: number;
}

const RANGE_OPTIONS: { value: ExpenseRange; label: string }[] = [
  { value: 'week', label: '7 ngày qua' },
  { value: 'month', label: 'Tháng này' },
];

/** Radio value cho control gộp hạng mục + loại-khỏi-chi-tiêu (mục 3.4 tài liệu). */
const EXCLUDE_VALUE = 'exclude';
function categoryRadioValue(name: string): string {
  return `cat:${name}`;
}

/**
 * Control gộp: dropdown hạng mục + option cuối "Không tính là chi tiêu" — 1 control duy nhất
 * (mục 3.4 tài liệu, quyết định UX: gộp thay vì 2 control tách rời). Chỉ hiện cho log CỦA MÌNH.
 */
function OwnCategoryControl({ log }: { log: LogEntry }) {
  const { dispatch } = useAppState();
  const excluded = !!log.excluded;
  const category = getLogCategory(log);
  const value = excluded ? EXCLUDE_VALUE : categoryRadioValue(category);
  const color = categoryColor(category);

  function handleChange(v: string) {
    if (v === EXCLUDE_VALUE) {
      dispatch({ type: 'LOG_PATCH_EXPENSE', payload: { id: log.id, excluded: true } });
      return;
    }
    const catName = v.slice(4);
    const auto = categorizeContent(log.content);
    dispatch({
      type: 'LOG_PATCH_EXPENSE',
      payload: { id: log.id, categoryOverride: catName === auto ? null : catName, excluded: false },
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-[148px] flex-none items-center gap-1.5 rounded-md border border-[color:var(--border)]
            bg-[var(--panel-bg)] px-2 py-1.5 text-[0.75rem] font-semibold text-[var(--text)] transition-colors
            duration-150 hover:border-[color:var(--accent)]"
          aria-label={`Sửa hạng mục hoặc loại khỏi chi tiêu cho log: "${log.content.slice(0, 40)}"`}
        >
          {excluded ? (
            <Ban className="icon h-3 w-3 flex-none text-[var(--text-dim)]" size={12} />
          ) : (
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
          )}
          <span className={`min-w-0 flex-1 truncate text-left ${excluded ? 'text-[var(--text-dim)]' : ''}`}>
            {excluded ? 'Không tính' : category}
          </span>
          <ChevronDown className="icon h-[10px] w-[10px] flex-none text-[var(--text-dim)]" size={10} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="space-menu-surface" style={{ minWidth: 190 }}>
          <DropdownMenu.RadioGroup value={value} onValueChange={handleChange}>
            {ALL_CATEGORY_NAMES.map((name) => (
              <DropdownMenu.RadioItem
                key={name}
                value={categoryRadioValue(name)}
                className="space-menu-item data-[state=checked]:font-bold data-[state=checked]:text-[var(--accent)]"
              >
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: categoryColor(name) }} />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
              </DropdownMenu.RadioItem>
            ))}
            <div className="my-1 h-px bg-[var(--border)]" />
            <DropdownMenu.RadioItem
              value={EXCLUDE_VALUE}
              className="space-menu-item data-[state=checked]:font-bold data-[state=checked]:text-[var(--text)]"
            >
              <Ban className="icon h-3 w-3 flex-none text-[var(--text-dim)]" size={12} />
              <span>Không tính là chi tiêu</span>
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Log của người khác — pill chỉ đọc, cùng bề rộng cố định 148px để cột luôn thẳng hàng (mục 3.4). */
function ReadonlyCategoryPill({ log, authorName }: { log: LogEntry; authorName: string }) {
  const category = getLogCategory(log);
  const color = categoryColor(category);
  return (
    <span
      className="flex w-[148px] flex-none items-center gap-1.5 rounded-full border border-[color:var(--border)]
        bg-[var(--panel-bg)] px-2.5 py-1.5 text-[0.75rem] font-semibold"
      style={{ color }}
      title={`Chỉ ${authorName} mới sửa được log này`}
    >
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-left">{category}</span>
      <Lock className="icon h-[11px] w-[11px] flex-none text-[var(--text-dim)]" size={11} />
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="hint px-1.5 py-1.5">{text}</p>;
}

export function ExpenseSummaryPanel({ logs, members, currentUserId }: ExpenseSummaryPanelProps) {
  const { dispatch } = useAppState();
  const [range, setRange] = useState<ExpenseRange>('month');
  const [activeDrillCategory, setActiveDrillCategory] = useState<string | null>(null);

  const rowsInRange = useMemo(
    () => logs.filter((l) => isDateInRange(getLogExpenseDate(l), range)),
    [logs, range],
  );

  const computed: ComputedRow[] = useMemo(
    () =>
      rowsInRange
        .map((log) => ({ log, amount: parseAmount(log.content), category: getLogCategory(log) }))
        .sort((a, b) => {
          const dateCmp = getLogExpenseDate(b.log).localeCompare(getLogExpenseDate(a.log));
          return dateCmp !== 0 ? dateCmp : b.log.createdAt.localeCompare(a.log.createdAt);
        }),
    [rowsInRange],
  );

  const withAmount = useMemo(() => computed.filter((r) => r.amount !== null), [computed]);
  const parsed = useMemo(() => withAmount.filter((r) => !r.log.excluded), [withAmount]);
  const excludedRows = useMemo(() => withAmount.filter((r) => r.log.excluded), [withAmount]);
  const unparsed = useMemo(() => computed.filter((r) => r.amount === null), [computed]);
  const total = useMemo(() => parsed.reduce((sum, r) => sum + (r.amount ?? 0), 0), [parsed]);

  const byCategory: AggRow[] = useMemo(() => {
    const map = new Map<string, AggRow>();
    parsed.forEach((r) => {
      const cur = map.get(r.category) ?? { key: r.category, name: r.category, color: categoryColor(r.category), amount: 0, count: 0 };
      cur.amount += r.amount ?? 0;
      cur.count += 1;
      map.set(r.category, cur);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [parsed]);

  const byDay: AggRow[] = useMemo(() => {
    const map = new Map<string, AggRow>();
    parsed.forEach((r) => {
      const key = getLogExpenseDate(r.log);
      const cur = map.get(key) ?? { key, name: formatExpenseDateLabel(key), color: '', amount: 0, count: 0 };
      cur.amount += r.amount ?? 0;
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [parsed]);

  const byMember: AggRow[] = useMemo(() => {
    const map = new Map<string, AggRow>();
    parsed.forEach((r) => {
      // Gộp về CHUNG 1 nhóm "Bạn" cho cả 2 trường hợp: log không set createdBy (Space cá nhân)
      // VÀ log set createdBy === currentUserId (Shared Space, log của chính mình) — nếu không sẽ
      // tách nhầm log của cùng 1 người thành 2 dòng khác nhau trong bảng.
      const key = !r.log.createdBy || r.log.createdBy === currentUserId ? '__self__' : r.log.createdBy;
      const author = getExpenseAuthorLabel(r.log.createdBy, members, currentUserId);
      const cur = map.get(key) ?? { key, name: author.name, color: author.color, amount: 0, count: 0 };
      cur.amount += r.amount ?? 0;
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [parsed, members, currentUserId]);

  const drillItems = useMemo(
    () => withAmount.filter((r) => r.category === activeDrillCategory),
    [withAmount, activeDrillCategory],
  );

  function handleRestore(id: string) {
    dispatch({ type: 'LOG_PATCH_EXPENSE', payload: { id, excluded: false } });
  }

  const maxCategoryAmount = byCategory[0]?.amount || 1;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="segmented-options" role="group" aria-label="Chọn khoảng thời gian Tổng hợp">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.value === range ? 'active' : ''}
            aria-pressed={o.value === range}
            onClick={() => {
              setRange(o.value);
              setActiveDrillCategory(null);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[10px] border border-[color:var(--border-hairline)] bg-[var(--raised)] px-3.5 py-3">
          <div className="text-[0.6875rem] font-bold uppercase tracking-[.04em] text-[var(--text-dim)]">Tổng chi</div>
          <div className="mt-1 text-[1.25rem] font-bold tracking-[-.01em] [font-variant-numeric:tabular-nums]">{fmtVND(total)}</div>
        </div>
        <div className="rounded-[10px] border border-[color:var(--border-hairline)] bg-[var(--raised)] px-3.5 py-3">
          <div className="text-[0.6875rem] font-bold uppercase tracking-[.04em] text-[var(--text-dim)]">Giao dịch</div>
          <div className="mt-1 text-[1.25rem] font-bold tracking-[-.01em] [font-variant-numeric:tabular-nums]">{parsed.length}</div>
        </div>
        <div className="rounded-[10px] border border-[color:var(--border-hairline)] bg-[var(--raised)] px-3.5 py-3">
          <div className="text-[0.6875rem] font-bold uppercase tracking-[.04em] text-[var(--text-dim)]">Chưa xác định</div>
          <div className="mt-1 text-[1.25rem] font-bold tracking-[-.01em] text-[var(--amber)] [font-variant-numeric:tabular-nums]">
            {unparsed.length}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[0.75rem] font-bold uppercase tracking-[.05em] text-[var(--text-dim)]">
          Theo hạng mục — bấm 1 dòng để xem chi tiết
        </h3>
        {byCategory.length === 0 ? (
          <EmptyRow text="Chưa có dữ liệu." />
        ) : (
          <div className="flex flex-col">
            {byCategory.map((c) => {
              const active = activeDrillCategory === c.name;
              const pct = Math.round((c.amount / maxCategoryAmount) * 100);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-expanded={active}
                  onClick={() => setActiveDrillCategory(active ? null : c.name)}
                  className={`grid w-full grid-cols-[10px_1fr_auto_auto] items-center gap-x-2.5 gap-y-1 rounded-lg px-1.5
                    py-1.5 text-left transition-colors duration-150 hover:bg-[var(--raised)]
                    ${active ? 'bg-[rgba(var(--accent-rgb),.08)]' : ''}`.trim()}
                >
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: c.color }} />
                  <span className="min-w-0 truncate text-[0.8438rem] font-semibold">{c.name}</span>
                  <span className="whitespace-nowrap text-[0.75rem] text-[var(--text-dim)]">{c.count} giao dịch</span>
                  <span className="whitespace-nowrap text-right text-[0.8438rem] font-bold [font-variant-numeric:tabular-nums]">
                    {fmtVND(c.amount)}
                  </span>
                  <span className="col-span-4 mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--border-hairline)]">
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeDrillCategory && (
          <div className="mt-1.5 flex flex-col rounded-[10px] border border-[color:var(--border-hairline)] bg-[var(--raised)] px-3 py-2">
            <div className="mb-1 text-[0.75rem] font-bold text-[var(--text-dim)]">
              Chi tiết &quot;{activeDrillCategory}&quot; ({drillItems.length} log)
            </div>
            {drillItems.map((r) => {
              const isOwn = isOwnExpenseLog(r.log, currentUserId);
              const author = getExpenseAuthorLabel(r.log.createdBy, members, currentUserId);
              const dateLabel = formatExpenseDateLabel(getLogExpenseDate(r.log));
              return (
                <div
                  key={r.log.id}
                  className={`grid grid-cols-[1fr_auto_148px] items-center gap-x-3 border-b border-[color:var(--border-hairline)]
                    py-2 text-[0.8125rem] last:border-b-0 ${r.log.excluded ? 'opacity-50' : ''}`.trim()}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[0.6875rem] text-[var(--text-dim)]">
                      {dateLabel}
                      {!isOwn && (
                        <>
                          {' · '}
                          <span className="font-bold" style={{ color: author.color }}>
                            {author.name}
                          </span>
                        </>
                      )}
                    </span>
                    <span className={`break-words leading-[1.4] ${r.log.excluded ? 'line-through' : ''}`}>
                      {r.log.content}
                      {r.log.categoryOverride && (
                        <span className="ml-1.5 whitespace-nowrap rounded-[5px] bg-[rgba(var(--accent-rgb),.14)] px-[5px] py-px text-[0.625rem] font-bold text-[var(--accent)]">
                          đã sửa
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right font-bold [font-variant-numeric:tabular-nums]">{fmtVND(r.amount!)}</span>
                  {isOwn ? <OwnCategoryControl log={r.log} /> : <ReadonlyCategoryPill log={r.log} authorName={author.name} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[0.75rem] font-bold uppercase tracking-[.05em] text-[var(--text-dim)]">Theo ngày</h3>
        {byDay.length === 0 ? (
          <EmptyRow text="Chưa có dữ liệu." />
        ) : (
          <div className="flex flex-col">
            {byDay.map((d) => (
              <div key={d.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2.5 px-1.5 py-1.5 text-[0.8438rem]">
                <span className="truncate font-semibold">{d.name}</span>
                <span className="whitespace-nowrap text-[0.75rem] text-[var(--text-dim)]">{d.count} giao dịch</span>
                <span className="whitespace-nowrap text-right font-bold [font-variant-numeric:tabular-nums]">{fmtVND(d.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[0.75rem] font-bold uppercase tracking-[.05em] text-[var(--text-dim)]">Theo người ghi</h3>
        {byMember.length === 0 ? (
          <EmptyRow text="Chưa có dữ liệu." />
        ) : (
          <div className="flex flex-col">
            {byMember.map((m) => (
              <div key={m.key} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-x-2.5 px-1.5 py-1.5 text-[0.8438rem]">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: m.color }} />
                <span className="truncate font-semibold">{m.name}</span>
                <span className="whitespace-nowrap text-[0.75rem] text-[var(--text-dim)]">{m.count} giao dịch</span>
                <span className="whitespace-nowrap text-right font-bold [font-variant-numeric:tabular-nums]">{fmtVND(m.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--raised)] px-3 py-2.5">
        <h3 className="mb-1.5 text-[0.75rem] font-bold text-[var(--text-dim)]">Log chưa xác định được số tiền</h3>
        {unparsed.length === 0 ? (
          <p className="py-[3px] text-[0.8125rem] text-[var(--text-dim)]">Không có log nào bị bỏ sót.</p>
        ) : (
          unparsed.map((r) => (
            <div key={r.log.id} className="py-[3px] text-[0.8125rem] text-[var(--text-dim)]">
              {formatExpenseDateLabel(getLogExpenseDate(r.log))} — <span className="font-semibold text-[var(--text)]">{r.log.content}</span>
            </div>
          ))
        )}
      </div>

      <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--raised)] px-3 py-2.5">
        <h3 className="mb-1.5 text-[0.75rem] font-bold text-[var(--text-dim)]">Đã loại khỏi chi tiêu</h3>
        {excludedRows.length === 0 ? (
          <p className="py-[3px] text-[0.8125rem] text-[var(--text-dim)]">Chưa loại log nào.</p>
        ) : (
          excludedRows.map((r) => (
            <div key={r.log.id} className="flex items-center gap-2 py-[3px] text-[0.8125rem] text-[var(--text-dim)]">
              <span className="min-w-0 flex-1 truncate">
                {formatExpenseDateLabel(getLogExpenseDate(r.log))} · {r.log.content}
              </span>
              <span className="flex-none [font-variant-numeric:tabular-nums]">{fmtVND(r.amount!)}</span>
              {isOwnExpenseLog(r.log, currentUserId) && (
                <button
                  type="button"
                  className="flex-none text-[0.75rem] font-bold text-[var(--accent)]"
                  onClick={() => handleRestore(r.log.id)}
                >
                  Hoàn tác
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <p className="hint pb-2 text-center">Số liệu theo dữ liệu đã tải — tải lại trang để cập nhật mới nhất.</p>
    </div>
  );
}
