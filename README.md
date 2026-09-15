# Cội · Gìn giữ nếp nhà

Cội là một web app cho dòng họ: lưu ngày giỗ theo âm lịch Việt Nam, hiển thị ngày dương tương ứng, giữ thông tin và ký ức về người thân, mời thành viên và gửi lời nhắc email.

## Có gì trong bản này

- Giao diện responsive theo concept **Cội**: nền olive đen, vàng champagne, typography Lora + Manrope.
- Dashboard tổng quan và lịch tháng âm/dương.
- Tra ngày giỗ lặp hằng năm theo âm lịch Việt Nam (UTC+7).
- Xử lý tháng nhuận: tháng thường, ưu tiên tháng nhuận hoặc cả hai.
- Xử lý ngày 30 ở tháng chỉ có 29 ngày: chuyển về ngày cuối tháng hoặc bỏ qua.
- Gia phả tưởng nhớ: đời thứ, chi/nhánh, liên kết thế hệ cha/mẹ.
- Miền ký ức: tiểu sử, câu chuyện và ghi chú ngày giỗ.
- **Trang riêng cho từng người đã khuất** tại `#person/<id>`: ảnh đại diện lớn, album ảnh, tiểu sử, ký ức của con cháu, ngày giỗ sắp tới, điểm danh và liên kết sang cha/mẹ, con cháu. Có địa chỉ thật nên gửi link cho người trong họ hoặc lưu lại được.
- Album ảnh cho mỗi người (tối đa 40 ảnh), chọn ảnh đại diện, đặt chú thích; nén ngay trên máy người dùng và tự xóa EXIF, kể cả tọa độ GPS.
- Miền ký ức mở cho cả nhà: thành viên gửi kỷ niệm, người quản lý duyệt trước khi hiển thị.
- Điểm danh ngày giỗ: ai về được, ai chưa chắc, kèm lời nhắn cho gia đình.
- Ngày lệ của dòng họ: Tết, rằm tháng Giêng, Giỗ Tổ, Vu Lan, Trung thu, ông Công ông Táo, mùng 1 và rằm hằng tháng — bật tắt theo nếp từng nhà.
- **Khách xem được phần tưởng nhớ** mà không cần đăng nhập: gia phả, lịch ngày giỗ, ảnh, ký ức đã duyệt. Đặt `PUBLIC_VIEW=false` để đóng lại như cũ.
- **Người còn sống thì không công khai**: email, số điện thoại, danh sách thành viên, điểm danh, lời mời và cài đặt nhắc luôn phải đăng nhập, kể cả khi đang mở cho khách.
- Hai đường đăng nhập: **email + mật khẩu quản lý** (`ADMIN_EMAIL` + `ADMIN_PASSWORD`, không cần tới hộp thư) và **mã OTP** gửi qua email. Lần đăng nhập đầu bằng mật khẩu dựng luôn dòng họ, nên dựng được hệ thống mà chưa cần cấu hình mail.
- Quản lý mời thành viên bằng link, đổi quyền hoặc thu hồi truy cập.
- Lời nhắc cá nhân theo email: đúng ngày, trước 1, 3, 7, 14 hoặc 30 ngày, theo giờ Việt Nam. Gửi qua **Brevo** (HTTPS, hợp serverless) hoặc **SMTP**.
- **Lịch đăng ký cho điện thoại**: link `webcal://` riêng cho từng người, kèm báo thức `VALARM` đúng theo cài đặt nhắc. Xem mục bên dưới.
- Thùng rác: xóa người thân là ẩn đi trước, khôi phục được, chỉ mất hẳn khi xóa lần hai.
- Xuất toàn bộ dữ liệu dòng họ ra JSON cho gia đình tự giữ.
- **Nhật ký quản trị**: ghi lại tài khoản mới, lần đăng nhập (kể cả lần trượt), lời mời, đổi quyền và thu hồi truy cập. Xem trong *Tài khoản → Dữ liệu & thùng rác*. Đây là **bảng trong cơ sở dữ liệu chứ không phải tệp `.log`** — nền serverless có đĩa chỉ đọc nên không ghi tệp được. Địa chỉ IP lưu dưới dạng băm; bản ghi quá một năm được dọn tự động.
- Cài được lên màn hình chính điện thoại: có `manifest.webmanifest`, bộ icon, `apple-touch-icon` và service worker.
- Chế độ dữ liệu mẫu trong development để xem giao diện nhanh; không gửi email thật.
- WebMCP (feature-detect): expose thao tác xem ngày giỗ và lưu cài đặt nhắc lịch cho tác nhân hỗ trợ.

## Chạy local

Yêu cầu Node.js **24+** (dùng `.nvmrc`).

```bash
cp .env.example .env
npm install
npm run build
npm start
```

Mở `http://localhost:3001`.

Trong môi trường development, màn hình đăng nhập có hai nút dữ liệu mẫu:

- **Người quản lý**: được thêm/sửa/xóa ngày giỗ, mời và phân quyền.
- **Thành viên**: xem lịch, ký ức và cài lời nhắc; không được sửa dữ liệu dòng họ.

Muốn chạy cả API và Vite hot reload:

```bash
npm run dev
```

Mở `http://localhost:5173`.

## Đưa lên mạng

Cội chạy được trên hai kiến trúc, tự nhận theo biến môi trường — không có cờ bật/tắt nào:

- **Vercel + Neon Postgres + Vercel Blob** — có `DATABASE_URL` thì dùng Postgres, có `BLOB_READ_WRITE_TOKEN` thì ảnh vào Blob, và `/api/cron/reminders` thay cho bộ quét thường trú.
- **Railway / VPS + SQLite** — không khai hai biến trên thì Cội dùng tệp SQLite và thư mục ảnh trên đĩa, cùng một tiến trình quét mỗi 60 giây.

Toàn bộ bộ test chạy trên **cả hai** engine. Xem [DEPLOY.md](DEPLOY.md) để đi từng bước.

## Cấu hình production

Sao chép `.env.example` thành `.env` và đặt tối thiểu:

```dotenv
NODE_ENV=production
APP_URL=https://ten-mien-cua-ban.example
APP_SECRET=chuoi-ngau-nhien-it-nhat-32-ky-tu
ADMIN_EMAIL=email-khoi-tao-dong-ho@example.com
ADMIN_PASSWORD=mat-khau-quan-ly-it-nhat-8-ky-tu
MAIL_DRIVER=brevo
BREVO_API_KEY=...
BREVO_TU_EMAIL=dia-chi-da-xac-minh@example.com
REMINDERS_ENABLED=true
TRUST_PROXY=false
```

`APP_URL` phải là HTTPS trong production. Phải còn ít nhất **một đường vào**: `ADMIN_PASSWORD`, hoặc `MAIL_DRIVER=smtp`/`brevo` để gửi mã OTP — Cội từ chối khởi động nếu không có đường nào. `ADMIN_EMAIL` là địa chỉ duy nhất có thể khởi tạo dòng họ đầu tiên bằng OTP. Người quản lý sau đó tạo link mời trong mục **Thành viên**; link chỉ hiển thị một lần, hết hạn sau 7 ngày và nên gửi qua kênh riêng cho đúng người thân.

`MAIL_DRIVER` nhận ba giá trị:

- `preview` — không gửi ra ngoài: **in toàn bộ thư ra console** (nên đọc được mã OTP ngay trong log, kể cả trên serverless) và ghi thêm tệp `.eml` vào `data/mail/` khi đĩa cho phép. Đĩa chỉ đọc thì chỉ bỏ phần ghi tệp, thư vẫn hiện trong log.
- `brevo` — gọi `api.brevo.com` qua HTTPS. Không cần cổng SMTP hay App Password, nên hợp Vercel nhất. Cần `BREVO_API_KEY` và `BREVO_TU_EMAIL` (địa chỉ đã xác minh trong Brevo → Senders).
- `smtp` — nhà cung cấp SMTP của bạn, qua `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`.

Không bật lời nhắc email thì đặt `REMINDERS_ENABLED=false`; báo thức trên lịch điện thoại vẫn chạy vì nó nổ trên máy người dùng, không cần máy chủ gửi gì.

Khi dùng reverse proxy, chỉ bật `TRUST_PROXY=true` nếu máy chủ thật sự đứng sau đúng một proxy đáng tin cậy.

## Nối lịch vào điện thoại

Mỗi thành viên có một link lịch riêng trong **Tài khoản → Nhắc lịch & điện thoại**:

- Feed nằm ở `/api/calendar/<token>/lich-ngay-gio.ics`, không cần đăng nhập vì bản thân token là chìa khóa. Token sinh ngẫu nhiên 32 byte, thu hồi bằng nút **Tạo link mới**.
- Feed trải **5 năm** ngày giỗ và ngày lệ, nên điện thoại không bao giờ hết ngày để hiện.
- Mỗi sự kiện kèm `VALARM` dựng từ đúng cài đặt nhắc của người đó, nên điện thoại tự đổ chuông kể cả khi mất mạng và không phụ thuộc SMTP.
- `SEQUENCE` lấy từ `ancestors.revision`, tăng mỗi lần sửa, để lịch đã đăng ký cập nhật đúng thay vì nhân bản sự kiện.

Hai điều cần nói đúng với người dùng:

- **Apple Calendar giữ báo thức** trong feed. **Google Calendar bỏ qua `VALARM`** — người dùng phải tự đặt thông báo cho lịch vừa thêm. Giao diện đã ghi rõ điều này.
- Các máy làm mới feed sau vài giờ đến một ngày (`REFRESH-INTERVAL` đề nghị 12 giờ). Sửa ngày giỗ xong sẽ **không** thấy đổi ngay lập tức.

Link feed để lộ tên người thân, ngày giỗ và địa điểm cho bất kỳ ai cầm được nó. Đây là đánh đổi bắt buộc để lịch tự cập nhật mà không phải đăng nhập lại; bù lại link thu hồi được bất cứ lúc nào.

## Nạp danh sách người thân

`scripts/gia-pha.json` giữ danh sách người thân của dòng họ. Sửa file rồi chạy:

```bash
npm run import
```

Script chỉ thêm người chưa có (so theo tên) nên chạy lại bao nhiêu lần cũng không tạo trùng. Nếu cơ sở dữ liệu chưa có dòng họ nào, script tạo dòng họ theo `FAMILY_NAME` và tài khoản quản lý theo `ADMIN_EMAIL`. Mỗi bản ghi đi qua đúng bộ kiểm tra của API, và script in ra ngày giỗ dương lịch gần nhất của từng người để đối chiếu.

Ngày trong file là **âm lịch**, `death_year` cũng là **năm âm lịch**. Trường `parent` ghi tên người thuộc thế hệ trước để dựng cây gia phả; để `null` nếu chưa rõ.

**File này chứa tên người thật trong dòng họ.** Repository phải để ở chế độ riêng tư.

## Cài lên màn hình chính

`public/sw.js` cố tình làm hẹp: **không bao giờ cache bất cứ thứ gì dưới `/api/`** — gia phả, ảnh, lịch và phiên đăng nhập luôn lấy mới. Nó chỉ giữ vỏ ứng dụng (lấy mạng trước, cache chỉ dùng khi mất mạng) và các tệp build có hash trong tên, vốn không thể cũ dưới chính tên đó. Service worker chỉ đăng ký trong bản build thật, không chạy khi `npm run dev`.

- iPhone: Safari → Chia sẻ → **Thêm vào MH chính**. Không cần service worker.
- Android: Chrome sẽ mời cài khi truy cập qua HTTPS.

Service worker bắt buộc chạy trên HTTPS (hoặc `localhost`). Trình duyệt xem trước nhúng trong Claude Code chặn đăng ký service worker, nên phần này **chưa được kiểm chứng trên trình duyệt thật** — sau khi triển khai, hãy mở DevTools → Application → Service Workers để xác nhận.

## Dữ liệu và sao lưu

- Dữ liệu SQLite nằm ở `DATABASE_PATH` (mặc định `data/coi.sqlite`). Thư mục `data/` không được commit.
- **Ảnh chân dung nằm ngoài SQLite**, ở `UPLOAD_DIR` (mặc định `data/uploads`). `npm run backup` sao lưu cả hai; nếu bạn tự viết quy trình sao lưu khác, đừng quên thư mục ảnh — mất nó là mất thứ không tạo lại được.
- Trước khi sao lưu, nên dừng tiến trình Cội để bản sao dễ kiểm tra:

```bash
npm run backup
```

- File sao lưu được ghi vào `backups/` (có thể đổi bằng `BACKUP_DIR`). Hãy mã hóa và lưu bản sao ở nơi riêng tư; cơ sở dữ liệu chứa email và thông tin dòng họ.
- Không dùng `DEMO_MODE=true` trong production. Dữ liệu mẫu chỉ để xem giao diện local.

## Test và build

```bash
npm test                                   # SQLite
DATABASE_URL="postgresql://..." npm run test:pg   # Postgres
npm run build
```

Bộ test dùng một schema riêng cho mỗi lần chạy nên không đụng dữ liệu thật, nhưng **hãy trỏ vào một branch Neon riêng cho test**, đừng dùng chung database với bản chạy thật.

Bộ test bao phủ chuyển đổi lịch Việt Nam, Tết/Trung thu, tháng nhuận, tháng thiếu, ranh giới UTC+7, OTP dùng một lần, quyền quản lý/thành viên, cô lập dòng họ, lời mời bị thu hồi, xuất iCalendar và chống gửi nhắc lặp.

`tests/features.test.js` phủ thêm: feed lịch theo token và việc thu hồi token, báo thức `VALARM` khớp cài đặt nhắc, các mốc nhắc mở rộng, ngày lệ dòng họ, tải và phân quyền ảnh (kể cả chặn tệp giả dạng ảnh và ảnh của dòng họ khác), ký ức chờ duyệt, điểm danh ngày giỗ, thùng rác và khôi phục, chia sẻ số điện thoại, xuất JSON.

## Đưa lên GitHub

1. Tạo repository riêng, ví dụ `coi-family`.
2. Chép toàn bộ thư mục này lên repository (không chép `node_modules/`, `data/`, `backups/` và `.env`).
3. Trên máy chạy production, tạo `.env` riêng theo phần cấu hình bên trên.
4. Chạy `npm ci` (sau khi lockfile đã được commit), `npm run build`, rồi `npm start`.

Repo này chứa cả source (`src/`, `server/`, `shared/`) và cấu hình Vite. `dist/` là output build; có thể build lại bất kỳ lúc nào.

**GitHub là nơi lưu mã nguồn, không phải máy chủ chạy app này.** Cội cần Node.js, SQLite và một SMTP server để đăng nhập/lưu dữ liệu/gửi email. GitHub Pages chỉ phục vụ file tĩnh nên không chạy được API, tài khoản và lời nhắc. Sau khi push GitHub, hãy triển khai repository lên một máy chủ Node hoặc nền tảng có persistent disk (VPS, Render, Railway, Fly.io hoặc máy chủ riêng), cấu hình biến môi trường production và bật một tiến trình chạy liên tục cho `npm start`.

Nếu chỉ muốn xem giao diện tĩnh, có thể chạy `npm run build` rồi dùng nội dung `dist/`; phần đó không có đăng nhập, database hay email.

## Lưu ý nghiệp vụ

Ngày lệ của dòng họ (Tết, rằm, Giỗ Tổ…) chỉ hiện trên lịch trong app và trong feed đã đăng ký, **không gửi email**. Đây là lựa chọn có chủ ý: bật mùng 1 và rằm hằng tháng sẽ thành 24 email mỗi năm cho mỗi người. Nếu dòng họ thật sự muốn email cho ngày lệ, cần cho `mail_deliveries.ancestor_id` nhận `NULL` và thêm khóa theo ngày lệ.

Âm lịch được lưu dưới dạng ngày/tháng âm và được tính lại thành ngày dương cho từng năm, không copy cố định ngày dương của năm hiện tại. Với ngày 30 trong tháng thiếu, lựa chọn “chuyển về ngày cuối tháng” chỉ là quy ước hiển thị/nhắc lịch của gia đình; hãy xác nhận tập quán của dòng họ trước khi bật gửi email tự động.

Thông tin trong dữ liệu mẫu (tên, địa điểm, tiểu sử) chỉ là nội dung minh họa. Hãy xóa hoặc thay thế trước khi dùng thật.
