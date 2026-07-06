// =============================================================================
// notify-shared-task-event — Supabase Edge Function (Deno)
// =============================================================================
// Phần "Assign Task + Thông báo sự kiện" — xem
// docs/features/shared-space-task-assign-notify.md mục 4 (Kiến trúc kỹ thuật).
//
// KHÁC send-due-notifications: function này được gọi TRỰC TIẾP từ client (không qua cron),
// nên PHẢI tự xác thực JWT người gọi + verify membership trước khi gửi push — không dùng
// service_role để tin cậy request ngay từ đầu.
// =============================================================================

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
// Cùng secret VAPID đã set cho send-due-notifications — không cần set lại (secret là project-level).
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@kn-space.io.vn';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  spaceId: string;
  spaceName: string;
  taskId: string;
  taskTitle: string;
  event: 'assigned' | 'completed';
  recipientUserIds?: string[];
  excludeUserId?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: 'Thiếu secret VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.' }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body không phải JSON hợp lệ.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Body phải là object JSON hợp lệ.' }, 400);
  }

  const { spaceId, spaceName, taskId, taskTitle, event, recipientUserIds, excludeUserId } = body;
  if (!spaceId || !spaceName || !taskId || !taskTitle || (event !== 'assigned' && event !== 'completed')) {
    return jsonResponse({ error: 'Thiếu field bắt buộc hoặc event không hợp lệ.' }, 400);
  }

  // 1) Xác thực caller qua JWT trong header Authorization (client tự đính kèm qua functions.invoke()).
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'Không xác thực được người gọi (JWT không hợp lệ).' }, 401);
  }
  const callerId = userData.user.id;

  // 2) service_role để verify caller là Member thật của space + lấy toàn bộ member.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: memberRows, error: memberErr } = await admin
    .from('kn_space_members')
    .select('user_id')
    .eq('space_id', spaceId);

  if (memberErr) {
    return jsonResponse({ error: `kn_space_members: ${memberErr.message}` }, 500);
  }
  const memberIds = new Set((memberRows ?? []).map((r) => r.user_id as string));
  if (!memberIds.has(callerId)) {
    return jsonResponse({ error: 'Bạn không phải thành viên của space này.' }, 403);
  }

  // 3) Tính danh sách người nhận theo event (xem spec mục 3.2/3.3).
  let recipients: string[];
  if (event === 'completed') {
    recipients = Array.from(memberIds).filter((id) => id !== excludeUserId);
  } else {
    recipients = (recipientUserIds ?? []).filter((id) => memberIds.has(id) && id !== callerId);
  }

  if (recipients.length === 0) {
    return jsonResponse({ ok: true, pushSent: 0, pushFailed: 0, note: 'Không có người nhận hợp lệ.' }, 200);
  }

  // 4) Lọc người đã tắt sub-toggle "Thông báo hoạt động Space chung" (settings.pushNotifySharedSpaceEvents === false).
  const { data: stateRows, error: stateErr } = await admin
    .from('kn_space_state')
    .select('user_id, settings')
    .in('user_id', recipients);
  if (stateErr) {
    return jsonResponse({ error: `kn_space_state: ${stateErr.message}` }, 500);
  }
  const optedOut = new Set(
    (stateRows ?? [])
      .filter((r) => (r.settings as { pushNotifySharedSpaceEvents?: boolean } | null)?.pushNotifySharedSpaceEvents === false)
      .map((r) => r.user_id as string),
  );
  const finalRecipients = recipients.filter((id) => !optedOut.has(id));

  if (finalRecipients.length === 0) {
    return jsonResponse({ ok: true, pushSent: 0, pushFailed: 0, note: 'Toàn bộ người nhận đã tắt loại thông báo này.' }, 200);
  }

  // 5) Lấy subscription của người nhận + gửi push (cùng pattern send-due-notifications).
  const { data: subRows, error: subErr } = await admin
    .from('kn_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key')
    .in('user_id', finalRecipients);
  if (subErr) {
    return jsonResponse({ error: `kn_push_subscriptions: ${subErr.message}` }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const title = event === 'completed'
    ? `✅ ${spaceName}: ${taskTitle} đã hoàn thành`
    : `📌 ${spaceName}: bạn được giao "${taskTitle}"`;
  const payload = JSON.stringify({ title, url: `/?open=task:${taskId}` });

  let pushSent = 0;
  let pushFailed = 0;
  for (const sub of subRows ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth_key as string } },
        payload,
      );
      pushSent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await admin.from('kn_push_subscriptions').delete().eq('id', sub.id as string);
      } else {
        pushFailed += 1;
      }
    }
  }

  return jsonResponse({ ok: true, pushSent, pushFailed, recipients: finalRecipients.length }, 200);
});
