import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { ConfirmProvider } from './components/ConfirmContext';
import { TopBar } from './components/TopBar';
import { AppLayout } from './layout/AppLayout';
import { AppBackground } from './components/AppBackground';
import { HomeScreen } from './features/home/HomeScreen';

/** true nếu đang có modal `.overlay` mở trên trang — dùng để không "nuốt" phím Enter/Space/Esc. */
function isAnyModalOpen(): boolean {
  return document.querySelector('.overlay') !== null;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function Shell() {
  const { state, dispatch, isLoading } = useAppState();
  const { settings, storageFallbackActive } = state;
  const currentScreen = state.ui.currentScreen;

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accent);
    // Nhiều style dùng rgba(var(--accent-rgb),alpha) (scrollbar, focus ring, filter-tabs...) —
    // phải tính lại --accent-rgb mỗi khi đổi accent, không thì các hiệu ứng đó vẫn giữ màu mặc định.
    const hex = settings.accent.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
    }
  }, [settings.accent]);

  // Phím tắt ngầm: Enter/Space ở Home -> Dashboard; Esc ở Dashboard -> Home.
  // Không hoạt động khi đang gõ trong input/textarea/select hoặc có modal mở.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (isAnyModalOpen()) return; // để Esc đóng modal nếu lỡ mở, không bị màn Home/Dashboard chặn trước
      if (currentScreen === 'home') {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'dashboard' } });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'home' } });
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentScreen, dispatch]);

  // Tự động đổi ảnh nền theo khoảng thời gian đã chọn (0 = tắt). Đọc index/total mới
  // nhất qua dispatch thunk-style (callback nhận state hiện tại từ closure ngoài effect
  // không khả thi với useReducer thuần) — dùng action riêng để reducer tự +1 modulo,
  // tránh phải đưa `index` vào dependency (sẽ làm setInterval bị tái tạo liên tục).
  useEffect(() => {
    const ms = settings.homeBackground.autoRotateMs;
    if (!ms) return;
    const timer = setInterval(() => {
      dispatch({ type: 'SETTINGS_HOME_BG_ROTATE_NEXT' });
    }, ms);
    return () => clearInterval(timer);
  }, [settings.homeBackground.autoRotateMs, dispatch]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
        Đang tải dữ liệu...
      </div>
    );
  }

  const imageUrl = settings.homeBackground.images[settings.homeBackground.index] ?? '';

  return (
    <>
      <AppBackground imageUrl={imageUrl} imageIndex={settings.homeBackground.index} />
      <div className={`home-layer ${currentScreen === 'dashboard' ? 'screen-hidden' : ''}`}>
        <HomeScreen onEnterDashboard={() => dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'dashboard' } })} />
      </div>
      <div className={`dashboard-layer ${currentScreen === 'home' ? 'screen-hidden' : ''}`}>
        {storageFallbackActive && (
          <div className="fallback-banner">
            <AlertTriangle className="icon" size={15} />
            <span>
              Dữ liệu đã vượt giới hạn đồng bộ Chrome (chrome.storage.sync), nên một phần dữ liệu chỉ lưu cục bộ trên máy
              này (chrome.storage.local) và sẽ KHÔNG đồng bộ sang máy khác. Hãy cân nhắc giảm dữ liệu hoặc export backup
              định kỳ.
            </span>
          </div>
        )}
        <TopBar onGoHome={() => dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'home' } })} />
        <AppLayout />
      </div>
    </>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </AppStateProvider>
  );
}
