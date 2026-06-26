import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { ConfirmProvider } from './components/ConfirmContext';
import { AppLayout } from './layout/AppLayout';
import { AppBackground } from './components/AppBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { isMacPlatform } from './features/spaces/spaceShortcuts';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './auth/LoginScreen';

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

  function goHome() {
    // 'onopen': đổi quote mỗi lần quay lại Home (port từ goToHome() trong mockup).
    if (settings.homeQuotes.rotateMode === 'onopen') {
      dispatch({ type: 'SETTINGS_HOME_QUOTE_ROTATE_NEXT' });
    }
    dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'home' } });
  }

  // Phím tắt ngầm: Enter/Space ở Home -> Dashboard (đổi quote nếu rotateMode === 'onopen');
  // Esc ở Dashboard -> Home. Không hoạt động khi đang gõ trong input/textarea/select hoặc có modal mở.
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
        goHome();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen, dispatch]);

  // Phím tắt đổi nhanh Space: Alt+1..9 (Win/Linux) hoặc Cmd+1..9 (Mac) — chỉ hoạt động khi
  // không đang gõ input/textarea/select và không có modal mở (mục 4.1/6 requirements).
  useEffect(() => {
    function handleSpaceShortcut(e: KeyboardEvent) {
      const wantMac = isMacPlatform();
      const modifierOk = wantMac ? e.metaKey : e.altKey;
      if (!modifierOk) return;
      if (!/^[1-9]$/.test(e.key)) return;
      if (isTypingTarget(e.target)) return;
      if (isAnyModalOpen()) return;
      const idx = Number(e.key) - 1;
      const orderedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);
      if (idx >= orderedSpaces.length) return;
      e.preventDefault();
      dispatch({ type: 'SPACE_SWITCH', payload: { id: orderedSpaces[idx].id } });
    }
    document.addEventListener('keydown', handleSpaceShortcut);
    return () => document.removeEventListener('keydown', handleSpaceShortcut);
  }, [state.spaces, dispatch]);

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

  // Tự động đổi quote Home theo `rotateMode` — chỉ 'every15m'/'every1h' cần interval cố định
  // (không phụ thuộc reload trang); 'daily' đã cố định theo dayIndex lúc seed, 'onopen' đổi
  // ngay khi điều hướng vào Home (xem dưới).
  useEffect(() => {
    const mode = settings.homeQuotes.rotateMode;
    const ms = mode === 'every15m' ? 900_000 : mode === 'every1h' ? 3_600_000 : 0;
    if (!ms) return;
    const timer = setInterval(() => {
      dispatch({ type: 'SETTINGS_HOME_QUOTE_ROTATE_NEXT' });
    }, ms);
    return () => clearInterval(timer);
  }, [settings.homeQuotes.rotateMode, dispatch]);

  function enterDashboard() {
    dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'dashboard' } });
  }

  if (isLoading) {
    return <LoadingScreen message="Đang tải dữ liệu..." />;
  }

  const imageUrl = settings.homeBackground.images[settings.homeBackground.index]?.value ?? '';

  return (
    <>
      <AppBackground imageUrl={imageUrl} imageIndex={settings.homeBackground.index} />
      {/* duration giảm 450ms -> 200ms + will-change: opacity — cardstyle desktop (.main-block/
          .sub-block/DashboardCorner) dùng backdrop-filter blur, animate opacity của 1 container
          fixed chứa hàng loạt layer blur này khá nặng cho trình duyệt vẽ lại mỗi frame, gây
          giật/lag rõ khi bấm Esc đổi màn nhanh (đã gặp khi test). will-change báo trước cho
          trình duyệt chuẩn bị compositing layer, 200ms thu ngắn khoảng thời gian phải vẽ lại. */}
      <div
        className={`fixed inset-0 visible opacity-100 transition-[opacity,visibility] duration-200 ease-out [will-change:opacity] ${
          currentScreen === 'dashboard' ? 'invisible opacity-0 pointer-events-none' : ''
        }`}
      >
        <HomeScreen onEnterDashboard={enterDashboard} />
      </div>
      <div
        className={`fixed inset-0 flex min-h-0 flex-col visible opacity-100 transition-[opacity,visibility] duration-200 ease-out [will-change:opacity] ${
          currentScreen === 'home' ? 'invisible opacity-0 pointer-events-none' : ''
        }`}
      >
        {storageFallbackActive && (
          <div className="fixed bottom-[14px] right-[14px] z-[80] flex max-w-[360px] items-start gap-2 rounded-xl border border-[color:var(--reminder-color)] bg-[var(--modal-bg)] px-[14px] py-3 text-[0.8125rem] text-[var(--text)] shadow-[var(--shadow)]">
            <AlertTriangle className="icon mt-px flex-none text-[var(--reminder-color)]" size={15} />
            <span>
              Lưu thay đổi gần nhất lên máy chủ chưa thành công (có thể do mất mạng). Dữ liệu vẫn còn trên màn hình này,
              nhưng chưa đồng bộ sang máy khác — hãy kiểm tra kết nối mạng, ứng dụng sẽ tự thử lưu lại ở lần sửa kế tiếp.
            </span>
          </div>
        )}
        <AppLayout onGoHome={goHome} />
      </div>
    </>
  );
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Đang kiểm tra đăng nhập..." />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <AppStateProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </AppStateProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
