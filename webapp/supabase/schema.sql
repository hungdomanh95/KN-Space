-- KN-Space — schema Supabase cho Bước 1 (Phase 2: web app cá nhân, KHÔNG chia sẻ/membership).
-- Chạy nguyên file này trong Supabase Dashboard > SQL Editor (1 lần, trên project mới).

create table if not exists public.kn_space_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spaces jsonb not null default '[]'::jsonb,
  current_space_id text not null default '',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kn_space_state enable row level security;

-- Mỗi user chỉ đọc/ghi đúng hàng của chính mình — KHÔNG có khái niệm chia sẻ/membership ở đây
-- (đó là Phase 3, chưa làm). auth.uid() chỉ có giá trị khi request có JWT hợp lệ (đã đăng nhập).
create policy "select own state" on public.kn_space_state
  for select using (auth.uid() = user_id);

create policy "insert own state" on public.kn_space_state
  for insert with check (auth.uid() = user_id);

create policy "update own state" on public.kn_space_state
  for update using (auth.uid() = user_id);

create policy "delete own state" on public.kn_space_state
  for delete using (auth.uid() = user_id);

-- Bật Realtime cho bảng này để đồng bộ UI giữa các máy (xem supabaseStore.subscribeStorageChanges).
-- Trong Supabase Dashboard > Database > Replication, bật bảng "kn_space_state", hoặc chạy:
alter publication supabase_realtime add table public.kn_space_state;

-- ============================================================================
-- Push Notification (Phần 2) — bảng lưu subscription Web Push của từng thiết bị.
-- Xem docs/features/push-notification.md mục 9.2/10 và
-- docs/features/push-notification-progress.md (Phần 2) cho bối cảnh đầy đủ.
-- Bảng này KHÔNG bật Realtime — không cần đồng bộ UI, chỉ Edge Function (Phần 3,
-- dùng service_role key, bypass RLS) đọc để gửi push.
-- ============================================================================

create table if not exists public.kn_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists kn_push_subscriptions_user_id_idx
  on public.kn_push_subscriptions (user_id);

alter table public.kn_push_subscriptions enable row level security;

-- Mỗi user chỉ đọc/ghi đúng subscription của chính mình (đúng convention RLS ở trên).
-- Có cả policy "update" vì hook subscribe() dùng upsert theo `endpoint`
-- (INSERT ... ON CONFLICT DO UPDATE ở tầng PostgREST) — không chỉ insert thuần.
create policy "select own push subscriptions" on public.kn_push_subscriptions
  for select using (auth.uid() = user_id);

create policy "insert own push subscriptions" on public.kn_push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "update own push subscriptions" on public.kn_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own push subscriptions" on public.kn_push_subscriptions
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Push Notification (Phần 3) — bảng log chống gửi trùng + cấu hình pg_cron.
-- Xem docs/features/push-notification.md mục 9.3 và
-- docs/features/push-notification-progress.md (Phần 3) cho bối cảnh đầy đủ.
-- ============================================================================

-- Bảng log: mỗi lần Edge Function gửi push thành công cho 1 item ở 1 mốc
-- "đến hạn" cụ thể, insert 1 dòng vào đây. Trước khi gửi, Edge Function thử
-- insert trước — nếu unique_violation (đã có dòng cho đúng item_key + due_at)
-- thì bỏ qua, không gửi lại (chống cron chạy chồng/lỡ nhịp gửi trùng).
-- KHÔNG có RLS — bảng này chỉ Edge Function (service_role key, bypass RLS)
-- đụng tới, không client nào query trực tiếp (giống kn_push_subscriptions
-- không cần RLS đọc từ Edge Function, nhưng khác ở chỗ bảng này không có
-- user_id nên không áp policy theo auth.uid() được — an toàn vì client
-- (anon/authenticated key) không có quyền gì trên bảng này theo mặc định
-- Postgres nếu không cấp GRANT, và ta không cấp).
create table if not exists public.kn_push_sent_log (
  id uuid primary key default gen_random_uuid(),
  item_key text not null, -- "task:<id>" | "reminder:<id>"
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  unique (item_key, due_at)
);

create index if not exists kn_push_sent_log_due_at_idx
  on public.kn_push_sent_log (due_at);

-- ============================================================================
-- pg_cron — gọi Edge Function send-due-notifications mỗi 1 phút.
-- CẦN CHẠY THỦ CÔNG SAU KHI ĐÃ DEPLOY EDGE FUNCTION (không chạy được lúc setup
-- ban đầu vì URL function chỉ có sau khi deploy) — xem hướng dẫn đầy đủ trong
-- docs/features/push-notification-progress.md (Phần 3, mục "Hướng dẫn deploy").
--
-- 1. Bật 2 extension cần thiết (chỉ cần 1 lần/project, làm trong SQL Editor):
--      create extension if not exists pg_cron with schema extensions;
--      create extension if not exists pg_net with schema extensions;
--
-- 2. Thay 2 chỗ PLACEHOLDER bên dưới rồi chạy:
--      - <YOUR-PROJECT-REF>  → project ref thật (vd abcxyzproject), lấy trong
--        Supabase Dashboard > Project Settings > General.
--      - <YOUR-SERVICE-ROLE-KEY> → service_role key thật (Project Settings >
--        API). Đây là secret, KHÔNG commit giá trị thật vào git — chỉ chạy
--        trực tiếp trong SQL Editor rồi thôi (câu lệnh `select cron.schedule`
--        chỉ lưu lại trong Postgres, không vào git).
--
-- select cron.schedule(
--   'send-due-notifications-every-minute',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-due-notifications',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <YOUR-SERVICE-ROLE-KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- 3. Kiểm tra job đã tạo: select * from cron.job;
-- 4. Xem lịch sử chạy (debug nếu không thấy push): select * from cron.job_run_details
--    order by start_time desc limit 20;
-- 5. Muốn tắt/xoá job: select cron.unschedule('send-due-notifications-every-minute');
-- ============================================================================
