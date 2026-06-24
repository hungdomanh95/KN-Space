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
    <div className="home-screen" role="region" aria-label="Màn hình Home">
      <div className="home-overlay" aria-hidden="true" />
      <div className="home-content">
        <div className="home-clock" aria-live="off">
          {clock.hh}:{clock.mm}
          <span className="sec">{clock.ss}</span>
        </div>
        <div className="home-date">{formatHomeDate(now)}</div>
        <div className="home-greeting">{formatGreeting(now)}</div>
        <div className={`home-quote ${quoteFading ? 'fading' : ''}`.trim()}>{displayedQuote}</div>
      </div>
      <div className="home-enter-wrap">
        <button id="home-enter-btn" type="button" onClick={onEnterDashboard} aria-label="Vào Dashboard">
          <ChevronsDown className="icon" size={17} />
          <span className="home-enter-caption">Vào Dashboard</span>
        </button>
      </div>
      {taskCount > 0 && <div id="home-today-hint">{taskCount} việc cần làm hôm nay</div>}
    </div>
  );
}
