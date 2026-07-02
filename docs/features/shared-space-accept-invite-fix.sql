-- =============================================================================
-- Fix: accept_invite — bỏ ERRCODE = 'PGRST', dùng RAISE EXCEPTION thường
-- =============================================================================
-- Nguyên nhân lỗi "Could not parse JSON in the RAISE SQLSTATE 'PGRST' error":
-- PostgREST kỳ vọng message là JSON khi ERRCODE = 'PGRST', nhưng messages là
-- chuỗi tiếng Việt thuần → không parse được → client luôn thấy "hết hạn/không hợp lệ".
-- Fix: dùng RAISE EXCEPTION thông thường, PostgREST tự wrap thành HTTP 500 với message rõ ràng.
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
    raise;
end;
$$;

revoke execute on function public.accept_invite(text) from public;
grant  execute on function public.accept_invite(text) to authenticated;
