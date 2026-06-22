export function maskContent(text: string): string {
  return (text || '')
    .split('\n')
    .map((line) => (line.trim() ? '*'.repeat(Math.min(line.length, 22)) : ''))
    .join('\n');
}

export function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function formatNoteDate(updatedAt: number): string {
  const d = new Date(updatedAt);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}
