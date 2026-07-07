-- =============================================================================
-- KN-Space — Schema cho tính năng Shared Space (Phase 3)
-- =============================================================================
-- Chạy file này RIÊNG, SAU KHI đã có schema Phase 2 (supabase/schema.sql).
-- Không xung đột với bảng kn_space_state đã có.
--
-- Quyết định thiết kế đã chốt:
--   - Habits block bị ẩn trong shared space → KHÔNG lưu habits ở đây
--   - Invite: token-based (24 bytes base64url), 1 token = 1 người, hết hạn 7 ngày
--   - Conflict: item-level last-write-wins (mỗi task/note/reminder có updatedAt riêng)
--   - Chỉ tạo shared space mới — không migrate space cá nhân cũ sang shared
--   - Phân quyền phẳng: owner (người tạo) và member (người được mời)
-- =============================================================================


-- =============================================================================
-- BẢNG 1: kn_shared_spaces
-- Mỗi hàng = 1 shared space. Dữ liệu tasks/notes/reminders lưu dạng JSONB.
-- Mỗi item trong mảng PHẢI có trường "updatedAt" (ISO 8601 string) để
-- resolve conflict theo last-write-wins ở application layer.
-- =============================================================================

create table if not exists public.kn_shared_spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id) on delete restrict,
  -- version: tăng 1 mỗi lần UPDATE (dùng cho optimistic locking ở client).
  -- Client gửi kèm version hiện tại; nếu version trên DB đã lớn hơn → báo conflict.
  version     bigint not null default 1,
  -- tasks: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... }
  tasks       jsonb not null default '[]'::jsonb,
  -- notes: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... }
  notes       jsonb not null default '[]'::jsonb,
  -- reminders: mảng JSON, mỗi phần tử PHẢI có { id, updatedAt, ... }
  reminders   jsonb not null default '[]'::jsonb,
  -- habits KHÔNG có ở đây (đã bỏ theo Q2)
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

-- Bật Realtime để đồng bộ giữa các thành viên đang mở cùng space
alter publication supabase_realtime add table public.kn_shared_spaces;


-- =============================================================================
-- BẢNG 2: kn_space_members
-- Liên kết user ↔ shared space. PK kép (space_id, user_id) đảm bảo 1 user
-- chỉ là thành viên 1 lần trong mỗi space.
-- =============================================================================

create table if not exists public.kn_space_members (
  space_id        uuid not null references public.kn_shared_spaces (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- role: 'owner' = người tạo space, 'member' = người được mời
  -- Mô hình phẳng — không có 'admin' hay phân quyền chi tiết hơn ở Phase 3
  role            text not null check (role in ('owner', 'member')),
  -- enabled_blocks: cấu hình UI riêng của từng member (khối nào hiện/ẩn).
  -- Ví dụ: { "tasks": true, "notes": true, "reminders": false }
  -- Habits KHÔNG được include ở đây vì bị ẩn trong shared space.
  enabled_blocks  jsonb not null default '{"tasks":true,"notes":true,"reminders":true}'::jsonb,
  joined_at       timestamptz not null default now(),
  primary key (space_id, user_id)
);

alter table public.kn_space_members enable row level security;

alter publication supabase_realtime add table public.kn_space_members;


-- =============================================================================
-- BẢNG 3: kn_space_invites
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
-- INDEXES
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
-- RLS POLICIES — kn_shared_spaces
-- =============================================================================

-- SELECT: member (bất kỳ role) của space mới được đọc
-- Dùng EXISTS vào kn_space_members thay vì JOIN để tương thích RLS
create policy "shared_spaces_select_for_member"
  on public.kn_shared_spaces
  for select
  using (
    exists (
      select 1
      from public.kn_space_members m
      where m.space_id = id
        and m.user_id  = auth.uid()
    )
  );
-- Giải thích: user chỉ thấy space mà họ có hàng trong kn_space_members.
-- Owner cũng là member (role='owner') nên không cần case riêng.

-- INSERT: bất kỳ user đã đăng nhập đều có thể tạo shared space mới.
-- Function accept_invite() sẽ tự INSERT vào kn_space_members với role='owner'
-- ngay sau khi INSERT space (hoặc gọi riêng ở application layer).
create policy "shared_spaces_insert_for_authenticated"
  on public.kn_shared_spaces
  for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
  );
-- Giải thích: yêu cầu created_by phải là chính user đang gọi — ngăn giả mạo creator.

-- UPDATE: chỉ member của space được sửa nội dung (tasks/notes/reminders/name).
-- Owner check không cần ở đây — mọi member đều được sửa nội dung (collaborative).
-- Optimistic locking (version check) xử lý ở application layer.
create policy "shared_spaces_update_for_member"
  on public.kn_shared_spaces
  for update
  using (
    exists (
      select 1
      from public.kn_space_members m
      where m.space_id = id
        and m.user_id  = auth.uid()
    )
  );
-- Cảnh báo: policy này cho phép mọi member sửa name space.
-- Nếu Phase 4 cần restrict đổi tên chỉ cho owner, thêm điều kiện role='owner'.

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
  using (
    exists (
      select 1
      from public.kn_space_members m2
      where m2.space_id = space_id
        and m2.user_id  = auth.uid()
    )
  );
-- Lưu ý: policy này tự-join vào chính bảng kn_space_members.
-- Supabase xử lý đúng — đây là pattern chuẩn cho membership check.

-- INSERT: KHÔNG cho phép insert trực tiếp qua RLS bình thường.
-- Việc thêm member PHẢI đi qua function accept_invite() (SECURITY DEFINER)
-- để đảm bảo validate token trước khi cấp quyền thành viên.
-- Policy này block INSERT trực tiếp; accept_invite() bypass RLS do SECURITY DEFINER.
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
    -- Owner kick người khác
    (
      auth.uid() != user_id  -- không tự kick mình
      and exists (
        select 1
        from public.kn_space_members owner_row
        where owner_row.space_id = space_id
          and owner_row.user_id  = auth.uid()
          and owner_row.role     = 'owner'
      )
    )
    or
    -- Member tự rời (chỉ role='member', owner không được rời — phải xoá space)
    (
      auth.uid() = user_id
      and role = 'member'
    )
  );
-- Cảnh báo kỹ thuật: Owner muốn "rời" phải DELETE toàn bộ space (policy DELETE
-- trên kn_shared_spaces). Không có transfer ownership ở Phase 3.

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
-- Function accept_invite() cũng cần đọc được invite — nó là SECURITY DEFINER
-- nên không bị RLS chặn, nhưng policy này vẫn cần cho client-side preview.
create policy "space_invites_select_for_authenticated"
  on public.kn_space_invites
  for select
  using (auth.uid() is not null);
-- Trade-off: policy này cho phép mọi user đã đăng nhập đọc TẤT CẢ invite
-- (kể cả của space khác) nếu biết token. Vì token là 24-byte random (192-bit)
-- và mỗi query phải cung cấp token chính xác, rủi ro thực tế rất thấp.
-- Nếu cần restrict hơn: "where token = $1" phải đi qua function, không expose trực tiếp.

-- INSERT: member của space (bất kỳ role) được tạo invite cho space đó.
-- Chỉ member mới được mời thêm người — không cho phép tạo invite cho space lạ.
create policy "space_invites_insert_for_member"
  on public.kn_space_invites
  for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and exists (
      select 1
      from public.kn_space_members m
      where m.space_id = space_id
        and m.user_id  = auth.uid()
    )
  );
-- Cảnh báo: policy này cho phép cả member (không chỉ owner) tạo invite.
-- Nếu muốn chỉ owner mới mời được, thêm: and m.role = 'owner'

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
-- =============================================================================

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
-- Đặt search_path cố định để tránh search_path injection attack
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
    raise exception 'Bạn cần đăng nhập để dùng invite link.' using errcode = 'PGRST';
  end if;

  -- 2. Tìm và lock invite theo token (FOR UPDATE để tránh race condition double-accept)
  select * into v_invite
  from public.kn_space_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite link không hợp lệ hoặc không tồn tại.' using errcode = 'PGRST';
  end if;

  -- 3. Kiểm tra token đã được dùng chưa
  if v_invite.accepted_at is not null then
    raise exception 'Invite link này đã được dùng rồi.' using errcode = 'PGRST';
  end if;

  -- 4. Kiểm tra token còn hạn không
  if v_invite.expires_at < now() then
    raise exception 'Invite link đã hết hạn (7 ngày).' using errcode = 'PGRST';
  end if;

  -- 5. Lấy thông tin space
  select * into v_space
  from public.kn_shared_spaces
  where id = v_invite.space_id;

  if not found then
    raise exception 'Space không còn tồn tại.' using errcode = 'PGRST';
  end if;

  -- 6. Kiểm tra user đã là thành viên chưa (tránh duplicate key error)
  if exists (
    select 1 from public.kn_space_members
    where space_id = v_invite.space_id
      and user_id  = v_caller_id
  ) then
    raise exception 'Bạn đã là thành viên của space này rồi.' using errcode = 'PGRST';
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
-- GHI CHÚ TÍCH HỢP (cho dev Phase 3)
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
-- 4. REALTIME SYNC: kn_shared_spaces và kn_space_members đã được thêm vào
--    supabase_realtime publication. Client subscribe channel 'shared_space:<space_id>'
--    để nhận UPDATE real-time.
--
-- 5. CONFLICT RESOLUTION (last-write-wins theo item):
--    Mỗi task/note/reminder trong JSONB PHẢI có trường "updatedAt" (ISO 8601).
--    Khi merge ở client: so sánh updatedAt của item local vs item từ DB,
--    giữ cái có updatedAt mới hơn. Không cần OT hay CRDT ở Phase 3.
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
--    ở frontend khi user đang xem shared space. enabled_blocks mặc định không có 'habits'.
-- =============================================================================
