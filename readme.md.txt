


Cội · Gìn giữ nếp nhà
Cội là một web app cho dòng họ: lưu ngày giỗ theo âm lịch Việt Nam, hiển thị ngày dương tương ứng, giữ thông tin và ký ức về người thân, mời thành viên và gửi lời nhắc email.

Có gì trong bản này
Giao diện responsive theo concept Cội: nền olive đen, vàng champagne, typography Lora + Manrope.

Dashboard tổng quan và lịch tháng âm/dương.

Tra ngày giỗ lặp hằng năm theo âm lịch Việt Nam (UTC+7).

Xử lý tháng nhuận: tháng thường, ưu tiên tháng nhuận hoặc cả hai.

Xử lý ngày 30 ở tháng chỉ có 29 ngày: chuyển về ngày cuối tháng hoặc bỏ qua.

Gia phả tưởng nhớ: đời thứ, chi/nhánh, liên kết thế hệ cha/mẹ.

Miền ký ức: tiểu sử, câu chuyện và ghi chú ngày giỗ.

Đăng nhập không dùng mật khẩu: mã OTP một lần gửi qua email.

Dòng họ riêng tư: chỉ tài khoản được mời mới vào được; quản lý có thể mời, đổi quyền hoặc thu hồi thành viên.

Lời nhắc cá nhân theo email: trước 7 ngày, trước 3 ngày hoặc đúng ngày, theo giờ Việt Nam.

Xuất .ics để thêm toàn bộ lịch ngày giỗ vào Google Calendar / Apple Calendar / Outlook.

Chế độ dữ liệu mẫu trong development để xem giao diện nhanh; không gửi email thật.

WebMCP (feature-detect): expose thao tác xem ngày giỗ và lưu cài đặt nhắc lịch cho tác nhân hỗ trợ.

Chạy local
Yêu cầu Node.js 24+ (dùng .nvmrc).

cp .env.example .env
npm install
npm run build
npm start
Mở http://localhost:3001.

Trong môi trường development, màn hình đăng nhập có hai nút dữ liệu mẫu:

Người quản lý: được thêm/sửa/xóa ngày giỗ, mời và phân quyền.

Thành viên: xem lịch, ký ức và cài lời nhắc; không được sửa dữ liệu dòng họ.

Muốn chạy cả API và Vite hot reload:

npm run dev
Mở http://localhost:5173.

Cấu hình production
Sao chép .env.example thành .env và đặt tối thiểu:

NODE_ENV=production
APP_URL=https://ten-mien-cua-ban.example
APP_SECRET=chuoi-ngau-nhien-it-nhat-32-ky-tu
ADMIN_EMAIL=email-khoi-tao-dong-ho@example.com
MAIL_DRIVER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=Cội <no-reply@ten-mien-cua-ban.example>
REMINDERS_ENABLED=true
TRUST_PROXY=false
APP_URL phải là HTTPS trong production. ADMIN_EMAIL là địa chỉ duy nhất có thể khởi tạo dòng họ đầu tiên bằng OTP. Người quản lý sau đó tạo link mời trong mục Thành viên; link chỉ hiển thị một lần, hết hạn sau 7 ngày và nên gửi qua kênh riêng cho đúng người thân.

MAIL_DRIVER=preview chỉ dành cho local: email được ghi thành file .eml trong data/mail/, không gửi ra ngoài. Production bắt buộc dùng MAIL_DRIVER=smtp với nhà cung cấp SMTP của bạn.

Khi dùng reverse proxy, chỉ bật TRUST_PROXY=true nếu máy chủ thật sự đứng sau đúng một proxy đáng tin cậy.

Dữ liệu và sao lưu
Dữ liệu SQLite nằm ở DATABASE_PATH (mặc định data/coi.sqlite). Thư mục data/ không được commit.

Trước khi sao lưu, nên dừng tiến trình Cội để bản sao dễ kiểm tra:

npm run backup
File sao lưu được ghi vào backups/ (có thể đổi bằng BACKUP_DIR). Hãy mã hóa và lưu bản sao ở nơi riêng tư; cơ sở dữ liệu chứa email và thông tin dòng họ.

Không dùng DEMO_MODE=true trong production. Dữ liệu mẫu chỉ để xem giao diện local.

Test và build
npm test
npm run build
Bộ test bao phủ chuyển đổi lịch Việt Nam, Tết/Trung thu, tháng nhuận, tháng thiếu, ranh giới UTC+7, OTP dùng một lần, quyền quản lý/thành viên, cô lập dòng họ, lời mời bị thu hồi, xuất iCalendar và chống gửi nhắc lặp.

Đưa lên GitHub
Tạo repository riêng, ví dụ coi-family.

Chép toàn bộ thư mục này lên repository (không chép node_modules/, data/, backups/ và .env).

Trên máy chạy production, tạo .env riêng theo phần cấu hình bên trên.

Chạy npm ci (sau khi lockfile đã được commit), npm run build, rồi npm start.

Repo này chứa cả source (src/, server/, shared/) và cấu hình Vite. dist/ là output build; có thể build lại bất kỳ lúc nào.

GitHub là nơi lưu mã nguồn, không phải máy chủ chạy app này. Cội cần Node.js, SQLite và một SMTP server để đăng nhập/lưu dữ liệu/gửi email. GitHub Pages chỉ phục vụ file tĩnh nên không chạy được API, tài khoản và lời nhắc. Sau khi push GitHub, hãy triển khai repository lên một máy chủ Node hoặc nền tảng có persistent disk (VPS, Render, Railway, Fly.io hoặc máy chủ riêng), cấu hình biến môi trường production và bật một tiến trình chạy liên tục cho npm start.

Nếu chỉ muốn xem giao diện tĩnh, có thể chạy npm run build rồi dùng nội dung dist/; phần đó không có đăng nhập, database hay email.

Lưu ý nghiệp vụ
Âm lịch được lưu dưới dạng ngày/tháng âm và được tính lại thành ngày dương cho từng năm, không copy cố định ngày dương của năm hiện tại. Với ngày 30 trong tháng thiếu, lựa chọn “chuyển về ngày cuối tháng” chỉ là quy ước hiển thị/nhắc lịch của gia đình; hãy xác nhận tập quán của dòng họ trước khi bật gửi email tự động.

Thông tin trong dữ liệu mẫu (tên, địa điểm, tiểu sử) chỉ là nội dung minh họa. Hãy xóa hoặc thay thế trước khi dùng thật.