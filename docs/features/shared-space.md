# Tính năng: Shared Space

> Phase 3 — xây trên nền Phase 2 (Supabase + auth Google).
> Tài liệu này ghi lại các quyết định đã chốt và là input cho uiux + dev sprint tiếp theo.
> Cập nhật: 2026-07-02.

---

## 1. Tổng quan

Shared Space cho phép **một người tạo một Space mới và mời người khác cùng sử dụng**, theo mô hình workspace đơn giản: Owner + nhiều Member cùng đọc/ghi dữ liệu trong Space chung đó.

Đây là tính năng **cộng thêm**, không thay thế hay ảnh hưởng đến các Space cá nhân hiện có. Người dùng luôn có thể giữ Space riêng song song với Shared Space.

**Điểm khác biệt chính so với Space cá nhân:**

| | Space cá nhân | Shared Space |
|---|---|---|
| Số thành viên | 1 (chỉ mình) | 2+ (không giới hạn) |
| Khối Thói quen | Hiển thị | Bị ẩn hoàn toàn |
| Xung đột dữ liệu | Không xảy ra | Merge theo item-level LWW |
| Tạo từ | Có sẵn khi tạo Space mới | Chỉ tạo mới, không migrate |
| Mời người khác | Không có | Qua copy link |

---

## 2. User Stories

### Actor: Owner (người tạo Shared Space)

- Là Owner, tôi muốn tạo một Shared Space mới để cộng tác với người khác mà không ảnh hưởng đến Space cá nhân của mình.
- Là Owner, tôi muốn tạo invite link và copy để gửi qua Zalo/nhắn tin cho người tôi muốn mời.
- Là Owner, tôi muốn tạo nhiều link cùng lúc — mỗi link cho một người khác nhau.
- Là Owner, tôi muốn xem danh sách link đang chờ dùng (pending) và thu hồi link chưa dùng.
- Là Owner, tôi muốn xem danh sách tất cả Member đã join.
- Là Owner, tôi muốn kick (xoá) một Member khỏi Space.
- Là Owner, tôi muốn đổi tên Shared Space.
- Là Owner, tôi muốn xoá toàn bộ Shared Space (bao gồm mọi dữ liệu bên trong).

### Actor: Member (người được mời)

- Là Member, tôi muốn click invite link để join Space mà không cần nhập gì thêm (chỉ cần đã đăng nhập).
- Là Member, tôi muốn thấy Shared Space xuất hiện ở đầu danh sách "Space chung" trong Space Switcher của tôi ngay sau khi join.
- Là Member, tôi muốn thêm/sửa/xoá task và note trong Shared Space.
- Là Member, tôi muốn rời Shared Space khi không muốn dùng nữa.

---

## 3. Luồng chi tiết

### 3.1 Tạo Shared Space mới

1. Owner mở Space Switcher → nhấn nút **[+]** ở header section **"Space chung"**.
2. Modal tạo space hiện ra với `type: 'shared'` đã được xác định sẵn (không cần toggle nữa vì nút [+] mỗi section đã phân biệt rõ loại).
3. Owner đặt tên space → nhấn Tạo.
4. App tạo bản ghi Space trên Supabase với `type: 'shared'` và `created_by: uid`.
5. App tự động tạo 1 invite link đầu tiên để Owner có thể dùng ngay.
6. Shared Space xuất hiện trong section "Space chung" của Space Switcher, hiển thị icon Users (👥) và số member.

> Lưu ý: nút [+] ở section "Space của tôi" tạo space cá nhân — luồng đó không thay đổi.

### 3.2 Tạo và chia sẻ invite link

1. Owner mở Settings của Shared Space (hoặc panel quản lý member).
2. Owner nhấn "Tạo invite link mới".
3. App sinh token ngẫu nhiên → tạo link dạng `https://kn-space.io.vn/join?token=<token>`.
4. App lưu token vào bảng `space_invites` với trạng thái `pending`, `expires_at = now() + 7 ngày`, `max_uses = 1`.
5. Link hiển thị inline → Owner nhấn nút Copy.
6. Owner tự gửi link qua Zalo/nhắn tin/kênh bất kỳ.
7. Owner có thể lặp lại bước này nhiều lần để tạo thêm link cho người khác.

**Trạng thái của invite link:**
- `pending` — chưa được dùng, còn hạn.
- `used` — đã có người click và join thành công.
- `revoked` — Owner đã thu hồi thủ công.
- `expired` — quá 7 ngày mà chưa ai dùng.

### 3.3 Người được mời join qua link

1. Người được mời click link `https://kn-space.io.vn/join?token=<token>`.
2. Nếu chưa đăng nhập → redirect sang trang đăng nhập Google → sau khi đăng nhập xong quay lại URL `/join?token=<token>` tự động.
3. App kiểm tra token:
   - Token không tồn tại → hiển thị lỗi "Link không hợp lệ".
   - Token đã `used` / `revoked` / `expired` → hiển thị lỗi tương ứng.
   - Token hợp lệ (`pending`, chưa hết hạn) → tiếp tục bước 4.
4. App kiểm tra người dùng đã là thành viên của Space này chưa:
   - Đã là thành viên → thông báo "Bạn đã ở trong space này rồi" → redirect về Dashboard với Space đó được chọn.
   - Chưa phải thành viên → thêm người dùng vào `space_members` với role `member`.
5. Token chuyển sang trạng thái `used`.
6. Người dùng được redirect về Dashboard. Shared Space mới join **xuất hiện ở đầu danh sách "Space chung"** trong Space Switcher và được chọn tự động.

### 3.4 Quản lý member (Owner)

Owner mở panel quản lý của Shared Space (trong Settings hoặc Space Switcher). Panel hiển thị:

**Tab "Thành viên":**
- Danh sách member đã join: avatar/email, vai trò (Owner/Member), ngày join.
- Nút Kick bên cạnh từng Member (Owner không thể tự kick chính mình).
- Xác nhận trước khi kick: "Xoá [tên] khỏi space này? Họ sẽ mất quyền truy cập ngay lập tức."
- Sau khi bị kick: Space bị xoá khỏi Space Switcher của người bị kick, nếu họ đang mở Space đó thì app tự chuyển sang Space khác.

**Tab "Invite Links":**
- Danh sách link đang `pending` (hiển thị token rút gọn, thời gian hết hạn).
- Nút Copy link, nút Thu hồi (revoke) từng link.
- Nút "Tạo link mới".
- Các link trạng thái `used`/`expired`/`revoked` không hiển thị (hoặc hiển thị mờ ở phần history nếu cần).

### 3.5 Member rời Space

1. Member mở Space Switcher → chọn Shared Space → nhấn "Rời space".
2. Xác nhận: "Rời space [tên]? Bạn sẽ mất quyền truy cập. Nếu muốn vào lại cần được Owner mời lại."
3. Sau khi xác nhận: xoá dòng trong `space_members`, Space biến khỏi Space Switcher của Member.
4. App tự chuyển Member sang Space kế tiếp trong danh sách của họ.

> Owner không thể rời Space — chỉ có thể xoá Space.

### 3.6 Xoá Shared Space (Owner)

1. Owner mở Space Switcher → chọn Shared Space → nhấn biểu tượng xoá.
2. Dialog xác nhận nặng hơn bình thường: "Xoá space [tên]? Toàn bộ dữ liệu (task, nhắc việc, ghi chú) và [N] thành viên sẽ bị xoá. Hành động không thể hoàn tác."
3. Sau khi xác nhận: xoá Space + toàn bộ dữ liệu liên quan + mọi bản ghi `space_members` + `space_invites`.
4. Mọi Member đang dùng Space đó bị tự động chuyển về Space khác (hoặc thấy thông báo "Space đã bị xoá").

---

## 4. Permission Model

| Hành động | Owner | Member |
|---|---|---|
| Xem dữ liệu (task, nhắc việc, note) | Được | Được |
| Thêm/sửa/xoá task | Được | Được |
| Thêm/sửa/xoá nhắc việc | Được | Được |
| Thêm/sửa/xoá note | Được | Được |
| Tạo invite link | Được | Không |
| Thu hồi invite link | Được | Không |
| Xem danh sách member | Được | Được (xem được tên/avatar) |
| Kick member | Được | Không |
| Rời space | Không (chỉ xoá) | Được |
| Đổi tên space | Được | Không |
| Xoá cả space | Được | Không |

> Thiết kế hiện tại có 2 role cứng: Owner và Member. Không có role trung gian (admin/moderator) — Out of scope.

---

## 5. UX / UI — Space Switcher

### 5.1 Layout 2 section tách biệt

Space Switcher chia thành **2 section riêng biệt**, không mix chung một danh sách:

```
Space của tôi          [+]
● Work
● Personal

Space chung            [+]
👥 Team Project · 3 người
👥 Gia đình · 2 người
```

- Header mỗi section có nút **[+]** riêng:
  - Section "Space của tôi" → [+] tạo Space cá nhân mới.
  - Section "Space chung" → [+] tạo Shared Space mới.
- Space cá nhân hiển thị dot màu như hiện tại.
- Shared Space hiển thị **icon Users (👥)** thay dot màu, kèm số member ở cuối tên (ví dụ "· 3 người").
- Hai section luôn hiển thị — kể cả khi chưa có Shared Space nào (section "Space chung" hiển thị empty state hoặc gợi ý tạo).

### 5.2 Thứ tự hiển thị trong mỗi section

- "Space của tôi": thứ tự do người dùng tự sắp xếp (drag hoặc tùy uiux quyết định).
- "Space chung": Shared Space mới join **xuất hiện ở đầu danh sách** tại thời điểm join. Sau đó người dùng có thể sắp xếp lại.

---

## 6. Behavior đặc biệt

### 6.1 Khối Thói quen bị ẩn

Habit là dữ liệu cực kỳ cá nhân (chuỗi ngày hoàn thành từng người). Trong Shared Space:
- Khối "Thói quen" bị **ẩn hoàn toàn** — không render, không chiếm layout.
- `enabledBlocks.habits` của Shared Space luôn bị force về `false` khi render.
- Người dùng không thể bật lại Habit trong Shared Space dù vào Settings.
- UI ẩn luôn cả toggle Habit trong Settings khi đang ở Shared Space.

### 6.2 Conflict resolution — Item-level Last-Write-Wins (LWW)

Khi 2+ người cùng sửa cùng lúc:

- Mỗi item (task, note, reminder) có field `updatedAt: number` (epoch ms).
- Khi có xung đột trên cùng 1 item: **item nào có `updatedAt` lớn hơn (mới hơn) thắng** — item kia bị ghi đè.
- Granularity là **item**, không phải field bên trong item. Ví dụ: nếu người A sửa title, người B sửa content cùng lúc trên cùng 1 note → người nào save sau sẽ ghi đè toàn bộ note (bao gồm cả thay đổi của người kia).
- Không có merge field-level, không có diff/patch, không có lịch sử version.
- Đây là trade-off có chủ đích: đơn giản, đủ dùng cho quy mô nhỏ (2–10 người).

**Hành vi khi bị ghi đè:**
- Không có notification "dữ liệu của bạn đã bị ghi đè".
- Người dùng tự nhận ra qua Supabase Realtime cập nhật UI.
- Chấp nhận mất thay đổi trong các tình huống edit đồng thời — đây là hành vi đã biết, không phải bug.

### 6.3 Realtime sync

- Dùng Supabase Realtime (đã có từ Phase 2) để push thay đổi cho mọi thành viên đang online.
- Thành viên offline không nhận được thay đổi realtime → thấy dữ liệu cũ cho đến khi mở lại app / refresh.
- Không có offline queue — giữ nguyên hành vi Phase 2 (banner lỗi nếu save thất bại do mất kết nối).

---

## 7. Out of Scope (không làm trong phase này)

- **Migrate/convert Space cá nhân thành Shared Space** — chỉ tạo mới.
- **Invite qua email** — không dùng email service, chỉ copy link.
- **Role trung gian** (admin/moderator) — chỉ có Owner và Member.
- **Transfer ownership thủ công** — Owner không thể chủ động nhường quyền Owner cho người khác (auto-promote xảy ra khi Owner xoá tài khoản, xem mục 8 Edge Cases).
- **Giới hạn số member** — không có quota.
- **Audit log / lịch sử thay đổi** — không tracking ai sửa gì.
- **Mention / comment / reaction** trên task/note.
- **Notification push** khi có thành viên thay đổi dữ liệu (chỉ có Realtime UI update, không có in-app notification riêng cho Shared Space).
- **Revoke link đã `used`** — chỉ thu hồi được link `pending`.
- **Gia hạn link hết hạn** — khi link expired, Owner tạo link mới.
- **Multiple invite link dùng được nhiều lần** — mỗi link chỉ dùng 1 lần (1 link = 1 người).
- **Thói quen trong Shared Space** — Habits block bị ẩn hoàn toàn.
- **Mobile redesign cho Shared Space** — Shared Space vẫn follow responsive rule hiện tại (chỉ 2 khối trên mobile).

---

## 8. Edge Cases cần handle

| Case | Hành vi mong đợi |
|---|---|
| Owner click invite link của chính mình | Thông báo "Bạn đã là Owner của space này" → redirect về Dashboard |
| Member click lại link mình đã dùng | Token đã `used` → thông báo "Link đã được sử dụng" |
| Token hợp lệ nhưng người dùng chưa đăng nhập | Redirect đăng nhập → sau đó quay lại `/join?token=` tự động |
| Member đang mở Shared Space thì bị kick | App tự chuyển sang Space kế tiếp, hiển thị toast "Bạn đã bị xoá khỏi space [tên]" |
| Member đang mở Shared Space thì Owner xoá Space | App tự chuyển sang Space kế tiếp, hiển thị toast "Space [tên] đã bị xoá" |
| Owner xoá Space khi chỉ có mình Owner (không member nào) | Cho phép xoá bình thường (giống Space cá nhân) — không cần confirm đặc biệt |
| Owner là người dùng duy nhất trong hệ thống (chỉ 1 Space) cố xoá | Nếu đây là Space duy nhất của Owner → không cho xoá (giữ nguyên rule hiện tại: không thể xoá Space cuối) |
| 2 người cùng sửa 1 task/note trong vài giây | LWW theo `updatedAt` — người save sau thắng, không báo lỗi |
| Mạng mất giữa chừng khi Member đang save | Hiện banner lỗi như Phase 2, không tự retry, người dùng phải save lại thủ công |
| Token URL bị thay đổi / giả mạo | Server kiểm tra token trong DB, không tìm thấy → lỗi "Link không hợp lệ" |
| Người dùng join nhiều Shared Space | Tất cả đều hiện trong section "Space chung" — không giới hạn số Shared Space một người có thể join |
| Owner xoá tài khoản, Shared Space còn member | Auto-promote member có `joined_at` sớm nhất lên role `owner`. Nếu không còn member nào khác → xoá luôn Space kèm toàn bộ dữ liệu. |
| Member vừa join Shared Space mới | Space đó xuất hiện ở **đầu danh sách** section "Space chung" và được chọn tự động. |

---

## 9. Schema bổ sung (định hướng, không phải thiết kế cuối)

Các bảng/field cần thêm vào Supabase so với Phase 2:

**Bảng `spaces` (mở rộng):**
- `type: 'personal' | 'shared'` — phân biệt loại Space.
- `created_by: uuid` — FK sang `auth.users`, chỉ owner mới là `created_by`.

**Bảng `space_members` (mới):**
- `space_id`, `user_id`, `role: 'owner' | 'member'`, `joined_at`.
- Personal Space sẽ có 1 dòng duy nhất với role `owner` — giúp RLS policy đồng nhất.
- `joined_at` là tiêu chí để auto-promote khi Owner xoá tài khoản: member có `joined_at` sớm nhất được promote.

**Bảng `space_invites` (mới):**
- `id`, `space_id`, `token` (unique, random), `status: 'pending' | 'used' | 'revoked' | 'expired'`, `created_by`, `used_by`, `expires_at`, `created_at`.

> Chi tiết schema (column types, indexes, RLS policies) là việc của dev sprint — không thuộc tài liệu này.

---

## 10. Câu hỏi mở / cần xác nhận thêm

**Q-B: Shared Space — empty state section "Space chung"**
Khi người dùng chưa có Shared Space nào, section "Space chung" trong Space Switcher hiển thị gì? Gợi ý text ("Tạo space chung để cộng tác") hay ẩn hẳn section? Cần uiux quyết định.
