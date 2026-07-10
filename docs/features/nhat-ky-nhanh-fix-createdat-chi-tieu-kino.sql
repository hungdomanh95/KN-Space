-- ĐÃ GỘP vào supabase/schema.sql (2026-07-09) — chỉ giữ làm lịch sử, KHÔNG chạy lại file này.
-- (Ghi chú: đây là script sửa DATA 1 lần cho 1 Space cụ thể, không phải DDL/schema —
-- không có gì để "gộp" về mặt cấu trúc bảng, nhưng vẫn đánh dấu để nhất quán quy ước.)

-- =============================================================================
-- FIX LẦN 2 (sau migrate ban đầu): sửa lại `createdAt` bị sai cho 9/14 Log
-- trong Shared Space "Chi tiêu gia đình Kino".
--
-- Bối cảnh: script migrate gốc
-- (docs/features/nhat-ky-nhanh-migrate-chi-tieu-kino.sql, ĐÃ CHẠY XONG, giữ
-- nguyên KHÔNG sửa lại — file này là bản vá riêng, chạy SAU) fallback
-- `createdAt = coalesce(t ->> 'createdAt', now()::text)` cho Task nào thiếu
-- field `createdAt` gốc. 9/14 Task cũ trong Space này được tạo trước khi app
-- có tracking `createdAt` (qua modal desktop), chỉ có field `date` chứ không
-- có `createdAt` — nên 9 Log tương ứng bị gắn nhầm timestamp "lúc script
-- migrate chạy" thay vì đúng ngày thật (01-02/07/2026) từng nằm ở field
-- `date` cũ của Task. Đã đối chiếu file backup JSON (export trước khi
-- migrate, do user cung cấp) để xác định chính xác 9 dòng cần sửa — match
-- bằng `content`, vì các Task này đều có `content` gốc rỗng nên `content`
-- của Log hiện tại = đúng `title` Task cũ, không bị nối thêm " — ...".
--
-- 5 Log còn lại của Space này ("Bánh mì sáng 25k", "Cf sáng 44k", "Cháo vịt
-- 80k", "Trà sữa 35k 3/7", "Cà phê sáng 20k") đã có `createdAt` đúng từ
-- trước — KHÔNG đụng tới, không nằm trong danh sách match bên dưới.
--
-- Giờ quy ước cho cả 9 dòng: 12:00 giờ Việt Nam (UTC+7) = 05:00:00 UTC, vì
-- Task gốc không có field `time` để suy ra giờ chính xác hơn.
--
-- ⚠️ CẢNH BÁO RỦI RO GHI ĐÈ (giống hệt cảnh báo ở script migrate gốc) — ĐỌC
-- TRƯỚC KHI CHẠY UPDATE:
-- Cơ chế lưu hiện tại (`src/storage/sharedSpaceStore.ts` + debounce 600ms
-- trong `AppStateContext.tsx`) gửi lên Supabase NGUYÊN CẢ MẢNG `logs` hiện
-- có trong bộ nhớ của từng thiết bị, không phải diff từng item. Nếu tại
-- thời điểm chạy script này có bất kỳ thành viên nào khác trong Space "Chi
-- tiêu gia đình Kino" đang mở app dở dang (kể cả chỉ đang xem, chưa thao
-- tác gì) và sau đó có 1 thay đổi bất kỳ trigger save diễn ra SAU khi script
-- UPDATE này chạy, thiết bị đó sẽ ghi đè `logs` bằng bản CŨ đang nằm trong
-- bộ nhớ của họ — vô hiệu hoá toàn bộ bản fix này. HÃY đảm bảo không có
-- thành viên nào khác đang mở app Space này trước khi chạy UPDATE bên dưới.
--
-- IDEMPOTENT: script AN TOÀN nếu lỡ chạy UPDATE 2 lần liên tiếp — mỗi lần
-- chạy đều SET `createdAt` về đúng cùng 1 giá trị cố định (không phải cộng
-- dồn/tính toán dựa trên giá trị cũ), nên chạy lại nhiều lần cho cùng kết
-- quả, không gây lỗi hay trùng lặp dữ liệu.
--
-- Chạy TRỰC TIẾP trong Supabase Dashboard > SQL Editor.
-- =============================================================================


-- =============================================================================
-- BƯỚC 1 — PREVIEW (chỉ SELECT, KHÔNG sửa dữ liệu). Chạy trước, soát kỹ:
-- kỳ vọng ĐÚNG 9 dòng, không thừa không thiếu, đúng 9 content liệt kê dưới.
-- =============================================================================
select
  elem ->> 'content' as content,
  elem ->> 'createdAt' as created_at_hien_tai
from public.kn_shared_spaces,
     jsonb_array_elements(logs) as elem
where name = 'Chi tiêu gia đình Kino'
  and elem ->> 'content' in (
    'Đặt pharmacity ck 135k',
    'Đi siêu thị ck 88k',
    'Matcha latte ck 39k',
    'Shopee Vip ck 29k',
    'Cf sáng ck 40k',
    'Cf chiều 41k',
    'Ăn trưa 56k',
    'Cf sáng 28k',
    'Ăn sáng bánh mì 45k'
  );

-- Kỳ vọng: đúng 9 dòng kết quả. Nếu khác 9, DỪNG LẠI — báo lại, không chạy
-- BƯỚC 2 (có thể tên Space không khớp chính xác, hoặc content bị trùng/lệch
-- so với bảng mapping).


-- =============================================================================
-- BƯỚC 2 — UPDATE thật: chỉ sửa `createdAt` của đúng 9 Log match theo
-- `content`, giữ nguyên mọi field khác của mọi Log (kể cả 5 Log không match).
-- Chỉ tác động ĐÚNG 1 hàng có name = 'Chi tiêu gia đình Kino'.
-- =============================================================================
update public.kn_shared_spaces
set logs = (
  select jsonb_agg(
    case elem ->> 'content'
      when 'Đặt pharmacity ck 135k' then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-02T05:00:00.000Z'::text))
      when 'Đi siêu thị ck 88k'      then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-01T05:00:00.000Z'::text))
      when 'Matcha latte ck 39k'     then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-01T05:00:00.000Z'::text))
      when 'Shopee Vip ck 29k'       then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-01T05:00:00.000Z'::text))
      when 'Cf sáng ck 40k'          then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-01T05:00:00.000Z'::text))
      when 'Cf chiều 41k'            then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-02T05:00:00.000Z'::text))
      when 'Ăn trưa 56k'             then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-02T05:00:00.000Z'::text))
      when 'Cf sáng 28k'             then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-02T05:00:00.000Z'::text))
      when 'Ăn sáng bánh mì 45k'     then jsonb_set(elem, '{createdAt}', to_jsonb('2026-07-02T05:00:00.000Z'::text))
      else elem
    end
    order by ordinality
  )
  from jsonb_array_elements(logs) with ordinality as t(elem, ordinality)
)
where name = 'Chi tiêu gia đình Kino';


-- =============================================================================
-- BƯỚC 3 — VERIFY: hiện lại `content` + `createdAt` MỚI của đúng 9 dòng vừa
-- sửa, đối chiếu với bảng mapping đã chốt.
-- =============================================================================
select
  elem ->> 'content' as content,
  elem ->> 'createdAt' as created_at_moi
from public.kn_shared_spaces,
     jsonb_array_elements(logs) as elem
where name = 'Chi tiêu gia đình Kino'
  and elem ->> 'content' in (
    'Đặt pharmacity ck 135k',
    'Đi siêu thị ck 88k',
    'Matcha latte ck 39k',
    'Shopee Vip ck 29k',
    'Cf sáng ck 40k',
    'Cf chiều 41k',
    'Ăn trưa 56k',
    'Cf sáng 28k',
    'Ăn sáng bánh mì 45k'
  );

-- Kỳ vọng — mỗi content khớp đúng created_at_moi tương ứng:
--   Đặt pharmacity ck 135k  -> 2026-07-02T05:00:00.000Z
--   Đi siêu thị ck 88k      -> 2026-07-01T05:00:00.000Z
--   Matcha latte ck 39k     -> 2026-07-01T05:00:00.000Z
--   Shopee Vip ck 29k       -> 2026-07-01T05:00:00.000Z
--   Cf sáng ck 40k          -> 2026-07-01T05:00:00.000Z
--   Cf chiều 41k            -> 2026-07-02T05:00:00.000Z
--   Ăn trưa 56k             -> 2026-07-02T05:00:00.000Z
--   Cf sáng 28k             -> 2026-07-02T05:00:00.000Z
--   Ăn sáng bánh mì 45k     -> 2026-07-02T05:00:00.000Z
