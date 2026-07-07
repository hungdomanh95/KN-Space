// =============================================================================
// SpaceInviteModal.tsx — Quản lý member + invite link của 1 Shared Space
// =============================================================================
// Cảnh báo kỹ thuật đã biết:
//   listMembers() trả về email: '' (Supabase JS client không access được auth.users
//   từ phía browser). Hiển thị userId rút gọn (8 ký tự) kèm title tooltip đầy đủ.
//   Phase 4 cần bảng kn_profiles public để hiện email thật — xem comment trong
//   sharedSpaceStore.ts.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { Copy, Check, Link, RefreshCw, X, UserMinus, LogOut, UserPlus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import {
  listMembers,
  listActiveInvites,
  createInviteLink,
  revokeInvite,
  kickMember,
  leaveSpace,
} from '../../storage/sharedSpaceStore';
import { supabase } from '../../lib/supabaseClient';
import { useAppState } from '../../state/AppStateContext';
import type { SharedSpaceMember, SpaceInvite } from '../../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpaceInviteModalProps {
  spaceId: string;      // uuid trong kn_shared_spaces
  spaceName: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helper — hiển thị identity khi email rỗng
// ---------------------------------------------------------------------------

function memberLabel(m: SharedSpaceMember): string {
  if (m.displayName) return m.displayName;
  if (m.email) return m.email;
  // Fallback: userId rút gọn — Phase 4 sẽ thay bằng email từ kn_profiles
  return `user:${m.userId.slice(0, 8)}`;
}

/** Tính số ngày còn lại từ expiresAt đến hôm nay. */
function daysLeft(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// SpaceInviteModal
// ---------------------------------------------------------------------------

type TabId = 'members' | 'invite';

export function SpaceInviteModal({ spaceId, spaceName, onClose }: SpaceInviteModalProps) {
  const { dispatch } = useAppState();

  const [tab, setTab] = useState<TabId>('members');

  // Data
  const [members, setMembers] = useState<SharedSpaceMember[]>([]);
  const [invites, setInvites] = useState<SpaceInvite[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null); // inviteId đang show "Đã sao chép!"
  const [creatingLink, setCreatingLink] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Mount: load data + currentUser
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersData, invitesData, { data: authData }] = await Promise.all([
        listMembers(spaceId),
        listActiveInvites(spaceId),
        supabase.auth.getUser(),
      ]);
      setMembers(membersData);
      setInvites(invitesData);
      setCurrentUserId(authData.user?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const myRole = members.find((m) => m.userId === currentUserId)?.role ?? null;
  const isOwner = myRole === 'owner';

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleCopy(invite: SpaceInvite) {
    const link = `${window.location.origin}/join?token=${invite.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((prev) => (prev === invite.id ? null : prev)), 2000);
    } catch {
      // Fallback: select + execCommand cho môi trường không hỗ trợ clipboard API
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((prev) => (prev === invite.id ? null : prev)), 2000);
    }
  }

  async function handleCreateLink() {
    setCreatingLink(true);
    setError(null);
    try {
      // createInviteLink trả về URL string, nhưng ta cần SpaceInvite object để hiển thị list.
      // Gọi xong rồi reload toàn bộ invites để đồng bộ.
      await createInviteLink(spaceId);
      const updated = await listActiveInvites(spaceId);
      setInvites(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được link mời');
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleRevoke(invite: SpaceInvite) {
    setRevokingId(invite.id);
    setError(null);
    try {
      await revokeInvite(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thu hồi được link');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleKick(member: SharedSpaceMember) {
    if (!window.confirm(`Kick "${memberLabel(member)}" khỏi space?`)) return;
    setKickingId(member.userId);
    setError(null);
    try {
      await kickMember(spaceId, member.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kick được member');
    } finally {
      setKickingId(null);
    }
  }

  async function handleLeave() {
    if (!window.confirm(`Rời space "${spaceName}"?`)) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveSpace(spaceId);
      dispatch({ type: 'SPACE_DELETE', payload: { id: spaceId } });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không rời được space');
      setLeaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderRoleBadge(role: SharedSpaceMember['role']) {
    return (
      <span
        className={`inline-flex items-center rounded-[5px] px-[7px] py-[2px] text-[0.6875rem] font-bold uppercase tracking-wide
          ${role === 'owner'
            ? 'bg-[rgba(var(--accent-rgb),.12)] text-[var(--accent)]'
            : 'border border-[color:var(--border)] text-[var(--text-dim)]'
          }`}
      >
        {role === 'owner' ? 'Owner' : 'Member'}
      </span>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Thành viên
  // ---------------------------------------------------------------------------

  function renderMembersTab() {
    return (
      <div>
        <p className="mb-3 text-[0.8125rem] text-[var(--text-dim)]">
          {members.length} thành viên
        </p>

        <ul className="flex flex-col gap-[9px]">
          {members.map((m) => {
            const label = memberLabel(m);
            const isSelf = m.userId === currentUserId;
            const isBeingKicked = kickingId === m.userId;

            return (
              <li
                key={m.userId}
                className="flex items-center gap-[10px] rounded-[10px] border border-[color:var(--border)] bg-[var(--raised)] px-3 py-2.5"
              >
                {/* Avatar placeholder */}
                <span
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[rgba(var(--accent-rgb),.14)] text-[0.75rem] font-bold text-[var(--accent)] select-none"
                  aria-hidden="true"
                >
                  {label.slice(0, 1).toUpperCase()}
                </span>

                {/* Email / label */}
                <span
                  className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem]"
                  title={m.userId}
                >
                  {label}
                  {isSelf && (
                    <span className="ml-1.5 text-[0.75rem] text-[var(--text-dim)]">(bạn)</span>
                  )}
                </span>

                {/* Role badge */}
                {renderRoleBadge(m.role)}

                {/* Kick button — chỉ owner thấy, không kick chính mình */}
                {isOwner && !isSelf && (
                  <button
                    className="icon-btn flex-none"
                    title={`Kick ${label}`}
                    aria-label={`Kick ${label}`}
                    disabled={isBeingKicked}
                    onClick={() => handleKick(m)}
                  >
                    {isBeingKicked ? (
                      <RefreshCw className="icon animate-spin" size={13} />
                    ) : (
                      <UserMinus className="icon" size={13} />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* Nút Rời space — chỉ member (không phải owner) thấy */}
        {!isOwner && myRole === 'member' && (
          <div className="modal-actions mt-4">
            <button
              className="btn-ghost flex items-center gap-1.5 text-red-500 hover:border-red-400"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? (
                <RefreshCw className="h-[14px] w-[14px] animate-spin" />
              ) : (
                <LogOut className="h-[14px] w-[14px]" />
              )}
              Rời space
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Mời
  // ---------------------------------------------------------------------------

  function renderInviteTab() {
    return (
      <div>
        <p className="mb-4 text-[0.8438rem] text-[var(--text-dim)]">
          Tạo link mời để chia sẻ với người khác. Link hết hạn sau 7 ngày.
        </p>

        {/* Nút tạo link mới */}
        <div className="mb-5 flex items-center gap-2">
          <button
            className="btn-primary flex items-center gap-1.5 text-[0.875rem]"
            onClick={handleCreateLink}
            disabled={creatingLink}
          >
            {creatingLink ? (
              <RefreshCw className="h-[14px] w-[14px] animate-spin" />
            ) : (
              <UserPlus className="h-[14px] w-[14px]" />
            )}
            Tạo link mời mới
          </button>
          <span className="text-[0.75rem] text-[var(--text-dim)]">Link hết hạn sau 7 ngày</span>
        </div>

        {/* Danh sách invites còn hiệu lực */}
        {invites.length === 0 ? (
          <p className="text-[0.8125rem] text-[var(--text-dim)] italic">
            Chưa có link mời nào đang hoạt động.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-[0.8125rem] font-semibold text-[var(--text-dim)]">
              Lời mời đang chờ ({invites.length}):
            </p>
            <ul className="flex flex-col gap-[9px]">
              {invites.map((invite, idx) => {
                const link = `${window.location.origin}/join?token=${invite.token}`;
                const remaining = daysLeft(invite.expiresAt);
                const isCopied = copiedId === invite.id;
                const isRevoking = revokingId === invite.id;

                return (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-2 rounded-[10px] border border-[color:var(--border)] bg-[var(--raised)] p-3"
                  >
                    {/* Label + ngày còn lại */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--text)]">
                        <Link className="h-[13px] w-[13px] flex-none text-[var(--text-dim)]" />
                        Link #{idx + 1}
                      </span>
                      <span
                        className={`text-[0.75rem] font-medium ${
                          remaining <= 1
                            ? 'text-red-500'
                            : remaining <= 3
                            ? 'text-orange-400'
                            : 'text-[var(--text-dim)]'
                        }`}
                      >
                        còn {remaining} ngày
                      </span>
                    </div>

                    {/* Link URL + copy button */}
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={link}
                        className="min-w-0 flex-1 rounded-[8px] border border-[color:var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[0.75rem] text-[var(--text-dim)] focus:outline-none"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="icon-btn flex-none"
                        title={isCopied ? 'Đã sao chép!' : 'Sao chép link'}
                        aria-label="Sao chép link mời"
                        onClick={() => handleCopy(invite)}
                      >
                        {isCopied ? (
                          <Check className="icon text-green-500" size={13} />
                        ) : (
                          <Copy className="icon" size={13} />
                        )}
                      </button>
                    </div>

                    {/* Thu hồi */}
                    <div className="flex justify-end">
                      <button
                        className="inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[0.75rem] font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
                        onClick={() => handleRevoke(invite)}
                        disabled={isRevoking}
                      >
                        {isRevoking ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        Thu hồi
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="note-modal-head mb-0 items-start">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 mb-0.5 text-[1.0938rem] font-bold">{spaceName}</h2>
          <p className="text-[0.8125rem] text-[var(--text-dim)]">Quản lý thành viên & mời</p>
        </div>
        <button
          className="icon-btn flex-none"
          onClick={onClose}
          aria-label="Đóng"
        >
          <X className="icon" size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-0 border-b border-[color:var(--border)]">
        {(['members', 'invite'] as const).map((t) => (
          <button
            key={t}
            className={`settings-tab rounded-b-none ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'members' ? 'Thành viên' : 'Mời'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-4">
        {/* Error banner */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-[9px] border border-red-300 bg-red-50 px-3 py-2.5 text-[0.8125rem] text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-400">
            <span className="flex-1">{error}</span>
            <button
              className="flex-none text-red-400 hover:text-red-600"
              onClick={() => setError(null)}
              aria-label="Đóng lỗi"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[0.875rem] text-[var(--text-dim)]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : (
          <>
            {tab === 'members' && renderMembersTab()}
            {tab === 'invite' && renderInviteTab()}
          </>
        )}
      </div>
    </Modal>
  );
}
