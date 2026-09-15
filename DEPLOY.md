# Đưa Cội lên mạng — từ A tới Z

Cội chạy được trên **hai kiến trúc**. Chọn một, đừng trộn.

| | Vercel + Neon + Blob | Railway (hoặc VPS) |
|---|---|---|
| Cơ sở dữ liệu | Neon Postgres | SQLite trên volume |
| Ảnh | Vercel Blob | Thư mục trên volume |
| Nhắc email | Vercel Cron | Tiến trình quét mỗi 60 giây |
| Chi phí | Có gói miễn phí | ~5 đô/tháng |
| Số dịch vụ phải trông | 3 | 1 |
| Email nhắc buổi tối | **Hỏng ở gói Hobby** (xem §7) | Đúng giờ |

Báo thức trên lịch điện thoại chạy **trên máy người dùng**, nên nó đúng giờ ở cả hai kiến trúc. Chỉ email mới phụ thuộc nơi chạy.

---

## 1. Lấy khóa trước

### 1.1 `APP_SECRET`

Cội dùng nó để ký mã OTP. Chạy trên máy bạn:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Đừng commit.** Chỉ dán vào biến môi trường của nhà cung cấp.

### 1.2 Gửi email — chọn Brevo hoặc Gmail

**Brevo (khuyên dùng, nhất là trên Vercel).** Gọi qua HTTPS nên không đụng cổng SMTP, không cần App Password, và không bị chặn ở môi trường serverless. Miễn phí 300 thư/ngày, chỉ cần xác minh **một địa chỉ người gửi** chứ không cần sở hữu tên miền.

1. `brevo.com` → đăng ký.
2. **Senders & IP → Senders** → thêm email của bạn và bấm xác minh trong hộp thư.
3. **Settings → SMTP & API → API Keys** → tạo khóa.

```dotenv
MAIL_DRIVER=brevo
BREVO_API_KEY=<khóa vừa tạo>
BREVO_TU_EMAIL=<email đã xác minh ở bước 2>
BREVO_TU_TEN=Dòng họ Đỗ
```

**Gmail (cách còn lại).** Cần App Password — xem dưới.

Không có SMTP thì **không ai đăng nhập được**, kể cả bạn — Cội đăng nhập bằng mã OTP gửi qua email.

1. `myaccount.google.com` → **Security** → bật **2-Step Verification** (không bật thì không tạo được App Password).
2. Vào `myaccount.google.com/apppasswords`, tạo một cái tên `Coi`.
3. Google trả về **16 ký tự** — đây là `SMTP_PASS`. Xóa hết dấu cách khi dán.

Đây không phải mật khẩu Gmail của bạn; thu hồi riêng được, không ảnh hưởng tài khoản.

### 1.3 `CRON_SECRET` (chỉ Vercel)

Sinh y như `APP_SECRET`. Endpoint `/api/cron/reminders` **từ chối mọi lời gọi** không kèm đúng chữ ký này — nếu để trống, endpoint đóng hoàn toàn. Có test riêng cho điều đó.

### 1.4 `ADMIN_EMAIL`

Địa chỉ **duy nhất** được phép khởi tạo dòng họ lần đầu. Sau đó bạn mời người khác bằng link mời trong mục Thành viên.

---

## 2. Đường Vercel + Neon + Blob

### 2.1 Tạo Neon

1. `neon.tech` → tạo project → copy **connection string** (dạng `postgresql://...`).
2. Dùng chuỗi **pooled** (có `-pooler` trong tên máy chủ) — đó là chuỗi hợp với serverless.

Không cần tự tạo bảng. Cội tự dựng toàn bộ schema và tự chạy migration khi khởi động lần đầu.

### 2.2 Tạo project trên Vercel

1. `vercel.com` → **Add New → Project** → chọn repo GitHub.
2. `vercel.json` trong repo đã khai sẵn build, thư mục xuất, đường dẫn và lịch cron. Không cần chỉnh gì trong giao diện.
3. Vào tab **Storage** → tạo một **Blob store** và gắn vào project. Vercel tự thêm biến `BLOB_READ_WRITE_TOKEN`.

### 2.3 Biến môi trường

```dotenv
NODE_ENV=production
APP_URL=https://<ten-app>.vercel.app
FAMILY_NAME=Dòng họ Đỗ

DATABASE_URL=<connection string pooled của Neon>
APP_SECRET=<chuỗi 64 ký tự>
CRON_SECRET=<chuỗi 64 ký tự khác>
ADMIN_EMAIL=<email quản lý>

MAIL_DRIVER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<gmail cua ban>@gmail.com
SMTP_PASS=<16 ky tu app password>
MAIL_FROM=Cội <<gmail cua ban>@gmail.com>

REMINDERS_ENABLED=true
TRUST_PROXY=true
DEMO_MODE=false
```

`BLOB_READ_WRITE_TOKEN` do Vercel tự thêm khi bạn gắn Blob store — không cần gõ tay.

Khi `DATABASE_URL` có giá trị, Cội dùng Postgres và bỏ qua `DATABASE_PATH`. Khi `BLOB_READ_WRITE_TOKEN` có giá trị, ảnh đi vào Blob và bỏ qua `UPLOAD_DIR`. Không cần cờ bật/tắt nào khác.

---

## 3. Đường Railway (đơn giản hơn)

1. **New Project → Deploy from GitHub repo**.
2. **Gắn volume, mount vào `/data`.** Bỏ bước này là mỗi lần deploy mất sạch gia phả và ảnh.
3. Biến môi trường: giống khối trên nhưng **bỏ** `DATABASE_URL` và `CRON_SECRET`, thêm:

```dotenv
DATABASE_PATH=/data/coi.sqlite
UPLOAD_DIR=/data/uploads
BACKUP_DIR=/data/backups
```

Không cần cron: `npm start` chạy sẵn bộ quét mỗi 60 giây.

---

## 4. Đăng nhập lần đầu và nạp gia phả

1. Mở `APP_URL`. Phải thấy màn hình đăng nhập, **không có** nút dữ liệu mẫu.
2. Nhập `ADMIN_EMAIL` → lấy mã 6 số trong hộp thư → đăng nhập. Cội tạo dòng họ theo `FAMILY_NAME` và cho bạn quyền quản lý.
3. Nạp danh sách người thân — chạy trên máy bạn, trỏ thẳng vào database production:

```bash
DATABASE_URL="<chuỗi Neon>" ADMIN_EMAIL="<email quản lý>" npm run import
```

Script chỉ thêm người chưa có nên chạy lại bao nhiêu lần cũng không tạo trùng. Với Railway thì thêm tay qua giao diện, hoặc mở shell vào service rồi chạy `npm run import`.

4. **Thành viên → Mời thành viên** để tạo link mời. Link chỉ hiện một lần, sống 7 ngày, gửi riêng cho đúng người.

---

## 5. Kiểm tra sau khi deploy

- [ ] **Đăng nhập được** bằng mã OTP gửi tới hộp thư thật.
- [ ] **Ảnh**: tải một ảnh lên rồi mở lại. Trên Vercel, ảnh nằm trong Blob nhưng vẫn đi qua `/api/photos/:id` có kiểm tra đăng nhập — dán link ảnh vào cửa sổ ẩn danh phải ra lỗi, không ra ảnh.
- [ ] **Lịch điện thoại**: *Tài khoản → Nhắc lịch & điện thoại*, mở link `webcal://` **ngay trên điện thoại**. iPhone phải hiện hộp thoại đăng ký lịch.
- [ ] **Báo thức**: bật nhắc lịch **trước** khi đăng ký feed. Apple giữ nguyên báo thức của Cội; **Google Calendar bỏ qua chúng**, phải vào cài đặt lịch vừa thêm để đặt thông báo riêng.
- [ ] **Cron** (Vercel): gọi thử `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/reminders` — phải trả về `{"sent":...,"failed":...}`. Gọi không kèm header phải ra 401.
- [ ] **Deploy lại lần nữa rồi xem gia phả còn nguyên không.** Với Railway đây là cách duy nhất chắc chắn volume đã gắn đúng. **Làm trước khi nhập dữ liệu thật.**

---

## 6. Sao lưu

**Neon**: dùng **Branches** để tạo nhánh ảnh chụp, hoặc `pg_dump "$DATABASE_URL" > coi.sql` nếu muốn tệp rời. Ảnh nằm trong Vercel Blob và do Vercel lưu giữ.

**Railway/VPS**: `npm run backup` chép cả file SQLite lẫn thư mục ảnh vào `BACKUP_DIR`. Nhưng `BACKUP_DIR` nằm **trên cùng ổ đĩa** với dữ liệu gốc — định kỳ tải bản sao về máy.

Ở cả hai kiến trúc, quản lý luôn tải được toàn bộ dữ liệu dạng JSON trong *Tài khoản → Dữ liệu & thùng rác*. Tệp đó **không chứa ảnh**.

---

## 7. Điều cần biết về Vercel Cron

Gói **Hobby chỉ chạy cron một lần mỗi ngày**. `vercel.json` đang đặt 00:00 UTC, tức **07:00 giờ Việt Nam**.

Hệ quả: ai đặt giờ nhắc **muộn hơn 07:00** sẽ không nhận được email đúng ngày giỗ — lịch chạy lúc 7 giờ sáng thấy chưa tới giờ của họ, mà tới lần chạy sau thì ngày giỗ đã qua.

Ba cách xử lý:
- **Bảo cả nhà đặt giờ nhắc từ 07:00 trở về trước.** Miễn phí, không sửa gì.
- **Lên Vercel Pro** để chạy cron dày hơn, ví dụ mỗi giờ: sửa `"schedule"` trong `vercel.json` thành `"0 * * * *"`.
- **Dựa vào báo thức trên lịch điện thoại**, vốn không dính giới hạn này chút nào.

Đổi giờ chạy cron thì sửa trường `schedule` trong `vercel.json` theo cú pháp cron chuẩn, **tính theo UTC**.

---

## 8. Một cái bẫy của Neon, đã xử lý sẵn

Neon dùng bộ gộp kết nối (PgBouncer) và **tái sử dụng kết nối giữa các ứng dụng khác nhau**. Một `SET search_path` do client khác để lại có thể bám vào kết nối mà app bạn nhận được, trỏ app vào một schema không tồn tại — lỗi này đã thực sự xảy ra trong lúc phát triển.

`server/db.js` vì thế **luôn đặt `search_path` tường minh** trên mỗi kết nối vật lý, không bao giờ tin giá trị sẵn có. Bạn không phải làm gì, chỉ cần biết để đừng gỡ dòng đó.

Cũng vì vậy, **đừng dùng chung một database Neon cho cả chạy thật lẫn chạy test**. Tạo một branch riêng trên Neon cho test.
