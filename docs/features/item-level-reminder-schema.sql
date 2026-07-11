-- ĐÃ GỘP vào supabase/schema.sql (2026-07-11) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- KN-Space — Bảng item-level cho Nhắc việc (Reminder) — Bước 3 (entity thứ 3)
-- của kế hoạch tách bảng, xem docs/features/item-level-entity-tables.md và
-- -progress.md.
-- =============================================================================
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT FILE NÀY (2026-07-11): CHỈ CHUẨN BỊ SQL trong
-- repo — CHƯA chạy lên Supabase Dashboard thật, CHƯA có dữ liệu migrate, CHƯA
-- có code TypeScript nào ĐỌC bảng này (chỉ có `src/storage/reminderStore.ts`
-- viết sẵn CRUD, và `src/state/itemPersist.ts` GHI qua debounce nhưng đang bị
-- khoá bởi cờ `REMINDER_ITEM_PERSIST_ENABLED = false` — xem comment đầu 2 file
-- đó). Cột `reminders jsonb` trong `kn_private_spaces`/`kn_shared_spaces`
-- (supabase/schema.sql) VẪN LÀ NGUỒN ĐỌC/GHI THẬT của Nhắc việc cho tới khi
-- hoàn tất di trú.
--
-- Chạy nguyên file này 1 lần trong Supabase Dashboard > SQL Editor SAU KHI đã
-- có `supabase/schema.sql` (cần `kn_private_spaces`, `kn_shared_spaces`,
-- `kn_space_members`, và 2 helper function `is_space_member()`/
-- `is_space_owner()` đã tồn tại — 2 bảng cha + 2 hàm helper này đã có sẵn ở
-- schema hiện tại, file này KHÔNG tạo lại).
--
-- An toàn chạy trên production: 2 bảng THUẦN THÊM MỚI (create table if not
-- exists), không ALTER/DROP bảng cũ nào, không đụng dữ liệu jsonb `reminders`
-- đang có trong `kn_private_spaces`/`kn_shared_spaces`. Migration dữ liệu cũ
-- sang 2 bảng này là 1 bước RIÊNG (`src/storage/migrateLegacyReminders.ts`,
-- gọi tay qua `window.knMigrateReminders.preview()/.run()`), KHÔNG chạy tự
-- động khi tạo bảng.
--
-- Quyết định thiết kế (mirror CHÍNH XÁC `kn_private_logs`/`kn_shared_logs`,
-- xem docs/features/item-level-entity-tables.md mục 3.2/3.4 + mục 10 câu hỏi
-- #1 — Phương án B: 2 bảng tách riêng theo loại Space, KHÔNG polymorphic FK).
-- Reminder CÓ bản Shared (khác Habit — bản Shared vẫn tồn tại, đọc/ghi qua cột
-- `reminders` jsonb của `kn_shared_spaces` hiện tại, xem
-- `src/storage/sharedSpaceStore.ts` — KHÔNG bị ép rỗng/ẩn như Habit):
--   - `id` uuid — CLIENT tự sinh (`crypto.randomUUID()`, xem
--     `state/reducers/reminders.ts`), KHÔNG có default `gen_random_uuid()` —
--     giữ nguyên định danh Reminder qua migration.
--   - `space_id` — FK duy nhất trỏ về ĐÚNG 1 bảng cha (kn_private_spaces cho
--     bảng private, kn_shared_spaces cho bảng shared) — không polymorphic.
--     `on delete cascade`: xoá Space thì xoá luôn Reminder của Space đó (khớp
--     hành vi cũ — Reminder nằm trong mảng `reminders` của Space, xoá Space
--     thì mảng cũng mất).
--   - `user_id` (CHỈ có ở bảng private) — cột RLS trực tiếp, KHÔNG join qua
--     `kn_private_spaces` để check quyền (mirror `kn_private_spaces`/
--     `kn_private_logs`). Bảng shared KHÔNG có cột này — quyền check qua
--     `is_space_member(space_id)` (SECURITY DEFINER, tránh đệ quy RLS), giống
--     `kn_shared_spaces`/`kn_shared_logs`. Reminder KHÔNG có field `createdBy`
--     ở tầng app (`src/types.ts` — `ReminderOnce`/`ReminderRecurring` không có
--     field này, khác Task/Note/Log) — vì vậy bảng này KHÔNG có cột
--     `created_by` (không cần, không có gì để lưu).
--   - `reminder_type` ('once' | 'recurring'), `title` — khớp
--     `ReminderDefinition` (`src/types.ts`).
--   - `date` (text, null được) — CHỈ có ý nghĩa với `type = 'once'`
--     (`ReminderOnce.date`). Luôn NULL với `type = 'recurring'` (tầng app tự
--     null tường minh khi ghi, xem `reminderStore.ts` — không để lại giá trị
--     "mồ côi" khi 1 reminder đổi từ once -> recurring hoặc ngược lại, vì
--     `ReminderFormModal.tsx` CHO PHÉP đổi `type` khi sửa 1 reminder đã có).
--   - `time` (text, not null default '') — dùng ở CẢ 2 type (`ReminderOnce.time`
--     hoặc `ReminderRecurring.time`, luôn là string không optional ở tầng
--     app, '' = "không đặt giờ"), không cần nullable.
--   - `freq_n` (integer, null được), `freq_unit` (text, null được, check
--     trong ('hour','day','month')), `day_of_month` (integer, null được) —
--     CHỈ có ý nghĩa với `type = 'recurring'` (`ReminderRecurring`). Luôn NULL
--     với `type = 'once'` (tầng app tự null tường minh khi ghi, cùng lý do
--     `date` ở trên).
--   - `created_at` — dùng THẲNG làm nguồn `ReminderRecurring.createdAt` (MỐC
--     TÍNH CHU KỲ lặp lại — `state/reducers/reminders.ts`: giữ nguyên qua mọi
--     lần `REMINDER_UPDATE` nếu reminder VẪN là 'recurring' trước lúc sửa,
--     làm mới thành "now" nếu vừa chuyển từ 'once' sang 'recurring'; xem mục
--     10 câu hỏi #6 đã chốt, `item-level-entity-tables.md`). Với `type =
--     'once'`, cột này KHÔNG mang ý nghĩa gì (không dùng để tính toán), tầng
--     app KHÔNG set tường minh khi ghi (`reminderStore.ts` — giữ nguyên giá
--     trị gốc lúc INSERT lần đầu, tránh reset vô nghĩa mỗi lần sửa nội dung
--     'once'). Có `default now()` làm lưới an toàn (phòng code quên set),
--     NHƯNG mọi lượt CREATE/UPDATE (khi type='recurring')/migration/import
--     THẬT SỰ PHẢI gửi kèm giá trị tường minh — KHÔNG được để DB tự sinh
--     `now()` cho reminder recurring, nếu không sẽ làm sai lệch mốc tính chu
--     kỳ (đặc biệt chu kỳ theo "Giờ" — neo theo đúng giờ:phút lúc tạo, xem
--     `supabase/functions/send-due-notifications/index.ts`).
--   - `version`/trigger `*_before_update` — giữ theo quyết định đã chốt
--     (2026-07-10, xem docs/features/conflict-handling-simplification.md mục
--     4.3): CÓ cột `version` + trigger tự tăng vô điều kiện mỗi UPDATE (cho
--     `updated_at` "miễn phí"), nhưng tầng app (`reminderStore.ts`) ghi thẳng
--     blind write (`WHERE id = reminderId`, KHÔNG kèm `AND version =
--     expected`), KHÔNG version-check/retry.
--   - Không có cột `order` — Reminder KHÔNG có kéo-thả thủ công, luôn unshift
--     vào ĐẦU mảng khi tạo (`REMINDER_CREATE`, `reducers/reminders.ts`) — load
--     sort theo `created_at` GIẢM DẦN (mới nhất trước) để khớp đúng hành vi
--     hiển thị cũ (`RemindersBlock.tsx` hiển thị thẳng theo thứ tự mảng, không
--     tự sort) — NGƯỢC HƯỚNG với `kn_private_logs`/`kn_private_habits` (2 bảng
--     đó sort TĂNG DẦN vì Log/Habit lần lượt append/push vào CUỐI mảng).
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_reminders — Nhắc việc của Space CÁ NHÂN.
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


-- =============================================================================
-- BẢNG: kn_shared_reminders — Nhắc việc của Shared Space.
-- =============================================================================

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

-- RLS: dùng is_space_member()/is_space_owner() (SECURITY DEFINER, đã có sẵn
-- trong supabase/schema.sql) để tránh đệ quy RLS — mirror CHÍNH XÁC
-- "shared_logs_*_for_member" của kn_shared_logs. Mọi member (không chỉ owner)
-- được sửa/xoá reminder của người khác trong CÙNG space — đúng hành vi cũ
-- (mảng jsonb dùng chung, ai cũng sửa/xoá được bất kỳ item nào), KHÔNG có giới
-- hạn quyền theo người tạo (Reminder không có field `createdBy` ở tầng app,
-- không có khái niệm "người tạo" để giới hạn — xem
-- docs/features/conflict-handling-simplification.md mục 5).
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
-- SAU KHI CHẠY FILE NÀY
-- =============================================================================
-- 1. Kiểm tra 2 bảng đã tạo: `select * from public.kn_private_reminders limit 1;`
--    và `select * from public.kn_shared_reminders limit 1;` (kỳ vọng: 0 hàng,
--    không lỗi "relation does not exist").
-- 2. CHƯA cần đổi gì ở code — `REMINDER_ITEM_PERSIST_ENABLED`
--    (src/state/itemPersist.ts) vẫn `false`, app tiếp tục đọc/ghi Nhắc việc
--    qua cột `reminders` jsonb như hiện tại, không ảnh hưởng gì tới trải
--    nghiệm đang chạy thật.
-- 3. Bước kế tiếp (KHÔNG làm trong lượt chuẩn bị này): test migration bằng
--    `window.knMigrateReminders.preview()` rồi `.run()` với tài khoản Google
--    PHỤ (User B) trước, xác nhận sạch mới migrate tài khoản chính (User A) —
--    xem docs/features/item-level-entity-tables-progress.md.
-- =============================================================================
