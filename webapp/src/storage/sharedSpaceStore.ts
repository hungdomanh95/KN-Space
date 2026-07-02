// =============================================================================
// sharedSpaceStore.ts — Phase 3a: Shared Space storage layer
// =============================================================================
// Tất cả operation liên quan đến kn_shared_spaces, kn_space_members,
// kn_space_invites. Không đụng đến kn_space_state (private spaces).
//
// Lưu ý kiến trúc:
//   - listMembers() chỉ trả được userId/role/joinedAt từ kn_space_members.
//     email/displayName/avatarUrl để trống vì auth.users không accessible qua
//     client-side Supabase JS. Nếu Phase 4 cần đầy đủ profile → tạo bảng
//     kn_profiles (public) mirror từ auth.users qua Supabase trigger.
//   - Optimistic locking: trigger kn_shared_spaces_before_update tự tăng version.
//     Client gửi WHERE version = expectedVersion; nếu 0 rows affected = conflict.
//   - Token generation dùng Web Crypto API (browser-safe, không cần Node.js).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import { normalizeSpace } from './normalize';
import type { Space, SharedSpaceMember, SpaceInvite } from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/**
 * Tạo token 24-byte ngẫu nhiên encode base64url (browser Web Crypto API).
 * Tương đương crypto.randomBytes(24).toString('base64url') trong Node.js.
 */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // btoa cho base64 chuẩn, sau đó convert sang base64url (RFC 4648 §5)
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Map 1 hàng từ kn_shared_spaces thành Space (frontend type).
 * `order` không có trong DB → dùng index truyền vào.
 */
function rowToSpace(
  row: {
    id: string;
    name: string;
    tasks: unknown;
    notes: unknown;
    reminders: unknown;
    version: number;
  },
  order: number,
): Space {
  const raw: Space = {
    id: row.id,
    name: row.name,
    order,
    enabledBlocks: {
      tasks: true,
      reminder: false, // reminder block (Nhắc việc) ẩn trong shared space
      habits: false,   // habits block ẩn trong shared space (chốt từ schema Q2)
      notes: true,
      reminders: true,
      today: true,
    },
    tasks: Array.isArray(row.tasks) ? (row.tasks as Space['tasks']) : [],
    reminders: Array.isArray(row.reminders) ? (row.reminders as Space['reminders']) : [],
    habits: [],        // shared space không có habits
    notes: Array.isArray(row.notes) ? (row.notes as Space['notes']) : [],
    isShared: true,
    sharedSpaceId: row.id,
  };
  return normalizeSpace(raw);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load tất cả shared spaces mà user hiện tại là member.
 * Query: kn_space_members WHERE user_id = me → join kn_shared_spaces.
 */
export async function loadSharedSpaces(): Promise<Space[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('kn_space_members')
    .select(`
      joined_at,
      kn_shared_spaces (
        id,
        name,
        tasks,
        notes,
        reminders,
        version
      )
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadSharedSpaces lỗi:', error.message);
    throw error;
  }
  if (!data || data.length === 0) return [];

  const spaces: Space[] = [];
  data.forEach((memberRow, idx) => {
    const spaceRow = (memberRow.kn_shared_spaces as unknown) as {
      id: string;
      name: string;
      tasks: unknown;
      notes: unknown;
      reminders: unknown;
      version: number;
    } | null;
    if (!spaceRow) return; // kn_shared_spaces bị xoá nhưng cascade chưa chạy
    spaces.push(rowToSpace(spaceRow, idx));
  });

  return spaces;
}

/**
 * Save shared space với optimistic locking.
 *
 * UPDATE kn_shared_spaces SET tasks=..., notes=..., reminders=..., name=...
 * WHERE id = spaceId AND version = expectedVersion
 *
 * Trigger kn_shared_spaces_before_update tự tăng version và cập nhật updated_at.
 * Nếu 0 rows affected → version đã thay đổi (conflict) → client cần fetch lại.
 */
export async function saveSharedSpace(
  spaceId: string,
  patch: Partial<Pick<Space, 'tasks' | 'notes' | 'reminders' | 'name'>>,
  expectedVersion: number,
): Promise<{ ok: boolean; conflict: boolean; newVersion?: number }> {
  // Chỉ gửi các field thực sự có trong patch
  const updatePayload: Record<string, unknown> = {};
  if (patch.tasks !== undefined) updatePayload.tasks = patch.tasks;
  if (patch.notes !== undefined) updatePayload.notes = patch.notes;
  if (patch.reminders !== undefined) updatePayload.reminders = patch.reminders;
  if (patch.name !== undefined) updatePayload.name = patch.name;

  if (Object.keys(updatePayload).length === 0) {
    return { ok: true, conflict: false, newVersion: expectedVersion };
  }

  const { data, error } = await supabase
    .from('kn_shared_spaces')
    .update(updatePayload)
    .eq('id', spaceId)
    .eq('version', expectedVersion)
    .select('version')
    .maybeSingle<{ version: number }>();

  if (error) {
    console.warn('[KN-Space] saveSharedSpace lỗi:', error.message);
    throw error;
  }

  if (!data) {
    // 0 rows updated → version đã đổi trên DB → conflict
    return { ok: false, conflict: true };
  }

  return { ok: true, conflict: false, newVersion: data.version };
}

/**
 * Tạo invite link cho shared space.
 * INSERT vào kn_space_invites, trả về URL dạng: origin/join?token=...
 */
export async function createInviteLink(sharedSpaceId: string): Promise<string> {
  const userId = await getCurrentUserId();
  const token = generateToken();

  const { error } = await supabase.from('kn_space_invites').insert({
    space_id: sharedSpaceId,
    created_by: userId,
    token,
    // expires_at: DB default là now() + interval '7 days', không cần override
  });

  if (error) {
    console.warn('[KN-Space] createInviteLink lỗi:', error.message);
    throw error;
  }

  return `${window.location.origin}/join?token=${token}`;
}

/**
 * Thu hồi invite (xoá token chưa dùng).
 * Chỉ người tạo invite mới được xoá (RLS policy "space_invites_delete_for_creator").
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('kn_space_invites')
    .delete()
    .eq('id', inviteId);

  if (error) {
    console.warn('[KN-Space] revokeInvite lỗi:', error.message);
    throw error;
  }
}

/**
 * Validate + accept invite bằng cách gọi RPC accept_invite().
 *
 * RPC trả về JSON: { space_id, space_name, joined_at } nếu thành công.
 * Mọi lỗi (token không hợp lệ, hết hạn, đã dùng, đã là member) đều raise
 * exception ở DB → Supabase trả về error.message.
 */
export async function acceptInvite(
  token: string,
): Promise<{ spaceId: string } | { error: string }> {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });

  if (error) {
    console.warn('[KN-Space] acceptInvite lỗi:', error.message);
    return { error: error.message };
  }

  const result = data as { space_id: string; space_name: string; joined_at: string } | null;
  if (!result?.space_id) {
    return { error: 'Phản hồi từ server không hợp lệ.' };
  }

  return { spaceId: result.space_id };
}

/**
 * Lấy danh sách member của 1 shared space.
 *
 * Giới hạn: chỉ trả được userId/role/joinedAt từ kn_space_members.
 * email/displayName/avatarUrl sẽ là chuỗi rỗng vì auth.users không accessible
 * qua Supabase JS client (cần service role hoặc bảng kn_profiles public).
 * TODO Phase 4: tạo bảng kn_profiles mirror từ auth.users để hiện đầy đủ thông tin.
 */
export async function listMembers(sharedSpaceId: string): Promise<SharedSpaceMember[]> {
  const { data, error } = await supabase
    .rpc('get_space_members_with_email', { p_space_id: sharedSpaceId });

  if (error) {
    console.warn('[KN-Space] listMembers lỗi:', error.message);
    throw error;
  }
  if (!data) return [];

  return (data as { user_id: string; role: string; joined_at: string; email: string; full_name: string }[]).map((row) => ({
    userId: row.user_id,
    email: row.email ?? '',
    displayName: row.full_name || undefined,
    avatarUrl: undefined,
    role: row.role as SharedSpaceMember['role'],
    joinedAt: row.joined_at,
  }));
}

/**
 * Kick member khỏi shared space (chỉ owner).
 * RLS policy "space_members_delete_for_owner_or_self" enforce điều kiện này tại DB.
 */
export async function kickMember(sharedSpaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('kn_space_members')
    .delete()
    .eq('space_id', sharedSpaceId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[KN-Space] kickMember lỗi:', error.message);
    throw error;
  }
}

/**
 * Tự rời shared space (chỉ member, không áp dụng cho owner).
 * Owner muốn giải tán space phải xoá toàn bộ space (DELETE kn_shared_spaces).
 * RLS policy "space_members_delete_for_owner_or_self" enforce role='member' tại DB.
 */
/** Xoá shared space (chỉ owner). ON DELETE CASCADE tự dọn kn_space_members + kn_space_invites. */
export async function deleteSharedSpace(sharedSpaceId: string): Promise<void> {
  const { error } = await supabase
    .from('kn_shared_spaces')
    .delete()
    .eq('id', sharedSpaceId);

  if (error) {
    console.warn('[KN-Space] deleteSharedSpace lỗi:', error.message);
    throw error;
  }
}

export async function leaveSpace(sharedSpaceId: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('kn_space_members')
    .delete()
    .eq('space_id', sharedSpaceId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[KN-Space] leaveSpace lỗi:', error.message);
    throw error;
  }
}

/**
 * Tạo shared space mới bằng cách gọi RPC create_shared_space().
 *
 * RPC tự INSERT vào kn_shared_spaces + kn_space_members (role='owner').
 * Không thể dùng INSERT trực tiếp vào kn_space_members vì RLS block
 * ("space_members_insert_blocked_use_function").
 *
 * Trả về Space object (isShared: true, order: 0 — caller tự điều chỉnh nếu cần).
 */
export async function createSharedSpace(name: string): Promise<Space> {
  const { data, error } = await supabase.rpc('create_shared_space', { p_name: name });

  if (error) {
    console.warn('[KN-Space] createSharedSpace lỗi:', error.message);
    throw error;
  }

  const result = data as { space_id: string; space_name: string } | null;
  if (!result?.space_id) {
    throw new Error('create_shared_space: phản hồi từ server không hợp lệ.');
  }

  // Fetch lại hàng đầy đủ để có tasks/notes/reminders/version (mặc định rỗng nhưng cần đồng nhất)
  const { data: spaceRow, error: fetchError } = await supabase
    .from('kn_shared_spaces')
    .select('id, name, tasks, notes, reminders, version')
    .eq('id', result.space_id)
    .single<{
      id: string;
      name: string;
      tasks: unknown;
      notes: unknown;
      reminders: unknown;
      version: number;
    }>();

  if (fetchError || !spaceRow) {
    console.warn('[KN-Space] createSharedSpace — fetch sau tạo lỗi:', fetchError?.message);
    throw fetchError ?? new Error('Không lấy được thông tin space vừa tạo.');
  }

  return rowToSpace(spaceRow, 0);
}

// ---------------------------------------------------------------------------
// Bonus: helper đọc danh sách invite còn active của 1 space (chưa accept)
// Không được yêu cầu trong spec nhưng cần thiết cho UI quản lý invite.
// ---------------------------------------------------------------------------

/**
 * Liệt kê invite còn hiệu lực (chưa accept, chưa hết hạn) của 1 shared space.
 * Chỉ member của space mới gọi được (RLS "space_invites_select_for_authenticated").
 */
export async function listActiveInvites(sharedSpaceId: string): Promise<SpaceInvite[]> {
  const { data, error } = await supabase
    .from('kn_space_invites')
    .select('id, space_id, token, expires_at, created_at, created_by, accepted_at')
    .eq('space_id', sharedSpaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[KN-Space] listActiveInvites lỗi:', error.message);
    throw error;
  }
  if (!data) return [];

  return data.map((row) => ({
    id: row.id as string,
    spaceId: row.space_id as string,
    token: row.token as string,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    acceptedAt: (row.accepted_at as string | null) ?? undefined,
  }));
}
