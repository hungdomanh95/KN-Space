import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { ConfirmProvider } from './components/ConfirmContext';
import { TopBar } from './components/TopBar';
import { AppLayout } from './layout/AppLayout';
import { BACKGROUND_OPTIONS, HEADER_TINTS_DARK, HEADER_TINTS_LIGHT } from './features/settings/backgroundOptions';

function Shell() {
  const { state, isLoading } = useAppState();
  const { settings, storageFallbackActive } = state;

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

  useEffect(() => {
    const opt = BACKGROUND_OPTIONS.find((b) => b.key === settings.background);
    if (!opt || !opt.css) {
      document.body.style.background = '';
      document.body.removeAttribute('data-bg');
      return;
    }
    document.body.style.background = opt.css;
    document.body.setAttribute('data-bg', settings.background);
    const tint = (settings.theme === 'dark' ? HEADER_TINTS_DARK : HEADER_TINTS_LIGHT)[settings.background];
    if (tint) document.documentElement.style.setProperty('--panel-bg', tint);
    else document.documentElement.style.removeProperty('--panel-bg');
  }, [settings.background, settings.theme]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
        Đang tải dữ liệu...
      </div>
    );
  }

  return (
    <>
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
      <TopBar />
      <AppLayout />
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
