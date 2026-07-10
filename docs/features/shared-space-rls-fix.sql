-- ĐÃ GỘP vào supabase/schema.sql (2026-07-09) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- FIX: RLS infinite recursion trên kn_space_members
-- Nguyên nhân: policy SELECT tự query lại bảng kn_space_members → đệ quy.
-- Fix: dùng SECURITY DEFINER helper function để bypass RLS khi check membership.
-- =============================================================================

-- Bước 1: Xoá các policy bị lỗi đệ quy
DROP POLICY IF EXISTS "space_members_select_for_member"     ON public.kn_space_members;
DROP POLICY IF EXISTS "space_members_delete_for_owner_or_self" ON public.kn_space_members;
DROP POLICY IF EXISTS "shared_spaces_select_for_member"     ON public.kn_shared_spaces;
DROP POLICY IF EXISTS "shared_spaces_update_for_member"     ON public.kn_shared_spaces;
DROP POLICY IF EXISTS "space_invites_insert_for_member"     ON public.kn_space_invites;

-- Bước 2: Tạo helper functions SECURITY DEFINER
-- SECURITY DEFINER = chạy dưới quyền postgres, bypass RLS → không bị đệ quy
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kn_space_members
    WHERE space_id = p_space_id
      AND user_id  = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_space_owner(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kn_space_members
    WHERE space_id = p_space_id
      AND user_id  = auth.uid()
      AND role     = 'owner'
  );
$$;

-- Bước 3: Tạo lại policies dùng helper functions (không còn đệ quy)

-- kn_space_members: SELECT
CREATE POLICY "space_members_select_for_member"
  ON public.kn_space_members
  FOR SELECT
  USING (is_space_member(space_id));

-- kn_space_members: DELETE (kick hoặc tự rời)
CREATE POLICY "space_members_delete_for_owner_or_self"
  ON public.kn_space_members
  FOR DELETE
  USING (
    (auth.uid() != user_id AND is_space_owner(space_id))
    OR
    (auth.uid() = user_id AND role = 'member')
  );

-- kn_shared_spaces: SELECT
CREATE POLICY "shared_spaces_select_for_member"
  ON public.kn_shared_spaces
  FOR SELECT
  USING (is_space_member(id));

-- kn_shared_spaces: UPDATE
CREATE POLICY "shared_spaces_update_for_member"
  ON public.kn_shared_spaces
  FOR UPDATE
  USING (is_space_member(id));

-- kn_space_invites: INSERT
CREATE POLICY "space_invites_insert_for_member"
  ON public.kn_space_invites
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND is_space_member(space_id)
  );
