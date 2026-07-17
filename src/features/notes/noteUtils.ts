export function maskLine(line: string): string {
  return line.trim() ? '*'.repeat(Math.min(line.length, 22)) : '';
}

/** Cộng/trừ độ sâu ngoặc + cặp `do`...`end` kiểu Ruby cho 1 dòng — dùng để biết dòng trắng có đang
 * nằm GIỮA 1 khối code chưa đóng hay không (xem `groupLinesIntoBlocks`). */
function lineDepthDelta(line: string): number {
  let delta = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '(' || ch === '[') delta++;
    else if (ch === '}' || ch === ')' || ch === ']') delta--;
  }
  if (/\bdo(\s*\|[^|]*\|)?\s*$/.test(line)) delta++;
  if (/^\s*end\s*$/.test(line)) delta--;
  return delta;
}

/**
 * Gom các DÒNG (không phải chuỗi) thành từng "cụm" — mỗi cụm là 1 mảng dòng, giữ nguyên dòng
 * trắng bên trong nếu đang ở giữa 1 khối ngoặc/`do...end` chưa đóng (vd nội dung Ruby/Podspec
 * nhiều dòng, chỉ tách cụm mới khi khối đã đóng, không tách theo MỌI dòng trắng mù quáng).
 *
 * Van an toàn: 2 dòng trắng liên tiếp LUÔN buộc tách cụm dù đang tưởng là chưa đóng khối — tránh
 * gộp nhầm cả phần còn lại của note nếu lỡ nhận sai tín hiệu mở khối (vd 1 câu văn xuôi tình cờ
 * kết thúc bằng chữ "do").
 *
 * Tách riêng bước này (thao tác trên MẢNG DÒNG THẬT) khỏi bước mask nội dung, để việc "ẩn nội
 * dung" (thay chữ bằng `***`) không bao giờ làm lệch ranh giới cụm so với nội dung thật — xem
 * `NoteViewModal.tsx`, nơi cả 2 bản hiển thị/thật đều gom theo ĐÚNG 1 lần gọi hàm này.
 */
export function groupLinesIntoBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  let depth = 0;
  let consecutiveBlank = 0;
  for (const line of lines) {
    const isBlank = line.trim() === '';
    if (isBlank) {
      consecutiveBlank++;
      if (depth > 0 && consecutiveBlank < 2) {
        if (current.length > 0) current.push(line);
        continue;
      }
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      depth = 0;
      continue;
    }
    consecutiveBlank = 0;
    current.push(line);
    depth = Math.max(0, depth + lineDepthDelta(line));
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

const FENCE_MARKER = /^```/;

interface RawSegment {
  lines: string[];
  isFence: boolean;
}

/**
 * Tách nội dung thành từng đoạn XEN KẼ trong/ngoài dấu code-fence ```` ``` ```` (cú pháp Markdown
 * quen thuộc — GitHub/Slack/Discord/Notion đều dùng) — ranh giới TƯỜNG MINH do user tự đánh dấu,
 * không cần đoán qua độ sâu ngoặc/`do...end` nữa (xem `groupNoteIntoBlocks`). Dòng ``` (mở hoặc
 * đóng, kể cả có tag ngôn ngữ như ```ruby) không nằm trong nội dung trả về — thuần làm dấu phân
 * cách. Fence chưa đóng (thiếu ``` kết thúc) coi như nuốt hết phần còn lại của note — đúng hành vi
 * trình render Markdown thông thường.
 */
function splitFenceSegments(lines: string[]): RawSegment[] {
  const segments: RawSegment[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE_MARKER.test(line.trim())) {
      segments.push({ lines: current, isFence: inFence });
      current = [];
      inFence = !inFence;
      continue;
    }
    current.push(line);
  }
  segments.push({ lines: current, isFence: inFence });
  return segments;
}

export interface NoteBlock {
  lines: string[];
  /** true nếu cụm này nằm trong dấu ```` ``` ```` — user đã tự xác nhận là code, không cần dò
   * `looksLikeCode()` nữa (xem `NoteViewModal.tsx`). */
  isFenced: boolean;
}

/**
 * Gom TOÀN BỘ nội dung note thành các cụm — ưu tiên ranh giới ```` ``` ```` tường minh trước, phần
 * còn lại (ngoài fence) mới rơi về suy luận dòng trắng/độ sâu ngoặc cũ (`groupLinesIntoBlocks`) làm
 * phương án dự phòng cho code chưa được đánh dấu bằng fence.
 */
export function groupNoteIntoBlocks(content: string): NoteBlock[] {
  const segments = splitFenceSegments(content.split('\n'));
  const blocks: NoteBlock[] = [];
  for (const seg of segments) {
    if (seg.lines.length === 0) continue; // đoạn rỗng (2 dấu ``` liền nhau, hoặc fence ở đầu/cuối note)
    if (seg.isFence) {
      blocks.push({ lines: seg.lines, isFenced: true });
    } else {
      for (const group of groupLinesIntoBlocks(seg.lines)) {
        blocks.push({ lines: group, isFenced: false });
      }
    }
  }
  return blocks;
}

/**
 * Nhận diện 1 cụm có "trông giống code/cấu hình" hay không, để hiển thị bằng font monospace +
 * khung riêng trong modal xem chi tiết thay vì trộn chung phong cách với văn xuôi (xem thảo luận
 * UX — cụm dài kiểu Podspec/script hiện ra như 1 khối chữ liền tù tì, không phân biệt được với
 * ghi chú thường). Tín hiệu: có ký tự cú pháp đặc trưng ({};/=>/::), có dòng thụt lề, hoặc là dòng
 * comment (#, //, --). Với cụm nhiều dòng, cần ít nhất một nửa số dòng khớp mới tính là code —
 * tránh nhận nhầm 1 câu văn xuôi chỉ tình cờ có 1 dấu `;` hay `::`.
 */
export function looksLikeCode(text: string): boolean {
  const codeSignal = /[{};]|=>|::/;
  const lines = text.split('\n');
  if (lines.length < 2) return codeSignal.test(text);
  const codeLikeLines = lines.filter((line) => /^\s{2,}\S/.test(line) || codeSignal.test(line) || /^\s*(#|\/\/|--)/.test(line));
  return codeLikeLines.length >= Math.ceil(lines.length / 2);
}

export function formatNoteDate(updatedAt: number): string {
  const d = new Date(updatedAt);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}

function findLinkLine(content: string): string | undefined {
  return content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
}

/**
 * Preview 1 dòng cho hàng danh sách, cắt gọn bằng CSS ellipsis ở nơi hiển thị. Note ẩn trả về
 * placeholder chấm tròn cố định. Note dạng link ưu tiên hiện ĐÚNG dòng link (kèm dòng nhãn
 * đứng trước nếu có) thay vì mù quáng lấy 2 dòng đầu — tránh mất chính phần thông tin hữu ích
 * nhất (URL) khi content có 1-2 dòng nhãn đứng trước.
 */
export function notePreviewText(hidden: boolean, content: string): string {
  if (hidden) return '•'.repeat(24);
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !FENCE_MARKER.test(line));
  if (lines.length === 0) return '(Trống)';
  const linkLine = findLinkLine(content);
  if (linkLine) {
    const label = lines[0] !== linkLine ? lines[0] : undefined;
    return label ? `${label} · ${linkLine}` : linkLine;
  }
  return lines.slice(0, 2).join(' · ');
}
