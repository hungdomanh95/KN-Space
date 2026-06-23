import { useEffect, useState } from 'react';
import { gradientForImageIndex } from '../features/home/homeContent';

interface AppBackgroundProps {
  imageUrl: string;
  imageIndex: number;
}

/**
 * Layer ảnh nền DÙNG CHUNG cho Home + Dashboard — 1 div fixed, z-index âm, không đổi
 * khi chuyển màn (đặt ở App.tsx, ngoài Home/Dashboard) để tránh nhảy/reload ảnh.
 * Gradient fallback luôn nằm dưới làm nền; ảnh thật fade-in đè lên khi load xong,
 * và bị gỡ (`loaded=false`) khi load lỗi — không bao giờ vỡ layout/màn trắng.
 */
export function AppBackground({ imageUrl, imageIndex }: AppBackgroundProps) {
  const [loaded, setLoaded] = useState(false);
  const gradient = gradientForImageIndex(imageIndex);

  useEffect(() => {
    setLoaded(false);
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setLoaded(false);
    img.src = imageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  return (
    <div className="app-bg" style={{ backgroundImage: gradient }} aria-hidden="true">
      <div
        className="app-bg-image"
        style={{ backgroundImage: loaded ? `url("${imageUrl}")` : 'none', opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}
