import type { LucideIcon } from 'lucide-react';

interface IconChipProps {
  icon: LucideIcon;
  background: string;
  color: string;
}

/** Icon-chip màu riêng cho mỗi khối, theo F23 (xanh/accent, xanh ngọc, cam, tím, hồng). */
export function IconChip({ icon: Icon, background, color }: IconChipProps) {
  return (
    <span className="block-icon" style={{ background, color }}>
      <Icon className="icon" size={15} strokeWidth={2} />
    </span>
  );
}
