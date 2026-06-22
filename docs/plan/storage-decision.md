# Quyết định storage — Phase 1 (ghi nhận tư vấn)

> Câu hỏi: Phase 1 nên dùng `chrome.storage`, kết hợp Supabase ngay, hay lưu Google Sheet?
> Kết luận: **giữ `chrome.storage` (sync + local fallback) cho Phase 1. KHÔNG đưa Supabase vào sớm, KHÔNG dùng Google Sheet ở bất kỳ giai đoạn nào.**

## So sánh nhanh

| Tiêu chí | `chrome.storage` | Supabase | Google Sheet |
|---|---|---|---|
| Cần auth | Không (đi theo Chrome account có sẵn) | Có (OAuth) — thêm 1 lớp phức tạp | Có (OAuth Google) + scope Sheets API |
| Độ phức tạp triển khai | Thấp-trung — storage TypeScript trong React app, không backend | Trung-cao — schema, RLS, client SDK, auth, offline queue | Trung — REST/Sheets API, quota, mapping JSON↔hàng/cột |
| Phụ thuộc mạng | Không — hoạt động 100% offline, đồng bộ nền khi có mạng | Có — mọi write cần roundtrip network (trừ khi tự build offline-first/IndexedDB queue) | Có — mọi write là 1 HTTP call tới Sheets API, không có offline-first, dễ bị mất action khi mất mạng |
| Giới hạn | 8KB/item, 100KB tổng (sync), 512 item — đã có chiến lược tách key + local fallback | Free tier ~500MB DB — dư, nhưng phải tự lo schema/RLS đúng | **Không phải DB**: không transaction, không index thật, rate limit thấp (Google Sheets API ~60-300 requests/phút/user), dễ vỡ khi ghi đồng thời |
| Bảo mật | Dữ liệu nằm trong Chrome account của chính chủ — không lộ ra ngoài, không cần lo RLS/leak giữa user khác | Cần tự thiết kế & TEST RLS đúng (rủi ro rò rỉ nếu sai — đã ghi nhận trong requirements là "rủi ro lớn nhất") | API key/OAuth token phải lưu phía client, rủi ro lộ token; Sheet vốn không thiết kế để chứa structured app data có kiểm soát quyền |
| Đồng bộ đa máy | Có — qua chính Chrome account, miễn phí, không cần code thêm gì ngoài `storage.sync` | Có — realtime, mạnh hơn nhưng cần build thêm (offline queue, conflict resolution) | Có nhưng chậm/giật — không có realtime, phải poll, dễ conflict khi 2 nơi cùng sửa 1 hàng |
| Đồng bộ đa nền tảng (mobile) | **Không** — extension không chạy Chrome mobile (đây là lý do Phase 2 PWA tồn tại) | Có — đúng mục tiêu Phase 2 | Có (Sheets có app mobile) nhưng UX rất tệ cho structured CRUD UI |
| Chi phí | 0đ | 0đ ở free tier (vẫn dư cho 1-2 người), tăng dần nếu scale | 0đ nhưng có rate limit/quota Google chi phối |
| Tốc độ phản hồi UI | Tức thời (local-first thật) | Cần optimistic update tự build mới tức thời, nếu không sẽ giật/chờ network | Chậm nhất — round-trip API mỗi action, UX note nhanh sẽ rất khó chịu |
| Giữ cửa Phase 2/3 | Tốt — export/import JSON đã có sẵn trong scope Phase 1 → là đường migrate thẳng lên Supabase khi cần | Là chính bản thân Phase 2 — đưa sớm = làm Phase 2 trước khi Phase 1 xong | Không giữ cửa gì cả — nếu dùng Sheet rồi sau chuyển Supabase vẫn phải viết lại toàn bộ tầng data + migrate, không tiết kiệm được gì |

## Rủi ro / đánh đổi nổi bật

**`chrome.storage` (giữ nguyên):**
- Quota nhỏ (8KB/item) → đã có giải pháp (tách key theo space/settings) trong plan, không phải rủi ro mới.
- Không chạy mobile → đã biết, đó chính xác là lý do tồn tại Phase 2, không phải lỗ hổng cần vá ngay bây giờ.
- Đồng bộ phụ thuộc Chrome account, không kiểm soát được tốc độ sync của Google (đôi khi delay vài giây-phút) — chấp nhận được cho use case cá nhân.

**Supabase đưa sớm vào Phase 1 (rủi ro nếu chọn nhầm hướng này):**
- Phase 1 hiện đã dùng React + TypeScript + Vite, nhưng **Supabase vẫn kéo thêm auth (Google OAuth), RLS, schema cloud, network failure handling và offline-first/IndexedDB queue** — tức là làm phần dữ liệu/cloud của Phase 2 lồng vào Phase 1, phá vỡ nguyên tắc "mỗi phase ship được độc lập, không over-build" đã chốt trong `plan/README.md`.
- Mockup hiện tại vẫn chỉ là prototype UX; đưa Supabase ngay sẽ làm trọng tâm lệch khỏi mục tiêu ship extension cá nhân dùng được trước.
- Thêm tầng auth + network cho 1 sản phẩm cá nhân/desktop là **phức tạp hoá không cần thiết** ở quy mô 1-2 người — đúng kiểu over-engineering sớm.
- Nếu chưa thiết kế RLS đúng ngay từ đầu (mà việc này cần thời gian/test kỹ theo đúng cảnh báo trong requirements), rủi ro lộ dữ liệu là có thật.

**Google Sheet (nên loại hẳn):**
- Sheet không phải database: không transaction, không quan hệ thật, không index — mọi logic "móc nối" (Thông báo tham chiếu Task/Reminder/Habit, masonry order, settings theo user...) sẽ phải tự mô phỏng bằng cách đọc/viết toàn bộ hàng, cực kỳ dễ vỡ và chậm.
- Rate limit Google Sheets API thấp hơn nhiều so với nhu cầu 1 app CRUD UI thao tác liên tục (mỗi tick checkbox/mỗi keystroke note đều có thể bắn 1 request).
- Không có cách nào làm offline-first tốt với Sheet — trải nghiệm "note nhanh" (động lực chính của roadmap) sẽ tệ hơn `chrome.storage` rất nhiều.
- Không giữ cửa gì cho Phase 2/3 — đây là lựa chọn "đường tắt" nhưng cụt, không tái sử dụng được khi lên Supabase thật.

## Khuyến nghị

**Giữ nguyên `chrome.storage` (sync + local fallback) cho Phase 1. Không đưa Supabase vào sớm. Loại bỏ hoàn toàn phương án Google Sheet — đây là lựa chọn sai cho mọi giai đoạn của KN-Space, không riêng Phase 1.**

Lý do cốt lõi:
1. Đúng bản chất Phase 1: dùng cá nhân, desktop, 1-2 người, ưu tiên gọn nhẹ — `chrome.storage` đáp ứng đủ và đơn giản nhất.
2. Roadmap đã thiết kế đúng: nhu cầu thật cần Supabase (mobile + cloud sync thật) là lý do tồn tại của Phase 2 — không phải lý do để gộp ngay vào Phase 1. Kéo Supabase lên sớm = làm Phase 2 lồng Phase 1, phá nguyên tắc "mỗi phase ship độc lập, không over-build" đã tự chốt.
3. Cửa đã được giữ đúng cách: Export/Import JSON (F13) trong Phase 1 chính là đường migrate dữ liệu thẳng sang Supabase ở Phase 2 (đã ghi rõ trong `phase-2-pwa-supabase.md`: "Migrate dữ liệu người dùng từ `chrome.storage` → Supabase (export JSON từ Phase 1 import lên)"). Không cần làm gì thêm ở Phase 1 để "giữ cửa" — nó đã được giữ.
4. Không cần điều chỉnh roadmap. Roadmap hiện tại (4 phase, Phase 1 = Extension/chrome.storage, Phase 2 = PWA/Supabase khi thật sự cần mobile) là hướng đúng, nên giữ nguyên thứ tự và ranh giới.

Khi nào nên xét lại: nếu trong quá trình dùng Phase 1 thực tế phát sinh nhu cầu rõ ràng (vd. cần note trên điện thoại gấp, hoặc 8KB/item thực sự cản trở dùng hàng ngày dù đã tách key) — đó là tín hiệu để mở khoá Phase 2, không phải lý do để vá Supabase nửa vời vào Phase 1.
