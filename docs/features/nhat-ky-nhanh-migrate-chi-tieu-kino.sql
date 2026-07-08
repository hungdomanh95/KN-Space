-- =============================================================================
-- Migrate 1 lần: chuyển TOÀN BỘ "Việc cần làm" (Task) -> "Nhật ký nhanh" (Log)
-- cho ĐÚNG 1 Shared Space có tên "Chi tiêu gia đình Kino".
--
-- Bối cảnh: đây chính là Space thật mà tính năng Nhật ký nhanh được xây ra để
-- giải quyết (các Task kiểu "Cà phê sáng 20k", "Trà sữa 35k"... đang bị dùng sai
-- mục đích làm log chi tiêu trong khối Việc cần làm). Xem
-- docs/features/nhat-ky-nhanh.md mục 1.
--
-- Chạy TRỰC TIẾP trong Supabase Dashboard > SQL Editor. KHÔNG chạy tự động qua
-- code app — đây là thao tác sửa dữ liệu thật 1 lần, không phải migration lặp
-- lại trong ứng dụng.
--
-- CHUYỂN ĐỔI FIELD (đã xác nhận với chủ dự án — chấp nhận mất field không có ở
-- Log):
--   Task.title (+ " — " + Task.content nếu content không rỗng)  -> Log.content
--   Task.createdBy                                              -> Log.createdBy (giữ nguyên nếu có)
--   Task.createdAt                                              -> Log.createdAt (giữ nguyên nếu có, fallback now())
--   Task.date / Task.time / Task.done / Task.assigneeIds        -> MẤT, không có trường
--                                                                    tương đương ở Log (đã xác nhận
--                                                                    chấp nhận mất, xem LogEntry ở
--                                                                    src/types.ts).
--   Log.id mới sinh bằng gen_random_uuid() — project này đã bật sẵn extension
--   pgcrypto (xem docs/features/shared-space-schema.sql: cột `id` của chính
--   bảng kn_shared_spaces cũng dùng `default gen_random_uuid()`), nên hàm này
--   dùng được thẳng, không cần `create extension` thêm.
--
-- ⚠️ CẢNH BÁO QUAN TRỌNG — ĐỌC TRƯỚC KHI CHẠY UPDATE:
-- Cơ chế lưu hiện tại (`src/storage/sharedSpaceStore.ts` + debounce 600ms trong
-- `AppStateContext.tsx`) gửi lên Supabase NGUYÊN CẢ MẢNG `tasks`/`logs` hiện có
-- trong bộ nhớ của từng thiết bị, không phải diff từng item. Nếu tại thời điểm
-- chạy script này có bất kỳ thành viên nào khác trong Space "Chi tiêu gia đình
-- Kino" đang mở app dở dang (kể cả chỉ đang xem, chưa thao tác gì) và sau đó có
-- 1 thay đổi bất kỳ trigger save (thêm/sửa/xoá 1 Task/Note/Reminder khác) diễn
-- ra SAU khi script UPDATE này chạy, thiết bị đó sẽ ghi đè `tasks` (và có thể cả
-- `logs`) bằng bản CŨ đang nằm trong bộ nhớ của họ — vô hiệu hoá toàn bộ
-- migration vừa chạy. HÃY đảm bảo không có thành viên nào khác đang mở app Space
-- này trước khi chạy UPDATE bên dưới (nhắn trước trong nhóm, hoặc chọn thời điểm
-- chắc chắn không ai đang dùng).
--
-- Nên tự backup Space này trước qua Settings > tab Chung > Export JSON (export
-- xuất toàn bộ `state.spaces`, gồm cả Shared Space đang là thành viên — xem
-- src/features/settings/exportImport.ts và docs/requirements.md mục 7) — mở
-- app, chuyển sang đúng Space "Chi tiêu gia đình Kino" hoặc bất kỳ Space nào
-- (export lấy tất cả Space cùng lúc), Settings > Export, lưu file .json lại
-- trước khi chạy UPDATE. Thao tác UPDATE dưới đây KHÔNG có cơ chế tự hoàn tác.
--
-- IDEMPOTENT: script AN TOÀN nếu lỡ chạy UPDATE 2 lần liên tiếp — sau lần chạy
-- đầu, `tasks` của Space này đã là '[]', nên điều kiện
-- `jsonb_array_length(tasks) > 0` sẽ chặn lần chạy sau không làm gì thêm (không
-- tạo log trùng lặp).
-- =============================================================================


-- =============================================================================
-- BƯỚC 1 — PREVIEW (chỉ SELECT, KHÔNG sửa dữ liệu). Chạy trước, đọc kỹ kết quả
-- trước khi chạy BƯỚC 2 (UPDATE).
-- =============================================================================
select
  name,
  id as space_id,
  jsonb_array_length(tasks) as so_task_se_chuyen,
  jsonb_array_length(logs) as so_log_hien_co_truoc_khi_chuyen,
  (
    select jsonb_agg(
      jsonb_build_object(
        'content',
          case
            when coalesce(trim(t ->> 'content'), '') = '' then t ->> 'title'
            else (t ->> 'title') || ' — ' || (t ->> 'content')
          end,
        'createdBy', t ->> 'createdBy',
        'createdAt', coalesce(t ->> 'createdAt', now()::text)
      )
      order by (t ->> 'createdAt') nulls last
    )
    from jsonb_array_elements(tasks) as t
  ) as preview_log_se_duoc_tao
from public.kn_shared_spaces
where name = 'Chi tiêu gia đình Kino';

-- Kỳ vọng: đúng 1 dòng kết quả (nếu ra 0 dòng, kiểm tra lại tên Space có đúng
-- chính xác từng ký tự/dấu cách không — WHERE dùng so khớp tuyệt đối, không
-- phải LIKE). Nếu ra nhiều hơn 1 dòng, DỪNG LẠI — báo lại, không chạy BƯỚC 2,
-- vì UPDATE bên dưới sẽ tác động lên TẤT CẢ các dòng trùng tên đó.


-- =============================================================================
-- BƯỚC 2 — UPDATE thật: chuyển toàn bộ tasks -> logs (append vào logs hiện có,
-- không ghi đè log cũ), rồi xoá sạch tasks (tasks = '[]').
-- Chỉ tác động ĐÚNG 1 hàng có name = 'Chi tiêu gia đình Kino'.
-- =============================================================================
update public.kn_shared_spaces
set
  logs = logs || coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'content',
            case
              when coalesce(trim(t ->> 'content'), '') = '' then t ->> 'title'
              else (t ->> 'title') || ' — ' || (t ->> 'content')
            end,
          'createdBy', t ->> 'createdBy',
          'createdAt', coalesce(t ->> 'createdAt', now()::text)
        )
      )
      from jsonb_array_elements(tasks) as t
    ),
    '[]'::jsonb
  ),
  tasks = '[]'::jsonb
where name = 'Chi tiêu gia đình Kino'
  and jsonb_array_length(tasks) > 0; -- chặn chạy lại lần 2 tạo log trùng (idempotent)

-- Sau khi chạy, verify lại bằng:
  select name, jsonb_array_length(tasks) as tasks_con_lai,
         jsonb_array_length(logs) as logs_sau_khi_chuyen
  from public.kn_shared_spaces
  where name = 'Chi tiêu gia đình Kino';
-- Kỳ vọng: tasks_con_lai = 0, logs_sau_khi_chuyen = (so_log_hien_co_truoc_khi_chuyen
-- + so_task_se_chuyen ở BƯỚC 1).
