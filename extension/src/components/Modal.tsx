import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Overlay nền đặc + đóng khi click ra ngoài (mousedown trên overlay, không phải modal).
 * Render qua portal vào document.body: .topbar/.main-block/.sub-block dùng backdrop-filter
 * (kính mờ) nên tự tạo containing block cho mọi descendant position:fixed — nếu modal nằm
 * lồng trong cây DOM của các khối đó, "fixed" sẽ bị kẹt trong khung khối cha thay vì phủ
 * toàn viewport. Portal thoát hẳn ra ngoài cây đó để fixed luôn tính theo viewport.
 */
export function Modal({ onClose, className, children }: ModalProps) {
  return createPortal(
    <div
      className="overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,30,.45)] backdrop-blur-[2px] animate-overlayFadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal max-h-[85vh] w-[440px] max-w-[90vw] overflow-y-auto rounded-2xl border border-[color:var(--border-hairline)] bg-[var(--modal-bg)] p-[22px] shadow-[0_20px_60px_rgba(0,0,0,.16)] animate-modalPopIn ${className ?? ''}`.trim()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
