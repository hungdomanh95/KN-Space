import React, { createContext, useContext, useState } from 'react';
import { ConfirmModal } from './ConfirmModal';
import type { ConfirmModalState } from './ConfirmModal';

interface ConfirmContextValue {
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmModalState | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setState({ title, message, onConfirm });
  };

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      {state && <ConfirmModal state={state} onClose={() => setState(null)} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue['showConfirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.showConfirm;
}
