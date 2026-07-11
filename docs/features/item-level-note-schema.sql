-- ĐÃ GỘP vào supabase/schema.sql (2026-07-11) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.

-- =============================================================================
-- KN-Space — Bảng item-level cho Ghi chú (Note) — Bước 5 (entity CUỐI CÙNG)
-- của kế hoạch tách bảng, xem docs/features/item-level-entity-tables.md và
-- -progress.md.
-- =============================================================================
-- TRẠNG THÁI TẠI THỜI ĐIỂM VIẾT FILE NÀY (2026-07-11): CHỈ CHUẨN BỊ SQL trong
-- repo — CHƯA chạy lên Supabase Dashboard thật, CHƯA có dữ liệu migrate, CHƯA
-- có code TypeScript nào ĐỌC bảng này (chỉ có `src/storage/noteStore.ts` viết
-- sẵn CRUD, và `src/state/itemPersist.ts` GHI qua debounce nhưng đang bị khoá
-- bởi cờ `NOTE_ITEM_PERSIST_ENABLED = false` — xem comment đầu 2 file đó).
-- Cột `notes jsonb` trong `kn_private_spaces`/`kn_shared_spaces`
-- (supabase/schema.sql) VẪN LÀ NGUỒN ĐỌC/GHI THẬT của Ghi chú cho tới khi
-- hoàn tất di trú.
--
-- Chạy nguyên file này 1 lần trong Supabase Dashboard > SQL Editor SAU KHI đã
-- có `supabase/schema.sql` (cần `kn_private_spaces`, `kn_shared_spaces`,
-- `kn_space_members`, và 2 helper function `is_space_member()`/
-- `is_space_owner()` đã tồn tại — 2 bảng cha + 2 hàm helper này đã có sẵn ở
-- schema hiện tại, file này KHÔNG tạo lại).
--
-- An toàn chạy trên production: 2 bảng THUẦN THÊM MỚI (create table if not
-- exists), không ALTER/DROP bảng cũ nào, không đụng dữ liệu jsonb `notes`
-- đang có trong `kn_private_spaces`/`kn_shared_spaces`. Migration dữ liệu cũ
-- sang 2 bảng này là 1 bước RIÊNG (`src/storage/migrateLegacyNotes.ts`, gọi
-- tay qua `window.knMigrateNotes.preview()/.run()`), KHÔNG chạy tự động khi
-- tạo bảng.
--
-- Quyết định thiết kế (mirror CHÍNH XÁC `kn_private_tasks`/`kn_shared_tasks`,
-- xem docs/features/item-level-entity-tables.md mục 3.2/3.4 + mục 10 câu hỏi
-- #1 — Phương án B: 2 bảng tách riêng theo loại Space, KHÔNG polymorphic FK).
-- Note CÓ bản Shared (giống Task/Log/Reminder, khác Habit):
--   - `id` uuid — CLIENT tự sinh (`crypto.randomUUID()`, xem
--     `state/reducers/notes.ts`), KHÔNG có default `gen_random_uuid()` — giữ
--     nguyên định danh Note qua migration.
--   - `space_id` — FK duy nhất trỏ về ĐÚNG 1 bảng cha (kn_private_spaces cho
--     bảng private, kn_shared_spaces cho bảng shared) — không polymorphic.
--     `on delete cascade`: xoá Space thì xoá luôn Note của Space đó (khớp
--     hành vi cũ — Note nằm trong mảng `notes` của Space, xoá Space thì mảng
--     cũng mất).
--   - `user_id` (CHỈ có ở bảng private) — cột RLS trực tiếp, KHÔNG join qua
--     `kn_private_spaces` để check quyền, mirror `kn_private_tasks`. Bảng
--     shared KHÔNG có cột này — quyền check qua `is_space_member(space_id)`
--     (SECURITY DEFINER, tránh đệ quy RLS).
--   - `created_by` (uuid, NULL được) — "ai tạo note này" (chỉ có ý nghĩa hiển
--     thị ở Shared Space, xem `Note.createdBy` trong `src/types.ts`), KHÔNG
--     dùng cho RLS. `on delete set null` — xoá 1 user không nên kéo theo xoá
--     note người khác đang xem trong Shared Space.
--   - `title`, `content`, `color` — khớp `Note` (`src/types.ts`), text NOT
--     NULL. `title` không có default (reducer luôn trim/fallback 'Note chưa
--     đặt tên' trước khi lưu, không bao giờ rỗng thật). `content`/`color`
--     NOT NULL DEFAULT '' (phòng thủ, dù reducer cũng luôn set giá trị thật).
--   - `hidden` (boolean, NOT NULL DEFAULT false) — "ẩn nội dung" (note bảo
--     mật, xem `NOTE_TOGGLE_CONTENT_HIDDEN`) — persist để giữ trạng thái ẩn
--     sau reload, KHÔNG liên quan gì tới mốc sửa nội dung (xem giải thích cột
--     `content_updated_at` bên dưới).
--   - `item_order` (double precision, NOT NULL, KHÔNG có default) —
--     fractional-index (xem item-level-entity-tables.md mục 5): kéo-thả chỉ
--     tính lại `order` của ĐÚNG 1 note vừa kéo (`computeOrderForInsertAt()`,
--     `src/state/fractionalOrder.ts`), các note khác giữ nguyên `item_order`
--     — mirror CHÍNH XÁC `kn_private_tasks`/`kn_shared_tasks`. Migration giữ
--     NGUYÊN giá trị `order` cũ (số nguyên hiện có) làm giá trị fractional
--     ban đầu.
--   - `created_at` (timestamptz, NULL ĐƯỢC, KHÔNG có default) — mirror
--     `kn_private_tasks`/`kn_shared_tasks`: `Note.createdAt` là field THẬT SỰ
--     OPTIONAL ở tầng app (`createdAt?: string`, xem `types.ts`) — note tạo
--     TRƯỚC khi field này ra đời hoàn toàn có thể THIẾU field này thật sự, và
--     điều đó có Ý NGHĨA KHÁC với "vừa tạo bây giờ" — dùng để sort trong
--     `MobileChatScreen.tsx` (item thiếu `createdAt` bị coi là "rất cũ", xếp
--     lên đầu). Migration/tạo mới CHỈ set `created_at` khi `Note.createdAt`
--     có giá trị thật, bỏ hẳn field này khi note KHÔNG có `createdAt` — xem
--     `noteStore.ts` (`toInsertRow`).
--   - **`content_updated_at` (double precision, NOT NULL, KHÔNG có default)
--     — cột RIÊNG, TÁCH KHỎI trigger `updated_at` nội bộ, chỉ tầng APP set
--     tường minh. LÝ DO (rủi ro thiết kế đã xác định trước khi viết file
--     này):** `Note.updatedAt` (`src/types.ts`, epoch ms) là mốc "sửa nội
--     dung lần cuối" — hiển thị cho user ("đã sửa lúc...") VÀ dùng để sort
--     "Mới sửa gần nhất" (`NotesBlock.tsx`). Ở tầng reducer
--     (`state/reducers/notes.ts`), field này CHỈ đổi ở `NOTE_CREATE`/
--     `NOTE_UPDATE` — KHÔNG đổi khi kéo-thả (`NOTE_REORDER`) hay ẩn/hiện
--     (`NOTE_TOGGLE_CONTENT_HIDDEN`). Nếu dùng thẳng cột `updated_at` do
--     trigger `*_before_update` tự bump VÔ ĐIỀU KIỆN mỗi lần UPDATE (cách
--     Log/Reminder/Task đang làm cho field tương ứng của họ — 2 khái niệm
--     trùng nhau ở các entity đó), 1 lần kéo-thả hoặc ẩn/hiện 1 note sẽ VÔ
--     TÌNH đổi "đã sửa lúc..." hiển thị cho user và làm SAI thứ tự sort "Mới
--     sửa gần nhất" — đây là REGRESSION thật so với hành vi hiện tại (jsonb),
--     PHẢI TRÁNH. Giải pháp: cột `content_updated_at` này CHỈ được
--     `noteStore.ts` set tường minh khi ghi `NOTE_CREATE`/`NOTE_UPDATE`
--     (map thẳng `Note.updatedAt` -> `content_updated_at`, KHÔNG qua
--     `Date`/ISO string — cả 2 đều epoch ms number), KHÔNG đụng khi ghi
--     `NOTE_REORDER` (chỉ patch `item_order`)/`NOTE_TOGGLE_CONTENT_HIDDEN`
--     (chỉ patch `hidden`). Cột `updated_at` (trigger nội bộ, mirror các bảng
--     khác — "miễn phí", không tốn công thêm) VẪN GIỮ trên DB nhưng KHÔNG
--     được tầng app đọc/dùng để suy ra `Note.updatedAt` — chỉ có ý nghĩa nội
--     bộ (audit "hàng này được UPDATE lần cuối lúc nào trên DB", không phải
--     "nội dung note được sửa lúc nào").
--   - `version`/trigger `*_before_update` — giữ theo quyết định đã chốt
--     (2026-07-10, xem docs/features/conflict-handling-simplification.md mục
--     4.3): CÓ cột `version` + trigger tự tăng vô điều kiện mỗi UPDATE (cho
--     `updated_at` "miễn phí"), nhưng tầng app (`noteStore.ts`) ghi thẳng
--     blind write (`WHERE id = noteId`, KHÔNG kèm `AND version = expected`),
--     KHÔNG version-check/retry.
-- =============================================================================


-- =============================================================================
-- BẢNG: kn_private_notes — Ghi chú của Space CÁ NHÂN.
-- =============================================================================

create table if not exists public.kn_private_notes (
  id                   uuid primary key,
  space_id             uuid not null references public.kn_private_spaces (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  title                text not null,
  content              text not null default '',
  color                text not null default '',
  hidden               boolean not null default false,
  item_order           double precision not null,
  created_by           uuid null references auth.users (id) on delete set null,
  created_at           timestamptz null,
  content_updated_at   double precision not null,
  version              bigint not null default 1,
  updated_at           timestamptz not null default now()
);

alter table public.kn_private_notes enable row level security;

create or replace function public.kn_private_notes_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_private_notes_before_update
  before update on public.kn_private_notes
  for each row execute function public.kn_private_notes_before_update();

-- RLS: giống hệt kn_private_spaces/kn_private_tasks — không có khái niệm
-- chia sẻ, mỗi user chỉ đọc/ghi đúng hàng có user_id = chính mình.
create policy "select own private notes" on public.kn_private_notes
  for select using (auth.uid() = user_id);

create policy "insert own private notes" on public.kn_private_notes
  for insert with check (auth.uid() = user_id);

create policy "update own private notes" on public.kn_private_notes
  for update using (auth.uid() = user_id);

create policy "delete own private notes" on public.kn_private_notes
  for delete using (auth.uid() = user_id);

-- Truy vấn chính: load toàn bộ note của 1 Space, sort theo item_order.
create index if not exists idx_kn_private_notes_space_id
  on public.kn_private_notes (space_id);

create index if not exists idx_kn_private_notes_space_id_item_order
  on public.kn_private_notes (space_id, item_order);


-- =============================================================================
-- BẢNG: kn_shared_notes — Ghi chú của Shared Space.
-- =============================================================================

create table if not exists public.kn_shared_notes (
  id                   uuid primary key,
  space_id             uuid not null references public.kn_shared_spaces (id) on delete cascade,
  title                text not null,
  content              text not null default '',
  color                text not null default '',
  hidden               boolean not null default false,
  item_order           double precision not null,
  created_by           uuid null references auth.users (id) on delete set null,
  created_at           timestamptz null,
  content_updated_at   double precision not null,
  version              bigint not null default 1,
  updated_at           timestamptz not null default now()
);

alter table public.kn_shared_notes enable row level security;

create or replace function public.kn_shared_notes_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end;
$$;

create trigger kn_shared_notes_before_update
  before update on public.kn_shared_notes
  for each row execute function public.kn_shared_notes_before_update();

-- RLS: dùng is_space_member() (SECURITY DEFINER, đã có sẵn trong
-- supabase/schema.sql) để tránh đệ quy RLS — mirror CHÍNH XÁC
-- "shared_tasks_*_for_member" của kn_shared_tasks. Mọi member (không chỉ
-- owner) được sửa/xoá note của người khác trong CÙNG space — đúng hành vi cũ
-- (mảng jsonb dùng chung, ai cũng sửa/xoá được bất kỳ item nào), KHÔNG có
-- giới hạn quyền theo người tạo.
create policy "shared_notes_select_for_member"
  on public.kn_shared_notes
  for select
  using (is_space_member(space_id));

create policy "shared_notes_insert_for_member"
  on public.kn_shared_notes
  for insert
  with check (auth.uid() is not null and is_space_member(space_id));

create policy "shared_notes_update_for_member"
  on public.kn_shared_notes
  for update
  using (is_space_member(space_id));

create policy "shared_notes_delete_for_member"
  on public.kn_shared_notes
  for delete
  using (is_space_member(space_id));

create index if not exists idx_kn_shared_notes_space_id
  on public.kn_shared_notes (space_id);

create index if not exists idx_kn_shared_notes_space_id_item_order
  on public.kn_shared_notes (space_id, item_order);


-- =============================================================================
-- SAU KHI CHẠY FILE NÀY
-- =============================================================================
-- 1. Kiểm tra 2 bảng đã tạo: `select * from public.kn_private_notes limit 1;`
--    và `select * from public.kn_shared_notes limit 1;` (kỳ vọng: 0 hàng,
--    không lỗi "relation does not exist").
-- 2. CHƯA cần đổi gì ở code — `NOTE_ITEM_PERSIST_ENABLED`
--    (src/state/itemPersist.ts) vẫn `false`, app tiếp tục đọc/ghi Ghi chú
--    qua cột `notes` jsonb như hiện tại, không ảnh hưởng gì tới trải nghiệm
--    đang chạy thật.
-- 3. Bước kế tiếp (KHÔNG làm trong lượt chuẩn bị này): test migration bằng
--    `window.knMigrateNotes.preview()` rồi `.run()` với tài khoản Google PHỤ
--    (User B) trước, xác nhận sạch mới migrate tài khoản chính (User A) — xem
--    docs/features/item-level-entity-tables-progress.md.
-- =============================================================================
