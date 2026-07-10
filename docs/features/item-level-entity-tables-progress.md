# Tách bảng item-level — file tiến độ

> Nguồn sự thật: `docs/features/item-level-entity-tables.md` (phân tích + thiết kế đã qua `dev` review đầy đủ, 2026-07-10). File này theo dõi tiến độ triển khai — làm cuốn chiếu đúng 1 phần/lượt, KHÔNG tự nhảy phần khi chưa được yêu cầu.
>
> **Tạm dừng theo yêu cầu chủ dự án (2026-07-10) — CHƯA CODE GÌ.** Toàn bộ nội dung dưới đây là checkpoint để phiên làm việc sau (có thể là ngày mai) đọc lại và tiếp tục đúng chỗ, không phải dò lại từ đầu.
>
> **Cập nhật cùng ngày (2026-07-10, muộn hơn) — quyết định #1 (schema) và #7 (A1) dưới đây đang được xem
> xét lại phần "version-check".** Xem `docs/features/conflict-handling-simplification.md` — đề xuất bỏ
> version-check + retry (cả ở Space-level hiện tại lẫn item-level sắp tới), thay A1 bằng banner lỗi network
> chung. **CHƯA chốt**, cần đọc kỹ trước khi bắt đầu Bước 1 (entity Log).

**Trạng thái tổng quan:** ⬜ CHƯA BẮT ĐẦU CODE. Đã xong: phân tích (`ba`) + review kỹ thuật (`dev`) + chốt các quyết định kiến trúc chính. Đang treo: xác nhận thời điểm bắt đầu.

---

## Quyết định đã chốt (2026-07-10)

1. **Schema: Phương án B — 9 bảng tách riêng theo loại Space** (`kn_private_tasks`/`kn_shared_tasks`, `kn_private_notes`/`kn_shared_notes`, `kn_private_habits` (không có bản shared), `kn_private_reminders`/`kn_shared_reminders`, `kn_private_logs`/`kn_shared_logs`) — mirror đúng pattern `kn_private_spaces`/`kn_shared_spaces` đã có. **Đảo ngược khuyến nghị ban đầu của `ba`** (5 bảng dùng chung polymorphic FK) sau khi `dev` phản biện bằng số liệu cụ thể (xem `item-level-entity-tables.md` mục 10, câu hỏi #1).
2. **Tầng storage: action-level persist** (không phải diff-mảng) — mỗi action CRUD (21 action type, đã đếm chính xác qua `SPACE_DOMAIN_ACTION_TYPES` trong `appReducer.ts`) tính sẵn descriptor khi dispatch, đẩy vào hàng đợi debounce theo `itemId`. Tách riêng module `state/itemPersist.ts` (không nhồi vào `smartDispatch` đang có sẵn trong `AppStateContext.tsx`).
3. **`order` (Task/Note): fractional-index** — số thực, chỉ 1 dòng đổi khi kéo-thả, thay vì reindex toàn mảng. `dev` xác nhận không có chỗ nào khác trong code giả định `order` là số nguyên liên tục.
4. **`assignee_ids`: giữ `jsonb`** (không đổi sang `uuid[]`).
5. **`createdAt` (Reminder/Log): bỏ field riêng, dùng thẳng cột DB `created_at`** — nhưng migration/import PHẢI set tường minh giá trị cũ, không để DB tự `now()`.
6. **Thứ tự migrate 5 entity: độ đơn giản tăng dần — Log → Habit → Reminder → Task → Note**, có thêm 1 bước con "viết + unit-test fractional-index độc lập" trước khi đụng Task (theo tinh chỉnh của `dev`).
7. **A1 (banner cảnh báo hết-retry, `storage-architecture-fix.md` mục 6): làm ngay, độc lập, không chờ việc lớn này** — cả `ba` lẫn `dev` đồng ý, đã phân tích kỹ thuật xong hoàn toàn từ trước.

## Phát hiện mới cần xử lý trước (không thuộc entity nào)

**Bug tiềm ẩn: 3 chỗ sort theo `createdAt` bằng `localeCompare` (so chuỗi) thay vì `Date`** — `src/features/logs/LogsBlock.tsx:48`, `src/features/logs/ExpenseSummaryPanel.tsx:163`, `src/layout/MobileChatScreen.tsx:34` (chỗ này quan trọng nhất — màn hình chính mobile). Định dạng timestamp cũ (`Z`) trộn với định dạng Postgres trả về (`+00:00`) trong lúc migrate sẽ làm sai thứ tự hiển thị. **Phải sửa cả 3 chỗ (đổi sang `new Date(x).getTime()`) TRƯỚC khi bắt đầu Bước 1 của entity đầu tiên.**

---

## Việc tiếp theo — 3 việc độc lập, chưa cái nào bắt đầu

### 1. ⬜ A1 — Banner cảnh báo khi hết lượt retry
Đã phân tích đầy đủ, acceptance criteria có sẵn ở `storage-architecture-fix.md` mục 6.4/6.6. Sẵn sàng giao `dev` code ngay, không phụ thuộc gì ở trên.

### 2. ⬜ Sửa 3 chỗ `localeCompare` timestamp
Đã xác định chính xác 3 vị trí (xem trên). Sẵn sàng giao `dev` code ngay, độc lập với A1 và với việc tách bảng.

### 3. ⬜ Bắt đầu Bước 1 của entity đầu tiên (Log → bảng `kn_private_logs`/`kn_shared_logs`)
Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7 (bảng mới → RLS 2 nhánh tách biệt → action-level persist cho Log → migration script test User B → migration thật User A).

## ❓ Câu hỏi cần xác nhận khi resume phiên làm việc

**Có muốn bắt đầu việc #3 (tách bảng Log) trong CÙNG lượt với việc #1 + #2, hay làm #1 + #2 trước, để việc #3 (đụng dữ liệu thật, quy mô lớn hơn nhiều) cho 1 lượt riêng sau khi đã thấy #1/#2 chạy ổn?** — chủ dự án dừng lại đúng ở câu hỏi này (2026-07-10), chưa trả lời. Hỏi lại đầu tiên khi resume.

---

## Nguyên tắc bắt buộc khi triển khai (nhắc lại từ tài liệu chính + `dev.md`)

- Đúng 1 phần/lượt, `npx tsc --noEmit` + `npm run build` pass, cập nhật file tiến độ này ngay, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Việc #3 (tách bảng) đụng dữ liệu thật — không đụng tài khoản chính chủ (User A) cho tới khi đã test sạch bằng tài khoản Google phụ (User B), đúng quy trình đã áp dụng thành công ở `storage-architecture-fix-progress.md`.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, RLS, migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật.
- Câu hỏi mở/quyết định phát sinh giữa chừng → ghi vào đây kèm ngày, không tự quyết âm thầm.
