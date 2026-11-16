# Vận hành ME.E DIGITALCAM

Trang thật: https://meedigitalcam.vercel.app (Vercel + CSDL online Turso).

## 1. Deploy

Trong thư mục dự án (thư mục có `package.json`):

```bash
npm test                     # 8 bài kiểm tra nghiệp vụ, phải đạt
npm run check:colors         # màu giao diện phải nằm trong tokens.css
npx vercel deploy --prod --yes
```

Sau khi deploy, mở `/health` vài lần để chắc mọi máy chủ đều trả `200`.
Thư mục `50K212.09.3007` (kho GitHub), `audit`, `tests`, `tools`, `docs`… đã được loại khỏi bản deploy trong `.vercelignore`.

## 2. `/health` – kiểm tra nhanh tình trạng

`GET https://meedigitalcam.vercel.app/health` trả JSON:

| Trường | Ý nghĩa |
|---|---|
| `ok` | `true` khi máy chủ chạy và truy vấn được CSDL |
| `csdl`, `csdl_loi` | `ok` / `loi` và lý do ngắn nếu CSDL lỗi (khi đó mã trả về là `503`) |
| `phien_ban.deploy`, `phien_ban.url` | bản deploy đang phục vụ (đối chiếu với danh sách trên Vercel) |
| `phan_hoi_ms` | thời gian xử lý yêu cầu này |
| `khoi_dong.sync_ms`, `khoi_dong.tong_ms` | thời gian đồng bộ CSDL và khởi động máy chủ |
| `khoi_dong.du_lieu_mau` | `da_cap_nhat` / `bo_qua` / `loi` – kết quả bước cập nhật dữ liệu mẫu lúc khởi động |

## 3. Xem log và tra một lỗi

Mọi phản hồi đều có header **`X-Request-Id`**. Khi có lỗi hệ thống (500), phản hồi API có thêm `error.ma_su_co` (cùng giá trị), và trình duyệt ghi ra Console dòng `[ME.E] Lỗi máy chủ … mã sự cố: …`.

Trên máy chủ, mỗi lỗi 500 ghi đúng một dòng log:

```
[E_LOI_HE_THONG] <thời gian ISO> id=<mã yêu cầu> <METHOD> <đường dẫn> status=500 ms=<thời gian xử lý>
<stack lỗi>
```

Log không ghi body yêu cầu, cookie, mật khẩu hay số CCCD.

Xem log trên Vercel:

```bash
npx vercel logs https://meedigitalcam.vercel.app
```

hoặc vào Vercel → Project → Logs, tìm theo mã yêu cầu (`id=...`) người dùng báo lại.

## 4. Quay lại bản deploy trước

```bash
npx vercel ls                       # danh sách các bản deploy
npx vercel rollback <url-bản-cũ>    # đưa bản cũ trở lại làm production
```

Rollback chỉ đổi mã chạy, **không** hoàn tác dữ liệu trong CSDL.

## 5. Dữ liệu mẫu

- Tệp: `server/seed.js`. Các bước chỉnh dữ liệu mẫu được gọi trong `server/index.js` và **chỉ chạy khi nội dung `seed.js` thay đổi** (đánh dấu bằng mã băm trong bảng `cap_nhat_du_lieu`).
- Mọi bước phải **chạy lại được nhiều lần** và **an toàn khi chạy song song**: sau deploy, Vercel có thể khởi động nhiều máy chủ cùng lúc và cùng chạy bước này. Máy chủ đến sau nếu vấp lỗi trùng sẽ chỉ ghi log `[KHOI_DONG] Bỏ qua bước cập nhật dữ liệu mẫu` và vẫn phục vụ bình thường (xem `khoi_dong.du_lieu_mau` trong `/health`).
- Chỉ thêm/sửa đúng bản ghi cần thiết, kiểm tra tồn tại trước khi chèn, xóa theo thứ tự bảng con trước bảng cha.

## 6. Bộ nhớ đệm (cache)

- CSS, JS, HTML: `Cache-Control: no-cache` kèm `ETag` → trình duyệt luôn kiểm tra lại, tệp không đổi thì nhận `304` (nhanh), sau deploy thì nhận bản mới – không cần Ctrl+F5.
- Ảnh, font: lưu 1 ngày (`max-age=86400`, dùng lại tối đa 7 ngày khi đang kiểm tra lại). Khi thay ảnh sản phẩm nên đổi tên tệp.
- API và `/health`: `no-store`.
