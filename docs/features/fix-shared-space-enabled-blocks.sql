-- =============================================================================
-- Fix bug: enabledBlocks của Shared Space bị hard-code cứng ở client
-- Xem docs/features/shared-space.md mục 6.1 và src/storage/sharedSpaceStore.ts
-- =============================================================================
--
-- Bug: bảng kn_shared_spaces chưa từng có cột lưu "khối nào bật/tắt" cho từng
-- space — rowToSpace() ở client ép cứng { tasks:true, reminder:false,
-- habits:false, notes:true, reminders:true, logs:true } mỗi lần load, bất kể
-- user đã tự bật/tắt gì qua Settings > Sửa Space. Patch lưu cũng chưa từng gửi
-- field này lên Supabase.
--
-- Quyết định đã chốt (2026-07-08):
--   - Cho phép user tự bật/tắt "Nhắc việc" (reminder) như tasks/notes/logs.
--   - "Thói quen" (habits) VẪN bị ẩn hoàn toàn ở Shared Space — bất biến,
--     không đổi (xem docs/features/shared-space.md mục 6.1). Giá trị default
--     ở cột mới vẫn để habits=false cho nhất quán, nhưng lớp ép cứng THẬT SỰ
--     nằm ở application layer (rowToSpace() luôn ép { ...raw, habits:false }),
--     không dựa vào default của cột này (đề phòng dữ liệu cũ/hỏng).
--
-- Chạy 1 lần trong Supabase Dashboard > SQL Editor, SAU KHI đã có bảng
-- kn_shared_spaces (docs/features/shared-space-schema.sql).
-- =============================================================================

alter table public.kn_shared_spaces
  add column if not exists enabled_blocks jsonb not null default
    '{"tasks":true,"reminder":true,"habits":false,"notes":true,"reminders":true,"logs":true}'::jsonb;

-- Không cần policy RLS riêng cho cột này — RLS áp dụng theo HÀNG (row-level),
-- không theo cột; 4 policy select/insert/update/delete đã có sẵn trên
-- kn_shared_spaces (xem shared-space-schema.sql) tự động bao trùm cột mới.
--
-- Việc đọc/ghi cột này qua Supabase JS client (rowToSpace()/saveSharedSpace()
-- trong src/storage/sharedSpaceStore.ts) là phần code đi kèm file SQL này,
-- xem commit sửa cùng lúc.
