import { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Pin, Repeat } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { DatePicker } from '../../components/DatePicker';
import { TimePicker } from '../../components/TimePicker';
import { useAppState } from '../../state/AppStateContext';
import type { ReminderDefinition, ReminderFreqUnit } from '../../types';

interface ReminderFormModalProps {
  reminder: ReminderDefinition | null;
  onClose: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReminderFormModal({ reminder, onClose }: ReminderFormModalProps) {
  const { dispatch } = useAppState();

  const [type, setType] = useState<'once' | 'recurring'>(reminder?.type ?? 'recurring');
  const [title, setTitle] = useState(reminder?.title ?? '');

  // once fields
  const [date, setDate] = useState(reminder?.type === 'once' ? reminder.date : todayStr());
  const [onceTime, setOnceTime] = useState(reminder?.type === 'once' ? reminder.time : '');

  // recurring fields
  const [freqN, setFreqN] = useState(reminder?.type === 'recurring' ? reminder.freqN : 1);
  const [freqUnit, setFreqUnit] = useState<ReminderFreqUnit>(reminder?.type === 'recurring' ? reminder.freqUnit : 'day');
  const [dayOfMonth, setDayOfMonth] = useState(
    reminder?.type === 'recurring' && reminder.dayOfMonth ? reminder.dayOfMonth : new Date().getDate(),
  );
  const [time, setTime] = useState(reminder?.type === 'recurring' ? reminder.time : '');

  function handleSave() {
    if (type === 'once') {
      const payload = { type: 'once' as const, title, date, onceTime };
      if (reminder) dispatch({ type: 'REMINDER_UPDATE', payload: { id: reminder.id, ...payload } });
      else dispatch({ type: 'REMINDER_CREATE', payload });
    } else {
      const payload = { type: 'recurring' as const, title, freqN: Math.max(1, freqN || 1), freqUnit, dayOfMonth, time };
      if (reminder) dispatch({ type: 'REMINDER_UPDATE', payload: { id: reminder.id, ...payload } });
      else dispatch({ type: 'REMINDER_CREATE', payload });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2>{reminder ? 'Sửa nhắc việc' : 'Nhắc việc mới'}</h2>
      <div className="mb-4 flex gap-2">
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border-[1.5px] border-[color:var(--border)]
            bg-[var(--raised)] p-[9px] text-[0.875rem] font-semibold text-[var(--text)] ${
            type === 'once' ? 'border-[color:var(--accent)] bg-[rgba(var(--accent-rgb),.08)] text-[var(--accent)]' : ''
          }`}
          onClick={() => setType('once')}
        >
          <Pin className="icon" size={14} /> 1 lần
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border-[1.5px] border-[color:var(--border)]
            bg-[var(--raised)] p-[9px] text-[0.875rem] font-semibold text-[var(--text)] ${
            type === 'recurring' ? 'border-[color:var(--accent)] bg-[rgba(var(--accent-rgb),.08)] text-[var(--accent)]' : ''
          }`}
          onClick={() => setType('recurring')}
        >
          <Repeat className="icon" size={14} /> Lặp lại
        </button>
      </div>
      <div className="field">
        <label>Tên việc</label>
        <input type="text" value={title} placeholder="Vd: Uống nước" onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      {type === 'once' ? (
        <div className="field-row">
          <div className="field">
            <label>Ngày</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="field">
            <label>Giờ (tuỳ chọn)</label>
            <TimePicker value={onceTime} onChange={setOnceTime} />
          </div>
        </div>
      ) : (
        <>
          <div className="field-row">
            <div className="field">
              <label>Mỗi</label>
              <input
                type="number"
                min={1}
                value={freqN}
                onChange={(e) => setFreqN(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Đơn vị</label>
              <Select.Root value={freqUnit} onValueChange={(v) => setFreqUnit(v as ReminderFreqUnit)}>
                <Select.Trigger className="flex w-full items-center justify-between rounded-[9px] border border-[color:var(--border)] bg-[var(--raised)] px-[11px] py-[9px] font-sans text-[0.9375rem] text-[var(--text)]">
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="icon" size={14} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="space-menu-surface" position="popper" sideOffset={4}>
                    <Select.Viewport>
                      <Select.Item value="hour" className="space-menu-item">
                        <Select.ItemText>Giờ</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="day" className="space-menu-item">
                        <Select.ItemText>Ngày</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="month" className="space-menu-item">
                        <Select.ItemText>Tháng</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
          {freqUnit === 'month' && (
            <div className="field">
              <label>Vào ngày (trong tháng)</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
              />
            </div>
          )}
          {freqUnit !== 'hour' && (
            <div className="field">
              <label>Giờ trong ngày (tuỳ chọn)</label>
              <TimePicker value={time} onChange={setTime} />
            </div>
          )}
        </>
      )}

      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={!title.trim()}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
