import { useEffect, useState } from 'react';
import { ChevronsDown } from 'lucide-react';
import { formatGreeting, formatHomeClock, formatHomeDate, todayQuote } from './homeContent';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';

interface HomeScreenProps {
  onEnterDashboard: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Màn Home (Tabliss-style): đồng hồ real-time + ngày + lời chào theo buổi + 1 quote/ngày. */
export function HomeScreen({ onEnterDashboard }: HomeScreenProps) {
  const { state } = useAppState();
  const space = useCurrentSpace();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = formatHomeClock(now);
  const today = todayStr();
  const taskCount = space.tasks.filter((t) => t.date === today && !t.done).length;

  // Crossfade khi đổi quote (fade-out ngắn rồi fade-in, không đổi tức thì — mục 4.5/7
  // requirements): giữ `displayedQuote` tách khỏi giá trị mới nhất, chỉ cập nhật SAU khi đã
  // fade-out xong (qua timeout khớp đúng thời lượng CSS `.home-quote.fading`).
  const currentQuoteText = todayQuote(state.settings.homeQuotes);
  const [displayedQuote, setDisplayedQuote] = useState(currentQuoteText);
  const [quoteFading, setQuoteFading] = useState(false);

  useEffect(() => {
    if (currentQuoteText === displayedQuote) return;
    setQuoteFading(true);
    const timer = setTimeout(() => {
      setDisplayedQuote(currentQuoteText);
      setQuoteFading(false);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuoteText]);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-white"
      role="region"
      aria-label="Màn hình Home"
    >
      {/* Giảm lần 1 (0.30/0.14/0.46 -> 0.16/0.07/0.24) vẫn còn thấy chênh sáng/tối rõ so với
          Dashboard (không có lớp phủ này) — giảm tiếp gần như bỏ hẳn ở vùng trên/giữa, chỉ giữ
          chút ở đáy (chỗ nút "Vào Dashboard" + nguồn quote cần contrast). text-shadow riêng
          trên chữ (dòng dưới) đã đủ gánh phần contrast chính cho đồng hồ/quote. */}
      <div
        className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,.04)_0%,rgba(0,0,0,.02)_50%,rgba(0,0,0,.16)_100%)]"
        aria-hidden="true"
      />
      <div className="relative z-[2] flex flex-col items-center gap-1.5 px-6 text-center [text-shadow:0_2px_12px_rgba(0,0,0,.45),0_1px_2px_rgba(0,0,0,.4)]">
        <div
          className="text-[clamp(64px,13vw,150px)] font-light leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
          aria-live="off"
        >
          {clock.hh}:{clock.mm}
          <span className="ml-[.1em] align-super text-[.42em] font-normal opacity-80">{clock.ss}</span>
        </div>
        <div className="mt-1.5 text-[clamp(15px,2vw,20px)] font-medium opacity-[.92]">{formatHomeDate(now)}</div>
        <div className="mt-[22px] text-[clamp(20px,3vw,30px)] font-semibold">{formatGreeting(now)}</div>
        <div
          className={`mt-3.5 max-w-[620px] text-[clamp(14px,1.7vw,18px)] font-normal italic leading-[1.55] opacity-90 transition-opacity duration-200 [transition-timing-function:var(--ease-standard)] ${
            quoteFading ? 'opacity-0 duration-150' : ''
          }`}
        >
          {displayedQuote}
        </div>
      </div>
      <div className="relative z-[2] mt-16 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onEnterDashboard}
          aria-label="Vào Dashboard"
          className="-mx-4 -mt-[10px] -mb-[10px] flex flex-col items-center gap-1.5 px-4 py-[10px] text-white transition-opacity duration-150 [transition-timing-function:var(--ease-standard)] hover:opacity-[.82] focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          {/* strokeWidth 1.7 (thay vì mặc định 2) — nét icon mảnh hơn, hợp icon lớn 26px đứng
              một mình giữa nền ảnh; size=17 chỉ set kích thước viewBox nội bộ, w/h thật do
              class Tailwind h-[26px]/w-[26px] quyết định (mục S3, docs/features/ui-audit-2026-07.md). */}
          <ChevronsDown className="icon h-[26px] w-[26px] animate-homeEnterBounce" strokeWidth={1.7} size={17} />
          <span className="text-[0.7188rem] font-semibold uppercase tracking-[.08em] opacity-75">Vào Dashboard</span>
        </button>
      </div>
      {taskCount > 0 && (
        <div className="absolute bottom-[18px] right-[18px] z-[3] max-w-[280px] text-right text-[clamp(11px,1.1vw,12.5px)] font-normal tracking-[.01em] opacity-[.58]">
          {taskCount} việc cần làm hôm nay
        </div>
      )}
    </div>
  );
}
