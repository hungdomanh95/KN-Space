-- ĐÃ GỘP vào supabase/schema.sql (2026-07-11) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- KN-Space — Bảng item-level cho Việc cần làm (Task) — Bước 4 (entity thứ 4)
-- của kế hoạch tách bảng, xem docs/features/item-level-entity-tables.md và
-- -progress.md.
-- =============================================================================
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT FILE NÀY (2026-07-11): CHỈ CHUẨN BỊ SQL trong
-- repo — CHƯA chạy lên Supabase Dashboard thật, CHƯA có dữ liệu migrate, CHƯA
-- có code TypeScript nào ĐỌC bảng này (chỉ có `src/storage/taskStore.ts` viết
-- sẵn CRUD, và `src/state/itemPersist.ts` GHI qua debounce nhưng đang bị khoá
-- bởi cờ `TASK_ITEM_PERSIST_ENABLED = false` — xem comment đầu 2 file đó).
-- Cột `tasks jsonb` trong `kn_private_spaces`/`kn_shared_spaces`
-- (supabase/schema.sql) VẪN LÀ NGUỒN ĐỌC/GHI THẬT của Việc cần làm cho tới khi
-- hoàn tất di trú.
--
-- Chạy nguyên file này 1 lần trong Supabase Dashboard > SQL Editor SAU KHI đã
-- có `supabase/schema.sql` (cần `kn_private_spaces`, `kn_shared_spaces`,
-- `kn_space_members`, và 2 helper function `is_space_member()`/
-- `is_space_owner()` đã tồn tại — 2 bảng cha + 2 hàm helper này đã có sẵn ở
-- schema hiện tại, file này KHÔNG tạo lại).
--
-- An toàn chạy trên production: 2 bảng THUẦN THÊM MỚI (create table if not
-- exists), không ALTER/DROP bảng cũ nào, không đụng dữ liệu jsonb `tasks`
-- đang có trong `kn_private_spaces`/`kn_shared_spaces`. Migration dữ liệu cũ
-- sang 2 bảng này là 1 bước RIÊNG (`src/storage/migrateLegacyTasks.ts`, gọi
-- tay qua `window.knMigrateTasks.preview()/.run()`), KHÔNG chạy tự động khi
-- tạo bảng.
--
-- Quyết định thiết kế (mirror CHÍNH XÁC `kn_private_logs`/`kn_shared_logs` +
-- `kn_private_reminders`/`kn_shared_reminders`, xem docs/features/
-- item-level-entity-tables.md mục 3.2/3.4 + mục 10 câu hỏi #1 — Phương án B: 2
-- bảng tách riêng theo loại Space, KHÔNG polymorphic FK). Task CÓ bản Shared
-- (giống Log/Reminder, khác Habit):
--   - `id` uuid — CLIENT tự sinh (`crypto.randomUUID()`, xem
--     `state/reducers/tasks.ts`), KHÔNG có default `gen_random_uuid()` — giữ
--     nguyên định danh Task qua migration (quan trọng: Task còn được dùng làm
--     deep-link trong notify Shared Space, xem
--     docs/features/shared-space-task-assign-notify.md — id KHÔNG được đổi).
--   - `space_id` — FK duy nhất trỏ về ĐÚNG 1 bảng cha (kn_private_spaces cho
--     bảng private, kn_shared_spaces cho bảng shared) — không polymorphic.
--     `on delete cascade`: xoá Space thì xoá luôn Task của Space đó (khớp
--     hành vi cũ — Task nằm trong mảng `tasks` của Space, xoá Space thì mảng
--     cũng mất).
--   - `user_id` (CHỈ có ở bảng private) — cột RLS trực tiếp, KHÔNG join qua
--     `kn_private_spaces` để check quyền, mirror `kn_private_logs`/
--     `kn_private_reminders`. Bảng shared KHÔNG có cột này — quyền check qua
--     `is_space_member(space_id)` (SECURITY DEFINER, tránh đệ quy RLS).
--   - `created_by` (uuid, NULL được) — "ai giao/tạo task này" (chỉ có ý nghĩa
--     hiển thị avatar ở Shared Space, xem `Task.createdBy` trong
--     `src/types.ts`), KHÔNG dùng cho RLS. `on delete set null` — xoá 1 user
--     không nên kéo theo xoá task người khác đang xem trong Shared Space.
--   - `title`, `content`, `task_date`, `task_time`, `done` — khớp `Task`
--     (`src/types.ts`). Cả 4 field text (`title`/`content`/`task_date`/
--     `task_time`) đều KHÔNG optional ở tầng app (rỗng `''` = "chưa đặt", CHỨ
--     KHÔNG PHẢI null) — NOT NULL DEFAULT ''.
--   - `item_order` (double precision, NOT NULL, KHÔNG có default) —
--     fractional-index (xem item-level-entity-tables.md mục 5): kéo-thả chỉ
--     tính lại `order` của ĐÚNG 1 task vừa kéo (`computeOrderForInsertAt()`,
--     `src/state/fractionalOrder.ts`), các task khác giữ nguyên `item_order`
--     — khác hẳn `order` kiểu integer cũ (reindex `0..n-1` toàn mảng mỗi lần
--     kéo-thả). Migration giữ NGUYÊN giá trị `order` cũ (số nguyên hiện có)
--     làm giá trị fractional ban đầu — số nguyên vẫn là số thực hợp lệ, không
--     cần convert gì đặc biệt.
--   - `assignee_ids` (jsonb, NOT NULL DEFAULT '[]') — GIỮ NGUYÊN kiểu jsonb
--     (quyết định đã chốt #4, item-level-entity-tables.md mục 10 câu hỏi #5 —
--     KHÔNG đổi sang `uuid[]`, dự án chưa có tiền lệ cột mảng kiểu đó, không
--     có nhu cầu query server-side theo assignee hiện tại).
--   - `created_at` (timestamptz, NULL ĐƯỢC, KHÔNG có default) — khác hẳn
--     `kn_private_logs`/`kn_private_reminders` (2 bảng đó NOT NULL DEFAULT
--     now()): `Task.createdAt` là field THẬT SỰ OPTIONAL ở tầng app
--     (`createdAt?: string`, xem `types.ts`) — Task tạo TRƯỚC khi field này ra
--     đời (không có trong `normalizeSpace()`, khác Reminder — reducer
--     `normalizeSpace` có patch mặc định cho `ReminderRecurring.createdAt`
--     nhưng KHÔNG có patch tương tự cho Task) hoàn toàn có thể THIẾU field
--     này thật sự, và điều đó có Ý NGHĨA KHÁC với "vừa tạo bây giờ" — dùng để
--     sort trong `MobileChatScreen.tsx` (item thiếu `createdAt` bị coi là
--     "rất cũ", xếp lên đầu). Nếu cột này NOT NULL DEFAULT now(), 1 task cũ
--     migrate thiếu field sẽ vô tình được gán "vừa tạo bây giờ", sai lệch thứ
--     tự hiển thị trong màn Trò chuyện (mobile). Vì vậy: migration/tạo mới
--     CHỈ set `created_at` khi `Task.createdAt` có giá trị thật, bỏ hẳn field
--     này (không set NULL tường minh, không set `now()`) khi task KHÔNG có
--     `createdAt` — xem `taskStore.ts` (`toInsertRow`).
--   - `version`/trigger `*_before_update` — giữ theo quyết định đã chốt
--     (2026-07-10, xem docs/features/conflict-handling-simplification.md mục
--     4.3): CÓ cột `version` + trigger tự tăng vô điều kiện mỗi UPDATE (cho
--     `updated_at` "miễn phí"), nhưng tầng app (`taskStore.ts`) ghi thẳng
--     blind write (`WHERE id = taskId`, KHÔNG kèm `AND version = expected`),
--     KHÔNG version-check/retry.
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_tasks — Việc cần làm của Space CÁ NHÂN.
-- =============================================================================

create table if not exists public.kn_private_tasks (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  content            text not null default '',
  task_date          text not null default '',
  task_time          text not null default '',
  done               boolean not null default false,
  item_order         double precision not null,
  created_by         uuid null references auth.users (id) on delete set null,
  assignee_ids       jsonb not null default '[]'::jsonb,
  created_at         timestamptz null,
  version            bigint not null default 1,
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_tasks enable row level security;

create or replace function public.kn_private_tasks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_tasks_before_update
  before update on public.kn_private_tasks
  for each row execute function public.kn_private_tasks_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_logs/kn_private_reminders —
-- không có khái niệm chia sẻ, mỗi user chỉ đọc/ghi đúng hàng có
-- user_id = chính mình.
create policy "select own private tasks" on public.kn_private_tasks
  for select using (auth.uid() = user_id);

create policy "insert own private tasks" on public.kn_private_tasks
  for insert with check (auth.uid() = user_id);

create policy "update own private tasks" on public.kn_private_tasks
  for update using (auth.uid() = user_id);

create policy "delete own private tasks" on public.kn_private_tasks
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ task của 1 Space, sort theo item_order.
create index if not exists idx_kn_private_tasks_space_id
  on public.kn_private_tasks (space_id);

create index if not exists idx_kn_private_tasks_space_id_item_order
  on public.kn_private_tasks (space_id, item_order);


-- =============================================================================
-- BẢNG: kn_shared_tasks — Việc cần làm của Shared Space.
-- =============================================================================

create table if not exists public.kn_shared_tasks (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_shared_spaces (id) on delete cascade,
  title              text not null,
  content            text not null default '',
  task_date          text not null default '',
  task_time          text not null default '',
  done               boolean not null default false,
  item_order         double precision not null,
  created_by         uuid null references auth.users (id) on delete set null,
  assignee_ids       jsonb not null default '[]'::jsonb,
  created_at         timestamptz null,
  version            bigint not null default 1,
  updated_at         timestamptz not null default now()
);

alter table public.kn_shared_tasks enable row level security;

create or replace function public.kn_shared_tasks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_tasks_before_update
  before update on public.kn_shared_tasks
  for each row execute function public.kn_shared_tasks_before_update();

-- RLS: dùng is_space_member()/is_space_owner() (SECURITY DEFINER, đã có sẵn
-- trong supabase/schema.sql) để tránh đệ quy RLS — mirror CHÍNH XÁC
-- "shared_reminders_*_for_member" của kn_shared_reminders. Mọi member (không
-- chỉ owner) được sửa/xoá task của người khác trong CÙNG space — đúng hành vi
-- cũ (mảng jsonb dùng chung, ai cũng sửa/xoá được bất kỳ item nào), KHÔNG có
-- giới hạn quyền theo người tạo (xem
-- docs/features/conflict-handling-simplification.md mục 5).
create policy "shared_tasks_select_for_member"
  on public.kn_shared_tasks
  for select
  using (is_space_member(space_id));

create policy "shared_tasks_insert_for_member"
  on public.kn_shared_tasks
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_tasks_update_for_member"
  on public.kn_shared_tasks
  for update
  using (is_space_member(space_id));

create policy "shared_tasks_delete_for_member"
  on public.kn_shared_tasks
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_tasks_space_id
  on public.kn_shared_tasks (space_id);

create index if not exists idx_kn_shared_tasks_space_id_item_order
  on public.kn_shared_tasks (space_id, item_order);


-- =============================================================================
-- SAU KHI CHẠY FILE NÀY
-- =============================================================================
-- 1. Kiểm tra 2 bảng đã tạo: `select * from public.kn_private_tasks limit 1;`
--    và `select * from public.kn_shared_tasks limit 1;` (kỳ vọng: 0 hàng,
--    không lỗi "relation does not exist").
-- 2. CHƯA cần đổi gì ở code — `TASK_ITEM_PERSIST_ENABLED`
--    (src/state/itemPersist.ts) vẫn `false`, app tiếp tục đọc/ghi Việc cần
--    làm qua cột `tasks` jsonb như hiện tại, không ảnh hưởng gì tới trải
--    nghiệm đang chạy thật.
-- 3. Bước kế tiếp (KHÔNG làm trong lượt chuẩn bị này): test migration bằng
--    `window.knMigrateTasks.preview()` rồi `.run()` với tài khoản Google PHỤ
--    (User B) trước, xác nhận sạch mới migrate tài khoản chính (User A) — xem
--    docs/features/item-level-entity-tables-progress.md.
-- =============================================================================
