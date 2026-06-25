import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquareQuote,
  Moon,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  Upload,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { buildExportPayload, downloadExportFile, parseImportFile } from './exportImport';
import { HomeBackgroundSettings } from './HomeBackgroundSettings';
import { HomeQuoteSettings } from './HomeQuoteSettings';
import type { ThemeMode } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'general' | 'background' | 'quote';

const ACCENT_OPTIONS: { color: string; label: string }[] = [
  { color: '#5457d6', label: 'Màu xanh dương' },
  { color: '#1fb874', label: 'Màu xanh lá' },
  { color: '#8b5cf6', label: 'Màu tím' },
  { color: '#ff5d7a', label: 'Màu hồng' },
  { color: '#ff8a3d', label: 'Màu cam' },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusError, setStatusError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { settings } = state;

  function setTheme(theme: ThemeMode) {
    dispatch({ type: 'SETTINGS_SET_THEME', payload: { theme } });
  }

  function handleExport() {
    try {
      const payload = buildExportPayload(state);
      downloadExportFile(payload);
      setStatusMsg('Đã xuất file JSON thành công.');
      setStatusError(false);
    } catch (err) {
      setStatusMsg('Lỗi khi xuất file: ' + (err instanceof Error ? err.message : String(err)));
      setStatusError(true);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseImportFile(String(reader.result));
        showConfirm(
          'Import dữ liệu?',
          'Import sẽ THAY THẾ toàn bộ dữ liệu hiện tại (mọi space + settings hiển thị) bằng nội dung file này. Tiếp tục?',
          () => {
            dispatch({ type: 'IMPORT_DATA', payload });
            setStatusMsg('Đã khôi phục dữ liệu từ file thành công.');
            setStatusError(false);
          },
        );
      } catch (err) {
        setStatusMsg('Lỗi khi đọc file: ' + (err instanceof Error ? err.message : String(err)));
        setStatusError(true);
      }
    };
    reader.onerror = () => {
      setStatusMsg('Không đọc được file.');
      setStatusError(true);
    };
    reader.readAsText(file);
  }

  return (
    <Modal
      onClose={onClose}
      className="modal-settings flex h-[min(680px,82vh)] w-[760px] max-w-[92vw] flex-col overflow-hidden p-0 max-md:w-[94vw]"
    >
      <h2 className="m-0 flex-none px-[22px] pb-2 pt-4">Cài đặt</h2>
      <div
        className="settings-tabs mb-0 flex flex-none flex-wrap gap-1 border-b border-[color:var(--border-hairline)] px-[22px] pb-2.5"
        role="tablist"
        aria-label="Nhóm cài đặt"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <SettingsIcon className="icon h-3.5 w-3.5" size={14} /> Chung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'background'}
          className={`settings-tab ${activeTab === 'background' ? 'active' : ''}`}
          onClick={() => setActiveTab('background')}
        >
          <ImageIcon className="icon h-3.5 w-3.5" size={14} /> Ảnh nền
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'quote'}
          className={`settings-tab ${activeTab === 'quote' ? 'active' : ''}`}
          onClick={() => setActiveTab('quote')}
        >
          <MessageSquareQuote className="icon h-3.5 w-3.5" size={14} /> Quote
        </button>
      </div>

      <div className="settings-body min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">
      {activeTab === 'general' && (
        <div className="settings-grid grid grid-cols-2 items-start gap-x-7 gap-y-[22px] max-md:grid-cols-1">
          <div className="setting-block mb-5">
            <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
              <Sun className="icon h-[13px] w-[13px]" size={13} /> Giao diện
            </label>
            <div className="theme-toggle flex gap-2.5">
              <button
                className={`flex flex-1 items-center justify-center gap-[7px] rounded-[10px] border-[1.5px] border-[color:var(--border)]
                  bg-[var(--raised)] p-2.5 text-[0.9062rem] font-semibold text-[var(--text)] ${
                  settings.theme === 'light' ? 'border-[color:var(--accent)] bg-[rgba(var(--accent-rgb),.08)] text-[var(--accent)]' : ''
                }`}
                onClick={() => setTheme('light')}
              >
                <Sun className="icon h-3.5 w-3.5" size={14} /> Sáng
              </button>
              <button
                className={`flex flex-1 items-center justify-center gap-[7px] rounded-[10px] border-[1.5px] border-[color:var(--border)]
                  bg-[var(--raised)] p-2.5 text-[0.9062rem] font-semibold text-[var(--text)] ${
                  settings.theme === 'dark' ? 'border-[color:var(--accent)] bg-[rgba(var(--accent-rgb),.08)] text-[var(--accent)]' : ''
                }`}
                onClick={() => setTheme('dark')}
              >
                <Moon className="icon h-3.5 w-3.5" size={14} /> Tối
              </button>
            </div>
          </div>

          <div className="setting-block mb-5">
            <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
              <LayoutGrid className="icon h-[13px] w-[13px]" size={13} /> Màu chủ đạo
            </label>
            <div className="color-palette">
              {ACCENT_OPTIONS.map((a) => (
                <button
                  key={a.color}
                  type="button"
                  className={`swatch ${settings.accent === a.color ? 'active' : ''}`}
                  style={{ background: a.color }}
                  title={a.label}
                  aria-label={`Chọn màu chủ đạo ${a.label}`}
                  onClick={() => dispatch({ type: 'SETTINGS_SET_ACCENT', payload: { accent: a.color } })}
                />
              ))}
            </div>
          </div>

          <div className="setting-block mb-5">
            <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
              <Database className="icon h-[13px] w-[13px]" size={13} /> Dữ liệu
            </label>
            <div className="export-import flex gap-2.5">
              <button className="btn-ghost flex-1" onClick={handleExport}>
                <Download className="icon h-3.5 w-3.5" size={14} /> Export JSON
              </button>
              <button className="btn-ghost flex-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="icon h-3.5 w-3.5" size={14} /> Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </div>
            {statusMsg && (
              <p className="hint mt-2" style={{ color: statusError ? 'var(--reminder-color)' : 'var(--text-dim)' }}>
                {statusMsg}
              </p>
            )}
          </div>

          <div className="setting-block span-2 col-span-2 mb-5">
            <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
              <LayoutGrid className="icon h-[13px] w-[13px]" size={13} /> Bố cục Dashboard
            </label>
            <p className="hint mb-2.5 mt-0">
              Kéo-thả khối bất kỳ vào vị trí khác để sắp xếp lại (thả vào giữa khối khác để
              chèn trên/dưới, thả vào mép trái/phải để ghép 2 khối nằm ngang). Kéo đường kẻ ẩn
              giữa các khối/cột để đổi kích thước.
            </p>
            <button
              className="btn-ghost"
              onClick={() => dispatch({ type: 'SPACE_RESET_DASHBOARD_LAYOUT', payload: { spaceId: state.currentSpaceId } })}
            >
              <Repeat className="icon h-3.5 w-3.5" size={14} /> Khôi phục bố cục mặc định
            </button>
          </div>
        </div>
      )}

      {activeTab === 'background' && (
        <div className="settings-grid grid grid-cols-2 items-start gap-x-7 gap-y-[22px] max-md:grid-cols-1">
          <HomeBackgroundSettings />
        </div>
      )}

      {activeTab === 'quote' && (
        <div className="settings-grid grid grid-cols-2 items-start gap-x-7 gap-y-[22px] max-md:grid-cols-1">
          <HomeQuoteSettings />
        </div>
      )}
      </div>

      <div className="modal-actions mt-0 flex-none border-t border-[color:var(--border-hairline)] px-[22px] py-3.5">
        <button className="btn-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}
