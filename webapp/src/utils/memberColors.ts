import type { SharedSpaceMember } from '../types';

export const MEMBER_COLORS = ['#e8873d', '#0f9e8e', '#e2566f', '#d4a017', '#7c6cf0', '#9a9588'];

export function getMemberColor(userId: string, members: SharedSpaceMember[]): string {
  const sorted = [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const idx = sorted.findIndex((m) => m.userId === userId);
  return idx >= 0 ? MEMBER_COLORS[idx % MEMBER_COLORS.length] : '#9a9588';
}

export function getMemberDisplayName(userId: string, members: SharedSpaceMember[]): string {
  const member = members.find((m) => m.userId === userId);
  if (!member) return 'Thành viên';
  const name = member.displayName || member.email.split('@')[0];
  return name.length > 15 ? `${name.slice(0, 15)}…` : name;
}
