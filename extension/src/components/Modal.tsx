import React from 'react';

interface ModalProps {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

/** Overlay nền đặc + đóng khi click ra ngoài (mousedown trên overlay, không phải modal). */
export function Modal({ onClose, className, children }: ModalProps) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className ?? ''}`.trim()}>{children}</div>
    </div>
  );
}
