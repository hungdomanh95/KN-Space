-- =============================================================================
-- KN-Space — schema Supabase, bản GỘP DUY NHẤT (2026-07-09)
-- =============================================================================
-- File này phản ánh ĐÚNG trạng thái schema production hiện tại (không phải
-- lịch sử từng bước) — gộp từ 8 file SQL rải rác trước đây:
--   supabase/schema.sql (bản cũ), docs/features/shared-space-schema.sql,
--   shared-space-rls-fix.sql, shared-space-accept-invite-fix.sql,
--   nhat-ky-nhanh-schema.sql, fix-shared-space-enabled-blocks.sql.
-- (2 file docs/features/nhat-ky-nhanh-fix-createdat-chi-tieu-kino.sql và
-- nhat-ky-nhanh-migrate-chi-tieu-kino.sql là script sửa DATA 1 lần cho 1 Space
-- cụ thể, không phải DDL/schema — không có gì để gộp vào đây, giữ nguyên làm
-- lịch sử trong docs/features/.)
--
-- Chạy nguyên file này trong Supabase Dashboard > SQL Editor (1 lần, trên
-- project mới) để dựng đầy đủ schema từ đầu.
--
-- KHÔNG dùng Supabase Realtime — đã chủ động gỡ khỏi code từ commit `aa00fae`
-- (2026-07-01) vì gây 5 bug mất dữ liệu, không ổn định, không cần thiết cho
-- tool cá nhân/nhóm nhỏ. Đồng bộ đa máy/đa thiết bị CHỈ qua load-on-open: mở
-- app/reload mới đọc bản mới nhất từ Supabase; sửa ở máy A không tự đẩy sang
-- máy B đang mở sẵn. File này KHÔNG có bất kỳ dòng
-- `alter publication supabase_realtime add table ...` nào — nếu thấy tài liệu
-- cũ nào còn nhắc Realtime, đó là thông tin lỗi thời.
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_space_state — Space CÁ NHÂN (Phase 2: web app cá nhân).
-- =============================================================================
-- Toàn bộ Space cá nhân + settings của 1 user nằm trong 1 hàng duy nhất, mảng
-- Space (gồm cả `logs[]` — Nhật ký nhanh) nằm trong cột `spaces jsonb` schema-
-- less, không cần cột riêng khi thêm field mới ở tầng ứng dụng.
--
-- Lưu ý kiến trúc (2026-07-09, xem docs/features/storage-architecture-fix.md):
-- kiểu lưu "1 hàng ghi đè toàn bộ" này là root cause của sự cố mất dữ liệu
-- layout/task thật — đang có kế hoạch sửa gốc ở Phần B của tài liệu đó (tách
-- bảng theo từng Space cá nhân + version-check, cùng cơ chế đã dùng ổn định ở
-- kn_shared_spaces bên dưới). Bảng `kn_space_state` dưới đây vẫn là bản ĐANG
-- CHẠY THẬT tại thời điểm viết file này — chưa đổi.
-- =============================================================================

create table if not exists public.kn_space_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spaces jsonb not null default '[]'::jsonb,
  current_space_id text not null default '',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kn_space_state enable row level security;

-- Mỗi user chỉ đọc/ghi đúng hàng của chính mình — KHÔNG có khái niệm chia sẻ/membership ở đây
-- (đó là Shared Space, xem phần riêng bên dưới). auth.uid() chỉ có giá trị khi request có JWT
-- hợp lệ (đã đăng nhập).
create policy "select own state" on public.kn_space_state
  for select using (auth.uid() = user_id);

create policy "insert own state" on public.kn_space_state
  for insert with check (auth.uid() = user_id);

create policy "update own state" on public.kn_space_state
  for update using (auth.uid() = user_id);

create policy "delete own state" on public.kn_space_state
  for delete using (auth.uid() = user_id);


-- =============================================================================
-- Push Notification (Phần 2) — bảng lưu subscription Web Push của từng thiết bị.
-- Xem docs/features/push-notification.md mục 9.2/10 và
-- docs/features/push-notification-progress.md (Phần 2) cho bối cảnh đầy đủ.
-- =============================================================================

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


-- =============================================================================
-- Push Notification (Phần 3) — bảng log chống gửi trùng + cấu hình pg_cron.
-- Xem docs/features/push-notification.md mục 9.3 và
-- docs/features/push-notification-progress.md (Phần 3) cho bối cảnh đầy đủ.
-- =============================================================================

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


-- =============================================================================
-- SHARED SPACE (Phase 3) — Space CHUNG nhiều thành viên
-- =============================================================================
-- Quyết định thiết kế đã chốt:
--   - Habits block bị ẩn trong shared space → KHÔNG lưu habits ở đây
--   - Invite: token-based (24 bytes base64url), 1 token = 1 người, hết hạn 7 ngày
--   - Conflict: item-level last-write-wins (mỗi task/note/reminder/log có updatedAt/createdAt riêng)
--   - Chỉ tạo shared space mới — không migrate space cá nhân cũ sang shared
--   - Phân quyền phẳng: owner (người tạo) và member (người được mời)
--   - Đồng bộ đa thiết bị: KHÔNG Realtime, chỉ load-on-open (giống Space cá nhân)
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_shared_spaces
-- Mỗi hàng = 1 shared space. Dữ liệu tasks/notes/reminders/logs lưu dạng JSONB,
-- mỗi cột riêng (khác kn_space_state — không gộp chung 1 cột `spaces`).
-- Mỗi item trong mảng tasks/notes/reminders PHẢI có trường "updatedAt" (ISO
-- 8601 string) để resolve conflict theo last-write-wins ở application layer;
-- item trong `logs` dùng "createdAt" (Nhật ký nhanh không có khái niệm sửa).
-- =============================================================================

create table if not exists public.kn_shared_spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id) on delete restrict,
  -- version: tăng 1 mỗi lần UPDATE (dùng cho optimistic locking ở client).
  -- Client gửi kèm version hiện tại; nếu version trên DB đã lớn hơn → báo conflict.
  version     bigint not null default 1,
  -- tasks/notes/reminders/logs: LỊCH SỬ — KHÔNG còn được app đọc/ghi từ 2026-07-11 (dọn dẹp
  -- "Việc 1", xem docs/features/item-level-entity-tables-progress.md câu hỏi mở #2). Cả 4 entity
  -- đã cutover hoàn toàn sang bảng item-level riêng (kn_shared_tasks/kn_shared_notes/
  -- kn_shared_reminders/kn_shared_logs, qua src/state/itemPersist.ts). 4 cột dưới đây giữ NGUYÊN
  -- (KHÔNG xoá/ALTER/DROP) làm lưới an toàn lịch sử — dữ liệu trong đó có thể LỖI THỜI (đứng yên
  -- từ mốc cutover, không phản ánh thay đổi sau đó), tuyệt đối KHÔNG dùng làm nguồn đọc/ghi mới.
  -- tasks: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... } — LỊCH SỬ, xem trên
  tasks       jsonb not null default '[]'::jsonb,
  -- notes: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... } — LỊCH SỬ, xem trên
  notes       jsonb not null default '[]'::jsonb,
  -- reminders: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... } — LỊCH SỬ, xem trên
  reminders   jsonb not null default '[]'::jsonb,
  -- logs: mảng JSON "Nhật ký nhanh", mỗi phần tử PHẢI có { id, content, createdAt, ... }
  -- (xem docs/features/nhat-ky-nhanh.md mục 9 — thêm sau, 2026-07-08) — LỊCH SỬ, xem trên
  logs        jsonb not null default '[]'::jsonb,
  -- enabled_blocks: cấu hình "khối nào bật/tắt" MẶC ĐỊNH của CHÍNH space này
  -- (tasks/notes/reminders/logs — không phải per-member). habits luôn ép
  -- false ở tầng application (src/storage/sharedSpaceStore.ts rowToSpace()),
  -- không dựa vào default cột này. Thêm sau (2026-07-08), xem
  -- docs/features/shared-space.md mục 6.1.
  enabled_blocks jsonb not null default
    '{"tasks":true,"reminder":true,"habits":false,"notes":true,"reminders":true,"logs":true}'::jsonb,
  -- habits KHÔNG có ở đây (đã bỏ theo quyết định thiết kế ở trên)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.kn_shared_spaces enable row level security;

-- Tự động cập nhật updated_at và tăng version mỗi khi UPDATE
create or replace function public.kn_shared_spaces_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_spaces_before_update
  before update on public.kn_shared_spaces
  for each row execute function public.kn_shared_spaces_before_update();


-- =============================================================================
-- BẢNG: kn_space_members
-- Liên kết user ↔ shared space. PK kép (space_id, user_id) đảm bảo 1 user
-- chỉ là thành viên 1 lần trong mỗi space.
-- =============================================================================

create table if not exists public.kn_space_members (
  space_id        uuid not null references public.kn_shared_spaces (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- role: 'owner' = người tạo space, 'member' = người được mời
  -- Mô hình phẳng — không có 'admin' hay phân quyền chi tiết hơn ở Phase 3
  role            text not null check (role in ('owner', 'member')),
  -- enabled_blocks: cột lịch sử, dự tính cho cấu hình UI riêng của TỪNG MEMBER
  -- (khác với kn_shared_spaces.enabled_blocks ở trên là cấu hình mặc định của
  -- CẢ space). Ứng dụng hiện tại (2026-07-09) đọc/ghi enabledBlocks qua cột
  -- kn_shared_spaces.enabled_blocks, KHÔNG dùng cột này — giữ lại để không phá
  -- schema đang chạy thật, không phải cột đang được ứng dụng sử dụng.
  enabled_blocks  jsonb not null default '{"tasks":true,"notes":true,"reminders":true}'::jsonb,
  joined_at       timestamptz not null default now(),
  primary key (space_id, user_id)
);

alter table public.kn_space_members enable row level security;


-- =============================================================================
-- BẢNG: kn_space_invites
-- Mỗi hàng = 1 invite link. Token dùng 1 lần (1 người accept = token bị đánh dấu used).
-- =============================================================================

create table if not exists public.kn_space_invites (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.kn_shared_spaces (id) on delete cascade,
  created_by   uuid not null references auth.users (id) on delete cascade,
  -- token: 24 bytes ngẫu nhiên encode base64url, UNIQUE toàn bảng.
  -- Generate ở application layer: crypto.randomBytes(24).toString('base64url')
  token        text not null unique,
  -- expires_at: mặc định 7 ngày kể từ lúc tạo (có thể override khi INSERT)
  expires_at   timestamptz not null default (now() + interval '7 days'),
  -- accepted_at / accepted_by: NULL = chưa dùng; không NULL = đã dùng 1 lần
  accepted_at  timestamptz null,
  accepted_by  uuid null references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.kn_space_invites enable row level security;


-- =============================================================================
-- INDEXES — Shared Space
-- =============================================================================

-- Tra cứu tất cả space mà 1 user là thành viên (dùng để load space-switcher)
create index if not exists idx_kn_space_members_user_id
  on public.kn_space_members (user_id);

-- Tra cứu tất cả thành viên của 1 space (dùng để hiện danh sách thành viên)
create index if not exists idx_kn_space_members_space_id
  on public.kn_space_members (space_id);

-- Validate token nhanh khi user bấm link join
create index if not exists idx_kn_space_invites_token
  on public.kn_space_invites (token);

-- Tra cứu invite theo space (để owner xem danh sách invite đang active)
create index if not exists idx_kn_space_invites_space_id
  on public.kn_space_invites (space_id);

-- Tìm invite do 1 user tạo
create index if not exists idx_kn_space_invites_created_by
  on public.kn_space_invites (created_by);


-- =============================================================================
-- HELPER FUNCTIONS — dùng trong RLS policy để tránh đệ quy
-- =============================================================================
-- Bối cảnh: policy SELECT ban đầu trên kn_space_members tự query lại chính
-- bảng kn_space_members → Postgres báo lỗi đệ quy (infinite recursion). Fix:
-- dùng SECURITY DEFINER helper function để bypass RLS khi check membership,
-- rồi các policy gọi hàm này thay vì tự viết EXISTS(...) trực tiếp.
-- =============================================================================

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.kn_space_members
    where space_id = p_space_id
      and user_id  = auth.uid()
  );
$$;

create or replace function public.is_space_owner(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.kn_space_members
    where space_id = p_space_id
      and user_id  = auth.uid()
      and role     = 'owner'
  );
$$;


-- =============================================================================
-- RLS POLICIES — kn_shared_spaces
-- =============================================================================

-- SELECT: member (bất kỳ role) của space mới được đọc.
-- Dùng helper is_space_member() (SECURITY DEFINER) thay vì EXISTS trực tiếp
-- vào kn_space_members để tránh đệ quy RLS.
create policy "shared_spaces_select_for_member"
  on public.kn_shared_spaces
  for select
  using (is_space_member(id));
-- Giải thích: user chỉ thấy space mà họ có hàng trong kn_space_members.
-- Owner cũng là member (role='owner') nên không cần case riêng.

-- INSERT: bất kỳ user đã đăng nhập đều có thể tạo shared space mới.
-- Function create_shared_space() sẽ tự INSERT vào kn_space_members với
-- role='owner' ngay sau khi INSERT space.
create policy "shared_spaces_insert_for_authenticated"
  on public.kn_shared_spaces
  for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
  );
-- Giải thích: yêu cầu created_by phải là chính user đang gọi — ngăn giả mạo creator.

-- UPDATE: chỉ member của space được sửa nội dung (tasks/notes/reminders/logs/name).
-- Owner check không cần ở đây — mọi member đều được sửa nội dung (collaborative).
-- Optimistic locking (version check) xử lý ở application layer.
create policy "shared_spaces_update_for_member"
  on public.kn_shared_spaces
  for update
  using (is_space_member(id));
-- Cảnh báo: policy này cho phép mọi member sửa name space.
-- Nếu cần restrict đổi tên chỉ cho owner, thêm điều kiện role='owner'.

-- DELETE: chỉ người tạo space (created_by) mới được xoá toàn bộ space.
-- ON DELETE CASCADE ở kn_space_members và kn_space_invites sẽ dọn sạch.
create policy "shared_spaces_delete_for_owner"
  on public.kn_shared_spaces
  for delete
  using (created_by = auth.uid());


-- =============================================================================
-- RLS POLICIES — kn_space_members
-- =============================================================================

-- SELECT: member của 1 space được xem danh sách thành viên của chính space đó.
-- Không được xem membership của space khác.
create policy "space_members_select_for_member"
  on public.kn_space_members
  for select
  using (is_space_member(space_id));

-- INSERT: KHÔNG cho phép insert trực tiếp qua RLS bình thường.
-- Việc thêm member PHẢI đi qua function accept_invite()/create_shared_space()
-- (SECURITY DEFINER) để đảm bảo validate token trước khi cấp quyền thành viên.
create policy "space_members_insert_blocked_use_function"
  on public.kn_space_members
  for insert
  with check (false);
-- Giải thích: with check (false) = luôn từ chối. Chỉ SECURITY DEFINER function
-- mới có thể insert (vì nó chạy dưới quyền postgres, không bị RLS chặn).

-- DELETE: owner được kick bất kỳ member (trừ chính mình),
--         hoặc chính user tự rời space (role='member' — owner không được rời).
create policy "space_members_delete_for_owner_or_self"
  on public.kn_space_members
  for delete
  using (
    (auth.uid() != user_id and is_space_owner(space_id))
    or
    (auth.uid() = user_id and role = 'member')
  );
-- Cảnh báo kỹ thuật: Owner muốn "rời" phải DELETE toàn bộ space (policy DELETE
-- trên kn_shared_spaces). Không có transfer ownership.

-- UPDATE: member chỉ được UPDATE hàng của chính mình (cập nhật enabled_blocks).
-- Không được thay đổi role của bản thân hoặc người khác qua đây.
create policy "space_members_update_own_row"
  on public.kn_space_members
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- Ngăn user tự nâng role của mình: role phải giữ nguyên
    and role = (select role from public.kn_space_members where space_id = kn_space_members.space_id and user_id = auth.uid())
  );
-- Lưu ý: check role không đổi là phòng thủ tại DB layer; application layer
-- cũng không nên gửi thay đổi role qua đây.


-- =============================================================================
-- RLS POLICIES — kn_space_invites
-- =============================================================================

-- SELECT: bất kỳ user đã đăng nhập đều được đọc invite theo token.
-- Cần thiết để validate token khi user bấm link join (chưa là member).
create policy "space_invites_select_for_authenticated"
  on public.kn_space_invites
  for select
  using (auth.uid() is not null);
-- Trade-off: policy này cho phép mọi user đã đăng nhập đọc TẤT CẢ invite
-- (kể cả của space khác) nếu biết token. Vì token là 24-byte random (192-bit)
-- và mỗi query phải cung cấp token chính xác, rủi ro thực tế rất thấp.

-- INSERT: member của space (bất kỳ role) được tạo invite cho space đó.
-- Chỉ member mới được mời thêm người — không cho phép tạo invite cho space lạ.
create policy "space_invites_insert_for_member"
  on public.kn_space_invites
  for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and is_space_member(space_id)
  );
-- Cảnh báo: policy này cho phép cả member (không chỉ owner) tạo invite.
-- Nếu muốn chỉ owner mới mời được, thêm: and is_space_owner(space_id)

-- DELETE: chỉ người tạo invite đó mới được thu hồi (xoá) invite.
-- Owner không tự động được xoá invite của member khác tạo ra.
create policy "space_invites_delete_for_creator"
  on public.kn_space_invites
  for delete
  using (created_by = auth.uid());


-- =============================================================================
-- FUNCTION: accept_invite(p_token text)
-- SECURITY DEFINER: chạy dưới quyền postgres, bypass RLS để INSERT member mới.
-- Cần SECURITY DEFINER vì user mới chưa có membership → RLS trên kn_space_members
-- sẽ block INSERT thông thường (policy "space_members_insert_blocked_use_function").
--
-- Lưu ý: bản dưới đây KHÔNG dùng `using errcode = 'PGRST'` (khác bản gốc ban
-- đầu) — đã fix vì PostgREST kỳ vọng message là JSON khi ERRCODE = 'PGRST',
-- nhưng message tiếng Việt thuần không parse được, khiến client luôn thấy lỗi
-- chung chung "hết hạn/không hợp lệ". `raise exception` thường để PostgREST tự
-- wrap thành HTTP lỗi với message rõ ràng.
-- =============================================================================

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite    public.kn_space_invites%rowtype;
  v_space     public.kn_shared_spaces%rowtype;
  v_caller_id uuid;
begin
  -- 1. Xác định user đang gọi
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Bạn cần đăng nhập để dùng invite link.';
  end if;

  -- 2. Tìm và lock invite theo token (FOR UPDATE để tránh race condition double-accept)
  select * into v_invite
  from public.kn_space_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite link không hợp lệ hoặc không tồn tại.';
  end if;

  -- 3. Kiểm tra token đã được dùng chưa
  if v_invite.accepted_at is not null then
    raise exception 'Invite link này đã được dùng rồi.';
  end if;

  -- 4. Kiểm tra token còn hạn không
  if v_invite.expires_at < now() then
    raise exception 'Invite link đã hết hạn (7 ngày).';
  end if;

  -- 5. Lấy thông tin space
  select * into v_space
  from public.kn_shared_spaces
  where id = v_invite.space_id;

  if not found then
    raise exception 'Space không còn tồn tại.';
  end if;

  -- 6. Kiểm tra user đã là thành viên chưa (tránh duplicate key error)
  if exists (
    select 1 from public.kn_space_members
    where space_id = v_invite.space_id
      and user_id  = v_caller_id
  ) then
    raise exception 'Bạn đã là thành viên của space này rồi.';
  end if;

  -- 7. INSERT member mới với role='member' và enabled_blocks mặc định
  -- SECURITY DEFINER bypass RLS → INSERT thành công dù user chưa có membership
  insert into public.kn_space_members (space_id, user_id, role, enabled_blocks, joined_at)
  values (
    v_invite.space_id,
    v_caller_id,
    'member',
    '{"tasks":true,"notes":true,"reminders":true}'::jsonb,
    now()
  );

  -- 8. Đánh dấu invite đã được dùng (consumed)
  update public.kn_space_invites
  set accepted_at = now(),
      accepted_by = v_caller_id
  where id = v_invite.id;

  -- 9. Trả về thông tin space để client redirect vào đúng space
  return jsonb_build_object(
    'space_id',   v_space.id,
    'space_name', v_space.name,
    'joined_at',  now()
  );

exception
  when others then
    -- Re-raise để client nhận được message rõ ràng
    raise;
end;
$$;

-- Revoke quyền execute mặc định, chỉ cho authenticated user gọi được
revoke execute on function public.accept_invite(text) from public;
grant  execute on function public.accept_invite(text) to authenticated;


-- =============================================================================
-- FUNCTION: create_shared_space(p_name text)
-- Helper: tạo space + tự động thêm creator vào kn_space_members với role='owner'.
-- Dùng SECURITY DEFINER để INSERT vào kn_space_members mà không bị block bởi
-- policy "space_members_insert_blocked_use_function".
-- =============================================================================

create or replace function public.create_shared_space(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space_id  uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Bạn cần đăng nhập để tạo shared space.';
  end if;

  if trim(p_name) = '' then
    raise exception 'Tên space không được để trống.';
  end if;

  -- INSERT space (policy "shared_spaces_insert_for_authenticated" cho phép)
  insert into public.kn_shared_spaces (name, created_by)
  values (trim(p_name), v_caller_id)
  returning id into v_space_id;

  -- INSERT owner vào members — SECURITY DEFINER bypass RLS
  insert into public.kn_space_members (space_id, user_id, role, enabled_blocks, joined_at)
  values (
    v_space_id,
    v_caller_id,
    'owner',
    '{"tasks":true,"notes":true,"reminders":true}'::jsonb,
    now()
  );

  return jsonb_build_object(
    'space_id',   v_space_id,
    'space_name', trim(p_name)
  );
end;
$$;

revoke execute on function public.create_shared_space(text) from public;
grant  execute on function public.create_shared_space(text) to authenticated;


-- =============================================================================
-- GHI CHÚ TÍCH HỢP (cho dev làm việc trên Shared Space)
-- =============================================================================
--
-- 1. TẠO SPACE: gọi `select create_shared_space('Tên space')` thay vì INSERT trực tiếp.
--    Function tự thêm owner vào kn_space_members.
--
-- 2. TẠO INVITE LINK: INSERT vào kn_space_invites với token tự sinh ở client:
--    const token = crypto.randomBytes(24).toString('base64url')  // Node.js
--    -- hoặc btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))))  // browser
--    Link share: https://kn-space.io.vn/join?token=<token>
--
-- 3. ACCEPT INVITE: gọi `select accept_invite('<token>')` khi user bấm link.
--    Function validate → INSERT member → UPDATE accepted_at, trả về space_id để redirect.
--
-- 4. ĐỒNG BỘ ĐA THIẾT BỊ: KHÔNG có Realtime (đã gỡ khỏi code từ commit
--    `aa00fae`, 2026-07-01). Client chỉ đọc dữ liệu mới nhất khi tự load lại
--    (mở app / chuyển Space / F5) — sửa ở máy A không tự đẩy sang máy B đang
--    mở sẵn. Đây là quyết định kiến trúc chủ động, không phải thiếu sót.
--
-- 5. CONFLICT RESOLUTION (last-write-wins theo item):
--    Mỗi task/note/reminder trong JSONB PHẢI có trường "updatedAt" (ISO 8601);
--    mỗi log trong `logs` PHẢI có "createdAt". Khi merge ở client: so sánh
--    updatedAt/createdAt của item local vs item từ DB, giữ cái mới hơn. Không
--    cần OT hay CRDT.
--
-- 6. OPTIMISTIC LOCKING (version):
--    Client đọc version hiện tại → sửa → UPDATE với điều kiện WHERE version = <old_version>.
--    Nếu 0 rows bị ảnh hưởng → version đã thay đổi → fetch lại và retry merge.
--    Ví dụ:
--      UPDATE kn_shared_spaces
--      SET tasks = $1, version = version + 1  -- trigger cũng tăng version, để trigger xử lý
--      WHERE id = $2 AND version = $3;         -- trigger sẽ ghi đè version +1
--    Lưu ý: trigger kn_shared_spaces_before_update tự tăng version, client không cần tự set.
--
-- 7. KHÔNG MIGRATE space cũ (kn_space_state) sang shared space — đây là quyết định đã chốt.
--    Shared space luôn là space MỚI tạo, dữ liệu bắt đầu từ đầu.
--
-- 8. HABITS: không lưu habits trong shared space. Habits block bị ẩn hoàn toàn
--    ở frontend khi user đang xem shared space. enabled_blocks mặc định không có 'habits' (false).
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_spaces (Phần B, bước 1 — 2026-07-09)
-- =============================================================================
-- Xem docs/features/storage-architecture-fix.md mục 3/4 (Phần B) cho bối cảnh
-- đầy đủ. Bảng này thay thế dần cột `spaces jsonb` trong `kn_space_state` — mỗi
-- HÀNG ở đây là 1 Space CÁ NHÂN (thay vì cả mảng Space của 1 user gộp trong 1
-- hàng như hiện tại), để chống bug "1 tab giữ bản cũ ghi đè mất toàn bộ Space
-- khác" (root cause mục 1 tài liệu trên) — cùng cơ chế optimistic locking
-- (`version` + trigger tự tăng) đã chứng minh chạy ổn ở `kn_shared_spaces`.
--
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT BLOCK NÀY: CHỈ chuẩn bị SQL trong repo — CHƯA
-- chạy lên Supabase Dashboard thật, CHƯA có code TypeScript nào đọc/ghi bảng
-- này (`kn_space_state` vẫn là nguồn đọc/ghi Space cá nhân đang chạy thật).
-- Đây thuần là bảng THÊM MỚI, không đụng/không migrate bảng cũ — an toàn chạy
-- độc lập trên production khi chủ dự án xác nhận (xem hướng dẫn cuối file).
--
-- Quyết định thiết kế:
--   - Giữ NGUYÊN `id` (uuid) làm khoá chính — client hiện đang tự sinh Space.id
--     qua `crypto.randomUUID()` trước khi ghi (xem `src/state/reducers/spaces.ts`),
--     nên KHÔNG đặt default `gen_random_uuid()` như `kn_shared_spaces` (ở đó id
--     do server sinh, trả ngược lại client) — insert phải luôn gửi kèm `id` để
--     giữ nguyên định danh Space qua migration, không phải đổi tham chiếu ở FE.
--   - Cột `space_order` (KHÔNG đặt tên `order`) — `order` là từ khoá dành riêng
--     của SQL (ORDER BY), đặt tên cột trùng dễ gây lỗi/nhầm lẫn khi viết SQL tay
--     (migration script ở bước 5, hoặc debug trên SQL Editor) dù PostgREST tự
--     quote được. Ứng với field `Space.order` ở `src/types.ts` — tầng
--     `storage/` khi viết lại (bước 4) sẽ map `order` (FE) <-> `space_order` (DB),
--     giống cách `sharedSpaceStore.ts` đã map `enabledBlocks` <-> `enabled_blocks`.
--   - Đủ cột dữ liệu khớp `interface Space` (`src/types.ts`): `tasks`, `reminders`,
--     `habits`, `notes`, `logs` (Space cá nhân CÓ habits, khác Shared Space đã
--     chủ động bỏ) — mỗi cột 1 mảng JSONB riêng, KHÔNG gộp chung 1 cột `spaces`
--     như `kn_space_state` (đây chính là điểm sửa gốc kiến trúc). 3 field
--     `isShared`/`sharedSpaceId`/`_sharedVersion` của `Space` type KHÔNG cần cột
--     — chỉ có ý nghĩa cho Shared Space, tầng `storage/` sẽ tự set `isShared:
--     false` khi map hàng bảng này ra `Space` object, giống cách `rowToSpace()`
--     tự set `isShared: true` cho Shared Space.
--   - `enabled_blocks` default có `habits: true` (khác default Shared Space) —
--     đúng `defaultEnabledBlocks()` hiện tại của Space cá nhân
--     (`src/state/reducers/spaces.ts`).
--   - `version`/trigger/RLS: copy CHÍNH XÁC cơ chế `kn_shared_spaces` +
--     `kn_shared_spaces_before_update`, chỉ đổi RLS từ membership-based sang
--     `auth.uid() = user_id` (Space cá nhân không có khái niệm chia sẻ).
-- =============================================================================

create table if not exists public.kn_private_spaces (
  -- id KHÔNG có default — client luôn tự gửi kèm uuid đã sinh sẵn (giữ nguyên
  -- định danh Space hiện có khi migrate từ kn_space_state.spaces[], xem bước 5).
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null default '',
  -- space_order: tương ứng field `order` trong `Space` type (FE) — xem giải
  -- thích lý do đổi tên ở comment khối phía trên.
  space_order    integer not null default 0,
  enabled_blocks jsonb not null default
    '{"tasks":true,"reminder":true,"habits":true,"notes":true,"reminders":true,"logs":true}'::jsonb,
  -- tasks/reminders/habits/notes/logs: LỊCH SỬ — KHÔNG còn được app đọc/ghi từ 2026-07-11 (dọn dẹp
  -- "Việc 1", xem docs/features/item-level-entity-tables-progress.md câu hỏi mở #2). Cả 5 entity đã
  -- cutover hoàn toàn sang bảng item-level riêng (kn_private_tasks/kn_private_reminders/
  -- kn_private_habits/kn_private_notes/kn_private_logs, qua src/state/itemPersist.ts). 5 cột dưới
  -- đây giữ NGUYÊN (KHÔNG xoá/ALTER/DROP) làm lưới an toàn lịch sử — dữ liệu trong đó có thể LỖI
  -- THỜI (đứng yên từ mốc cutover, không phản ánh thay đổi sau đó), tuyệt đối KHÔNG dùng làm nguồn
  -- đọc/ghi mới.
  tasks          jsonb not null default '[]'::jsonb,
  reminders      jsonb not null default '[]'::jsonb,
  habits         jsonb not null default '[]'::jsonb,
  notes          jsonb not null default '[]'::jsonb,
  -- logs: mảng "Nhật ký nhanh" — giống cột cùng tên ở kn_shared_spaces, mỗi
  -- phần tử PHẢI có { id, content, createdAt, ... } (xem LogEntry trong types.ts). LỊCH SỬ, xem trên.
  logs           jsonb not null default '[]'::jsonb,
  -- version: tăng 1 mỗi lần UPDATE (optimistic locking) — copy CHÍNH XÁC cơ chế
  -- đã dùng ở kn_shared_spaces, xem trigger bên dưới.
  version        bigint not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.kn_private_spaces enable row level security;

-- Tự động cập nhật updated_at và tăng version mỗi khi UPDATE — copy CHÍNH XÁC
-- logic của kn_shared_spaces_before_update, chỉ đổi tên hàm/trigger cho bảng này.
create or replace function public.kn_private_spaces_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_spaces_before_update
  before update on public.kn_private_spaces
  for each row execute function public.kn_private_spaces_before_update();

-- RLS: Space cá nhân — KHÔNG có khái niệm chia sẻ/membership (khác kn_shared_spaces),
-- mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình. Đúng nguyên tắc đang
-- áp dụng cho kn_space_state ở đầu file này.
create policy "select own private spaces" on public.kn_private_spaces
  for select using (auth.uid() = user_id);

create policy "insert own private spaces" on public.kn_private_spaces
  for insert with check (auth.uid() = user_id);

create policy "update own private spaces" on public.kn_private_spaces
  for update using (auth.uid() = user_id);

create policy "delete own private spaces" on public.kn_private_spaces
  for delete using (auth.uid() = user_id);

-- Tra cứu toàn bộ Space cá nhân của 1 user (load lúc mở app) — thao tác đọc
-- chính của bảng này, cần index theo user_id.
create index if not exists idx_kn_private_spaces_user_id
  on public.kn_private_spaces (user_id);

-- Hỗ trợ đọc theo đúng thứ tự hiển thị Space (space_order) trong 1 lần query,
-- tránh phải sort lại toàn bộ ở application layer khi danh sách Space dài.
create index if not exists idx_kn_private_spaces_user_id_order
  on public.kn_private_spaces (user_id, space_order);


-- =============================================================================
-- ITEM-LEVEL ENTITY TABLES (2026-07-10 → 2026-07-11) — tách 5 entity con
-- (Log/Habit/Reminder/Task/Note) khỏi mảng jsonb trong kn_private_spaces/
-- kn_shared_spaces sang bảng riêng theo từng item, mirror CHÍNH XÁC cơ chế
-- kn_private_spaces/kn_shared_spaces ở trên (version + trigger tự tăng, RLS
-- theo user_id/is_space_member). Xem docs/features/item-level-entity-tables.md
-- + -progress.md cho kế hoạch đầy đủ, docs/features/item-level-<entity>-schema.sql
-- (đã đánh dấu "ĐÃ GỘP") cho lịch sử quyết định thiết kế gốc từng bước.
--
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT BLOCK NÀY: cả 5 entity đã tạo bảng thật + đã
-- migrate dữ liệu cũ + đã bật dual-write (`src/state/itemPersist.ts`, mọi cờ
-- `<ENTITY>_ITEM_PERSIST_ENABLED = true`) + đã cutover phần ĐỌC (`AppStateContext.tsx`
-- đọc thẳng từ 10 bảng dưới đây, KHÔNG còn đọc cột jsonb tương ứng). Nhánh ghi
-- vào cột jsonb cũ (`tasks`/`reminders`/`habits`/`notes`/`logs` trong
-- kn_private_spaces/kn_shared_spaces) VẪN CHẠY SONG SONG làm lưới an toàn, chưa
-- tắt hẳn — chưa xoá cột jsonb khỏi 2 bảng Space.
--
-- Quyết định thiết kế chung (Phương án B — 2 bảng tách riêng theo loại Space,
-- KHÔNG polymorphic FK, xem item-level-entity-tables.md mục 3.2/3.4 + mục 10):
--   - `id` uuid mỗi bảng — CLIENT tự sinh (`crypto.randomUUID()`), KHÔNG default
--     `gen_random_uuid()` — giữ nguyên định danh item qua migration.
--   - `space_id` — FK duy nhất trỏ về ĐÚNG 1 bảng cha (kn_private_spaces cho
--     bảng private, kn_shared_spaces cho bảng shared), `on delete cascade`.
--   - `user_id` (CHỈ có ở bảng private) — cột RLS trực tiếp, KHÔNG join qua
--     kn_private_spaces. Bảng shared quyền check qua `is_space_member(space_id)`
--     (SECURITY DEFINER, tránh đệ quy RLS).
--   - `version`/trigger `*_before_update` — mọi bảng CÓ cột `version` + trigger
--     tự tăng vô điều kiện mỗi UPDATE (cho `updated_at` "miễn phí"), nhưng tầng
--     app ghi thẳng blind write (`WHERE id = itemId`, KHÔNG kèm
--     `AND version = expected`), KHÔNG version-check/retry — quyết định đã chốt
--     2026-07-10, xem docs/features/conflict-handling-simplification.md mục 4.3.
--   - Habit KHÔNG có bản Shared (chỉ `kn_private_habits`) — Habit block ẩn hoàn
--     toàn ở Shared Space (xem mục Shared Space phía trên). 4 entity còn lại
--     (Log/Reminder/Task/Note) đều có cặp bảng private + shared.
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_logs / kn_shared_logs — Nhật ký nhanh (Log), item-level Bước 1
-- =============================================================================
-- Riêng entity này:
--   - `created_by` (uuid, NULL được) — "ai viết log này" (chỉ có ý nghĩa hiển
--     thị avatar ở Shared Space, xem `LogEntry.createdBy` trong `src/types.ts`),
--     KHÔNG dùng cho RLS. `on delete set null` — xoá 1 user không nên kéo theo
--     xoá log người khác đang xem trong Shared Space.
--   - `content`, `expense_date`, `category_override`, `excluded` — khớp
--     `LogEntry` (`src/types.ts`). 3 field expense là phần MỞ RỘNG sau
--     (docs/features/quan-ly-chi-tieu.md), optional/NULL = "chưa đặt", tầng app
--     tự áp default khi đọc (xem `logStore.ts` rowToLog()).
--   - `created_at` — dùng THẲNG làm nguồn `LogEntry.createdAt` (KHÔNG có cột
--     `createdAt` riêng ở tầng app). Có `default now()` làm lưới an toàn (phòng
--     code quên set), NHƯNG mọi lượt CREATE/migration/import THẬT SỰ PHẢI gửi
--     kèm giá trị tường minh (`logStore.ts` luôn set `created_at = log.createdAt`)
--     — KHÔNG được để DB tự sinh `now()` khi migrate log cũ, nếu không sẽ mất
--     mốc thời gian gốc của log đã tạo từ trước.
--   - Không có cột `order` — Log sort thuần theo `created_at`, không có kéo-thả
--     thủ công (khác Task/Note — cần fractional-index).
-- =============================================================================

create table if not exists public.kn_private_logs (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  content            text not null,
  created_by         uuid null references auth.users (id) on delete set null,
  expense_date       text null,
  category_override  text null,
  excluded           boolean null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_logs enable row level security;

create or replace function public.kn_private_logs_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_logs_before_update
  before update on public.kn_private_logs
  for each row execute function public.kn_private_logs_before_update();

-- RLS: giống hệt kn_private_spaces — không có khái niệm chia sẻ, mỗi user chỉ
-- đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private logs" on public.kn_private_logs
  for select using (auth.uid() = user_id);

create policy "insert own private logs" on public.kn_private_logs
  for insert with check (auth.uid() = user_id);

create policy "update own private logs" on public.kn_private_logs
  for update using (auth.uid() = user_id);

create policy "delete own private logs" on public.kn_private_logs
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ log của 1 Space, sort theo created_at.
create index if not exists idx_kn_private_logs_space_id
  on public.kn_private_logs (space_id);

create index if not exists idx_kn_private_logs_space_id_created_at
  on public.kn_private_logs (space_id, created_at);


create table if not exists public.kn_shared_logs (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_shared_spaces (id) on delete cascade,
  content            text not null,
  created_by         uuid null references auth.users (id) on delete set null,
  expense_date       text null,
  category_override  text null,
  excluded           boolean null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_shared_logs enable row level security;

create or replace function public.kn_shared_logs_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_logs_before_update
  before update on public.kn_shared_logs
  for each row execute function public.kn_shared_logs_before_update();

-- RLS: dùng is_space_member()/is_space_owner() (SECURITY DEFINER, đã có sẵn ở
-- trên) để tránh đệ quy RLS — mirror CHÍNH XÁC "shared_spaces_*_for_member" của
-- kn_shared_spaces. Mọi member (không chỉ owner) được sửa/xoá log của người
-- khác trong CÙNG space — đúng hành vi cũ (mảng jsonb dùng chung, ai cũng
-- sửa/xoá được bất kỳ item nào), KHÔNG có giới hạn quyền theo người tạo (ngoài
-- phạm vi, xem docs/features/conflict-handling-simplification.md mục 5).
create policy "shared_logs_select_for_member"
  on public.kn_shared_logs
  for select
  using (is_space_member(space_id));

create policy "shared_logs_insert_for_member"
  on public.kn_shared_logs
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_logs_update_for_member"
  on public.kn_shared_logs
  for update
  using (is_space_member(space_id));

create policy "shared_logs_delete_for_member"
  on public.kn_shared_logs
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_logs_space_id
  on public.kn_shared_logs (space_id);

create index if not exists idx_kn_shared_logs_space_id_created_at
  on public.kn_shared_logs (space_id, created_at);


-- =============================================================================
-- BẢNG: kn_private_habits — Thói quen (Habit), item-level Bước 2 (KHÔNG có bản Shared)
-- =============================================================================
-- KHÁC kn_private_logs/kn_shared_logs — Habit KHÔNG có bản Shared: CHỈ 1 bảng
-- `kn_private_habits`, không có `kn_shared_habits`. Habit block bị ẩn hoàn toàn
-- ở Shared Space (Shared Space không lưu `habits`, `enabled_blocks` mặc định ép
-- `habits: false`, `sharedSpaceStore.ts` ép cứng `habits: []` bất kể DB lưu gì).
--
-- Riêng entity này:
--   - `title`, `completed_dates` (jsonb, mảng `yyyy-mm-dd`, giữ nguyên kiểu cũ —
--     khớp `Habit.completedDates` trong `src/types.ts`).
--   - Không có cột `order` — Habit giữ nguyên thứ tự mảng khi tạo (push vào
--     cuối), KHÔNG có kéo-thả thủ công. Load sort theo `created_at` tăng dần để
--     giữ đúng thứ tự tạo.
--   - `created_at` — có `default now()`, tầng app (`habitStore.ts`) KHÔNG cần
--     set tường minh khi tạo mới (khác Log — Habit không có field `createdAt`
--     hiển thị ở FE, cột này chỉ dùng nội bộ để sort đúng thứ tự tạo).
-- =============================================================================

create table if not exists public.kn_private_habits (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  completed_dates    jsonb not null default '[]'::jsonb,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_habits enable row level security;

create or replace function public.kn_private_habits_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_habits_before_update
  before update on public.kn_private_habits
  for each row execute function public.kn_private_habits_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_logs — không có khái niệm chia
-- sẻ, mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private habits" on public.kn_private_habits
  for select using (auth.uid() = user_id);

create policy "insert own private habits" on public.kn_private_habits
  for insert with check (auth.uid() = user_id);

create policy "update own private habits" on public.kn_private_habits
  for update using (auth.uid() = user_id);

create policy "delete own private habits" on public.kn_private_habits
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ habit của 1 Space, sort theo created_at.
create index if not exists idx_kn_private_habits_space_id
  on public.kn_private_habits (space_id);

create index if not exists idx_kn_private_habits_space_id_created_at
  on public.kn_private_habits (space_id, created_at);


-- =============================================================================
-- BẢNG: kn_private_reminders / kn_shared_reminders — Nhắc việc (Reminder), item-level Bước 3
-- =============================================================================
-- Riêng entity này:
--   - Reminder KHÔNG có field `createdBy` ở tầng app (`ReminderOnce`/
--     `ReminderRecurring` không có field này, khác Task/Note/Log) — vì vậy 2
--     bảng dưới đây KHÔNG có cột `created_by`.
--   - `reminder_type` ('once' | 'recurring'), `title` — khớp
--     `ReminderDefinition` (`src/types.ts`).
--   - `date` (text, null được) — CHỈ có ý nghĩa với `type = 'once'`. Luôn NULL
--     với `type = 'recurring'` (tầng app tự null tường minh khi ghi).
--   - `time` (text, not null default '') — dùng ở CẢ 2 type, luôn là string
--     không optional ở tầng app ('' = "không đặt giờ"), không cần nullable.
--   - `freq_n` (integer, null được), `freq_unit` (text, null được, check trong
--     ('hour','day','month')), `day_of_month` (integer, null được) — CHỈ có ý
--     nghĩa với `type = 'recurring'`. Luôn NULL với `type = 'once'`.
--   - `created_at` — dùng THẲNG làm nguồn `ReminderRecurring.createdAt` (MỐC
--     TÍNH CHU KỲ lặp lại — giữ nguyên qua mọi lần sửa nếu vẫn 'recurring', làm
--     mới thành "now" nếu vừa chuyển từ 'once' sang 'recurring'). Với `type =
--     'once'`, cột này KHÔNG mang ý nghĩa tính toán gì, tầng app KHÔNG set
--     tường minh khi ghi (giữ nguyên giá trị gốc lúc INSERT lần đầu). Có
--     `default now()` làm lưới an toàn, NHƯNG mọi lượt CREATE/UPDATE (khi
--     type='recurring')/migration THẬT SỰ PHẢI gửi kèm giá trị tường minh —
--     KHÔNG được để DB tự sinh `now()` cho reminder recurring, nếu không sẽ làm
--     sai lệch mốc tính chu kỳ (đặc biệt chu kỳ theo "Giờ" — neo theo đúng
--     giờ:phút lúc tạo, xem `supabase/functions/send-due-notifications/index.ts`).
--   - Không có cột `order` — Reminder KHÔNG có kéo-thả thủ công, luôn unshift
--     vào ĐẦU mảng khi tạo — load sort theo `created_at` GIẢM DẦN (mới nhất
--     trước) để khớp đúng hành vi hiển thị cũ — NGƯỢC HƯỚNG với
--     kn_private_logs/kn_private_habits (2 bảng đó sort TĂNG DẦN vì Log/Habit
--     lần lượt append/push vào CUỐI mảng).
-- =============================================================================

create table if not exists public.kn_private_reminders (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  reminder_type      text not null check (reminder_type in ('once', 'recurring')),
  title              text not null,
  date               text null,
  time               text not null default '',
  freq_n             integer null,
  freq_unit          text null check (freq_unit in ('hour', 'day', 'month')),
  day_of_month       integer null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_reminders enable row level security;

create or replace function public.kn_private_reminders_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_reminders_before_update
  before update on public.kn_private_reminders
  for each row execute function public.kn_private_reminders_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_logs — không có khái niệm chia
-- sẻ, mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private reminders" on public.kn_private_reminders
  for select using (auth.uid() = user_id);

create policy "insert own private reminders" on public.kn_private_reminders
  for insert with check (auth.uid() = user_id);

create policy "update own private reminders" on public.kn_private_reminders
  for update using (auth.uid() = user_id);

create policy "delete own private reminders" on public.kn_private_reminders
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ reminder của 1 Space, sort theo created_at.
create index if not exists idx_kn_private_reminders_space_id
  on public.kn_private_reminders (space_id);

create index if not exists idx_kn_private_reminders_space_id_created_at
  on public.kn_private_reminders (space_id, created_at);


create table if not exists public.kn_shared_reminders (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_shared_spaces (id) on delete cascade,
  reminder_type      text not null check (reminder_type in ('once', 'recurring')),
  title              text not null,
  date               text null,
  time               text not null default '',
  freq_n             integer null,
  freq_unit          text null check (freq_unit in ('hour', 'day', 'month')),
  day_of_month       integer null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_shared_reminders enable row level security;

create or replace function public.kn_shared_reminders_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_reminders_before_update
  before update on public.kn_shared_reminders
  for each row execute function public.kn_shared_reminders_before_update();

-- RLS: dùng is_space_member()/is_space_owner() — mirror CHÍNH XÁC
-- "shared_logs_*_for_member" của kn_shared_logs. Mọi member (không chỉ owner)
-- được sửa/xoá reminder của người khác trong CÙNG space — đúng hành vi cũ,
-- KHÔNG có giới hạn quyền theo người tạo (Reminder không có field `createdBy`
-- ở tầng app, không có khái niệm "người tạo" để giới hạn).
create policy "shared_reminders_select_for_member"
  on public.kn_shared_reminders
  for select
  using (is_space_member(space_id));

create policy "shared_reminders_insert_for_member"
  on public.kn_shared_reminders
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_reminders_update_for_member"
  on public.kn_shared_reminders
  for update
  using (is_space_member(space_id));

create policy "shared_reminders_delete_for_member"
  on public.kn_shared_reminders
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_reminders_space_id
  on public.kn_shared_reminders (space_id);

create index if not exists idx_kn_shared_reminders_space_id_created_at
  on public.kn_shared_reminders (space_id, created_at);


-- =============================================================================
-- BẢNG: kn_private_tasks / kn_shared_tasks — Việc cần làm (Task), item-level Bước 4
-- =============================================================================
-- Riêng entity này:
--   - `id` — quan trọng: Task còn được dùng làm deep-link trong notify Shared
--     Space (xem docs/features/shared-space-task-assign-notify.md) — id KHÔNG
--     được đổi qua migration.
--   - `created_by` (uuid, NULL được) — "ai giao/tạo task này" (chỉ có ý nghĩa
--     hiển thị avatar ở Shared Space, xem `Task.createdBy`), KHÔNG dùng cho
--     RLS. `on delete set null`.
--   - `title`, `content`, `task_date`, `task_time`, `done` — khớp `Task`
--     (`src/types.ts`). Cả 4 field text đều KHÔNG optional ở tầng app (rỗng ''
--     = "chưa đặt", CHỨ KHÔNG PHẢI null) — NOT NULL DEFAULT ''.
--   - `item_order` (double precision, NOT NULL, KHÔNG có default) —
--     fractional-index (xem item-level-entity-tables.md mục 5): kéo-thả chỉ
--     tính lại `item_order` của ĐÚNG 1 task vừa kéo (`computeOrderForInsertAt()`,
--     `src/state/fractionalOrder.ts`), các task khác giữ nguyên — khác hẳn
--     `order` kiểu integer cũ (reindex `0..n-1` toàn mảng mỗi lần kéo-thả).
--     Migration giữ NGUYÊN giá trị `order` cũ (số nguyên hiện có) làm giá trị
--     fractional ban đầu.
--   - `assignee_ids` (jsonb, NOT NULL DEFAULT '[]') — GIỮ NGUYÊN kiểu jsonb
--     (KHÔNG đổi sang `uuid[]`, dự án chưa có tiền lệ cột mảng kiểu đó, không
--     có nhu cầu query server-side theo assignee hiện tại).
--   - `created_at` (timestamptz, NULL ĐƯỢC, KHÔNG có default) — khác hẳn
--     kn_private_logs/kn_private_reminders (NOT NULL DEFAULT now()):
--     `Task.createdAt` là field THẬT SỰ OPTIONAL ở tầng app (`createdAt?: string`)
--     — Task tạo TRƯỚC khi field này ra đời hoàn toàn có thể THIẾU field này
--     thật sự, và điều đó có Ý NGHĨA KHÁC với "vừa tạo bây giờ" — dùng để sort
--     trong `MobileChatScreen.tsx` (item thiếu `createdAt` bị coi là "rất cũ",
--     xếp lên đầu). Nếu cột này NOT NULL DEFAULT now(), 1 task cũ migrate thiếu
--     field sẽ vô tình được gán "vừa tạo bây giờ", sai lệch thứ tự hiển thị
--     trong màn Trò chuyện (mobile). Vì vậy: migration/tạo mới CHỈ set
--     `created_at` khi `Task.createdAt` có giá trị thật, bỏ hẳn field này khi
--     task KHÔNG có `createdAt` (xem `taskStore.ts` `toInsertRow`).
-- =============================================================================

create table if not exists public.kn_private_tasks (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  content            text not null default '',
  task_date          text not null default '',
  task_time          text not null default '',
  done               boolean not null default false,
  item_order         double precision not null,
  created_by         uuid null references auth.users (id) on delete set null,
  assignee_ids       jsonb not null default '[]'::jsonb,
  created_at         timestamptz null,
  version            bigint not null default 1,
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_tasks enable row level security;

create or replace function public.kn_private_tasks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_tasks_before_update
  before update on public.kn_private_tasks
  for each row execute function public.kn_private_tasks_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_logs/kn_private_reminders —
-- không có khái niệm chia sẻ, mỗi user chỉ đọc/ghi đúng hàng có
-- user_id = chính mình.
create policy "select own private tasks" on public.kn_private_tasks
  for select using (auth.uid() = user_id);

create policy "insert own private tasks" on public.kn_private_tasks
  for insert with check (auth.uid() = user_id);

create policy "update own private tasks" on public.kn_private_tasks
  for update using (auth.uid() = user_id);

create policy "delete own private tasks" on public.kn_private_tasks
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ task của 1 Space, sort theo item_order.
create index if not exists idx_kn_private_tasks_space_id
  on public.kn_private_tasks (space_id);

create index if not exists idx_kn_private_tasks_space_id_item_order
  on public.kn_private_tasks (space_id, item_order);


create table if not exists public.kn_shared_tasks (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_shared_spaces (id) on delete cascade,
  title              text not null,
  content            text not null default '',
  task_date          text not null default '',
  task_time          text not null default '',
  done               boolean not null default false,
  item_order         double precision not null,
  created_by         uuid null references auth.users (id) on delete set null,
  assignee_ids       jsonb not null default '[]'::jsonb,
  created_at         timestamptz null,
  version            bigint not null default 1,
  updated_at         timestamptz not null default now()
);

alter table public.kn_shared_tasks enable row level security;

create or replace function public.kn_shared_tasks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_tasks_before_update
  before update on public.kn_shared_tasks
  for each row execute function public.kn_shared_tasks_before_update();

-- RLS: dùng is_space_member()/is_space_owner() — mirror CHÍNH XÁC
-- "shared_reminders_*_for_member" của kn_shared_reminders. Mọi member (không
-- chỉ owner) được sửa/xoá task của người khác trong CÙNG space — đúng hành vi
-- cũ, KHÔNG có giới hạn quyền theo người tạo.
create policy "shared_tasks_select_for_member"
  on public.kn_shared_tasks
  for select
  using (is_space_member(space_id));

create policy "shared_tasks_insert_for_member"
  on public.kn_shared_tasks
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_tasks_update_for_member"
  on public.kn_shared_tasks
  for update
  using (is_space_member(space_id));

create policy "shared_tasks_delete_for_member"
  on public.kn_shared_tasks
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_tasks_space_id
  on public.kn_shared_tasks (space_id);

create index if not exists idx_kn_shared_tasks_space_id_item_order
  on public.kn_shared_tasks (space_id, item_order);


-- =============================================================================
-- BẢNG: kn_private_notes / kn_shared_notes — Ghi chú (Note), item-level Bước 5 (cuối cùng)
-- =============================================================================
-- Riêng entity này:
--   - `title`, `content`, `color` — khớp `Note` (`src/types.ts`), text NOT
--     NULL. `title` không có default (reducer luôn trim/fallback 'Note chưa
--     đặt tên' trước khi lưu, không bao giờ rỗng thật). `content`/`color` NOT
--     NULL DEFAULT '' (phòng thủ, dù reducer cũng luôn set giá trị thật).
--   - `hidden` (boolean, NOT NULL DEFAULT false) — "ẩn nội dung" (note bảo mật,
--     xem `NOTE_TOGGLE_CONTENT_HIDDEN`) — persist để giữ trạng thái ẩn sau
--     reload, KHÔNG liên quan gì tới mốc sửa nội dung (xem giải thích cột
--     `content_updated_at` bên dưới).
--   - `item_order` (double precision, NOT NULL, KHÔNG có default) —
--     fractional-index, mirror CHÍNH XÁC kn_private_tasks/kn_shared_tasks.
--     Migration giữ NGUYÊN giá trị `order` cũ làm giá trị fractional ban đầu.
--   - `created_at` (timestamptz, NULL ĐƯỢC, KHÔNG có default) — mirror
--     kn_private_tasks/kn_shared_tasks: `Note.createdAt` là field THẬT SỰ
--     OPTIONAL ở tầng app, note tạo TRƯỚC khi field này ra đời hoàn toàn có thể
--     THIẾU field này thật sự — dùng để sort trong `MobileChatScreen.tsx` (item
--     thiếu `createdAt` bị coi là "rất cũ", xếp lên đầu). Migration/tạo mới
--     CHỈ set `created_at` khi `Note.createdAt` có giá trị thật (xem
--     `noteStore.ts` `toInsertRow`).
--   - **`content_updated_at` (double precision, NOT NULL, KHÔNG có default) —
--     cột RIÊNG, TÁCH KHỎI trigger `updated_at` nội bộ, chỉ tầng APP set tường
--     minh. LÝ DO (rủi ro thiết kế đã xác định trước khi tạo bảng):**
--     `Note.updatedAt` (`src/types.ts`, epoch ms) là mốc "sửa nội dung lần
--     cuối" — hiển thị cho user ("đã sửa lúc...") VÀ dùng để sort "Mới sửa gần
--     nhất" (`NotesBlock.tsx`). Ở tầng reducer (`state/reducers/notes.ts`),
--     field này CHỈ đổi ở `NOTE_CREATE`/`NOTE_UPDATE` — KHÔNG đổi khi kéo-thả
--     (`NOTE_REORDER`) hay ẩn/hiện (`NOTE_TOGGLE_CONTENT_HIDDEN`). Nếu dùng
--     thẳng cột `updated_at` do trigger `*_before_update` tự bump VÔ ĐIỀU KIỆN
--     mỗi lần UPDATE (cách Log/Reminder/Task làm cho field tương ứng của họ —
--     2 khái niệm trùng nhau ở các entity đó), 1 lần kéo-thả hoặc ẩn/hiện 1
--     note sẽ VÔ TÌNH đổi "đã sửa lúc..." hiển thị cho user và làm SAI thứ tự
--     sort "Mới sửa gần nhất" — đây là REGRESSION thật so với hành vi cũ
--     (jsonb), PHẢI TRÁNH. Giải pháp: cột `content_updated_at` này CHỈ được
--     `noteStore.ts` set tường minh khi ghi `NOTE_CREATE`/`NOTE_UPDATE` (map
--     thẳng `Note.updatedAt` -> `content_updated_at`, KHÔNG qua `Date`/ISO
--     string — cả 2 đều epoch ms number), KHÔNG đụng khi ghi `NOTE_REORDER`
--     (chỉ patch `item_order`)/`NOTE_TOGGLE_CONTENT_HIDDEN` (chỉ patch
--     `hidden`). Cột `updated_at` (trigger nội bộ, mirror các bảng khác —
--     "miễn phí") VẪN GIỮ trên DB nhưng KHÔNG được tầng app đọc/dùng để suy ra
--     `Note.updatedAt` — chỉ có ý nghĩa nội bộ (audit "hàng này được UPDATE lần
--     cuối lúc nào trên DB", không phải "nội dung note được sửa lúc nào").
-- =============================================================================

create table if not exists public.kn_private_notes (
  id                   uuid primary key,
  space_id             uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  title                text not null,
  content              text not null default '',
  color                text not null default '',
  hidden               boolean not null default false,
  item_order           double precision not null,
  created_by           uuid null references auth.users (id) on delete set null,
  created_at           timestamptz null,
  content_updated_at   double precision not null,
  version              bigint not null default 1,
  updated_at           timestamptz not null default now()
);

alter table public.kn_private_notes enable row level security;

create or replace function public.kn_private_notes_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_notes_before_update
  before update on public.kn_private_notes
  for each row execute function public.kn_private_notes_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_tasks — không có khái niệm chia
-- sẻ, mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private notes" on public.kn_private_notes
  for select using (auth.uid() = user_id);

create policy "insert own private notes" on public.kn_private_notes
  for insert with check (auth.uid() = user_id);

create policy "update own private notes" on public.kn_private_notes
  for update using (auth.uid() = user_id);

create policy "delete own private notes" on public.kn_private_notes
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ note của 1 Space, sort theo item_order.
create index if not exists idx_kn_private_notes_space_id
  on public.kn_private_notes (space_id);

create index if not exists idx_kn_private_notes_space_id_item_order
  on public.kn_private_notes (space_id, item_order);


create table if not exists public.kn_shared_notes (
  id                   uuid primary key,
  space_id             uuid not null references public.kn_shared_spaces (id) on delete cascade,
  title                text not null,
  content              text not null default '',
  color                text not null default '',
  hidden               boolean not null default false,
  item_order           double precision not null,
  created_by           uuid null references auth.users (id) on delete set null,
  created_at           timestamptz null,
  content_updated_at   double precision not null,
  version              bigint not null default 1,
  updated_at           timestamptz not null default now()
);

alter table public.kn_shared_notes enable row level security;

create or replace function public.kn_shared_notes_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_notes_before_update
  before update on public.kn_shared_notes
  for each row execute function public.kn_shared_notes_before_update();

-- RLS: dùng is_space_member() — mirror CHÍNH XÁC "shared_tasks_*_for_member"
-- của kn_shared_tasks. Mọi member (không chỉ owner) được sửa/xoá note của
-- người khác trong CÙNG space — đúng hành vi cũ, KHÔNG có giới hạn quyền theo
-- người tạo.
create policy "shared_notes_select_for_member"
  on public.kn_shared_notes
  for select
  using (is_space_member(space_id));

create policy "shared_notes_insert_for_member"
  on public.kn_shared_notes
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_notes_update_for_member"
  on public.kn_shared_notes
  for update
  using (is_space_member(space_id));

create policy "shared_notes_delete_for_member"
  on public.kn_shared_notes
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_notes_space_id
  on public.kn_shared_notes (space_id);

create index if not exists idx_kn_shared_notes_space_id_item_order
  on public.kn_shared_notes (space_id, item_order);
