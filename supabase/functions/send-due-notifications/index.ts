// =============================================================================
// send-due-notifications — Supabase Edge Function (Deno)
// =============================================================================
// Phần 3 của Push Notification. Xem docs/features/push-notification.md mục 9.3
// và docs/features/push-notification-progress.md (Phần 3) cho bối cảnh đầy đủ.
//
// Chạy theo lịch (pg_cron, mỗi 1 phút — xem cuối webapp/supabase/schema.sql).
// Quét MỌI user (kn_space_state) + MỌI shared space (kn_shared_spaces) bằng
// service_role key (bypass RLS), tìm Reminder/Task đang "đến hạn" trong cửa sổ
// 60 giây gần nhất, gửi Web Push tới các subscription liên quan.
//
// CHƯA tự verify chạy thật (không có quyền deploy lên project thật của chủ dự
// án) — xem "Câu hỏi mở / rủi ro" trong file tiến độ trước khi coi đây là xong.
// =============================================================================

// Deno Edge Runtime của Supabase hỗ trợ npm specifier trực tiếp (không cần
// import_map/deno.json riêng cho các bản Supabase CLI/Edge Runtime gần đây).
// Đây là điểm RỦI RO NHẤT của Phần 3 — chưa tự deploy để verify `npm:web-push`
// chạy đúng trong Edge Runtime (khác Node.js: không có `crypto` module Node
// đầy đủ, web-push nội bộ dùng Node `crypto` cho ECDH/HMAC). Nếu deploy lỗi,
// xem phương án dự phòng ghi trong docs/features/push-notification-progress.md
// (Phần 3, mục "Câu hỏi mở") — không viết sẵn code dự phòng ở đây vì tự viết
// đúng RFC 8291 (aes128gcm content encoding) bằng tay tốn effort lớn và rủi ro
// bug cao hơn so với thử specifier thay thế trước (vd `https://esm.sh/web-push`).
import webpush from 'npm:web-push@3.6.7';

import { createClient } from 'npm:@supabase/supabase-js@2';

// -----------------------------------------------------------------------------
// Types tối thiểu (copy tay từ webapp/src/types.ts — Edge Function là project
// Deno độc lập, không import xuyên qua src/ của app Vite để tránh phụ thuộc
// build-tool chéo runtime).
// -----------------------------------------------------------------------------

interface TaskRow {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd, '' nếu không đặt
  time: string; // HH:mm, '' nếu không đặt
  done: boolean;
}

interface ReminderOnceRow {
  id: string;
  type: 'once';
  title: string;
  date: string;
  time: string;
}

interface ReminderRecurringRow {
  id: string;
  type: 'recurring';
  title: string;
  freqN: number;
  freqUnit: 'hour' | 'day' | 'month';
  dayOfMonth: number | null;
  time: string;
  createdAt: string; // yyyy-mm-dd
}

type ReminderRow = ReminderOnceRow | ReminderRecurringRow;

interface SpaceLike {
  id: string;
  tasks?: TaskRow[];
  reminders?: ReminderRow[];
  enabledBlocks?: { tasks?: boolean; reminder?: boolean };
}

interface DueItem {
  itemKey: string; // "task:<id>" | "reminder:<id>"
  dueAtMs: number;
  title: string;
  kind: 'task' | 'reminder';
  spaceId: string;
  /** true nếu thuộc shared space (kn_shared_spaces.id) — false nếu thuộc space cá nhân */
  isShared: boolean;
  /** user_id chủ sở hữu — chỉ có ý nghĩa khi !isShared */
  ownerUserId: string | null;
}

// -----------------------------------------------------------------------------
// Múi giờ: KHÔNG có cột timezone nào trong DB hiện tại — toàn bộ ngày/giờ
// người dùng nhập (`date`/`time`) được coi là giờ địa phương Việt Nam
// (Asia/Ho_Chi_Minh, UTC+7, không có DST). Đây là GIẢ ĐỊNH cần chủ dự án xác
// nhận nếu có user ở múi giờ khác — xem "Câu hỏi mở" trong file tiến độ.
// -----------------------------------------------------------------------------

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Task/Reminder-once chỉ có `date`, không có `time` (rỗng): vẫn phải push, mặc định
// vào lúc 8:00 sáng giờ VN ngày đó (QUYẾT ĐỊNH đã chốt 2026-07-03 — xem file tiến độ).
const DEFAULT_TIME_NO_TIME = '08:00';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** yyyy-mm-dd theo giờ VN, từ 1 thời điểm UTC (Date). */
function vnDateStr(now: Date): string {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Giờ:phút (0-23 / 0-59) theo giờ VN, từ 1 thời điểm UTC (Date). */
function vnHourMinute(d: Date): { hour: number; minute: number } {
  const shifted = new Date(d.getTime() + VN_OFFSET_MS);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

/**
 * Giờ:phút (giờ VN) LÚC TẠO reminder recurring, đọc từ `createdAt` (kỳ vọng ISO
 * timestamp đầy đủ, vd "2026-07-03T07:30:00.000Z"). Trả về `null` nếu `createdAt`
 * là dữ liệu CŨ chỉ có dạng "yyyy-mm-dd" (10 ký tự, không có "T") — tạo trước khi
 * client được sửa (2026-07-03) để lưu đầy đủ giờ:phút:giây thay vì chỉ cắt lấy
 * ngày. Nơi gọi phải tự fallback về giờ mặc định khi gặp `null`.
 */
function anchorHourMinuteFromCreatedAt(createdAt: string): { hour: number; minute: number } | null {
  if (!createdAt || createdAt.length <= 10 || !createdAt.includes('T')) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return vnHourMinute(d);
}

/** Convert 1 mốc "yyyy-mm-dd" + "HH:mm" theo giờ VN → epoch ms (UTC). */
function vnDateTimeToMs(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  const [y, m, d] = dateParts;
  const [hh, mm] = timeParts;
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  // Date.UTC với giờ đã trừ offset VN = đúng epoch UTC tương ứng giờ VN đó.
  return Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0);
}

/** Số ngày nguyên giữa 2 mốc "yyyy-mm-dd" (b - a), không phụ thuộc giờ trong ngày. */
function daysBetween(aDateStr: string, bDateStr: string): number {
  const a = vnDateTimeToMs(aDateStr, '00:00');
  const b = vnDateTimeToMs(bDateStr, '00:00');
  if (a === null || b === null) return NaN;
  return Math.round((b - a) / 86_400_000);
}

// -----------------------------------------------------------------------------
// Logic tính "đến hạn" — bản server, KHÔNG dùng chung với
// webapp/src/features/notifications/computeNotifications.ts (khác runtime,
// đã xác nhận ở docs/features/push-notification.md mục 9.3 / Q-B).
// -----------------------------------------------------------------------------

function collectDueItems(space: SpaceLike, now: Date, isShared: boolean, ownerUserId: string | null): DueItem[] {
  const out: DueItem[] = [];
  const todayVN = vnDateStr(now);

  const tasksEnabled = space.enabledBlocks ? space.enabledBlocks.tasks !== false : true;
  if (tasksEnabled) {
    for (const t of space.tasks ?? []) {
      if (t.done) continue;
      if (!t.date) continue; // không có ngày → không có mốc "đến hạn" nào để push
      const dueAtMs = vnDateTimeToMs(t.date, t.time || DEFAULT_TIME_NO_TIME);
      if (dueAtMs === null) continue;
      out.push({
        itemKey: `task:${t.id}`,
        dueAtMs,
        title: t.title,
        kind: 'task',
        spaceId: space.id,
        isShared,
        ownerUserId,
      });
    }
  }

  // Reminder block: ở Shared Space, UI hiện ẩn hoàn toàn khối "Nhắc việc"
  // (enabledBlocks.reminder cố định false — xem webapp/src/storage/sharedSpaceStore.ts
  // rowToSpace()), nên trên thực tế mảng reminders của shared space sẽ luôn rỗng.
  // Vẫn xử lý ở đây cho đúng/đủ (phòng trường hợp UI mở lại tính năng này sau),
  // không dựa vào enabledBlocks.reminder để bỏ qua sớm.
  for (const r of space.reminders ?? []) {
    if (r.type === 'once') {
      if (!r.date) continue;
      const dueAtMs = vnDateTimeToMs(r.date, r.time || DEFAULT_TIME_NO_TIME);
      if (dueAtMs === null) continue;
      out.push({
        itemKey: `reminder:${r.id}`,
        dueAtMs,
        title: r.title,
        kind: 'reminder',
        spaceId: space.id,
        isShared,
        ownerUserId,
      });
      continue;
    }

    // recurring
    if (r.freqUnit === 'month') {
      if (!r.dayOfMonth) continue;
      const todayDay = Number(todayVN.split('-')[2]);
      if (todayDay !== r.dayOfMonth) continue;
      const dueAtMs = vnDateTimeToMs(todayVN, r.time || DEFAULT_TIME_NO_TIME);
      if (dueAtMs === null) continue;
      out.push({ itemKey: `reminder:${r.id}`, dueAtMs, title: r.title, kind: 'reminder', spaceId: space.id, isShared, ownerUserId });
    } else if (r.freqUnit === 'day') {
      if (!r.createdAt) continue;
      const diffDays = daysBetween(r.createdAt, todayVN);
      if (Number.isNaN(diffDays) || diffDays < 0) continue;
      if (r.freqN <= 0 || diffDays % r.freqN !== 0) continue;
      const dueAtMs = vnDateTimeToMs(todayVN, r.time || DEFAULT_TIME_NO_TIME);
      if (dueAtMs === null) continue;
      out.push({ itemKey: `reminder:${r.id}`, dueAtMs, title: r.title, kind: 'reminder', spaceId: space.id, isShared, ownerUserId });
    } else {
      // freqUnit === 'hour' — nhắc lặp mỗi N giờ, neo theo đúng giờ:phút LÚC TẠO
      // reminder (giờ VN), kiểu "Lời nhắc" trên iPhone. CHỐT 2026-07-03 (xem file
      // tiến độ, Phần 3 "Quyết định kỹ thuật"):
      //   Mốc đến hạn trong 1 ngày = (giờ:phút lúc tạo) + k * freqN giờ, k = 0,1,2,...
      //   cộng dồn tới khi vượt 24h thì quay vòng (mod 1440 phút trong ngày).
      //   Ví dụ tạo lúc 14:30, freqN=3 → các mốc trong ngày: 14:30, 17:30, 20:30,
      //   23:30, 02:30, 05:30, 08:30, 11:30 (8 mốc, quay lại đúng 14:30 thì khép chu
      //   kỳ — không sinh trùng thêm). Các mốc này LẶP LẠI GIỐNG HỆT MỖI NGÀY (không
      //   phụ thuộc "đã bao nhiêu ngày kể từ lúc tạo" như nhánh day/month — vì freqN
      //   là số nguyên giờ nên chu kỳ luôn là ước số của 24h, không cần đếm ngày).
      //   Dữ liệu CŨ (createdAt chỉ "yyyy-mm-dd", không có giờ) → fallback neo
      //   08:00 giờ VN, nhất quán với DEFAULT_TIME_NO_TIME dùng cho item thiếu `time`.
      if (!r.freqN || r.freqN <= 0) continue;
      const anchor = anchorHourMinuteFromCreatedAt(r.createdAt) ?? { hour: 8, minute: 0 };
      const anchorMinuteOfDay = (anchor.hour * 60 + anchor.minute) % 1440;
      const stepMinutes = r.freqN * 60;

      // Sinh toàn bộ mốc giờ:phút trong ngày hôm nay (giờ VN), tối đa 24 vòng lặp
      // (freqN nguyên giờ nên chu kỳ luôn khép trong <=24 bước) — không bao giờ vô hạn.
      let minuteOfDay = anchorMinuteOfDay;
      for (let k = 0; k < 24; k++) {
        const hh = Math.floor(minuteOfDay / 60);
        const mm = minuteOfDay % 60;
        const dueAtMs = vnDateTimeToMs(todayVN, `${pad2(hh)}:${pad2(mm)}`);
        if (dueAtMs !== null) {
          out.push({ itemKey: `reminder:${r.id}`, dueAtMs, title: r.title, kind: 'reminder', spaceId: space.id, isShared, ownerUserId });
        }
        minuteOfDay = (minuteOfDay + stepMinutes) % 1440;
        if (minuteOfDay === anchorMinuteOfDay) break; // đã quay lại đúng mốc neo — chu kỳ khép kín, dừng sớm
      }
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// Handler chính
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
// Subject bắt buộc theo chuẩn Web Push (mailto: hoặc https: URL liên hệ) — không phải bí mật,
// đặt placeholder mặc định, có thể override bằng secret VAPID_SUBJECT nếu chủ dự án muốn đổi.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@kn-space.io.vn';

// Cửa sổ "đến hạn" — cron chạy mỗi 1 phút, dùng cửa sổ 90s để có biên an toàn
// nếu cron lỡ nhịp nhẹ (vẫn không gửi trùng nhờ kn_push_sent_log unique constraint).
const DUE_WINDOW_MS = 90_000;

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Thiếu SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (env tự inject, kiểm tra lại project).' }, 500);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: 'Thiếu secret VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — chạy `supabase secrets set` trước khi deploy.' }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const windowStart = now.getTime() - DUE_WINDOW_MS;

  const summary = {
    itemsChecked: 0,
    itemsDue: 0,
    itemsAlreadySent: 0,
    pushSent: 0,
    pushFailed: 0,
    subscriptionsRemoved: 0,
    errors: [] as string[],
  };

  // 1) Thu thập item đến hạn — space cá nhân (kn_space_state).
  const dueItems: DueItem[] = [];

  const { data: personalRows, error: personalErr } = await supabase
    .from('kn_space_state')
    .select('user_id, spaces');
  if (personalErr) {
    summary.errors.push(`kn_space_state: ${personalErr.message}`);
  } else {
    for (const row of personalRows ?? []) {
      const spaces = Array.isArray(row.spaces) ? (row.spaces as SpaceLike[]) : [];
      for (const space of spaces) {
        summary.itemsChecked += (space.tasks?.length ?? 0) + (space.reminders?.length ?? 0);
        dueItems.push(...collectDueItems(space, now, false, row.user_id as string));
      }
    }
  }

  // 2) Thu thập item đến hạn — shared space (kn_shared_spaces).
  const { data: sharedRows, error: sharedErr } = await supabase
    .from('kn_shared_spaces')
    .select('id, tasks, reminders');
  if (sharedErr) {
    summary.errors.push(`kn_shared_spaces: ${sharedErr.message}`);
  } else {
    for (const row of sharedRows ?? []) {
      const space: SpaceLike = {
        id: row.id as string,
        tasks: Array.isArray(row.tasks) ? (row.tasks as TaskRow[]) : [],
        reminders: Array.isArray(row.reminders) ? (row.reminders as ReminderRow[]) : [],
      };
      summary.itemsChecked += (space.tasks?.length ?? 0) + (space.reminders?.length ?? 0);
      dueItems.push(...collectDueItems(space, now, true, null));
    }
  }

  // 3) Lọc còn item thật sự nằm trong cửa sổ đến hạn hiện tại.
  const inWindow = dueItems.filter((it) => it.dueAtMs >= windowStart && it.dueAtMs <= now.getTime());
  summary.itemsDue = inWindow.length;

  if (inWindow.length === 0) {
    return jsonResponse(summary, 200);
  }

  // 4) Chống gửi trùng: insert vào kn_push_sent_log, bỏ qua item bị conflict (đã gửi rồi).
  const toSend: DueItem[] = [];
  for (const it of inWindow) {
    const dueAtIso = new Date(it.dueAtMs).toISOString();
    const { error: logErr } = await supabase
      .from('kn_push_sent_log')
      .insert({ item_key: it.itemKey, due_at: dueAtIso });
    if (logErr) {
      // Mã lỗi unique_violation của Postgres là '23505' — đã gửi rồi cho đúng due_at này.
      if ((logErr as { code?: string }).code === '23505') {
        summary.itemsAlreadySent += 1;
        continue;
      }
      summary.errors.push(`kn_push_sent_log insert (${it.itemKey}): ${logErr.message}`);
      continue;
    }
    toSend.push(it);
  }

  if (toSend.length === 0) {
    return jsonResponse(summary, 200);
  }

  // 5) Gom user_id nhận thông báo cho từng item.
  //    - Space cá nhân: chỉ owner (ownerUserId).
  //    - Shared space: toàn bộ member (kn_space_members WHERE space_id = ...).
  const sharedSpaceIds = Array.from(new Set(toSend.filter((it) => it.isShared).map((it) => it.spaceId)));
  const membersBySpace = new Map<string, string[]>();
  if (sharedSpaceIds.length > 0) {
    const { data: memberRows, error: memberErr } = await supabase
      .from('kn_space_members')
      .select('space_id, user_id')
      .in('space_id', sharedSpaceIds);
    if (memberErr) {
      summary.errors.push(`kn_space_members: ${memberErr.message}`);
    } else {
      for (const row of memberRows ?? []) {
        const spaceId = row.space_id as string;
        const list = membersBySpace.get(spaceId) ?? [];
        list.push(row.user_id as string);
        membersBySpace.set(spaceId, list);
      }
    }
  }

  // 6) Gom toàn bộ user_id cần gửi (union), load subscription 1 lượt (tránh N+1 query).
  const recipientUserIds = new Set<string>();
  for (const it of toSend) {
    if (it.isShared) {
      for (const uid of membersBySpace.get(it.spaceId) ?? []) recipientUserIds.add(uid);
    } else if (it.ownerUserId) {
      recipientUserIds.add(it.ownerUserId);
    }
  }

  const subsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth_key: string }[]>();
  if (recipientUserIds.size > 0) {
    const { data: subRows, error: subErr } = await supabase
      .from('kn_push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth_key')
      .in('user_id', Array.from(recipientUserIds));
    if (subErr) {
      summary.errors.push(`kn_push_subscriptions: ${subErr.message}`);
    } else {
      for (const row of subRows ?? []) {
        const uid = row.user_id as string;
        const list = subsByUser.get(uid) ?? [];
        list.push({
          id: row.id as string,
          endpoint: row.endpoint as string,
          p256dh: row.p256dh as string,
          auth_key: row.auth_key as string,
        });
        subsByUser.set(uid, list);
      }
    }
  }

  // 7) Gửi push cho từng item x từng subscription của user liên quan.
  for (const it of toSend) {
    const recipients = it.isShared ? (membersBySpace.get(it.spaceId) ?? []) : it.ownerUserId ? [it.ownerUserId] : [];
    // title cố định, ngắn — tên item thật để ở body (không rút gọn) tránh bị điện thoại cắt mất
    // khi tên item dài, xem docs/features/push-notification.md mục 5.3 (cập nhật 2026-07-07).
    const label = it.kind === 'task' ? 'Việc cần làm' : 'Nhắc việc';
    const payload = JSON.stringify({
      title: `⏰ ${label} đến hạn`,
      body: it.title,
      url: `/?open=${it.itemKey}`,
    });

    for (const uid of recipients) {
      const subs = subsByUser.get(uid) ?? [];
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            },
            payload,
          );
          summary.pushSent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // Subscription hỏng/thu hồi — xoá, không crash batch (theo mục 8 Edge Cases).
            const { error: delErr } = await supabase.from('kn_push_subscriptions').delete().eq('id', sub.id);
            if (!delErr) summary.subscriptionsRemoved += 1;
          } else {
            summary.pushFailed += 1;
            summary.errors.push(`sendNotification (${it.itemKey} → ${uid}): ${(err as Error)?.message ?? String(err)}`);
          }
        }
      }
    }
  }

  return jsonResponse(summary, 200);
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
