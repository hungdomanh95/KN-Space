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
//   - KHÔNG version-check/retry (bỏ theo docs/features/conflict-handling-simplification.md,
//     2026-07-10 — version-check chỉ bảo vệ được 1 khung rất hẹp, không chặn được đúng kịch bản gây
//     mất dữ liệu thật). saveSharedSpace() ghi thẳng WHERE id = spaceId (blind write, last-write-
//     wins). Cột version/trigger kn_shared_spaces_before_update VẪN GIỮ trên DB (tự tăng version/
//     updated_at vô điều kiện) nhưng tầng app không còn đọc/dùng để chặn ghi. Rủi ro RAM cũ (root
//     cause thật) xử lý riêng bằng refresh-on-visible ở AppStateContext.tsx (refreshStaleSpaces()).
//   - Token generation dùng Web Crypto API (browser-safe, không cần Node.js).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import { normalizeSpace } from './normalize';
import type { EnabledBlocks, Space, SharedSpaceMember, SpaceInvite } from '../types';

/**
 * enabledBlocks mặc định cho Shared Space khi hàng DB thiếu cột `enabled_blocks`
 * (space tạo trước khi chạy docs/features/fix-shared-space-enabled-blocks.sql) hoặc
 * giá trị lưu không hợp lệ. Không dùng `defaultEnabledBlocks()` của reducers/spaces.ts
 * (mặc định `habits: true`) vì Shared Space luôn ép `habits: false` — xem
 * docs/features/shared-space.md mục 6.1.
 */
function defaultSharedEnabledBlocks(): EnabledBlocks {
  // `expenseTracking: true` — Shared Space không có luồng tạo mới phân biệt được "vừa tạo" (RPC
  // `create_shared_space` dùng default cột DB, không set field này qua code), nên dùng chung 1
  // mặc định `true` cho cả Space mới lẫn cũ (khác Space cá nhân, nơi phân biệt được qua
  // `defaultEnabledBlocks()` ở reducers/spaces.ts). User tự tắt qua menu khối Nhật ký nhanh nếu
  // Shared Space mới tạo không dùng để log chi tiêu.
  return { tasks: true, reminder: true, habits: false, notes: true, reminders: true, logs: true, expenseTracking: true };
}

/**
 * Chuẩn hoá `enabled_blocks` đọc từ DB — fallback an toàn nếu thiếu/hỏng.
 * LUÔN ép `habits: false` bất kể DB lưu gì (lớp phòng thủ ở application layer,
 * không phụ thuộc default của cột DB) — invariant đã tài liệu hoá: khối "Thói
 * quen" bị ẩn hoàn toàn ở mọi Shared Space, không cho user bật lại.
 */
export function normalizeSharedEnabledBlocks(raw: unknown): EnabledBlocks {
  const fallback = defaultSharedEnabledBlocks();
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof EnabledBlocks, unknown>>) : {};
  return {
    tasks: typeof r.tasks === 'boolean' ? r.tasks : fallback.tasks,
    reminder: typeof r.reminder === 'boolean' ? r.reminder : fallback.reminder,
    habits: false, // ép cứng — xem comment hàm phía trên
    notes: typeof r.notes === 'boolean' ? r.notes : fallback.notes,
    reminders: typeof r.reminders === 'boolean' ? r.reminders : fallback.reminders,
    logs: typeof r.logs === 'boolean' ? r.logs : fallback.logs,
    expenseTracking: typeof r.expenseTracking === 'boolean' ? r.expenseTracking : fallback.expenseTracking,
  };
}

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
    logs: unknown;
    enabled_blocks?: unknown;
    version: number;
  },
  order: number,
): Space {
  const raw: Space = {
    id: row.id,
    name: row.name,
    order,
    // Đọc enabledBlocks THẬT từ DB (cột `enabled_blocks`, xem
    // docs/features/fix-shared-space-enabled-blocks.sql) — trước đây bị hard-code cứng ở đây,
    // khiến user tắt/bật khối qua Settings > Sửa Space không bao giờ được lưu lại.
    // `habits` luôn bị ép `false` trong normalizeSharedEnabledBlocks() bất kể DB lưu gì.
    enabledBlocks: normalizeSharedEnabledBlocks(row.enabled_blocks),
    tasks: Array.isArray(row.tasks) ? (row.tasks as Space['tasks']) : [],
    reminders: Array.isArray(row.reminders) ? (row.reminders as Space['reminders']) : [],
    habits: [],        // shared space không có habits
    notes: Array.isArray(row.notes) ? (row.notes as Space['notes']) : [],
    // Cột `logs` (jsonb) thêm bởi docs/features/nhat-ky-nhanh-schema.sql — nếu user chưa chạy
    // migration này, Supabase trả lỗi "column does not exist" ở bước SELECT (xem loadSharedSpaces/
    // createSharedSpace), không âm thầm rơi về [] ở đây.
    logs: Array.isArray(row.logs) ? (row.logs as Space['logs']) : [],
    isShared: true,
    sharedSpaceId: row.id,
    _sharedVersion: row.version,
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
        logs,
        enabled_blocks,
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
      logs: unknown;
      enabled_blocks: unknown;
      version: number;
    } | null;
    if (!spaceRow) return; // kn_shared_spaces bị xoá nhưng cascade chưa chạy
    spaces.push(rowToSpace(spaceRow, idx));
  });

  return spaces;
}

/**
 * Save shared space — ghi thẳng (blind write, last-write-wins), KHÔNG version-check (bỏ theo
 * docs/features/conflict-handling-simplification.md mục 2.1 — 2026-07-10).
 *
 * UPDATE kn_shared_spaces SET name=..., enabled_blocks=... WHERE id = spaceId
 *
 * Trigger kn_shared_spaces_before_update vẫn tự tăng version + updated_at (giữ nguyên, vô hại)
 * nhưng `newVersion` trả về ở đây chỉ mang tính thông tin, không dùng để chặn ghi lần sau. Lỗi thật
 * (network/server) throw ra ngoài cho caller (`AppStateContext.tsx` — `attemptSaveShared`) tự bật
 * banner lỗi mạng.
 *
 * **`patch` KHÔNG còn nhận `tasks`/`notes`/`reminders`/`logs`** (dọn dẹp 2026-07-11, xem
 * docs/features/item-level-entity-tables-progress.md câu hỏi mở #2, "Việc 1") — cả 4 field này đã
 * cutover hoàn toàn sang bảng item-level riêng (`kn_shared_tasks`/`kn_shared_notes`/
 * `kn_shared_reminders`/`kn_shared_logs`, qua `itemPersist.ts`), Space-level chỉ còn thật sự sở hữu
 * `name`/`enabledBlocks`. Compiler tự chặn mọi nơi còn lỡ gọi với field cũ.
 */
export async function saveSharedSpace(
  spaceId: string,
  patch: Partial<Pick<Space, 'name' | 'enabledBlocks'>>,
): Promise<{ newVersion?: number }> {
  // Chỉ gửi các field thực sự có trong patch
  const updatePayload: Record<string, unknown> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  // Luôn ép `habits: false` trước khi gửi lên DB — phòng trường hợp caller lỡ truyền
  // enabledBlocks có habits:true (không nên xảy ra vì UI đã chặn, nhưng đây là lớp
  // phòng thủ cuối trước khi ghi DB, tránh dữ liệu bẩn nếu có bug ở tầng trên).
  if (patch.enabledBlocks !== undefined) updatePayload.enabled_blocks = { ...patch.enabledBlocks, habits: false };

  if (Object.keys(updatePayload).length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('kn_shared_spaces')
    .update(updatePayload)
    .eq('id', spaceId)
    .select('version')
    .maybeSingle<{ version: number }>();

  if (error) {
    console.warn('[KN-Space] saveSharedSpace lỗi:', error.message);
    throw error;
  }

  return { newVersion: data?.version };
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
    .select('id, name, tasks, notes, reminders, logs, enabled_blocks, version')
    .eq('id', result.space_id)
    .single<{
      id: string;
      name: string;
      tasks: unknown;
      notes: unknown;
      reminders: unknown;
      logs: unknown;
      enabled_blocks: unknown;
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
