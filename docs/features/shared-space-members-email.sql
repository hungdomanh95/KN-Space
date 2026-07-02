-- =============================================================================
-- Thêm function lấy thông tin member kèm email từ auth.users
-- Cần SECURITY DEFINER vì auth.users không đọc được từ client thường.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_space_members_with_email(p_space_id uuid)
RETURNS TABLE (
  user_id    uuid,
  role       text,
  joined_at  timestamptz,
  email      text,
  full_name  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.user_id,
    m.role,
    m.joined_at,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') AS full_name
  FROM public.kn_space_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.space_id = p_space_id
    -- Chỉ member của space này mới được gọi (kiểm tra qua is_space_member)
    AND is_space_member(p_space_id)
  ORDER BY m.joined_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_space_members_with_email(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_space_members_with_email(uuid) TO authenticated;
