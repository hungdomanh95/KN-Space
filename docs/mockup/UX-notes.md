# UX Notes — extensionNote mockup (vòng 11 — đã thử rồi bỏ phong cách Duolingo)

## -3. Thay đổi vòng 11 (mới nhất) — quyết định cuối: KHÔNG dùng Duolingo
- Quá trình: thử style Duolingo (màu bão hoà, viền dày, đổ bóng đáy) cho toàn bộ UI → thu hẹp chỉ áp dụng cho khối Thói quen → người dùng phản hồi "không hợp" → **bỏ hẳn, quay lại đúng UI của vòng 10**.
- Toàn bộ file `index.html` hiện tại (style + JS render) đã rollback hoàn toàn về trạng thái vòng 10: `:root` dùng `--accent:#5b6cff`, `--note-color:#8b5cf6`, `--habit-color:#ff8a3d`, `--reminder-color:#ff5d7a`, `--shadow` mềm; checkbox dùng chung class `.check`; `.week-box`/`.streak-pill` viền mỏng 1px, không đổ bóng đáy.
- Không có khác biệt hành vi/tính năng — đây thuần là quyết định về ngôn ngữ thiết kế, đã chốt: **giữ phong cách trung tính/mềm mại hiện tại, không áp dụng Duolingo ở bất kỳ phần nào của UI**.

## -3b. Đổi hẳn cách thể hiện 7 ngày — dãy chấm tròn thay lưới ô vuông
- Lưới ô-vuông + nhãn ngày (`.week-wrap > .week-col > .week-box + .day-label`) vẫn bị kéo giãn dù đã vá bằng `flex:0 0 auto`/`min-width`/`max-width` — người dùng yêu cầu đổi cách thể hiện khác hẳn.
- **Thay bằng `.week-track` chứa 7 `.week-dot`** — chấm tròn nhỏ 13px nằm thẳng hàng trên 1 dòng duy nhất (`display:flex; gap:7px`), không còn cấu trúc cột riêng từng ngày nên không có chiều nào bị flex/grid phân bổ khoảng trống sai cách:
  - Chấm tô màu cam (`--habit-color`) = ngày đã hoàn thành, chấm viền xám nhạt = chưa.
  - Chấm của hôm nay có `box-shadow` vòng ngoài nhẹ để dễ định vị (thay viền `outline` trước đây).
  - Tên ngày (T2–CN) + trạng thái hiển thị qua thuộc tính `title` (tooltip khi hover) — bỏ hẳn label text cố định dưới mỗi ô, giảm chiều cao và độ phức tạp layout.
- Đây là thay đổi cách trình bày, không đổi dữ liệu/hành vi: `computeStreak()` và model `habits[].week` giữ nguyên.

## -3c. Bỏ dòng nhãn/grip phía trên mỗi khối chính (F21 cập nhật)
- Dòng label in hoa kèm icon grip (`.main-head`) phía trên mỗi khối chính (vd. "VIỆC CẦN LÀM · THÓI QUEN", "GHI CHÚ", "THÔNG BÁO") đã **bỏ hoàn toàn** — người dùng thấy mất cân đối, đặc biệt khối tổng hợp có label ghép 2 tên khác hẳn 2 khối còn lại (label trùng với title bên dưới).
- Handle kéo-thả để đổi thứ tự (F21) chuyển sang chính `.block-head` của từng khối — `draggable="true"` đặt trực tiếp trên `.main-block` (`#block-combined`/`#block-notes`/`#block-reminders`), và `setupReorder()` lắng nghe `dragstart` trên cả block thay vì 1 handle riêng. Cursor `grab`/`grabbing` áp dụng cho `.block-head` để gợi ý vùng có thể kéo.
- Đã xoá CSS `.main-head` không dùng và các lệnh JS gán nội dung cho id `ic-combined-head`/`ic-notes-head`/`ic-reminders-head` (không còn tồn tại trong HTML).

## -3d. Đồng bộ gợi ý kéo-thả bằng icon grip nhỏ trong header (không thêm dòng riêng)
- Cân nhắc 2 hướng: (a) thêm lại dòng nhãn riêng cho cả 3 khối — vẫn lệch vì khối tổng hợp có 2 tên ghép dài hơn 2 khối kia; (b) bỏ hẳn gợi ý — khó phát hiện thao tác kéo-thả (F21). Chọn phương án trung gian: **gắn icon grip nhỏ, mờ (`.grip-handle`, opacity .45) ngay trong `<h2>` của từng header có sẵn** (Việc cần làm, Thói quen, Ghi chú, Thông báo) — không thêm dòng/row mới nên không có vấn đề lệch độ dài, đồng thời cả 4 header đều nhất quán 100% về cấu trúc (`grip + block-icon + tên`).
- Style: `.grip-handle { color: var(--text-dim); opacity:.45; }`, icon 13px — đủ tinh tế để không cướp chú ý khỏi tiêu đề, nhưng đủ rõ để gợi ý "có thể kéo".

## -3e. Ẩn / mở lại khối (F24 — mới)
- Mỗi khối con (Việc cần làm, Thói quen, Ghi chú, Thông báo) có icon con mắt (`eye`/`eyeOff`) ở cuối header — bấm để toggle ẩn/hiện qua `toggleCollapse(key)`.
- Cơ chế thu nhỏ: thêm class `.collapsed` lên đúng phần tử khối đó (`sub-tasks`/`sub-habits`/`block-notes`/`block-reminders`). CSS `!important` ép `flex-basis` về một dải nhỏ cố định (46px cho khối con dọc trong khối tổng hợp, 56px cho khối chính Ghi chú/Thông báo theo chiều ngang), đồng thời ẩn `.block-body` và các nút phụ (`.collapsible-hide` trên filter-tabs/nút "+Thêm").
- **Các khối còn lại tự giãn lấp khoảng trống** — không cần JS tính lại tỉ lệ: vì các khối khác vẫn giữ `flex-grow` theo tỉ lệ đã đặt ở Settings (F20), khi 1 khối bị ép `flex: 0 0 56px`, trình duyệt tự phân bổ phần không gian dư cho các khối còn lại theo đúng tỉ lệ flex-grow giữa chúng — đây là hành vi flexbox tiêu chuẩn, không cần thêm logic.
- Khối Ghi chú/Thông báo khi ẩn đổi `.block-head` sang `flex-direction: column` và ẩn `.title-text` (chữ tên khối) — vì không gian ngang chỉ còn ~56px không đủ hiển thị chữ ngang; vẫn giữ icon-chip màu + icon mắt để nhận biết khối nào và bấm mở lại. Khối con Việc cần làm/Thói quen (thu hẹp theo chiều cao, không phải chiều rộng) vẫn giữ chữ hiển thị ngang bình thường vì đủ không gian.
- Test thật: bấm icon mắt ở khối Ghi chú → khối co lại còn dải hẹp bên phải Thói quen/Việc cần làm, khối Thông báo giãn ra lấp chỗ trống; bấm lại icon mắt (giờ là eyeOff) để mở lại.

---

# UX Notes — extensionNote mockup (vòng 10 — sửa hiển thị streak Thói quen)

## -2. Thay đổi vòng 10
- **Streak tính lại đúng nghĩa**: `computeStreak()` đếm số ngày liên tiếp từ cuối mảng `week` (hôm nay) lùi về trước, dừng ngay khi gặp ngày chưa hoàn thành — thay cho cách cũ `week.filter(Boolean).length` (tổng số ô tick, có thể rải rác và gây hiểu lầm).
- **Mỗi ô tuần giờ có nhãn ngày** (T2–CN) bên dưới, **icon check** hiện trong ô khi đã hoàn thành (thay vì chỉ đổi màu nền), và ô của **hôm nay có viền nhấn riêng** (`.week-box.today`) để dễ định vị.
- Streak hiển thị dạng **pill có nền màu** ("🔥 N ngày liên tiếp") thay vì số trần cạnh icon flame — rõ ràng hơn về đơn vị, đỡ trông như số ngẫu nhiên.
- Test thật: tick/un-tick checkbox habit, quan sát ô "hôm nay" (có viền nhấn) đổi trạng thái và số streak cập nhật theo đúng logic liên tiếp.

---

# UX Notes — extensionNote mockup (vòng 8 — chu kỳ lặp lại theo giờ)

## -1. Thay đổi vòng 8
- Chu kỳ việc lặp lại đổi từ dropdown cố định (mỗi ngày/2 ngày/tháng) sang dạng **"Mỗi [N] [đơn vị]"** — input số `task-freq-n` + select đơn vị `task-freq-unit` (Giờ/Ngày/Tháng). Test thật: tạo việc lặp lại "Uống nước" với N=3, đơn vị=Giờ → hiển thị "Mỗi 3 giờ".
- Khi đơn vị = **Giờ**, trường "Giờ trong ngày" tự ẩn (`onFreqUnitChange()`) vì lặp theo giờ là khoảng tương đối, không gắn mốc giờ cố định.
- Khối Thông báo hiển thị việc lặp theo giờ bằng chính chu kỳ (vd. "Mỗi 3 giờ bạn cần: Uống nước") thay vì "Hôm nay lúc..." (vốn chỉ hợp với lặp theo ngày/tháng).
- Model dữ liệu đổi từ `freq: 'daily'|'every2'|'monthly'` sang `freqN: number, freqUnit: 'hour'|'day'|'month'` — linh hoạt hơn, Dev nên giữ cấu trúc này khi code thật.

---

# UX Notes — extensionNote mockup (vòng 7 — hệ icon SVG + polish UI)

## 0. Thay đổi vòng 7
- **Bỏ toàn bộ emoji** (📋🔥✅🔔📝⠿✎✕◐📌🔁☀🌙⬇⬆) — thay bằng bộ `ICON_PATHS` (SVG line-icon tự vẽ, stroke-based, đồng nhất độ dày nét `stroke-width: 1.9`) định nghĩa ở đầu `<script>`, dùng qua hàm `svgIcon(name)`. Xem F23 trong requirements.md.
- **Icon-chip màu theo khối**: mỗi khối có 1 ô vuông bo góc nền màu nhạt + icon màu đậm cùng tông (Việc cần làm = xanh `--task-color`, Thói quen = cam `--habit-color`, Ghi chú = tím `--note-color`, Thông báo = hồng `--reminder-color`) — giải quyết trực tiếp phản hồi "đơn điệu" bằng cách tạo điểm nhấn màu rõ ràng mà vẫn nhất quán.
- **Checkbox tuỳ biến** (`.check`): hình vuông bo góc tự vẽ + icon check SVG khi tích, thay checkbox input mặc định của OS (vốn trông khác nhau giữa Chrome/Windows/Mac).
- **Card/khối có shadow nhẹ** (`--shadow`) thay vì chỉ viền phẳng — tạo độ sâu, đỡ "phẳng".
- **Brand mark**: logo góc trên trái đổi từ emoji 🗒️ sang ô vuông gradient (xanh → tím) chứa icon notebook SVG trắng, kèm dòng phụ đề "Personal dashboard" — nhận diện thương hiệu rõ hơn.
- Bảng màu chủ đạo trong Settings cũng đổi sang tông hài hoà với icon-chip (xanh/lục/tím/hồng/cam).

---

# UX Notes — extensionNote mockup (3 khối chính, vòng 6)

Mockup **tương tác thật**: mở [`index.html`](./index.html) bằng browser. State demo trong bộ nhớ, không có chrome.storage thật.

## 1. Thay đổi so với vòng 5
- **Gộp Todo + Nhắc lặp lại** thành 1 khối **"Việc cần làm"** (F22) — bỏ Kanban 4 cột, vì 2 khối cũ có chức năng quá giống nhau (cùng quản lý "việc cần làm", chỉ khác có lặp lại hay không).
- Khối tổng hợp bên trái giờ chỉ còn **2 khối con**: Việc cần làm + Thói quen (trước là 3: Todo/Nhắc lặp lại/Thói quen).
- Việc lặp lại có thêm **trường giờ tuỳ chọn** bên cạnh chu kỳ.
- **Resize đổi cơ chế**: bỏ hẳn kéo-thả splitter trên dashboard (lỗi/giật khi nhiều khối liên động) → chuyển vào Settings dưới dạng slider %, áp dụng ngay khi kéo.
- Đổi thứ tự khối (F21) vẫn giữ kéo-thả header — không đổi.

## 2. Khối Việc cần làm (F22)
- 1 danh sách phẳng, mỗi dòng có checkbox + tên + badge loại (📌 1 lần / 🔁 chu kỳ) + ngày-giờ hoặc chu kỳ-giờ.
- Filter 3 tab: Tất cả / Chưa xong / Đã xong (`setTaskFilter()`), test thật bằng cách bấm tab rồi xem danh sách lọc lại.
- Modal tạo/sửa có 2 nút chọn loại (1 lần / Lặp lại) — đổi loại sẽ ẩn/hiện field tương ứng (`setTaskType()`): 1 lần → ngày+giờ; Lặp lại → chu kỳ (select) + giờ.
- Tick checkbox: việc 1 lần → done cố định (bật/tắt được); việc lặp lại → doneToday, ý nghĩa "xong chu kỳ hiện tại" (chưa làm reset tự động theo thời gian thật trong mockup — Dev cần xử lý khi code thật, xem mục 5).

## 3. Khối Thói quen — không đổi (F18)
- Vẫn 7 ô tuần + streak + tick hôm nay.

## 4. Khối Thông báo — F19 (nguồn dữ liệu đổi theo F22)
- Tổng hợp: việc 1 lần có ngày = hôm nay, toàn bộ việc lặp lại (kèm giờ nếu có), toàn bộ habit.
- Bấm "Xong" không ẩn dòng, liên kết 2 chiều thật với khối Việc cần làm/Thói quen qua `toggleReminderSource()`.

## 5. Resize qua Settings (F20 — đổi cơ chế quan trọng nhất)
- Mở Settings (⚙) → mục "Bố cục — kích thước khối": 3 slider chính (Việc cần làm/Thói quen gộp = "Khối trái", Ghi chú, Thông báo tự động = phần còn lại) + 2 slider con (Việc cần làm / Thói quen tự động = phần còn lại).
- Kéo slider áp dụng ngay (`onSizeChange()` → `applySizes()` set `flex` trực tiếp bằng số nguyên %) — không còn phần tử splitter nào trong DOM, loại bỏ hẳn nguồn gây lỗi kéo-thả tự do.
- Test thật: mở Settings, kéo slider "Khối trái" hoặc "Ghi chú", quan sát layout đổi ngay phía sau modal (modal không che hết, có thể kéo modal... thực ra modal che — Dev khi code thật nên làm Settings dạng panel/drawer không che hết dashboard để xem live preview rõ hơn, mockup này tạm dùng modal overlay đơn giản).

## 6. Khối Ghi chú — không đổi (F1–F5, F11, F12, F15)

## 7. Lưu ý cho Dev khi code thật
- Model dữ liệu `tasks` hợp nhất 2 loại (`type: 'once' | 'recurring'`) — field khác nhau theo loại (`date/time` vs `freq/time`), Dev nên dùng discriminated union khi viết TypeScript.
- Việc lặp lại "doneToday" cần logic reset thật theo chu kỳ (so sánh ngày cuối cùng tick với chu kỳ hiện tại) — mockup chỉ giữ 1 boolean, không tự reset qua ngày, cần bổ sung khi code thật.
- Settings nên là drawer/sidebar thay vì modal che toàn màn hình, để người dùng thấy preview layout đổi trực tiếp khi kéo slider (mockup dùng modal cho đơn giản, không phải thiết kế cuối).
- Lưu 2 cấp tỉ lệ (3 khối chính, 2 khối con) + thứ tự 3 khối chính vào `chrome.storage` — không lưu giá trị splitter (đã bỏ).
- Toàn bộ JS là demo state in-memory, Dev thay bằng state thật + `chrome.storage.sync`.
