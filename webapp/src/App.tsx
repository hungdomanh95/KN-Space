import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { ConfirmProvider } from './components/ConfirmContext';
import { AppLayout } from './layout/AppLayout';
import { useMobileLayout } from './layout/useMobileLayout';
import { AppBackground } from './components/AppBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { isMacPlatform } from './features/spaces/spaceShortcuts';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './auth/LoginScreen';
import { JoinSpacePage, readInviteTokenFromUrl, PENDING_INVITE_KEY } from './pages/JoinSpacePage';
import type { Space } from './types';

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
  // Mobile bỏ hẳn màn Home — Chat (trong AppLayout) là màn chính, không qua bước xem
  // đồng hồ/quote/ảnh nền trước nữa (đã chốt với chủ dự án).
  const isMobile = useMobileLayout();

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
      if (isMobile) return; // không còn màn Home trên mobile — phím tắt này vô nghĩa
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
  }, [currentScreen, dispatch, isMobile]);

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
      {/* Mobile: bỏ hẳn màn Home, luôn vào AppLayout (Chat là tab mặc định trong đó) — không
          cần animate/toggle gì cả. Desktop: giữ nguyên cơ chế crossfade Home<->Dashboard.
          Giảm duration vẫn không hết giật trên desktop — vì các card (.main-block/.sub-block/
          DashboardCorner) dùng backdrop-filter blur, ANIMATE OPACITY của khối chứa hàng loạt
          layer blur này luôn nặng bất kể duration ngắn/dài (trình duyệt phải vẽ lại blur ở MỌI
          frame trong suốt animation). Đổi chiến lược: bỏ animation hẳn ở chiều ẨN ĐI (Dashboard
          biến mất NGAY, không có gì để vẽ lại) — chỉ còn fade-in ở chiều XUẤT HIỆN (Home không
          có blur nên fade-in vẫn nhẹ, mượt). Bấm Esc giờ không phải vẽ lại blur lúc fade nữa.

          ĐÃ THỬ co/khoá chiều cao khung này bằng JS (window.innerHeight/visualViewport) qua vài
          vòng — không hiệu quả nhất quán trên thiết bị thật (có lúc còn tệ hơn, ẩn mất cả input
          lẫn thanh điều hướng). Trả về `inset-0` thuần, đơn giản nhất — xử lý zoom triệt để bằng
          cách chặn hẳn ở viewport meta (index.html: maximum-scale=1, user-scalable=no) thay vì
          vá layout bằng JS không kiểm chứng được trên máy thật. */}
      {!isMobile && (
        <div
          className={`fixed inset-0 ${
            currentScreen === 'home'
              ? 'visible opacity-100 transition-opacity duration-200 ease-out [will-change:opacity]'
              : 'invisible opacity-0 pointer-events-none transition-none'
          }`}
        >
          <HomeScreen onEnterDashboard={enterDashboard} />
        </div>
      )}
      <div
        className={`fixed inset-0 flex min-h-0 flex-col ${
          isMobile || currentScreen === 'dashboard'
            ? 'visible opacity-100 transition-opacity duration-200 ease-out [will-change:opacity]'
            : 'invisible opacity-0 pointer-events-none transition-none'
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

// ---------------------------------------------------------------------------
// JoinGate — xử lý /join?token= flow bọc ngoài AppStateProvider
// ---------------------------------------------------------------------------
// Lý do tách riêng thay vì gộp vào Shell: JoinSpacePage cần render TRƯỚC khi
// AppStateProvider load dữ liệu (để tránh flash app chính), nhưng lại cần
// dispatch sau khi join xong (nên vẫn phải nằm trong AppStateProvider).
// Giải pháp: render JoinSpacePage cùng cấp AppStateProvider, chỉ mount
// AppStateProvider 1 lần, nhưng render JoinSpacePage đè lên Shell.

function AppWithJoin({ initialToken }: { initialToken: string | null }) {
  const [joinToken, setJoinToken] = useState<string | null>(initialToken);
  const [pendingSpace, setPendingSpace] = useState<Space | null>(null);

  function handleJoined(space: Space) {
    setPendingSpace(space);
    setJoinToken(null); // ẩn JoinSpacePage, hiện Shell
  }

  function handleCancelJoin() {
    setJoinToken(null);
    // Xoá token sessionStorage phòng case lỗi nhưng user bấm "Về trang chủ"
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  }

  if (joinToken) {
    return (
      <JoinSpacePage
        token={joinToken}
        onJoined={handleJoined}
        onCancel={handleCancelJoin}
      />
    );
  }

  return (
    <AppStateProvider>
      <ConfirmProvider>
        <ShellWithPendingSpace pendingSpace={pendingSpace} onPendingSpaceHandled={() => setPendingSpace(null)} />
      </ConfirmProvider>
    </AppStateProvider>
  );
}

/** Shell mở rộng: nhận pendingSpace từ join flow và dispatch SPACE_ADD_SHARED khi app đã hydrate. */
function ShellWithPendingSpace({
  pendingSpace,
  onPendingSpaceHandled,
}: {
  pendingSpace: Space | null;
  onPendingSpaceHandled: () => void;
}) {
  const { dispatch, isLoading } = useAppState();

  useEffect(() => {
    if (isLoading || !pendingSpace) return;
    dispatch({ type: 'SPACE_ADD_SHARED', payload: { space: pendingSpace } });
    dispatch({ type: 'SCREEN_NAVIGATE', payload: { screen: 'dashboard' } });
    onPendingSpaceHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pendingSpace]);

  return <Shell />;
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  // Đọc token từ URL (lần đầu load) hoặc sessionStorage (sau khi Google OAuth redirect về).
  // Đọc 1 lần ở đây — nếu đọc trong render sẽ re-evaluate mỗi render lần (không ổn).
  const [initialToken] = useState<string | null>(() => {
    // Ưu tiên token trên URL (link mời trực tiếp).
    const urlToken = readInviteTokenFromUrl();
    if (urlToken) return urlToken;
    // Fallback: token đã lưu trong sessionStorage (sau Google OAuth redirect).
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  });

  if (isLoading) {
    return <LoadingScreen message="Đang kiểm tra đăng nhập..." />;
  }

  // Chưa đăng nhập và không có token trên URL → màn login bình thường.
  // (Nếu có token, JoinSpacePage sẽ tự redirect sang Google OAuth khi cần.)
  if (!session && !initialToken) {
    return <LoginScreen />;
  }

  // initialToken không null → luôn mount join flow; JoinSpacePage tự xử lý auth check bên trong.
  return <AppWithJoin initialToken={initialToken} />;
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
