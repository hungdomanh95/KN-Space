# Phase 3 — Shared space (chia sẻ & thành viên) ⏸ HOÃN

> Mở khoá sau Phase 2 (đã có Supabase + auth). Nội dung gốc từ requirements vòng 24 / F36.

## Mục tiêu
Cho phép **mời người khác cùng dùng chung 1 Space** (mô hình workspace kiểu Notion/Trello): mời qua email, **mọi thành viên ngang quyền**, dữ liệu thuộc về Space.

## Nền tảng (cộng thêm trên Phase 2)
- Bảng `space_members` (N-N user ↔ space) + `space_invites` (pending-invite theo email).
- **RLS membership-based**: đọc/ghi 1 dòng nếu `auth.uid()` là thành viên của space chứa dòng đó (qua helper `is_space_member` tránh đệ quy policy).
- Nếu Phase 2 đã dựng sẵn model space-centric + `space_members` đơn-thành-viên → phase này **thuần additive**, không migrate.

## Tính năng (F36)
- Mời thành viên qua email (F36a); người đã có tài khoản → vào ngay (F36c).
- **Pending-invite resolve-on-first-login** cho người chưa có tài khoản (F36b).
- Danh sách thành viên / xoá thành viên / rời space (F36d–F36f); chặn rời space cuối.
- Sync realtime + last-write-wins **giữa nhiều thành viên** (F9 multi-member).
- Chỉ `created_by` được xoá cả space (chốt #15); tự chuyển space khi bị xoá/remove (chốt #18).

## Rủi ro chính
**Rò rỉ dữ liệu giữa các space nếu RLS cấu hình sai** — bắt buộc test RLS kỹ với nhiều thành viên + nhiều space.
