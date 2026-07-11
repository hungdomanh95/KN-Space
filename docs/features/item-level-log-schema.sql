-- ĐÃ GỘP vào supabase/schema.sql (2026-07-11) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- KN-Space — Bảng item-level cho Nhật ký nhanh (Log) — Bước 1 (entity đầu tiên)
-- của kế hoạch tách bảng, xem docs/features/item-level-entity-tables.md và
-- -progress.md.
-- =============================================================================
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT FILE NÀY (2026-07-10): CHỈ CHUẨN BỊ SQL trong
-- repo — CHƯA chạy lên Supabase Dashboard thật, CHƯA có dữ liệu migrate, CHƯA
-- có code TypeScript nào ĐỌC bảng này (chỉ có `src/storage/logStore.ts` viết
-- sẵn CRUD, và `src/state/itemPersist.ts` GHI qua debounce nhưng đang bị khoá
-- bởi cờ `LOG_ITEM_PERSIST_ENABLED = false` — xem comment đầu 2 file đó).
-- Cột `logs jsonb` trong `kn_private_spaces`/`kn_shared_spaces` (supabase/schema.sql)
-- VẪN LÀ NGUỒN ĐỌC/GHI THẬT của Nhật ký nhanh cho tới khi hoàn tất di trú.
--
-- Chạy nguyên file này 1 lần trong Supabase Dashboard > SQL Editor SAU KHI đã
-- có `supabase/schema.sql` (cần `kn_private_spaces`, `kn_shared_spaces`,
-- `kn_space_members`, và 2 helper function `is_space_member()`/
-- `is_space_owner()` đã tồn tại — 2 bảng cha + 2 hàm helper này đã có sẵn ở
-- schema hiện tại, file này KHÔNG tạo lại).
--
-- An toàn chạy trên production: 2 bảng THUẦN THÊM MỚI (create table if not
-- exists), không ALTER/DROP bảng cũ nào, không đụng dữ liệu jsonb `logs`
-- đang có trong `kn_private_spaces`/`kn_shared_spaces`. Migration dữ liệu cũ
-- sang 2 bảng này là 1 bước RIÊNG (`src/storage/migrateLegacyLogs.ts`, gọi tay
-- qua `window.knMigrateLogs.preview()/.run()`), KHÔNG chạy tự động khi tạo
-- bảng.
--
-- Quyết định thiết kế (mirror CHÍNH XÁC `kn_private_spaces`/`kn_shared_spaces`,
-- xem docs/features/item-level-entity-tables.md mục 3.2/3.4 + mục 10 câu hỏi
-- #1 — Phương án B: 2 bảng tách riêng theo loại Space, KHÔNG polymorphic FK):
--   - `id` uuid — CLIENT tự sinh (`crypto.randomUUID()`, xem `state/reducers/logs.ts`),
--     KHÔNG có default `gen_random_uuid()` — giữ nguyên định danh Log qua migration.
--   - `space_id` — FK duy nhất trỏ về ĐÚNG 1 bảng cha (kn_private_spaces cho
--     bảng private, kn_shared_spaces cho bảng shared) — không polymorphic,
--     không CHECK constraint cần nhớ. `on delete cascade`: xoá Space thì xoá
--     luôn Log của Space đó (khớp hành vi cũ — Log nằm trong mảng `logs` của
--     Space, xoá Space thì mảng cũng mất).
--   - `user_id` (CHỈ có ở bảng private) — cột RLS trực tiếp, KHÔNG join qua
--     `kn_private_spaces` để check quyền (mirror `kn_private_spaces` tự có
--     `user_id` thay vì phải join `kn_space_state`). Bảng shared KHÔNG có cột
--     này — quyền check qua `is_space_member(space_id)` (SECURITY DEFINER,
--     tránh đệ quy RLS), giống `kn_shared_spaces`.
--   - `created_by` (uuid, NULL được) — khác `user_id`: đây là "ai viết log
--     này" (chỉ có ý nghĩa hiển thị avatar ở Shared Space, xem `LogEntry.createdBy`
--     trong `src/types.ts`), KHÔNG dùng cho RLS. `on delete set null` — xoá 1
--     user không nên kéo theo xoá log người khác đang xem trong Shared Space.
--   - `content`, `expense_date`, `category_override`, `excluded` — khớp
--     `LogEntry` (`src/types.ts`). 3 field expense là phần MỞ RỘNG sau
--     (docs/features/quan-ly-chi-tieu.md), optional/NULL = "chưa đặt", tầng
--     app tự áp default khi đọc (xem `logStore.ts` rowToLog()).
--   - `created_at` — dùng THẲNG làm nguồn `LogEntry.createdAt` (KHÔNG có cột
--     `createdAt` riêng ở tầng app nữa, xem item-level-entity-tables.md mục
--     3.4 + mục 10 câu hỏi #6 đã chốt). Có `default now()` làm lưới an toàn
--     (phòng code quên set), NHƯNG mọi lượt CREATE/migration/import THẬT SỰ
--     PHẢI gửi kèm giá trị tường minh (`logStore.ts` luôn set `created_at =
--     log.createdAt`) — KHÔNG được để DB tự sinh `now()` khi migrate log cũ,
--     nếu không sẽ mất mốc thời gian gốc của log đã tạo từ trước.
--   - `version`/trigger `*_before_update` — giữ theo quyết định đã chốt (2026-07-10,
--     xem docs/features/conflict-handling-simplification.md mục 4.3): CÓ cột
--     `version` + trigger tự tăng vô điều kiện mỗi UPDATE (cho `updated_at`
--     "miễn phí"), nhưng tầng app (`logStore.ts`) ghi thẳng blind write
--     (`WHERE id = logId`, KHÔNG kèm `AND version = expected`), KHÔNG
--     version-check/retry. Log không có action UPDATE nội dung (`content`/
--     `created_by`/`created_at` bất biến) — trigger chỉ thực sự chạy khi
--     `LOG_PATCH_EXPENSE` (sửa 3 field expense).
--   - Không có cột `order` — Log sort thuần theo `created_at`, không có kéo-thả
--     thủ công (khác Task/Note sắp tới sẽ cần fractional-index).
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_logs — Nhật ký nhanh của Space CÁ NHÂN.
-- =============================================================================

create table if not exists public.kn_private_logs (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  content            text not null,
  created_by         uuid null references auth.users (id) on delete set null,
  expense_date       text null,
  category_override  text null,
  excluded           boolean null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_logs enable row level security;

create or replace function public.kn_private_logs_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_logs_before_update
  before update on public.kn_private_logs
  for each row execute function public.kn_private_logs_before_update();

-- RLS: giống hệt kn_private_spaces — không có khái niệm chia sẻ, mỗi user chỉ
-- đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private logs" on public.kn_private_logs
  for select using (auth.uid() = user_id);

create policy "insert own private logs" on public.kn_private_logs
  for insert with check (auth.uid() = user_id);

create policy "update own private logs" on public.kn_private_logs
  for update using (auth.uid() = user_id);

create policy "delete own private logs" on public.kn_private_logs
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ log của 1 Space, sort theo created_at.
create index if not exists idx_kn_private_logs_space_id
  on public.kn_private_logs (space_id);

create index if not exists idx_kn_private_logs_space_id_created_at
  on public.kn_private_logs (space_id, created_at);


-- =============================================================================
-- BẢNG: kn_shared_logs — Nhật ký nhanh của Shared Space.
-- =============================================================================

create table if not exists public.kn_shared_logs (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_shared_spaces (id) on delete cascade,
  content            text not null,
  created_by         uuid null references auth.users (id) on delete set null,
  expense_date       text null,
  category_override  text null,
  excluded           boolean null,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_shared_logs enable row level security;

create or replace function public.kn_shared_logs_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_logs_before_update
  before update on public.kn_shared_logs
  for each row execute function public.kn_shared_logs_before_update();

-- RLS: dùng is_space_member()/is_space_owner() (SECURITY DEFINER, đã có sẵn
-- trong supabase/schema.sql) để tránh đệ quy RLS — mirror CHÍNH XÁC
-- "shared_spaces_*_for_member" của kn_shared_spaces. Mọi member (không chỉ
-- owner) được sửa/xoá log của người khác trong CÙNG space — đúng hành vi cũ
-- (mảng jsonb dùng chung, ai cũng sửa/xoá được bất kỳ item nào), KHÔNG có giới
-- hạn quyền theo người tạo (ngoài phạm vi, xem
-- docs/features/conflict-handling-simplification.md mục 5).
create policy "shared_logs_select_for_member"
  on public.kn_shared_logs
  for select
  using (is_space_member(space_id));

create policy "shared_logs_insert_for_member"
  on public.kn_shared_logs
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_logs_update_for_member"
  on public.kn_shared_logs
  for update
  using (is_space_member(space_id));

create policy "shared_logs_delete_for_member"
  on public.kn_shared_logs
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_logs_space_id
  on public.kn_shared_logs (space_id);

create index if not exists idx_kn_shared_logs_space_id_created_at
  on public.kn_shared_logs (space_id, created_at);


-- =============================================================================
-- SAU KHI CHẠY FILE NÀY
-- =============================================================================
-- 1. Kiểm tra 2 bảng đã tạo: `select * from public.kn_private_logs limit 1;`
--    và `select * from public.kn_shared_logs limit 1;` (kỳ vọng: 0 hàng, không
--    lỗi "relation does not exist").
-- 2. CHƯA cần đổi gì ở code — `LOG_ITEM_PERSIST_ENABLED` (src/state/itemPersist.ts)
--    vẫn `false`, app tiếp tục đọc/ghi Nhật ký nhanh qua cột `logs` jsonb như
--    hiện tại, không ảnh hưởng gì tới trải nghiệm đang chạy thật.
-- 3. Bước kế tiếp (KHÔNG làm trong lượt chuẩn bị này): test migration bằng
--    `window.knMigrateLogs.preview()` rồi `.run()` với tài khoản Google PHỤ
--    (User B) trước, xác nhận sạch mới migrate tài khoản chính (User A) — xem
--    docs/features/item-level-entity-tables-progress.md.
-- =============================================================================
