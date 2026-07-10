-- ĐÃ GỘP vào supabase/schema.sql (2026-07-09) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- Nhật ký nhanh (LogEntry) — bổ sung schema cho Shared Space
-- Xem docs/features/nhat-ky-nhanh.md mục 9 và
-- docs/features/nhat-ky-nhanh-progress.md (Phần 1) cho bối cảnh đầy đủ.
-- =============================================================================
--
-- Space CÁ NHÂN (kn_space_state, xem supabase/schema.sql) KHÔNG cần đổi gì —
-- toàn bộ mảng Space (gồm cả `logs[]` mới) nằm trong 1 cột `spaces jsonb` duy
-- nhất, không có schema cứng, app tự đọc/ghi field mới qua normalize.ts.
--
-- Ngược lại, Shared Space (kn_shared_spaces, xem docs/features/shared-space-schema.sql)
-- lưu MỖI mảng thành 1 CỘT JSONB RIÊNG (tasks/notes/reminders), không phải 1
-- cột "spaces" gộp chung như kn_space_state. Vì vậy field `logs[]` mới CẦN 1
-- CỘT MỚI ở đây — đây là điểm khác thực tế so với câu "Không tạo bảng Supabase
-- mới" ở nhat-ky-nhanh.md mục 9 (tài liệu đó giả định nhầm kn_shared_spaces
-- cũng dùng 1 cột jsonb gộp như kn_space_state; đã kiểm tra lại schema thật
-- trước khi viết file này — không phải bảng mới, chỉ thêm 1 CỘT vào bảng cũ,
-- nhưng vẫn là 1 thay đổi DDL thật cần chạy tay trên Supabase Dashboard).
--
-- Chạy đoạn dưới đây 1 lần trong Supabase Dashboard > SQL Editor, SAU KHI đã
-- chạy docs/features/shared-space-schema.sql (bảng kn_shared_spaces phải tồn
-- tại trước).
-- =============================================================================

alter table public.kn_shared_spaces
  add column if not exists logs jsonb not null default '[]'::jsonb;

-- Không cần policy RLS riêng cho cột này — RLS của Postgres áp dụng theo HÀNG
-- (row-level), không theo cột; 4 policy select/insert/update/delete đã có sẵn
-- trên kn_shared_spaces (xem shared-space-schema.sql) tự động bao trùm cột mới.
--
-- Việc SELECT/UPDATE thực tế cột `logs` này qua Supabase JS client (thêm vào
-- rowToSpace()/saveSharedSpace() trong src/storage/sharedSpaceStore.ts) là
-- việc của Phần 2 (storage functions) — CHƯA làm ở Phần 1, xem
-- docs/features/nhat-ky-nhanh-progress.md.
