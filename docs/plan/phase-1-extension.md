# Phase 1 — Extension cá nhân (desktop) 🚧 ĐANG LÀM

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
- [ ] Dev đọc kỹ [requirements.md](../requirements.md), [mockup index.html](../mockup/index.html), và file plan này trước khi code.

### 1. Tạo khung extension
- [ ] Tạo thư mục `extension/`.
- [ ] Scaffold React + TypeScript + Vite trong `extension/`.
- [ ] Cài dependency tối thiểu: `react`, `react-dom`, `lucide-react`; dev dependency: `typescript`, `vite`, `@vitejs/plugin-react`.
- [ ] Tạo `extension/manifest.json` theo Manifest V3.
- [ ] Khai báo permission tối thiểu: `storage`.
- [ ] Khai báo `action` và `background.service_worker`.
- [ ] Tạo `extension/background.js`.
- [ ] Tạo `extension/index.html`.
- [ ] Tạo `extension/src/main.tsx`.
- [ ] Tạo `extension/src/App.tsx`.
- [ ] Tạo `extension/src/storage/chromeStorage.ts`.
- [ ] Tạo thư mục `extension/icons/`.

### 2. Background mở dashboard full-tab
- [ ] Implement `background.js`: click icon extension mở `index.html`.
- [ ] Nếu dashboard đã mở, focus tab cũ thay vì mở tab trùng.
- [ ] Verify click icon mở/focus đúng tab.

### 3. Port mockup sang React components
- [ ] Trích layout/CSS/token cần thiết từ `docs/mockup/index.html`.
- [ ] Tách component theo khối: Tasks, ReminderDefinitions, Habits, Notes, Notifications.
- [ ] Tách component shell: TopBar, SpaceSwitcher, SettingsModal, ConfirmModal, AppLayout.
- [ ] Dùng `lucide-react` cho toàn bộ icon chính.
- [ ] Giữ lại UI/UX đúng mockup: 5 khối, Space switcher, Settings, modal, note Grid/List, ẩn/hiện khối.
- [ ] Verify app dev/build không lỗi layout lớn.

### 4. MV3 CSP + build output
- [ ] Đảm bảo `index.html` không có inline `<script>`.
- [ ] Đảm bảo build output không cần `eval`/remote script.
- [ ] Cấu hình Vite output phù hợp Chrome Extension MV3.
- [ ] Đảm bảo modal, Settings, Space menu, filter, note sort/view, CRUD, drag/drop hoạt động qua React event handlers.
- [ ] Verify console không còn lỗi CSP khi load unpacked.

### 5. Chuẩn hoá state runtime
- [ ] Thiết kế TypeScript types cho AppState, Space, Task, ReminderDefinition, Habit, Note, Settings.
- [ ] Gom state demo hiện tại thành một object/app state rõ ràng.
- [ ] Dùng reducer/custom hooks để mutation tập trung, dễ persist.
- [ ] Giữ đủ dữ liệu: spaces, currentSpaceId, settings, layout sizes, collapsedBlocks, note view/sort/search.
- [ ] Seed demo "Cá nhân"/"Công ty" chỉ khi storage rỗng.
- [ ] Khi chuyển Space reset UI tạm: task filter, note search, note sort, hidden note state.

### 6. Implement storage
- [ ] `chromeStorage.ts` có API `loadAppState()`.
- [ ] `chromeStorage.ts` có API `saveAppState()` hoặc các hàm save theo phần.
- [ ] Lưu chính bằng `chrome.storage.sync`.
- [ ] Tách key để tránh giới hạn 8KB/item: settings/layout riêng, mỗi space một key.
- [ ] Có debounce khi ghi sau mutation.
- [ ] Fallback sang `chrome.storage.local` khi vượt quota sync.
- [ ] Có cảnh báo nhẹ nếu dữ liệu phải fallback local.
- [ ] Verify reload tab vẫn giữ dữ liệu.

### 7. Wire CRUD 5 khối vào storage
- [ ] Việc cần làm: tạo/sửa/xoá/tick/filter và persist.
- [ ] Nhắc việc: tạo/sửa/xoá loại một lần/lặp lại và persist.
- [ ] Thói quen: tạo/sửa/xoá/tick hôm nay, `completedDates`, streak và persist.
- [ ] Ghi chú: tạo/xem/sửa/xoá/màu/Grid/List/sort/order/ẩn nội dung theo phiên và persist phần cần lưu.
- [ ] Thông báo: tổng hợp đúng từ 3 khối nguồn, nút Xong đồng bộ về Việc cần làm/Thói quen.

### 8. Wire Space vào storage
- [ ] Tạo Space mới và persist.
- [ ] Đổi tên Space và persist.
- [ ] Xoá Space, chặn xoá khi chỉ còn 1 Space.
- [ ] Chuyển Space và load đúng dữ liệu riêng.
- [ ] Sắp xếp Space lên/xuống và persist.
- [ ] Bật/tắt khối theo Space (`enabledBlocks`) và persist.
- [ ] Settings vẫn dùng chung mọi Space.

### 9. Wire Settings vào storage
- [ ] Theme sáng/tối persist.
- [ ] Màu chủ đạo persist.
- [ ] Ảnh nền/header tint persist.
- [ ] Layout sizes persist.
- [ ] Thứ tự khối chính persist.
- [ ] Khôi phục layout mặc định hoạt động và persist.
- [ ] Ẩn/hiện khối và Ẩn tất cả/Hiện tất cả hoạt động đúng.

### 10. Export/Import JSON
- [ ] Export toàn bộ spaces + settings thành file `.json`.
- [ ] Import đọc file `.json`.
- [ ] Trước khi import có modal xác nhận thay thế dữ liệu hiện tại.
- [ ] Sau import lưu vào storage.
- [ ] Sau import reset UI tạm hợp lý: Space hợp lệ, task filter All, note sort manual, note search rỗng.
- [ ] Verify export/import khôi phục đúng dữ liệu.

### 11. Icons
- [ ] Tạo icon extension 16x16.
- [ ] Tạo icon extension 32x32.
- [ ] Tạo icon extension 48x48.
- [ ] Tạo icon extension 128x128.
- [ ] Khai báo icons trong `manifest.json`.
- [ ] Dùng `lucide-react` cho icon UI trong dashboard.

### 12. Verification cuối Phase 1
- [ ] Load unpacked extension thành công.
- [ ] Click icon mở/focus dashboard full-tab.
- [ ] Console sạch lỗi CSP/runtime.
- [ ] CRUD đủ 5 khối.
- [ ] Tạo/đổi tên/xoá/sắp xếp Space.
- [ ] Bật/tắt khối theo Space.
- [ ] Đổi theme/màu/ảnh nền/layout/thứ tự khối.
- [ ] Reload tab dữ liệu còn nguyên.
- [ ] Export JSON tải file đúng.
- [ ] Import JSON khôi phục đúng.
- [ ] Test dữ liệu lớn hoặc mô phỏng quota để xác nhận fallback local/cảnh báo nhẹ.

### Handoff note
- **Trạng thái hiện tại:** requirements đã được làm sạch cho Phase 1; chưa bắt đầu code extension.
- **Đang làm dở:** chưa có.
- **Bước tiếp theo:** cập nhật implementation sang React + TypeScript + Vite; nếu đã có thử nghiệm vanilla trong `extension/`, cần thay bằng scaffold React trước khi tiếp tục.
- **File đã sửa trong lượt này:** `docs/requirements.md`, `docs/plan/phase-1-extension.md`.
- **Lệnh verify đã chạy:** chưa có lệnh test code, chỉ rà nội dung tài liệu.
