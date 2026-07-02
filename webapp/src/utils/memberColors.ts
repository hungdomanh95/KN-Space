import type { SharedSpaceMember } from '../types';

export const MEMBER_COLORS = ['#e8873d', '#0f9e8e', '#e2566f', '#d4a017', '#7c6cf0', '#9a9588'];

export function getMemberColor(userId: string, members: SharedSpaceMember[]): string {
  const sorted = [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const idx = sorted.findIndex((m) => m.userId === userId);
  if (idx >= 0) return MEMBER_COLORS[idx % MEMBER_COLORS.length];
  // Fallback khi members chưa load: derive màu từ userId để mỗi người luôn cùng 1 màu
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash * 31) + userId.charCodeAt(i)) | 0;
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

/**
 * `maxLen` mặc định 15 — phù hợp chỗ hiển thị chật (dot tooltip, meta note nhỏ). Chỗ có nhiều
 * chỗ hơn (tên người gửi trên dòng riêng trong MobileChatScreen) truyền `maxLen` lớn hơn hẳn
 * hoặc `Infinity` để không cắt tên.
 */
export function getMemberDisplayName(userId: string, members: SharedSpaceMember[], maxLen = 15): string {
  const member = members.find((m) => m.userId === userId);
  if (!member) return 'Thành viên';
  const name = member.displayName || member.email.split('@')[0];
  return name.length > maxLen ? `${name.slice(0, maxLen)}…` : name;
}
