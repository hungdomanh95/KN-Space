import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatGreeting, formatHomeClock, formatHomeDate, todayQuote } from './homeContent';

interface HomeScreenProps {
  onEnterDashboard: () => void;
}

/** Màn Home (Tabliss-style): đồng hồ real-time + ngày + lời chào theo buổi + 1 quote/ngày. */
export function HomeScreen({ onEnterDashboard }: HomeScreenProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = formatHomeClock(now);

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
        <div className="home-quote">{todayQuote()}</div>
      </div>
      <button id="home-enter-btn" type="button" onClick={onEnterDashboard} aria-label="Vào Dashboard">
        <span>Vào Dashboard</span>
        <ArrowRight className="icon" size={17} />
      </button>
    </div>
  );
}
