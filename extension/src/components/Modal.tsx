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
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className ?? ''}`.trim()}>{children}</div>
    </div>,
    document.body,
  );
}
