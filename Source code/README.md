# ME.E DIGITALCAM – Hệ thống cho thuê máy ảnh tại Đà Nẵng

Website cho thuê máy ảnh, gồm cả 3 phần: **Frontend** làm theo file Figma của nhóm, **Backend** (REST API) và **Database**. Mã nghiệp vụ được hệ thống tự sinh.

## 1. Chạy dự án

Bạn chỉ cần cài **Node.js 22.13 trở lên** (https://nodejs.org). Dự án **không có thư viện ngoài** nên không cần `npm install`.

```bash
cd me-e-digitalcam
npm start            # mở http://localhost:3000
```

Ở chế độ phát triển, lần chạy đầu hệ thống tự tạo database `data/meedigitalcam.db` và nạp dữ liệu mẫu. Không dùng database này để triển khai công khai.

| Lệnh | Tác dụng |
|---|---|
| `npm start` | Chạy web tại cổng 3000 (đổi cổng: `PORT=8080 npm start`) |
| `npm run dev` | Chạy và tự khởi động lại khi sửa code |
| `npm run reset` | Xóa database rồi nạp lại dữ liệu mẫu |
| `npm test` | Chạy 6 bộ kiểm thử nghiệp vụ qua API (dùng database tạm) |
| `npm run check:colors` | Kiểm tra đồng bộ màu: báo lỗi nếu có mã màu nằm ngoài bảng chuẩn |

**Tài khoản mẫu** (mật khẩu chung `123456`):

| Vai trò | Số điện thoại |
|---|---|
| Chủ cửa hàng | 0123456789 |
| Nhân viên | 0222444666 |
| Khách hàng | 0111333555 |

## 2. Cấu trúc thư mục

```
database/schema.sql      Lược đồ CSDL (SQLite) – 16 bảng, có chú thích tiếng Việt
server/                  Backend Node.js (http + node:sqlite tích hợp sẵn)
  index.js               Máy chủ web + phục vụ giao diện
  db.js                  Kết nối CSDL, transaction, SINH MÃ TỰ ĐỘNG
  seed.js                Dữ liệu mẫu (15 dòng máy, thiết bị, đơn thuê, thanh toán…)
  lib/                   Xác thực phiên, kiểm tra dữ liệu, tiện ích HTTP
  services/              Quy tắc nghiệp vụ: lịch trống, tính giá theo gói, phí trả trễ…
  routes/                API theo use case (UC_2 … UC_12)
public/                  Frontend (HTML/CSS/JavaScript module, không cần build)
  assets/css/tokens.css  Design tokens lấy từ trang "00 · Quy chuẩn giao diện" của Figma
  assets/css/app.css     Thành phần giao diện dùng chung
  assets/js/core.js      Định tuyến, bố cục (sidebar / header / footer), form, modal
  assets/js/pages/       Các màn hình theo use case
  assets/img/            Logo và ảnh máy ảnh lấy từ file Figma
tests/                   Kiểm thử end-to-end
tools/check-colors.js    Công cụ kiểm tra đồng bộ màu
```

## 3. Giao diện theo Figma

- **Bảng màu chuẩn:** Nâu thương hiệu `#AC7F5E` · Nâu đất `#A94E34` · Espresso `#2F2118` · Nâu phụ `#766453` · Kem nền `#F6EFE5` · Kem bề mặt `#FFFCF7` · Viền ấm `#D9CBBB` · Cát nhạt `#C4A882`.
- **Tự đồng bộ màu:** mọi màu trong giao diện đều đi qua biến của `tokens.css`. Một số màn trong Figma dùng màu lệch chuẩn, đã được quy về bảng chuẩn như sau:
  - nút viền vàng/cam ("Cập nhật thông tin đơn thuê", "Ghi nhận lỗi") đổi thành **nút phụ**;
  - nút "Xác nhận" màu nâu nhạt đổi thành **nút chính Nâu đất**;
  - chip xanh dương đổi sang **họ màu ấm**;
  - tiêu đề dùng font serif ở vài màn đổi về **font chuẩn**.

  Lệnh `npm run check:colors` sẽ báo lỗi nếu có màu nằm ngoài bảng chuẩn.
- **Thống nhất toàn hệ thống:**
  - Sidebar có đúng các mục theo từng vai trò (khách vãng lai, khách hàng, nhân viên, chủ cửa hàng).
  - Header có đường dẫn `ME.E / …`, vai trò hiển thị bên phải.
  - Footer nâu có 4 nhóm thông tin.
  - Nút có 6 trạng thái: Mặc định / Di chuột / Nhấn / Tiêu điểm / Vô hiệu / Đang xử lý.
- **Trang chủ khách** làm theo màn "giao diện chính": thanh menu ngang, hero, "Sản phẩm nổi bật", thẻ khuyến mãi.

## 4. Sinh mã tự động

Mã được sinh trong cùng transaction với thao tác ghi, bằng bảng `ma_tu_dong` và lệnh `UPSERT … RETURNING`, nên không bị trùng khi nhiều người thao tác cùng lúc.

| Đối tượng | Mẫu mã | Ví dụ |
|---|---|---|
| Đơn thuê | `DT-YYMMDD-NNN` (đánh số lại mỗi ngày) | DT-261103-012 |
| Đơn đặt lịch online | `DL-YYMMDD-NNN` | DL-261103-001 |
| Mã tham chiếu thanh toán | `TT-YYMMDD-NNN` | TT-261103-001 |
| Khách hàng | `KH0001` | KH0009 |
| Nhân viên / Chủ cửa hàng | `NV001` / `CH001` | NV003 |
| Dòng máy / Thiết bị / Phụ kiện | `DM001` / `TB0001` / `PK001` | TB0024 |
| Khuyến mãi / Lỗi ghi nhận | `KM001` / `LG0001` | KM002 |

## 5. Chức năng theo use case

| Use case | Vai trò | Nội dung |
|---|---|---|
| UC_1, UC_12, UC_6 | Tất cả | Đăng ký (xác thực OTP: OTP sai, OTP hết hạn, SĐT đã dùng), đăng nhập (sai thông tin, tài khoản bị khóa), đăng xuất |
| UC_2.1 | Tất cả | Tra cứu lịch trống: lịch tháng Trống / Đang thuê; lỗi E01–E05 |
| UC_2.2 | Tất cả | Tra cứu giá theo gói 6 tiếng / 1 / 2 / 3 ngày / Tùy chọn (từ ngày thứ 4, buổi lẻ 6 tiếng) |
| UC_2.3 | Tất cả | Danh sách máy, lọc theo dòng máy và hãng, chi tiết thiết bị và bảng giá; nhân viên xem thêm thông tin nội bộ |
| UC_3.2 | Khách hàng | Tạo đơn đặt lịch → giữ máy 15 phút → đặt cọc online 50.000đ (QR, mã TT) → thành công; lỗi E01–E07 |
| UC_3.1 | Khách hàng | Đơn đặt lịch (Tất cả / Đã đặt lịch / Đã nhận máy / Quá hạn / Đã hủy), chi tiết, hủy đơn (cọc không hoàn lại, theo Figma) |
| UC_4.0–4.7 | Nhân viên, Chủ | Danh sách và tìm kiếm đơn, chi tiết, tạo đơn tại quầy, cập nhật, hủy, ghi nhận CCCD, ghi nhận lỗi máy/phụ kiện. Đơn đi qua các bước bàn giao → trả máy (tự tính phí trả trễ 30.000đ/giờ) → tất toán |
| UC_5 | Nhân viên, Chủ | Quản lý khách hàng: thêm, tìm, xem, cập nhật |
| UC_8 | Nhân viên, Chủ | Quản lý lịch: lưới lịch thiết bị theo ngày |
| UC_9.1–9.2 | Chủ | Báo cáo doanh thu: biểu đồ cột / đường / tròn, dữ liệu chi tiết; lỗi E01–E03 |
| UC_10.1–10.3 | Chủ | Quản lý tài khoản: cập nhật, mở/đóng, phân quyền nhân viên |
| Máy ảnh, Khuyến mãi | Chủ (hoặc nhân viên được cấp quyền) | Danh mục dòng máy, thiết bị, bảng giá, phụ kiện; tạo và sửa khuyến mãi |

## 6. Ghi chú

- Mã QR và cổng thanh toán cọc online là **mô phỏng**: bấm "Thanh toán cọc online" là được tính đã cọc.
- OTP đăng ký được hiển thị ngay trên màn hình ở chế độ phát triển. Chế độ production từ chối gửi OTP cho đến khi tích hợp SMS thực.
- Database là SQLite. Lược đồ chuẩn SQL nằm trong `database/schema.sql`, có thể chuyển sang SQL Server/MySQL nếu cần.

## Giao diện theo Figma

- `public/assets/css/screens.css` (nạp sau cùng) căn lại từng màn hình theo ảnh xuất Figma ở khung 1440px: sidebar 224px, vùng nội dung 328–1338px, footer toàn chiều ngang, trang chủ dùng thanh điều hướng ngang.
- `public/assets/img/photos/` chứa ảnh chụp thực tế cắt từ Figma; danh sách và chi tiết máy dùng ảnh này khi có (xem `photos()` trong `core.js`).
- Mọi mã màu mới đều khai báo trong `tokens.css` (`npm run check:colors` hoặc `node tools/check-colors.js`).

## Chuẩn bị triển khai

- Dùng máy chủ chạy Node.js 22.13+ và có ổ đĩa **lưu bền**. Ứng dụng dùng SQLite và ảnh tải lên tại `DB_FILE` và `UPLOAD_DIR`; dịch vụ chỉ có ổ tạm sẽ mất dữ liệu khi khởi động lại. Không chạy nhiều instance ghi cùng một file SQLite trên các máy khác nhau.
- Đặt biến môi trường như `.env.example` trong phần cấu hình của nền tảng lưu trữ. Tệp `.env.example` chỉ là mẫu, ứng dụng không tự đọc `.env`. Lệnh khởi chạy: `npm start`; cổng lấy từ `PORT`; kiểm tra hoạt động tại `GET /health`.
- Tạo **CSDL production riêng**. Ở lần chạy đầu, đặt `OWNER_NAME`, `OWNER_PHONE`, `OWNER_EMAIL`, `OWNER_PASSWORD` (ít nhất 12 ký tự) làm secret để tạo tài khoản chủ. Sau đó có thể bỏ các biến này khỏi cấu hình. Production không tự nạp dữ liệu mẫu và từ chối CSDL chứa chủ mẫu với mật khẩu công khai.
- Cấu hình HTTPS ở reverse proxy hoặc nền tảng lưu trữ. Cookie phiên có thuộc tính `Secure` trong production. Sao lưu định kỳ cả CSDL SQLite (gồm WAL nếu đang chạy) và thư mục ảnh tải lên; thử khôi phục trước khi nhận dữ liệu thật.
- **Chưa mở cho khách thật:** cần tích hợp dịch vụ SMS cho OTP và cổng thanh toán có xác nhận giao dịch thật. Hiện OTP production trả lỗi 503; thanh toán cọc vẫn là mô phỏng. Cần rà soát bảo mật, quyền truy cập và dữ liệu cá nhân trước khi công khai.
