import { useState } from 'react';
import { Eye, EyeOff, Home, Settings as SettingsIcon } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { SpaceSwitcher } from '../features/spaces/SpaceSwitcher';
import { SettingsModal } from '../features/settings/SettingsModal';

interface TopBarProps {
  onGoHome: () => void;
}

export function TopBar({ onGoHome }: TopBarProps) {
  const { state, dispatch } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allCollapsed = Object.values(state.settings.collapsedBlocks).every(Boolean);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <img src="icons/icon32.png" alt="KN-Space" />
        </div>
        <div>
          <h1>KN-Space</h1>
          <div className="sub">Personal dashboard</div>
        </div>
        <SpaceSwitcher />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button id="btn-home" className="btn-ghost" onClick={onGoHome} title="Về màn Home" aria-label="Về màn Home">
          <Home className="icon" size={14} /> Home
        </button>
        <button className="btn-ghost" onClick={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSE_ALL' })}>
          {allCollapsed ? <EyeOff className="icon" size={14} /> : <Eye className="icon" size={14} />}
          {allCollapsed ? ' Hiện tất cả' : ' Ẩn tất cả'}
        </button>
        <button className="btn-ghost" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="icon" size={14} /> Cài đặt
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
