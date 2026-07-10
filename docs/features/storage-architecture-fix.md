# Sửa kiến trúc lưu trữ — chống ghi đè mất dữ liệu

> Quyết định đã chốt qua điều tra + trao đổi trực tiếp với chủ dự án (2026-07-09), sau sự cố mất layout mọi Space cá nhân + 1 số task thật. Tài liệu này là nguồn sự thật cho `dev` triển khai — đọc trước khi code, không suy đoán lại root cause.

---

## 1. Sự cố + Root cause (đã điều tra trong code thật, không suy đoán)

**Triệu chứng:** layout của TẤT CẢ Space cá nhân bị reset về mặc định, một số task bị mất — xảy ra ngay sau phiên test tính năng "Quản lý chi tiêu" trên `localhost`, nhưng ảnh hưởng cả production.

**Root cause (3 yếu tố cộng lại):**
1. **`localhost` và production dùng CHUNG 1 project Supabase** — `.env.local` trỏ thẳng project thật (`oopkpyltisngovrystub.supabase.co`), không có DB dev riêng.
2. **Lưu trữ kiểu "ghi đè toàn bộ"** — bảng `kn_space_state` lưu TOÀN BỘ Space cá nhân + `settings` của 1 user trong **1 hàng duy nhất**. `flushSave()` (`src/storage/supabaseStore.ts`) là `upsert` nguyên khối `spaces` + `settings` đang có trong RAM trình duyệt, mỗi khi có **bất kỳ** thay đổi nào (`src/state/AppStateContext.tsx` dòng 121-126) — không phân biệt "vừa đổi đúng chỗ nào".
3. **Không có kiểm tra xung đột (optimistic concurrency)** cho dữ liệu cá nhân — khác hẳn Shared Space đã có `version` (xem mục 3).

**Cơ chế cụ thể:** 1 tab/phiên mở app từ lâu, giữ 1 "bản chụp" dữ liệu trong RAM tại thời điểm nó tải. Nếu dữ liệu trên server đổi sau đó (do phiên khác lưu) mà tab này không tải lại, rồi tab này thực hiện bất kỳ thao tác nào (dù nhỏ) → 600ms sau tự lưu **đè toàn bộ** server bằng bản cũ đang giữ — xoá mất mọi thay đổi mới hơn, kể cả ở Space/field nó chưa từng đụng tới.

**Đã loại trừ nguyên nhân khác:** không phải do tính năng "Quản lý chi tiêu" vừa code (đã audit kỹ, action mới `LOG_PATCH_EXPENSE` chỉ patch đúng field liên quan). Không phải do Realtime (đã xác nhận Realtime không còn code nào subscribe, xem mục 2).

**Không khôi phục được dữ liệu đã mất** — dự án không có Supabase backup/PITR.

---

## 2. Audit thêm — 2 vấn đề "lung tung" khác phát hiện được (không phải root cause, nhưng cần dọn)

1. **Realtime publication vẫn bật ở schema dù không còn code nào dùng.** `supabase/schema.sql` + `docs/features/shared-space-schema.sql` có `alter publication supabase_realtime add table ...` cho cả 3 bảng (`kn_space_state`, `kn_shared_spaces`, `kn_space_members`), kèm comment mô tả "subscribe channel để nhận real-time" — nhưng grep toàn bộ `src/` xác nhận **không có dòng code nào** subscribe Realtime nữa (đã gỡ từ commit `aa00fae`, 2026-07-01, sau khi gây 5 bug mất dữ liệu). Cấu hình + tài liệu chết, gây hiểu nhầm.
2. **Schema production không nằm ở 1 nơi** — phải đọc đúng thứ tự 8 file SQL rải rác (`supabase/schema.sql`, `shared-space-schema.sql`, `shared-space-rls-fix.sql`, `shared-space-accept-invite-fix.sql`, `nhat-ky-nhanh-schema.sql`, `fix-shared-space-enabled-blocks.sql`, `nhat-ky-nhanh-fix-createdat-chi-tieu-kino.sql`, `nhat-ky-nhanh-migrate-chi-tieu-kino.sql`) mới ra bức tranh thật.

---

## 3. Quyết định kiến trúc — KHÔNG dùng Realtime, dùng version-check

Đã cân nhắc khôi phục Supabase Realtime để giảm độ trễ đồng bộ giữa các tab/thiết bị. **Quyết định: KHÔNG làm.**

**Lý do:**
- Realtime chỉ **giảm xác suất** xảy ra (thu hẹp cửa sổ dữ liệu cũ từ hàng giờ xuống mili-giây khi tab đang active) — **không loại bỏ được** cơ chế gây lỗi (tab chạy nền bị trình duyệt throttle, mất kết nối mạng, máy sleep/wake vẫn có thể khiến tab "lỡ nhịp" cập nhật).
- Đã có tiền lệ thất bại ngay trong dự án: Realtime từng cần cả 1 cỗ máy trạng thái phức tạp (`normalizeRealtimeRow`, `hasPendingSave`, `stableStringify`, `skipInitialSaveRef`, `isFlushInProgress` — đã xoá ở `aa00fae`) mà vẫn gây 5 bug mất dữ liệu.
- Version-check là server làm trọng tài cuối cùng — an toàn không phụ thuộc độ tin cậy mạng/trình duyệt, đúng tinh thần gọn nhẹ của dự án, và **tái dùng nguyên pattern đã chứng minh chạy ổn** ở Shared Space (`kn_shared_spaces`, cột `version` + trigger `kn_shared_spaces_before_update` tự tăng version mỗi lần UPDATE, client gửi kèm `WHERE version = expected` — 0 row affected = conflict).

---

## 4. Kế hoạch triển khai — 2 phần, tách rủi ro

### Phần A — Dọn dẹp, rủi ro thấp, KHÔNG đụng dữ liệu (làm trước, gọn trong 1 lượt)

**✅ ĐÃ HOÀN THÀNH TOÀN BỘ (2026-07-09)** — cả phần file trong repo lẫn hạ tầng thật. Chủ dự án đã tự chạy 3 câu lệnh `ALTER PUBLICATION ... DROP TABLE` trên Supabase Dashboard (production) — xác nhận xong.

1. Gỡ `alter publication supabase_realtime add table` cho cả 3 bảng — cả trong file SQL VÀ trên Supabase Dashboard thật.
   - Đã xoá khỏi `supabase/schema.sql` và `docs/features/shared-space-schema.sql` (file trong repo).
   - **Đã chạy trên Supabase Dashboard thật (2026-07-09, chủ dự án tự chạy):**
     ```sql
     alter publication supabase_realtime drop table public.kn_space_state;
     alter publication supabase_realtime drop table public.kn_shared_spaces;
     alter publication supabase_realtime drop table public.kn_space_members;
     ```
2. Gộp 8 file SQL rải rác thành **1 `supabase/schema.sql` duy nhất**, phản ánh đúng schema hiện tại (kể cả 2 bảng Push Notification, `kn_shared_spaces`/`kn_space_members`/`kn_space_invites`, function `accept_invite`/`create_shared_space`). Các file cũ trong `docs/features/` giữ lại nhưng thêm dòng đầu file đánh dấu rõ **"ĐÃ GỘP vào `supabase/schema.sql` — chỉ giữ làm lịch sử, không chạy lại"**. Đã làm cho cả 7 file: `shared-space-schema.sql`, `shared-space-rls-fix.sql`, `shared-space-accept-invite-fix.sql`, `nhat-ky-nhanh-schema.sql`, `fix-shared-space-enabled-blocks.sql`, `nhat-ky-nhanh-fix-createdat-chi-tieu-kino.sql`, `nhat-ky-nhanh-migrate-chi-tieu-kino.sql`.

### Phần B — Sửa gốc kiến trúc Space cá nhân, rủi ro cao hơn, LÀM CUỐN CHIẾU CÓ FILE TIẾN ĐỘ (theo đúng `dev.md`)

> **Cập nhật 2026-07-09 — bỏ ý định tách project Supabase dev riêng.** Đã cân nhắc lại: chi phí thiết lập (tạo project, cấu hình lại OAuth redirect) không tương xứng với rủi ro thực sự cần chặn. Thay bằng: **test bằng 1 tài khoản Google phụ (User B) trên chính project production** — vì `kn_space_state` khoá theo `user_id` (PK) + RLS `auth.uid() = user_id`, thao tác của User B về mặt cấu trúc KHÔNG THỂ chạm được hàng dữ liệu của chủ dự án (User A), kể cả nếu lỡ tái hiện đúng lỗi ghi đè cũ. Khoảng hở duy nhất cách này không che được là **thay đổi cấu trúc bảng (DDL)** — vì bảng/trigger dùng chung cho cả DB, không phân biệt user. Xử lý: bước 2 (tạo bảng mới) là thuần thêm mới, không đụng bảng cũ nên an toàn làm thẳng; bước 5 (script migrate, đọc trực tiếp từ hàng thật) bắt buộc phải chạy thử cho User B trước, xác nhận đúng, mới chạy cho hàng thật của User A.

Tạo `docs/features/storage-architecture-fix-progress.md` theo mẫu chuẩn, chia nhỏ tối thiểu các phần sau (dev có thể chia nhỏ hơn nếu thấy hợp lý, nhưng KHÔNG gộp lại thành ít phần hơn):

1. **Bảng mới cho Space cá nhân** — mỗi Space cá nhân 1 hàng (bảng mới, đặt tên do `dev` quyết, gợi ý `kn_private_spaces`), cột `version` + trigger tự tăng **copy chính xác** `kn_shared_spaces_before_update`. RLS `auth.uid() = user_id`. Thuần thêm bảng mới, không đụng bảng cũ — an toàn chạy thẳng trên production (chủ dự án tự chạy SQL, giống cách đã làm ở Phần A).
2. **Tách `settings` khỏi vòng lưu chung với `spaces`** — lưu/đọc độc lập, chỉ ghi khi chính `settings` đổi (không kéo theo mỗi lần 1 Space đổi).
3. **Viết lại tầng `storage/`** (`supabaseStore.ts`, `AppStateContext.tsx`) — đọc/ghi theo hàng riêng từng Space cá nhân + version-check, mirror cách `sharedSpaceStore.ts` đã làm. Test bằng tài khoản Google phụ (User B) — không đụng dữ liệu User A. **Cân nhắc và đề xuất rõ với `ba`/chủ dự án** (không tự quyết âm thầm): có nên dùng CHUNG hẳn 1 cơ chế cho Space cá nhân và Shared Space luôn không (về bản chất Space cá nhân = Shared Space có đúng 1 thành viên) — nếu thấy hợp lý, nêu rõ đánh đổi trước khi làm.
4. **Migration data** — script chuyển dữ liệu từ `kn_space_state.spaces[]` (mảng cũ) sang các hàng mới. **Bắt buộc chạy thử cho User B trước** (tự tạo vài Space/Task/Layout giả lập giống cấu trúc thật cho User B, chạy script chỉ scope đúng `user_id` của User B, tự kiểm tra kết quả đúng) — xác nhận sạch mới được chạy cho User A (dữ liệu thật).
5. **Áp dụng migration cho dữ liệu thật (User A)** — CHỈ sau khi bước 4 đã chạy sạch cho User B và được xác nhận. Trước khi chạy: hướng dẫn chủ dự án tự Export JSON toàn bộ Space (tính năng Export sẵn có trong app) làm lưới an toàn thủ công tối thiểu (vì không có DB backup thật). Giám sát chặt trong lúc chạy migration thật cho User A.

**Nguyên tắc bắt buộc khi làm Phần B (nhắc lại từ `dev.md`):**
- Đúng 1 phần/lượt, build/tsc pass, cập nhật file tiến độ, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Không đụng dữ liệu thật của User A cho tới bước 5, và bước 5 phải có xác nhận rõ ràng từ chủ dự án trước khi chạy.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, trigger, chạy migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật, đưa lại cho chủ dự án tự chạy hoặc xác nhận rõ ràng trước, giống quy trình đã áp dụng ở Phần A.
- Câu hỏi mở/quyết định kiến trúc phát sinh giữa chừng → ghi vào file tiến độ + hỏi lại, không tự quyết.

---

## 5. Ngoài phạm vi (không làm đợt này)

- Khôi phục Supabase Realtime (đã quyết định không làm, xem mục 3).
- Tách toàn bộ Task/Note/Habit/Reminder/Log ra bảng riêng theo từng entity (mức độ granularity cao hơn per-Space) — cân nhắc sau nếu per-Space vẫn chưa đủ trong thực tế dùng, không làm ngay vì chi phí/rủi ro migration lớn hơn nhiều so với lợi ích hiện tại.
