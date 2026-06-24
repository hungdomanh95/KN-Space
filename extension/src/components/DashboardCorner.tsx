import { useState } from 'react';
import { Home, Settings as SettingsIcon } from 'lucide-react';
import { SpaceSwitcher } from '../features/spaces/SpaceSwitcher';
import { SettingsModal } from '../features/settings/SettingsModal';

interface DashboardCornerProps {
  onGoHome: () => void;
}

/**
 * Widget điều hướng cố định ngay dưới khối Thông báo (thay topbar ngang đã bỏ hẳn).
 * 3 phần ngang: nút Home icon-only, Space-switcher (flex:1, nội dung căn giữa), nút Settings
 * icon-only. Luôn hiện cùng .reminders-col — không phụ thuộc enabledBlocks của Space nào
 * (xem requirements mục 4.1).
 */
export function DashboardCorner({ onGoHome }: DashboardCornerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div id="dashboard-corner" role="group" aria-label="Về Home, chuyển space và cài đặt">
      <button
        id="dashboard-corner-home-btn"
        type="button"
        onClick={onGoHome}
        title="Về Home"
        aria-label="Về Home"
      >
        <Home className="icon" size={16} />
      </button>
      <SpaceSwitcher />
      <button
        id="dashboard-corner-settings-btn"
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="Cài đặt"
        aria-label="Cài đặt"
      >
        <SettingsIcon className="icon" size={16} />
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
