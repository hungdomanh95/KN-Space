# Phase 1 — Extension cá nhân (desktop) 🟡 CODE XONG — CHỜ VERIFY TRÊN CHROME THẬT

## Mục tiêu
Một bản KN-Space **dùng được ngay cho cá nhân trên desktop**: full dashboard 5 khối, dữ liệu lưu bền và đồng bộ giữa các máy đăng nhập cùng Chrome account. Không backend, không auth, không hosting.

## Nền tảng & ràng buộc
- **Chrome Extension Manifest V3.**
- **Lưu trữ: `chrome.storage`** — `sync` làm chính (đồng bộ cùng Chrome account), `local` fallback khi vượt quota.
- **Desktop-only**.
- **React + TypeScript + Vite** để quản lý state/UI rõ ràng hơn ngay từ Phase 1.
- **lucide-react** làm thư viện icon chính, không tự duy trì bộ SVG thủ công trong runtime.
- Không backend/auth/Supabase ở Phase 1.

## Phạm vi
Full dashboard 5 khối + đa Space + settings, đúng [mockup index.html](../mockup/index.html) và [requirements.md](../requirements.md): Việc cần làm (F22), Nhắc việc (F25), Thói quen (F18), Ghi chú (F1–F5, F11 Grid/List, F15 màu, F28 tìm/sắp), Thông báo (F19); đa Space (F32); ẩn/hiện khối (F24/F27); resize + đổi thứ tự khối (F20/F21/F26); theme/màu/ảnh nền (F6–F8); export/import (F13); icon SVG qua `lucide-react` (F23); modal tuỳ biến (F4/F31); accessibility (F29).

> Đa Space ở phase này chỉ là cục bộ trong `chrome.storage` của 1 người — **không có cộng tác nhiều người**.

## Điểm mấu chốt (từ khảo sát mockup)
Mockup [index.html](../mockup/index.html) là **prototype UX/interaction bằng vanilla** (đã có đa Space `spaces[]` Cá nhân/Công ty + switcher + modal, cả 5 khối, export/import UI, theme). Phase 1 mới sẽ **port UX này sang React + TypeScript**, không copy nguyên runtime vanilla.

Các việc bắt buộc:
1. **Scaffold React/Vite extension:** cấu hình build để output là extension MV3 load unpacked được, HTML chỉ load JS/CSS bundle external.
2. **Component hóa theo domain:** tách `Tasks`, `ReminderDefinitions`, `Habits`, `Notes`, `Notifications`, `SpaceSwitcher`, `Settings`, `Modal`.
3. **Icon library:** dùng `lucide-react` cho icon line nhất quán; không dùng emoji làm icon chính, không tự nhúng `ICON_PATHS` thủ công nếu icon có sẵn trong thư viện.
4. **Persistence:** viết tầng storage TypeScript đọc/ghi `chrome.storage`.
5. **MV3 CSP:** không inline script trong HTML build output; React event handlers trong bundle external là hợp lệ.

## Cấu trúc thư mục
```
extension/
  manifest.json      # MV3: permissions ["storage"], action, background SW, icons
  background.js      # service worker: click icon → mở/focus tab dashboard
  index.html         # entry HTML cho React app, không inline script
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    types.ts
    storage/
      chromeStorage.ts
    state/
      appReducer.ts
      seed.ts
    components/
    features/
      tasks/
      reminders/
      habits/
      notes/
      notifications/
      spaces/
      settings/
  icons/             # 16/32/48/128
```

## Chiến lược storage
- `chrome.storage.sync` làm chính để đồng bộ cùng Chrome account. Giới hạn: 8KB/item, 100KB tổng, 512 item.
- **Tách key** (mỗi space 1 key, settings/layout 1 key) thay vì 1 blob lớn → né giới hạn 8KB/item.
- **Fallback `chrome.storage.local`** + cảnh báo nhẹ khi vượt quota sync (khôi phục tinh thần F9/F10 gốc).
- **Seed dữ liệu demo** (Cá nhân/Công ty) chỉ ở lần chạy đầu (storage rỗng); sau đó luôn đọc từ storage.
- **Save debounce** sau mỗi mutation (note/task/habit/reminder/space/theme/layout/thứ tự khối).

## Dev Checklist Phase 1
> Quy ước: làm xong bước nào thì đổi `[ ]` thành `[x]` ngay trong file này. Nếu gần hết token/context, cập nhật mục **Handoff note** ở cuối checklist: đang làm tới đâu, file nào đã sửa, lỗi còn lại, lệnh verify đã chạy.

### 0. Chuẩn bị yêu cầu
- [x] Làm sạch [requirements.md](../requirements.md), chỉ giữ scope Phase 1 Extension desktop.
- [x] Đồng bộ plan với mockup hiện tại: Ghi chú dùng Grid/List, không còn masonry.
- [x] Dev đọc kỹ [requirements.md](../requirements.md), [mockup index.html](../mockup/index.html), và file plan này trước khi code.

### 1. Tạo khung extension
- [x] Tạo thư mục `extension/`.
- [x] Scaffold React + TypeScript + Vite trong `extension/`.
- [x] Cài dependency tối thiểu: `react`, `react-dom`, `lucide-react`; dev dependency: `typescript`, `vite`, `@vitejs/plugin-react`.
- [x] Tạo `extension/manifest.json` theo Manifest V3.
- [x] Khai báo permission tối thiểu: `storage`.
- [x] Khai báo `action` và `background.service_worker`.
- [x] Tạo `extension/background.js`.
- [x] Tạo `extension/index.html`.
- [x] Tạo `extension/src/main.tsx`.
- [x] Tạo `extension/src/App.tsx`.
- [x] Tạo `extension/src/storage/chromeStorage.ts`.
- [x] Tạo thư mục `extension/icons/`.

### 2. Background mở dashboard full-tab
- [x] Implement `background.js`: click icon extension mở `index.html`.
- [x] Nếu dashboard đã mở, focus tab cũ thay vì mở tab trùng.
- [ ] Verify click icon mở/focus đúng tab. _(cần test trên Chrome thật qua "Load unpacked" — xem hướng dẫn ở Handoff note)_

### 3. Port mockup sang React components
- [x] Trích layout/CSS/token cần thiết từ `docs/mockup/index.html`.
- [x] Tách component theo khối: Tasks, ReminderDefinitions, Habits, Notes, Notifications.
- [x] Tách component shell: TopBar, SpaceSwitcher, SettingsModal, ConfirmModal, AppLayout.
- [x] Dùng `lucide-react` cho toàn bộ icon chính.
- [x] Giữ lại UI/UX đúng mockup: 5 khối, Space switcher, Settings, modal, note Grid/List, ẩn/hiện khối.
- [x] Verify app dev/build không lỗi layout lớn. _(verify được: `npm run build` pass, `tsc --noEmit` sạch; chưa verify bằng mắt trên Chrome thật)_

### 4. MV3 CSP + build output
- [x] Đảm bảo `index.html` không có inline `<script>`.
- [x] Đảm bảo build output không cần `eval`/remote script.
- [x] Cấu hình Vite output phù hợp Chrome Extension MV3.
- [x] Đảm bảo modal, Settings, Space menu, filter, note sort/view, CRUD, drag/drop hoạt động qua React event handlers.
- [ ] Verify console không còn lỗi CSP khi load unpacked. _(cần test trên Chrome thật)_

### 5. Chuẩn hoá state runtime
- [x] Thiết kế TypeScript types cho AppState, Space, Task, ReminderDefinition, Habit, Note, Settings.
- [x] Gom state demo hiện tại thành một object/app state rõ ràng.
- [x] Dùng reducer/custom hooks để mutation tập trung, dễ persist (1 `useReducer` gốc + Context, domain sub-reducers compose trong `appReducer.ts`).
- [x] Giữ đủ dữ liệu: spaces, currentSpaceId, settings, layout sizes, collapsedBlocks, note view/sort/search.
- [x] Seed demo "Cá nhân"/"Công ty" chỉ khi storage rỗng.
- [x] Khi chuyển Space reset UI tạm: task filter, note search, note sort, hidden note state.

### 6. Implement storage
- [x] `chromeStorage.ts` có API `loadAppState()`.
- [x] `chromeStorage.ts` có API `saveAppState()` hoặc các hàm save theo phần (`flushSave`/`scheduleSave`/`forceFlush`).
- [x] Lưu chính bằng `chrome.storage.sync`.
- [x] Tách key để tránh giới hạn 8KB/item: settings/layout riêng, mỗi space một key (+ `space-index` key riêng để tự phục hồi).
- [x] Có debounce khi ghi sau mutation (600ms).
- [x] Fallback sang `chrome.storage.local` khi vượt quota sync.
- [x] Có cảnh báo nhẹ nếu dữ liệu phải fallback local (`.fallback-banner` trong `App.tsx`).
- [ ] Verify reload tab vẫn giữ dữ liệu. _(cần test trên Chrome thật)_

### 7. Wire CRUD 5 khối vào storage
- [x] Việc cần làm: tạo/sửa/xoá/tick/filter và persist.
- [x] Nhắc việc: tạo/sửa/xoá loại một lần/lặp lại và persist.
- [x] Thói quen: tạo/sửa/xoá/tick hôm nay, `completedDates`, streak và persist.
- [x] Ghi chú: tạo/xem/sửa/xoá/màu/Grid/List/sort/order/ẩn nội dung theo phiên và persist phần cần lưu.
- [x] Thông báo: tổng hợp đúng từ 3 khối nguồn, nút Xong đồng bộ về Việc cần làm/Thói quen (derive thuần qua `computeNotifications`, không lưu storage riêng).

### 8. Wire Space vào storage
- [x] Tạo Space mới và persist.
- [x] Đổi tên Space và persist.
- [x] Xoá Space, chặn xoá khi chỉ còn 1 Space.
- [x] Chuyển Space và load đúng dữ liệu riêng.
- [x] Sắp xếp Space lên/xuống và persist.
- [x] Bật/tắt khối theo Space (`enabledBlocks`) và persist.
- [x] Settings vẫn dùng chung mọi Space.

### 9. Wire Settings vào storage
- [x] Theme sáng/tối persist.
- [x] Màu chủ đạo persist.
- [x] Ảnh nền/header tint persist.
- [x] Layout sizes persist.
- [x] Thứ tự khối chính persist.
- [x] Khôi phục layout mặc định hoạt động và persist.
- [x] Ẩn/hiện khối và Ẩn tất cả/Hiện tất cả hoạt động đúng.

### 10. Export/Import JSON
- [x] Export toàn bộ spaces + settings thành file `.json`.
- [x] Import đọc file `.json`.
- [x] Trước khi import có modal xác nhận thay thế dữ liệu hiện tại.
- [x] Sau import lưu vào storage (qua debounce save bình thường, vì IMPORT_DATA đổi `state.spaces/settings/currentSpaceId`).
- [x] Sau import reset UI tạm hợp lý: Space hợp lệ, task filter All, note sort manual, note search rỗng.
- [ ] Verify export/import khôi phục đúng dữ liệu. _(cần test trên Chrome thật)_

### 11. Icons
- [x] Tạo icon extension 16x16.
- [x] Tạo icon extension 32x32.
- [x] Tạo icon extension 48x48.
- [x] Tạo icon extension 128x128.
- [x] Khai báo icons trong `manifest.json`.
- [x] Dùng `lucide-react` cho icon UI trong dashboard.
  > Lưu ý: 4 icon hiện tại là placeholder màu solid `#5b6cff` (sinh bằng script, không phải artwork thật). Đủ để build/load unpacked nhưng nên thay icon thương hiệu thật trước khi phát hành.

### 12. Verification cuối Phase 1
- [ ] Load unpacked extension thành công. _(cần Chrome thật)_
- [ ] Click icon mở/focus dashboard full-tab. _(cần Chrome thật)_
- [ ] Console sạch lỗi CSP/runtime. _(cần Chrome thật)_
- [x] CRUD đủ 5 khối. _(verify qua code review + build pass; UI thật cần Chrome)_
- [x] Tạo/đổi tên/xoá/sắp xếp Space. _(verify qua code review)_
- [x] Bật/tắt khối theo Space. _(verify qua code review)_
- [x] Đổi theme/màu/ảnh nền/layout/thứ tự khối. _(verify qua code review; đã fix bug `--accent-rgb` không cập nhật theo accent mới chọn)_
- [ ] Reload tab dữ liệu còn nguyên. _(cần Chrome thật)_
- [ ] Export JSON tải file đúng. _(cần Chrome thật, `URL.createObjectURL` + click <a> cần DOM thật)_
- [ ] Import JSON khôi phục đúng. _(cần Chrome thật)_
- [ ] Test dữ liệu lớn hoặc mô phỏng quota để xác nhận fallback local/cảnh báo nhẹ. _(cần Chrome thật, không mô phỏng được quota sync trong Node)_

### Handoff note
- **Trạng thái hiện tại:** Code Phase 1 đã hoàn thiện toàn bộ theo plan (toàn bộ mục §1–§11 đã làm). `npm run build` pass sạch (tsc -b + vite build), `npx tsc --noEmit` không lỗi. Còn lại các mục verify ở §12 cần kiểm tra trực tiếp trên Chrome (load unpacked) — không thể giả lập đầy đủ `chrome.storage`/`chrome.action`/`chrome.tabs` trong môi trường CLI/Node.
- **Đang làm dở:** Không còn việc code dở. Chỉ còn bước kiểm thử thủ công trên Chrome thật (§12) và quyết định icon thương hiệu thật (hiện là placeholder solid color).
- **Rủi ro/điểm cần chủ dự án tự kiểm tra kỹ:**
  1. Kéo-thả note card (kỹ thuật arm/disarm qua ref + HTML5 DnD) — rủi ro UI cao nhất, cần test thực tế kéo-thả trong cả Grid và List view.
  2. Logic due-today cho nhắc lặp lại theo "Ngày" (`(số ngày từ createdAt) % freqN === 0`, file `src/features/reminders/reminderUtils.ts`) là field/logic MỚI không có trong mockup gốc — đã verify bằng script Node độc lập cho case "mỗi 3 ngày" (đến hạn đúng vào ngày 0, 3, 6, 9...), nhưng nên tạo thử 1 reminder thật trong app và quan sát qua nhiều ngày (hoặc sửa tạm `createdAt` trong storage để giả lập) để chắc chắn.
  3. Quota fallback `sync → local`: logic đã viết đúng (catch cả reject promise và `chrome.runtime.lastError`), nhưng chưa test được tình huống quota thật vượt 8KB/item hoặc 100KB tổng trên Chrome thật.
- **File đã sửa/tạo trong lượt này:** toàn bộ `extension/` (manifest.json, background.js, index.html, package.json, tsconfig.json, vite.config.ts, icons/*.png, và toàn bộ `extension/src/**`) + `.gitignore` (thêm `extension/node_modules/`, `extension/dist/`, `extension/*.tsbuildinfo`) + `docs/plan/phase-1-extension.md` (checklist này).
- **Bug tự phát hiện và đã sửa trong lượt review cuối:**
  1. `--accent-rgb` (CSS var dùng cho mọi `rgba(var(--accent-rgb),alpha)` — scrollbar, focus ring, filter-tabs active...) không được cập nhật khi user đổi màu accent trong Settings, chỉ `--accent` (hex) được set. Đã sửa trong `src/App.tsx`: tính lại rgb từ hex mỗi khi `settings.accent` đổi.
  2. `id="block-notes"`/`id="block-reminders"` (dùng cho responsive CSS `@media (max-width: 980px)`) bị đặt nhầm vào `BlockShell` con (`.sub-block`) thay vì đúng wrapper `.main-block` ở `AppLayout.tsx` — khiến rule responsive không áp đúng phần tử cha có `style.flex` inline. Đã sửa: chuyển id lên đúng wrapper trong `AppLayout.tsx`, bỏ `domId` trùng khỏi `NotesBlock`/`NotificationsBlock`.
  3. Dọn `src/iconMap.ts` (dead code không được import bởi component nào, sót lại từ giai đoạn đầu trước khi quyết định dùng lucide-react trực tiếp).
- **Lệnh verify đã chạy:**
  - `cd extension && npm install` — pass (102 packages).
  - `cd extension && npm run build` (= `tsc -b && vite build`) — pass, output `extension/dist/` đủ `index.html`, `assets/*.js,*.css`, `manifest.json`, `background.js`, `icons/*.png`.
  - `cd extension && npx tsc --noEmit -p tsconfig.json` — pass, 0 lỗi.
  - Script Node độc lập verify logic `isRecurringDueToday` cho case "mỗi 3 ngày" — đúng kỳ vọng (due vào ngày 0, 3, 6, 9...).
  - Đọc thủ công `dist/index.html`, `dist/manifest.json`, `dist/background.js` — xác nhận không có `default_popup`, không inline script, mọi asset path tương đối.
- **Bước tiếp theo (cho chủ dự án):** mở `chrome://extensions`, bật "Developer mode", bấm "Load unpacked", chọn thư mục `extension/dist/` (không phải `extension/` gốc). Sau đó test theo checklist §12 còn lại. Nếu cần build lại sau khi sửa code: chạy lại `npm run build` trong `extension/`, rồi bấm icon "reload" của extension trong `chrome://extensions` (không cần load unpacked lại từ đầu).
