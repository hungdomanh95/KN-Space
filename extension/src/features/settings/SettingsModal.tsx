import React, { useRef, useState } from 'react';
import { Database, Download, LayoutGrid, Moon, Repeat, Sun, Upload } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { buildExportPayload, downloadExportFile, parseImportFile } from './exportImport';
import { BACKGROUND_OPTIONS } from './backgroundOptions';
import type { ThemeMode } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

const ACCENT_OPTIONS: { color: string; label: string }[] = [
  { color: '#5b6cff', label: 'Màu xanh dương' },
  { color: '#1fb874', label: 'Màu xanh lá' },
  { color: '#8b5cf6', label: 'Màu tím' },
  { color: '#ff5d7a', label: 'Màu hồng' },
  { color: '#ff8a3d', label: 'Màu cam' },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [statusMsg, setStatusMsg] = useState('');
  const [statusError, setStatusError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { settings } = state;
  const { layoutSizes } = settings;

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

  function setSize(key: keyof typeof layoutSizes, value: number) {
    dispatch({ type: 'SETTINGS_SET_LAYOUT_SIZES', payload: { [key]: value } });
  }

  const remindersPct = Math.max(10, 100 - layoutSizes.combined - layoutSizes.notes);
  const habitsPct = Math.max(10, 100 - layoutSizes.reminder);

  return (
    <Modal onClose={onClose} className="modal-settings">
      <h2>Cài đặt</h2>
      <div className="settings-grid">
        <div className="setting-block">
          <label>
            <Sun className="icon" size={13} /> Giao diện
          </label>
          <div className="theme-toggle">
            <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <Sun className="icon" size={14} /> Sáng
            </button>
            <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <Moon className="icon" size={14} /> Tối
            </button>
          </div>
        </div>

        <div className="setting-block">
          <label>
            <LayoutGrid className="icon" size={13} /> Màu chủ đạo
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

        <div className="setting-block">
          <label>
            <Database className="icon" size={13} /> Dữ liệu
          </label>
          <div className="export-import">
            <button className="btn-ghost" onClick={handleExport}>
              <Download className="icon" size={14} /> Export JSON
            </button>
            <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
              <Upload className="icon" size={14} /> Import JSON
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
            <p className="hint" style={{ marginTop: 8, color: statusError ? 'var(--reminder-color)' : 'var(--text-dim)' }}>
              {statusMsg}
            </p>
          )}
        </div>

        <div className="setting-block span-2">
          <label>Ảnh nền</label>
          <div className="bg-grid">
            {BACKGROUND_OPTIONS.map((bg) => (
              <button
                key={bg.key}
                type="button"
                className={`bg-thumb ${bg.key === 'plain' ? 'plain' : ''} ${settings.background === bg.key ? 'active' : ''}`}
                style={bg.css ? { background: bg.css } : undefined}
                title={bg.title}
                aria-label={bg.title}
                onClick={() => dispatch({ type: 'SETTINGS_SET_BACKGROUND', payload: { background: bg.key } })}
              >
                {bg.key === 'plain' ? 'Trơn' : ''}
              </button>
            ))}
          </div>
          <p className="hint">Đóng gói sẵn vài gradient/màu cố định trong extension — không tải ảnh từ internet.</p>
        </div>

        <div className="setting-block span-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ marginBottom: 0 }}>Bố cục — kích thước khối</label>
            <button className="add-link" style={{ marginBottom: 0 }} onClick={() => dispatch({ type: 'SETTINGS_RESET_LAYOUT' })}>
              <Repeat className="icon" size={13} /> Khôi phục mặc định
            </button>
          </div>
          <div className="layout-cols">
            <div>
              <div className="size-row">
                <label>Khối trái (Việc làm+Nhắc việc+Thói quen)</label>
                <input
                  type="range"
                  min={20}
                  max={60}
                  value={layoutSizes.combined}
                  onChange={(e) => setSize('combined', Number(e.target.value))}
                />
                <span className="size-val">{layoutSizes.combined}%</span>
              </div>
              <div className="size-row">
                <label>Khối Ghi chú</label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={layoutSizes.notes}
                  onChange={(e) => setSize('notes', Number(e.target.value))}
                />
                <span className="size-val">{layoutSizes.notes}%</span>
              </div>
              <div className="size-row">
                <label>Khối Thông báo</label>
                <span className="size-auto">Tự động = phần còn lại</span>
                <span className="size-val">{remindersPct}%</span>
              </div>
            </div>
            <div>
              <div className="size-row">
                <label>↳ Việc cần làm (cao, so hàng dưới)</label>
                <input
                  type="range"
                  min={15}
                  max={70}
                  value={layoutSizes.tasks}
                  onChange={(e) => setSize('tasks', Number(e.target.value))}
                />
                <span className="size-val">{layoutSizes.tasks}%</span>
              </div>
              <div className="size-row">
                <label>↳ Nhắc việc (rộng, hàng dưới)</label>
                <input
                  type="range"
                  min={15}
                  max={85}
                  value={layoutSizes.reminder}
                  onChange={(e) => setSize('reminder', Number(e.target.value))}
                />
                <span className="size-val">{layoutSizes.reminder}%</span>
              </div>
              <div className="size-row">
                <label>↳ Thói quen (rộng, hàng dưới)</label>
                <span className="size-auto">Tự động = phần còn lại</span>
                <span className="size-val">{habitsPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}
