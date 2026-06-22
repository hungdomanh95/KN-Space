# Đề xuất tính năng: Pomodoro Timer + Focus Music

> Hồ sơ phân tích BA — KHÔNG phải quyết định cuối. Chờ chủ dự án chốt theo workflow demo-first.
> Bối cảnh: KN-Space đang ở **Phase 1 — Chrome Extension Manifest V3 + `chrome.storage` (sync chính + local fallback), desktop-only, KHÔNG backend/auth/hosting**, permission hiện tối thiểu chỉ `storage`. Tinh thần: gọn nhẹ, ít dependency, bundle nhỏ, ưu tiên đúng ý người dùng hơn đầy đủ tính năng. (Lưu ý: thân bài `requirements.md` đang mô tả pivot PWA+Supabase vòng 23-24, nhưng roadmap `docs/plan/` đã đảo Phase 1 về lại Extension — phân tích này bám theo Phase 1 Extension.)

## 1. Tóm tắt khuyến nghị
- **Pomodoro timer: PHÙ HỢP** với tầm nhìn "dashboard năng suất cá nhân". Là tính năng năng suất kinh điển, đúng đối tượng. Làm được trong tinh thần gọn nhẹ. → **Cân nhắc đưa vào Phase 1 (bản tối giản, in-page), HOẶC một Phase 1.5 nhỏ ngay sau khi 5 khối ổn định.**
- **Focus music: KHÔNG khuyến nghị cho Phase 1.** Đúng "tinh thần tập trung" nhưng **mâu thuẫn trực tiếp** với tiêu chí gọn nhẹ + F8 ("không tải từ internet") + permission tối thiểu, lại thêm **rủi ro bản quyền nhạc**. → **Hoãn** (xét lại ở phase web/PWA nếu thực sự cần).

Tóm gọn: **làm Pomodoro trước, hoãn Focus music.**

## 2. Mức độ phù hợp với tầm nhìn

### Pomodoro — phù hợp
- Tầm nhìn đã là "dashboard năng suất cá nhân", có sẵn khối "Việc cần làm" + "Thói quen". Pomodoro là mảnh ghép tự nhiên: tập trung làm task → đúng mạch sản phẩm, không phải hướng đi lạc.
- Gọn nhẹ: chỉ là logic đếm ngược + vài state, không kéo theo dependency nặng. Hợp tiêu chí mục 7.
- Rủi ro scope creep thấp **nếu giữ bản tối giản** (work/break/start/pause/reset + báo hết phiên). Creep xảy ra nếu thêm thống kê, biểu đồ focus, lịch sử phiên... → để dành phase sau.

### Focus music — phù hợp về ý tưởng, lệch về thực thi
- Về mặt "giúp tập trung" thì cùng họ với Pomodoro, đúng tinh thần.
- **NHƯNG vướng đúng những ràng buộc cốt lõi của Phase 1**: nguồn nhạc, bundle, permission, bản quyền (chi tiết mục 3). Đây là dấu hiệu **scope creep**: chi phí kỹ thuật + pháp lý lớn so với giá trị, và kéo sản phẩm ra khỏi định vị "công cụ năng suất gọn" sang "app nghe nhạc".
- Quan điểm thẳng thắn: chưa đáng làm ở Phase 1. Nếu muốn "âm thanh hỗ trợ tập trung" rẻ tiền, có thể làm **white-noise/ambient sinh bằng Web Audio API** (không cần file nhạc, không bản quyền) — xem mục 5 câu hỏi mở.

## 3. Phân rã functional

### 3.1 Pomodoro timer
- **Cấu hình**: thời lượng work (mặc định 25'), short break (5'), long break (15'), số phiên trước long break (mặc định 4). Cho chỉnh trong Settings hoặc ngay trên widget.
- **Điều khiển**: Start / Pause (resume) / Reset; tự chuyển work ↔ break khi hết phiên.
- **Hiển thị**: đồng hồ đếm ngược lớn + nhãn phiên hiện tại (Tập trung / Nghỉ) + bộ đếm chu kỳ (vd. "Phiên 2/4").
- **Báo hết phiên**: âm thanh ngắn (chuông) + thông báo (in-page banner; thông báo hệ thống là tuỳ chọn — xem ràng buộc).
- **Đếm chu kỳ**: đếm số phiên work đã hoàn thành trong ngày/loạt; reset theo ngày hoặc theo nút Reset.
- **Gắn với khối "Việc cần làm"? — ĐỀ XUẤT KHÔNG ở bản đầu.** Bản tối giản chạy độc lập. Việc "chọn 1 task để pomodoro" / "tự +1 pomodoro cho task" làm tăng độ phức tạp data + UI rõ rệt → để phase sau nếu người dùng thực sự cần. (Đây là điểm phân nhánh scope rõ nhất — cần chốt.)
- **Vị trí UI**: widget nhỏ trên header app, HOẶC 1 khối con. Vì 3 khối chính + 5 khối con đã chật và có cơ chế resize/đổi-thứ-tự phức tạp, **đề xuất widget header gọn** thay vì thêm khối thứ 6 (tránh đụng layout model 2 cấp + drag-drop hiện có).

### 3.2 Focus music
- **Nguồn nhạc** (vấn đề lớn nhất — xem mục 4): (a) bundle file mp3, (b) stream URL ngoài, (c) white-noise sinh bằng Web Audio (không file).
- **Điều khiển**: play / pause, volume, chọn track/loại âm.
- **Chạy nền khi chuyển tab?**: với extension MV3, audio phát trong **trang dashboard** chỉ sống khi tab đó còn mở. Muốn nhạc chạy tiếp khi rời tab dashboard cần hướng tiếp cận khác (offscreen document / tab riêng) — phức tạp hơn nhiều. Cần chốt kỳ vọng.

## 4. Ràng buộc & tác động kỹ thuật cho Phase 1 (MV3 + chrome.storage + desktop, không backend)

### 4.1 Pomodoro
- **Timer chạy khi đóng tab dashboard?** Đây là quyết định kiến trúc then chốt:
  - **Phương án A — timer chỉ chạy khi tab dashboard mở** (đếm bằng React hook/timer trong dashboard app): đơn giản nhất, **không cần thêm permission**, đúng tinh thần gọn nhẹ. Nhược: đóng tab là dừng. Với "dashboard cá nhân full-tab" thì thường tab vẫn mở khi làm việc → chấp nhận được. **Đề xuất chọn A cho bản đầu.** Lưu timestamp khi pause/đóng để tính lại khi quay lại (tránh lệch giờ do throttle background tab).
  - **Phương án B — timer chạy nền qua service worker + `chrome.alarms`**: cần thêm permission `alarms`; service worker MV3 **bị kill sau ~30s không hoạt động** nên KHÔNG dùng `setInterval` trong SW được — phải dựa `chrome.alarms` (độ phân giải tối thiểu ~1 phút, không đủ mượt cho đồng hồ giây-by-giây) → chỉ hợp để bắn thông báo "hết phiên", không hợp để hiển thị đếm ngược realtime. Tăng độ phức tạp đáng kể.
- **Âm báo hết phiên**: phát bằng `new Audio()` trong trang dashboard với 1 file âm ngắn đóng gói sẵn (vài KB) — **không cần permission**, không tải từ internet, hợp F8. Lưu ý: nếu phiên kết thúc lúc tab bị throttle, âm có thể trễ tới khi tab active lại (đánh đổi của phương án A).
- **Thông báo (notification)**:
  - In-page banner: **không cần permission**, đủ dùng nếu tab đang mở. **Đề xuất dùng cái này.**
  - Thông báo hệ thống (hiện cả khi ở tab khác): cần permission `notifications` → **mở rộng permission model** (đang chỉ `storage`). Có thể làm tuỳ chọn (opt-in) ở phase sau.
- **Lưu trữ**: cấu hình pomodoro + bộ đếm phiên trong ngày lưu `chrome.storage` (rất nhỏ, không lo quota). Settings pomodoro nên gắn **per-user/global** (không theo space), giống theme/layout.
- **Tổng tác động permission**: bản đề xuất (phương án A + in-page + audio đóng gói) = **0 permission mới**, giữ nguyên `["storage"]`. Đây là lý do chính khiến Pomodoro "rẻ" và đáng làm.

### 4.2 Focus music — nguồn nhạc là rào cản chính
- **(a) Bundle file mp3 trong extension**: phình bundle nghiêm trọng (mỗi track nhạc 3-5' ~3-5MB; vài track là chục MB) → **đụng thẳng tiêu chí gọn nhẹ**. Vẫn vướng **bản quyền** nếu không phải nhạc tự sản xuất / license rõ ràng. → loại.
- **(b) Stream URL ngoài** (YouTube/Spotify/CDN nhạc): cần **host permission** + truy cập mạng → **mâu thuẫn tinh thần F8 "không tải từ internet"** và làm extension "nặng tay" về quyền; phụ thuộc dịch vụ ngoài; **rủi ro bản quyền** + vi phạm ToS nền tảng nếu nhúng sai cách. → không phù hợp Phase 1.
- **(c) White-noise / ambient sinh bằng Web Audio API** (mưa, sóng, tiếng ồn trắng/nâu sinh bằng code): **không file, không mạng, không bản quyền**, bundle gần như không tăng. Đây là phương án **duy nhất** thực sự hợp tinh thần gọn nhẹ + F8 — nhưng KHÁC với "focus music" (giai điệu) mà chủ dự án có thể đang hình dung. → nếu chủ dự án OK với "âm nền tập trung" thay vì "nhạc", đây là hướng khả thi rẻ.
- **Chạy nền khi chuyển tab**: audio trong trang dashboard chỉ sống khi tab mở. "Nhạc nền chạy tiếp khi rời tab" cần offscreen document / tab giữ audio → thêm phức tạp + có thể cần permission `offscreen`. → kỳ vọng "nhạc chạy nền toàn hệ thống" KHÔNG nên hứa ở Phase 1.
- **Permission**: phương án (b) cần host permission + có thể network; (c) cần 0 permission mới. (a) 0 permission nhưng phình bundle + bản quyền.

## 5. Câu hỏi mở (cần chốt trước khi thiết kế/demo)
**Pomodoro**
1. Timer cần chạy tiếp **khi đóng/đổi tab dashboard** không? (Quyết định A vs B ở mục 4.1 — ảnh hưởng permission + độ phức tạp lớn nhất.)
2. Có cần **thông báo hệ thống** (hiện khi đang ở app khác) không? Nếu có → chấp nhận thêm permission `notifications`?
3. Pomodoro có **gắn với 1 task cụ thể** ở khối Việc cần làm không, hay chạy độc lập? (Ảnh hưởng data model + UI.)
4. Vị trí: **widget trên header** hay **khối riêng**? (Đề xuất widget để né layout model phức tạp.)
5. Có cần cho **chỉnh thời lượng** work/break, hay khoá cứng 25/5/15?

**Focus music**
6. Ý là **nhạc có giai điệu** hay chấp nhận **âm nền/white-noise sinh bằng code** (mưa/sóng/ồn trắng)? — quyết định feature có khả thi ở Phase 1 hay không.
7. Có cần nhạc **chạy nền khi rời tab dashboard** không? (Nếu có → gần như không khả thi gọn nhẹ ở Phase 1.)
8. Nguồn nhạc dự kiến từ đâu, đã có **license/bản quyền** chưa?

## 6. Khuyến nghị cuối
1. **Pomodoro: NÊN LÀM**, theo bản tối giản: phương án A (timer in-page) + âm báo file ngắn đóng gói sẵn + thông báo in-page + đếm chu kỳ + đặt làm **widget header**, **chạy độc lập** (chưa gắn task). → **0 permission mới**, hợp gọn nhẹ. Có thể làm ngay trong Phase 1 (sau khi 5 khối + đa space chạy ổn) hoặc tách Phase 1.5 nhỏ.
2. **Focus music: HOÃN.** Không đưa vào Phase 1. Lý do: nguồn nhạc đụng gọn nhẹ + F8 + permission + bản quyền; lợi ích không tương xứng chi phí. Nếu chủ dự án vẫn muốn yếu tố âm thanh tập trung, đề xuất thay bằng **white-noise/ambient sinh bằng Web Audio (phương án c)** — rẻ, không bản quyền — và làm như phần mở rộng của widget Pomodoro, KHÔNG phải module nghe nhạc riêng.
3. Giữ nguyên nguyên tắc roadmap: mỗi tính năng mới phải **giữ cửa, không over-build**. Ưu tiên ship Pomodoro tối giản, đo phản hồi thực tế rồi mới quyết định có nâng cấp (gắn task, thống kê, thông báo hệ thống) hay không.

> Tài liệu này chỉ là đề xuất. Không sửa `requirements.md` / `mockup/index.html`. Chờ chủ dự án duyệt rồi mới demo → update requirements → dev.
