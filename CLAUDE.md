# KN-Space — quy tắc làm việc

Các quy tắc dưới đây áp dụng khi Claude Code làm việc trong repo này (React + Vite + TypeScript + Supabase), bất kể chạy trên máy nào. File này được commit vào git để mọi máy `git pull` về đều có cùng ngữ cảnh.

## Ngôn ngữ
Luôn trả lời bằng **tiếng Việt**.

## Khi user báo bug hoặc hỏi về một vấn đề
KHÔNG tự động sửa code ngay. Phải theo đúng quy trình:
1. Điều tra tìm **nguyên nhân gốc** (root cause) trong code — đọc code thật, không đoán.
2. Giải thích nguyên nhân bằng tiếng Việt, dễ hiểu.
3. Đề xuất cách giải quyết (nêu vài phương án nếu có trade-off).
4. Dừng lại, **chờ user xác nhận** rồi mới bắt đầu implement.

Áp dụng cho MỌI bug report / câu hỏi "tại sao X bị lỗi" — kể cả khi nguyên nhân đã rõ ràng hoặc fix rất nhỏ. Không tự ý build/commit/push trước khi user đồng ý với giải pháp.

## Sau khi sửa code (chỉ làm sau khi đã được confirm ở bước trên)
- Chạy `npx tsc --noEmit` và `npm run build` trước khi báo "xong" — không đợi user nhắc.
- Chỉ `git commit` / `git push` khi user yêu cầu rõ ràng (trừ khi user đã có chỉ dẫn đứng "cứ push luôn" cho phiên làm việc đó).

## Bối cảnh kiến trúc
Đây là bản React + Vite + TypeScript + Supabase (Google OAuth, `kn_space_state`, `kn_shared_spaces`, `kn_space_members`, `kn_space_invites`...), đang được phát triển tích cực — bao gồm cả tính năng Space chung (shared space, invite, member, optimistic-locking sync). Nếu thấy tài liệu cũ nào nói Phase Supabase/shared-space "đã hoãn", tài liệu đó đã lỗi thời so với thực tế code hiện tại — ưu tiên đọc code thật (`src/storage/sharedSpaceStore.ts`, `src/state/AppStateContext.tsx`) hơn tài liệu roadmap cũ.
