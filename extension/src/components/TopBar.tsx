import { useState } from 'react';
import { BookOpen, Eye, EyeOff, Settings as SettingsIcon } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { SpaceSwitcher } from '../features/spaces/SpaceSwitcher';
import { SettingsModal } from '../features/settings/SettingsModal';

export function TopBar() {
  const { state, dispatch } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allCollapsed = Object.values(state.settings.collapsedBlocks).every(Boolean);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <BookOpen className="icon" size={17} strokeWidth={2.1} />
        </div>
        <div>
          <h1>KN-Space</h1>
          <div className="sub">Personal dashboard</div>
        </div>
        <SpaceSwitcher />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
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
