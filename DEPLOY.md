# Đưa Cội lên mạng — từ A tới Z

Hướng dẫn này đi từ repo trống tới lúc điện thoại trong nhà đổ chuông đúng ngày giỗ.

---

## 0. Cội cần gì ở nơi chạy

Chỉ hai điều, nhưng hai điều này quyết định chọn nhà cung cấp nào:

1. **Ổ đĩa giữ được file qua mỗi lần deploy.** Cội lưu dữ liệu trong một file SQLite và ảnh chân dung thành file riêng. Nơi nào dùng ổ đĩa tạm là mỗi lần deploy mất sạch gia phả lẫn ảnh.
2. **Tiến trình chạy liên tục.** Bộ gửi nhắc quét mỗi 60 giây. Gói nào "ngủ khi không ai truy cập" sẽ ngủ qua đúng giờ cần nhắc.

| Nơi chạy | Được không | Vì sao |
|---|---|---|
| **Railway** (có volume) | ✅ Nên dùng | Nối thẳng GitHub, push là deploy, có volume thật |
| **Fly.io** (có volume) | ✅ | Được, phải viết `fly.toml` |
| **Render** bản trả phí + Persistent Disk | ✅ | Bản **free thì hỏng cả hai điều kiện** |
| **VPS** (Hetzner, DigitalOcean, AZDIGI…) | ✅ | Tự chủ nhất, cũng nhiều việc nhất |
| **Vercel / Netlify / Cloudflare Pages** | ❌ | Serverless: không giữ được file, không nuôi được tiến trình |

Phần còn lại của tài liệu này đi theo **Railway** vì nó gần cảm giác Vercel nhất.

---

## 1. Lấy khóa và mật khẩu trước

Chuẩn bị sẵn ba thứ này rồi hẵng vào Railway, đỡ phải quay đi quay lại.

### 1.1 `APP_SECRET` — chuỗi bí mật của riêng bạn

Cội dùng nó để ký mã OTP. Chạy trên máy bạn:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy chuỗi 64 ký tự nhận được. **Đừng commit nó vào repo**, chỉ dán vào biến môi trường trên Railway.

Đổi chuỗi này về sau sẽ làm mọi mã OTP đang chờ mất hiệu lực (phiên đăng nhập thì vẫn còn).

### 1.2 App Password của Gmail — để gửi mã đăng nhập

Không có SMTP thì **không ai đăng nhập được**, kể cả bạn. Cội đăng nhập bằng mã OTP gửi qua email.

1. Vào `myaccount.google.com` → **Security**.
2. Bật **2-Step Verification** nếu chưa bật. Không bật thì Google không cho tạo App Password.
3. Vào `myaccount.google.com/apppasswords`.
4. Tạo một App Password, đặt tên gì cũng được (ví dụ `Coi`).
5. Google trả về **16 ký tự**. Đây là `SMTP_PASS`. Xóa hết dấu cách khi dán.

Đây không phải mật khẩu Gmail của bạn — nó là mật khẩu riêng chỉ dùng để gửi mail, thu hồi được bất cứ lúc nào mà không ảnh hưởng tài khoản.

Gmail miễn phí cho khoảng 500 mail/ngày, thừa sức cho một dòng họ. Muốn chuyên nghiệp hơn thì dùng Brevo (300 mail/ngày miễn phí) hoặc Resend (cần tên miền riêng).

### 1.3 Email quản lý

`ADMIN_EMAIL` là địa chỉ **duy nhất** được phép khởi tạo dòng họ lần đầu. Sau khi vào rồi, bạn mời người khác bằng link mời trong mục Thành viên.

---

## 2. Tạo service trên Railway

1. `railway.app` → đăng nhập bằng GitHub.
2. **New Project → Deploy from GitHub repo** → chọn repo của bạn.
3. Railway tự nhận đây là dự án Node và chạy `npm install` + `npm start`. Nếu cần khai báo tay:
   - Build: `npm ci && npm run build`
   - Start: `npm start`

Đừng đặt `PORT` — Railway tự cấp, và `server/index.js` đã đọc `process.env.PORT`.

---

## 3. Gắn volume — bước quan trọng nhất

**Bỏ qua bước này là mất toàn bộ dữ liệu mỗi lần deploy.**

1. Trong service → **Variables / Settings** → thêm **Volume**.
2. Mount path: `/data`

Sau đó mọi thứ cần bền được trỏ vào đó qua biến môi trường ở bước sau (`/data/coi.sqlite`, `/data/uploads`).

---

## 4. Điền biến môi trường

Dán nguyên khối này vào phần Variables của Railway, sửa lại các chỗ `<...>`:

```dotenv
NODE_ENV=production
APP_URL=https://<ten-app>.up.railway.app
FAMILY_NAME=Dòng họ Đỗ

DATABASE_PATH=/data/coi.sqlite
UPLOAD_DIR=/data/uploads
BACKUP_DIR=/data/backups

APP_SECRET=<chuỗi 64 ký tự ở bước 1.1>
ADMIN_EMAIL=<email quản lý của bạn>

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

Vài chỗ dễ sai:

- **`APP_URL` phải là HTTPS** và phải đúng tên miền thật. Link lịch `webcal://` được dựng từ đây; sai là điện thoại không đăng ký được.
- **`TRUST_PROXY=true`** vì Railway đứng trước app bằng một proxy. Không bật thì mọi người dùng bị tính chung một địa chỉ IP, và giới hạn chống dò mã OTP sẽ khóa nhầm cả nhà.
- **`SMTP_SECURE=false`** là đúng với cổng 587 — Cội sẽ dùng STARTTLS. Chỉ đặt `true` nếu nhà cung cấp bắt dùng cổng 465.
- **`DEMO_MODE=false`**: thật ra ở production Cội tự từ chối khởi động nếu bật, nhưng cứ ghi rõ cho chắc.

Cội **cố tình không chịu khởi động** nếu thiếu: `APP_SECRET` dưới 32 ký tự, `APP_URL` không phải HTTPS, `MAIL_DRIVER` khác `smtp`, hoặc thiếu `ADMIN_EMAIL`. Nếu app không lên, mở log là thấy nó nói thiếu cái gì — đó là tính năng, không phải lỗi.

---

## 5. Đăng nhập lần đầu và nạp gia phả

1. Mở `APP_URL`. Phải thấy màn hình đăng nhập, **không có** nút dữ liệu mẫu.
2. Nhập `ADMIN_EMAIL` → bấm nhận mã.
3. Mở hộp thư, lấy mã 6 số, nhập vào. Lúc này Cội tạo dòng họ theo `FAMILY_NAME` và cho bạn quyền quản lý.
4. Nạp danh sách người thân — chọn một trong hai:
   - Nếu Railway cho mở shell vào service: chạy `npm run import`.
   - Không thì thêm tay qua giao diện. Với vài người thì nhanh hơn là loay hoay.
5. Vào **Thành viên → Mời thành viên** để tạo link mời cho người trong nhà. Link chỉ hiện một lần, sống 7 ngày, gửi riêng cho đúng người.

---

## 6. Kiểm tra sau khi deploy

Làm đủ năm mục này rồi hãy báo cho cả nhà:

- [ ] **Đăng nhập được** bằng mã OTP gửi tới hộp thư thật.
- [ ] **Lịch điện thoại**: vào *Tài khoản → Nhắc lịch & điện thoại*, mở link `webcal://` **ngay trên điện thoại**. iPhone phải hiện hộp thoại hỏi đăng ký lịch. Sau đó kiểm tra ngày giỗ đã hiện trong app Lịch.
- [ ] **Báo thức**: bật nhắc lịch trước khi đăng ký feed. Apple giữ nguyên báo thức của Cội; **Google Calendar bỏ qua chúng** nên phải vào cài đặt của lịch vừa thêm để đặt thông báo riêng.
- [ ] **Cài lên màn hình chính**: iPhone dùng Safari → Chia sẻ → Thêm vào MH chính. Android thì Chrome sẽ tự mời. Kiểm tra service worker bằng DevTools → Application → Service Workers.
- [ ] **Deploy lại một lần nữa** rồi vào xem gia phả còn nguyên không. Đây là cách duy nhất chắc chắn volume đã gắn đúng. **Làm bước này trước khi nhập dữ liệu thật.**

---

## 7. Sao lưu

```bash
npm run backup
```

Lệnh này chép cả file SQLite lẫn thư mục ảnh vào `BACKUP_DIR`. Nhưng `BACKUP_DIR` nằm **trên cùng ổ đĩa** với dữ liệu gốc — hỏng ổ là mất cả hai. Định kỳ tải bản sao về máy hoặc đẩy lên nơi khác.

Quản lý cũng tải được toàn bộ dữ liệu dạng JSON trong *Tài khoản → Dữ liệu & thùng rác*. File JSON đó **không chứa ảnh** — ảnh chỉ nằm trong bản sao lưu ở trên.

---

## 8. Còn Postgres và Neon thì sao?

Dùng được, nhưng **không nên**, vì ba lý do:

**Thứ nhất, Neon không giải quyết vấn đề ảnh.** Neon là cơ sở dữ liệu, không lưu file. Ảnh chân dung vẫn là file trong `UPLOAD_DIR`. Nên bạn vẫn cần volume — mà đã có volume rồi thì SQLite nằm luôn trên đó là xong, thêm Neon chẳng bớt được gì.

**Thứ hai, đây là một cuộc viết lại thật sự.** Cội dùng `node:sqlite` chạy đồng bộ. Postgres thì bất đồng bộ. Trong mã hiện tại có:

- **131** lời gọi `db.prepare`
- **8** khối `transaction()`
- **6** lời gọi `db.exec`

trải trên `server/app.js`, `server/db.js`, `server/reminders.js`, `server/security.js`, `server/seed.js`, `scripts/backup.js`, `scripts/import.js`. Tất cả phải chuyển sang `async/await`, kèm viết lại cơ chế migration. Phần dễ sai nhất lại đúng là phần nhạy cảm nhất: xác thực OTP, giới hạn số lần thử, cô lập dòng họ.

**Thứ ba, quy mô không cần tới.** Một dòng họ vài chục người, vài chục bản ghi. SQLite thừa sức, và nó chỉ là một file — sao lưu bằng một lệnh.

**Khi nào Postgres mới đáng:** nếu muốn một bản cài chạy cho nhiều dòng họ khác nhau với lượng ghi đồng thời thật, hoặc muốn sao lưu tự động có quản lý mà không đụng tới volume.

Nếu vẫn muốn Vercel + Neon thì phải làm đủ ba việc: viết lại tầng dữ liệu sang Postgres, chuyển lưu ảnh sang object storage (S3/R2), và thay bộ quét 60 giây bằng Vercel Cron — mà Cron gói Hobby chỉ chạy **một lần mỗi ngày**, nghĩa là ai chọn giờ nhắc buổi tối sẽ nhận muộn mất một ngày.
