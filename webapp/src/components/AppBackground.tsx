import { useEffect, useRef, useState } from 'react';
import { gradientForImageIndex } from '../features/home/homeContent';
import { useStableViewportHeight } from '../layout/useStableViewportHeight';

interface AppBackgroundProps {
  imageUrl: string;
  imageIndex: number;
}

interface LayerState {
  background: string;
}

/**
 * Layer ảnh nền DÙNG CHUNG cho Home + Dashboard — đặt ở App.tsx, ngoài Home/Dashboard,
 * không đổi khi chuyển màn để tránh nhảy/reload ảnh.
 *
 * Dùng 2 layer ping-pong (đúng yêu cầu mục 4.6 requirements: "crossfade 2 layer, không đổi
 * tức thì/giật") — layer ĐANG hiện luôn giữ nguyên ảnh cũ trong khi layer còn lại tải ảnh mới
 * ở dưới; khi ảnh mới sẵn sàng (load xong hoặc fallback gradient nếu lỗi), layer đó được đưa
 * lên trên (z-index) rồi fade opacity 0->1 — ảnh CŨ vẫn còn nguyên bên dưới nên không có
 * khoảng trống/gradient lộ ra giữa 2 ảnh như khi chỉ dùng 1 layer.
 */
export function AppBackground({ imageUrl, imageIndex }: AppBackgroundProps) {
  const gradient = gradientForImageIndex(imageIndex);
  const [layers, setLayers] = useState<[LayerState, LayerState]>([{ background: gradient }, { background: '' }]);
  const [topLayer, setTopLayer] = useState<0 | 1>(0);
  const topLayerRef = useRef<0 | 1>(0);
  topLayerRef.current = topLayer;

  // Xem useStableViewportHeight.ts — tránh ảnh nhìn như bị ZOOM khi bàn phím ảo mở trên iOS.
  const vh = useStableViewportHeight();

  useEffect(() => {
    const nextIdx: 0 | 1 = topLayerRef.current === 0 ? 1 : 0;
    if (!imageUrl) {
      setLayers((prev) => {
        const next = [...prev] as [LayerState, LayerState];
        next[nextIdx] = { background: gradient };
        return next;
      });
      setTopLayer(nextIdx);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setLayers((prev) => {
        const next = [...prev] as [LayerState, LayerState];
        next[nextIdx] = { background: `url("${imageUrl}")` };
        return next;
      });
      setTopLayer(nextIdx);
    };
    img.onerror = () => {
      setLayers((prev) => {
        const next = [...prev] as [LayerState, LayerState];
        next[nextIdx] = { background: gradient };
        return next;
      });
      setTopLayer(nextIdx);
    };
    img.src = imageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, gradient]);

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[-2] pointer-events-none bg-cover bg-center"
      style={{ height: vh }}
      aria-hidden="true"
    >
      {layers.map((layer, i) => (
        <div
          key={i}
          className={`absolute inset-0 bg-cover bg-center opacity-0 transition-opacity duration-[600ms] ease-linear ${
            topLayer === i ? 'z-[1] opacity-100' : 'z-0'
          }`}
          style={{ backgroundImage: layer.background }}
        />
      ))}
    </div>
  );
}
