-- ĐÃ GỘP vào supabase/schema.sql (2026-07-11) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- KN-Space — Bảng item-level cho Thói quen (Habit) — Bước 2 (entity thứ 2)
-- của kế hoạch tách bảng, xem docs/features/item-level-entity-tables.md và
-- -progress.md.
-- =============================================================================
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT FILE NÀY (2026-07-11): CHỈ CHUẨN BỊ SQL trong
-- repo — CHƯA chạy lên Supabase Dashboard thật, CHƯA có dữ liệu migrate, CHƯA
-- có code TypeScript nào ĐỌC bảng này (chỉ có `src/storage/habitStore.ts` viết
-- sẵn CRUD, và `src/state/itemPersist.ts` GHI qua debounce nhưng đang bị khoá
-- bởi cờ `HABIT_ITEM_PERSIST_ENABLED = false` — xem comment đầu 2 file đó).
-- Cột `habits jsonb` trong `kn_private_spaces` (supabase/schema.sql) VẪN LÀ
-- NGUỒN ĐỌC/GHI THẬT của Thói quen cho tới khi hoàn tất di trú.
--
-- Chạy nguyên file này 1 lần trong Supabase Dashboard > SQL Editor SAU KHI đã
-- có `supabase/schema.sql` (cần `kn_private_spaces` đã tồn tại — bảng cha này
-- đã có sẵn ở schema hiện tại, file này KHÔNG tạo lại).
--
-- An toàn chạy trên production: 1 bảng THUẦN THÊM MỚI (create table if not
-- exists), không ALTER/DROP bảng cũ nào, không đụng dữ liệu jsonb `habits`
-- đang có trong `kn_private_spaces`. Migration dữ liệu cũ sang bảng này là 1
-- bước RIÊNG (`src/storage/migrateLegacyHabits.ts`, gọi tay qua
-- `window.knMigrateHabits.preview()/.run()`), KHÔNG chạy tự động khi tạo bảng.
--
-- KHÁC `kn_private_logs`/`kn_shared_logs` (Bước 1) — Habit KHÔNG có bản Shared:
-- CHỈ 1 bảng `kn_private_habits`, không có `kn_shared_habits`. Habit block bị
-- ẩn hoàn toàn ở Shared Space (xem supabase/schema.sql mục 8 — Shared Space
-- không lưu `habits`, `enabled_blocks` mặc định ép `habits: false`,
-- `sharedSpaceStore.ts` ép cứng `habits: []` bất kể DB lưu gì) — quyết định đã
-- chốt #1 (docs/features/item-level-entity-tables-progress.md).
--
-- Quyết định thiết kế (mirror CHÍNH XÁC `kn_private_logs`, xem
-- docs/features/item-level-entity-tables.md mục 3.2/3.4):
--   - `id` uuid — CLIENT tự sinh (`crypto.randomUUID()`, xem
--     `state/reducers/habits.ts`), KHÔNG có default `gen_random_uuid()` — giữ
--     nguyên định danh Habit qua migration.
--   - `space_id` — FK trỏ về `kn_private_spaces` (chỉ 1 nhánh, không
--     polymorphic). `on delete cascade`: xoá Space thì xoá luôn Habit của
--     Space đó (khớp hành vi cũ — Habit nằm trong mảng `habits` của Space, xoá
--     Space thì mảng cũng mất).
--   - `user_id` — cột RLS trực tiếp, KHÔNG join qua `kn_private_spaces` để
--     check quyền (mirror `kn_private_spaces`/`kn_private_logs` tự có
--     `user_id`).
--   - `title`, `completed_dates` (jsonb, mảng `yyyy-mm-dd`, giữ nguyên kiểu cũ
--     — khớp `Habit.completedDates` trong `src/types.ts`).
--   - Không có cột `order` — Habit giữ nguyên thứ tự mảng khi tạo (push vào
--     cuối, xem `state/reducers/habits.ts`), KHÔNG có kéo-thả thủ công. Load
--     sort theo `created_at` tăng dần để giữ đúng thứ tự tạo (mirror
--     `kn_private_logs`, không cần fractional-index như Task/Note sắp tới).
--   - `created_at` — có `default now()` làm lưới an toàn (phòng code quên
--     set), tầng app (`habitStore.ts`) KHÔNG cần set tường minh khi tạo mới
--     (khác Log — Habit không có field `createdAt` hiển thị ở FE, cột này chỉ
--     dùng nội bộ để sort đúng thứ tự tạo). Riêng migration dữ liệu CŨ
--     (`migrateLegacyHabits.ts`) — Habit jsonb cũ KHÔNG có mốc thời gian tạo
--     nào để giữ lại (không có field tương đương `createdAt`), nên migrate cứ
--     để DB tự `now()`, chấp nhận thứ tự sau migrate không phản ánh đúng thứ
--     tự tạo gốc (rủi ro thấp — Habit thường chỉ vài item/Space).
--   - `version`/trigger `*_before_update` — giữ theo quyết định đã chốt
--     (2026-07-10, xem docs/features/conflict-handling-simplification.md mục
--     4.3): CÓ cột `version` + trigger tự tăng vô điều kiện mỗi UPDATE (cho
--     `updated_at` "miễn phí"), nhưng tầng app (`habitStore.ts`) ghi thẳng
--     blind write (`WHERE id = habitId`, KHÔNG kèm `AND version = expected`),
--     KHÔNG version-check/retry.
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_habits — Thói quen của Space CÁ NHÂN (KHÔNG có bản Shared).
-- =============================================================================

create table if not exists public.kn_private_habits (
  id                 uuid primary key,
  space_id           uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  completed_dates    jsonb not null default '[]'::jsonb,
  version            bigint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.kn_private_habits enable row level security;

create or replace function public.kn_private_habits_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_habits_before_update
  before update on public.kn_private_habits
  for each row execute function public.kn_private_habits_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_logs — không có khái niệm chia
-- sẻ, mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private habits" on public.kn_private_habits
  for select using (auth.uid() = user_id);

create policy "insert own private habits" on public.kn_private_habits
  for insert with check (auth.uid() = user_id);

create policy "update own private habits" on public.kn_private_habits
  for update using (auth.uid() = user_id);

create policy "delete own private habits" on public.kn_private_habits
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ habit của 1 Space, sort theo created_at.
create index if not exists idx_kn_private_habits_space_id
  on public.kn_private_habits (space_id);

create index if not exists idx_kn_private_habits_space_id_created_at
  on public.kn_private_habits (space_id, created_at);


-- =============================================================================
-- SAU KHI CHẠY FILE NÀY
-- =============================================================================
-- 1. Kiểm tra bảng đã tạo: `select * from public.kn_private_habits limit 1;`
--    (kỳ vọng: 0 hàng, không lỗi "relation does not exist").
-- 2. CHƯA cần đổi gì ở code — `HABIT_ITEM_PERSIST_ENABLED` (src/state/itemPersist.ts)
--    vẫn `false`, app tiếp tục đọc/ghi Thói quen qua cột `habits` jsonb như
--    hiện tại, không ảnh hưởng gì tới trải nghiệm đang chạy thật.
-- 3. Bước kế tiếp (KHÔNG làm trong lượt chuẩn bị này): test migration bằng
--    `window.knMigrateHabits.preview()` rồi `.run()` với tài khoản Google PHỤ
--    (User B) trước, xác nhận sạch mới migrate tài khoản chính (User A) — xem
--    docs/features/item-level-entity-tables-progress.md.
-- =============================================================================
