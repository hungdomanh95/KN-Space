// ============================================================================
// Phím tắt đổi nhanh Space: Alt+1..9 (Windows/Linux) hoặc Cmd+1..9 (Mac).
// Tách riêng module để dùng chung giữa App.tsx (global keydown listener) và
// SpaceSwitcher.tsx (gợi ý hiển thị cạnh tên Space trong dropdown).
// ============================================================================

/**
 * Detect Mac qua navigator.userAgent (ưu tiên)/navigator.platform (fallback) — không dùng
 * userAgentData vì chưa hỗ trợ mọi browser. Chỉ cần biết Mac hay không để hiển thị ĐÚNG
 * modifier; không quyết định việc phím tắt có hoạt động hay không (App.tsx tự lắng nghe
 * cả altKey/metaKey rồi ưu tiên theo OS).
 */
export function isMacPlatform(): boolean {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  return /Mac|iPhone|iPad|iPod/.test(plat) || /Macintosh/.test(ua);
}

/** Gợi ý phím tắt hiển thị cho Space thứ `idx` (0-based) — chỉ 9 Space đầu có gợi ý. */
export function spaceShortcutLabel(idx: number): string {
  if (idx >= 9) return '';
  return isMacPlatform() ? `⌘${idx + 1}` : `Alt+${idx + 1}`;
}
