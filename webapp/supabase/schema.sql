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
