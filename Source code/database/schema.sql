-- =====================================================================
--  ME.E DIGITALCAM – Hệ thống cho thuê máy ảnh tại Đà Nẵng
--  Lược đồ cơ sở dữ liệu (SQLite 3.35+)
--  Quy ước: thời gian lưu dạng 'YYYY-MM-DD HH:MM' (giờ Việt Nam, UTC+7)
--           tiền lưu dạng số nguyên VNĐ
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Bảng sinh mã tự động: mỗi "khoa" là một dãy số riêng
--   KH  -> KH0001 (khách hàng)      NV -> NV001 (nhân viên)
--   CH  -> CH001  (chủ cửa hàng)    DM -> DM001 (dòng máy)
--   TB  -> TB0001 (thiết bị)        PK -> PK001 (phụ kiện)
--   KM  -> KM001  (khuyến mãi)      LG -> LG0001 (lỗi ghi nhận)
--   Mã theo ngày (đánh số lại mỗi ngày, đúng mẫu trong Figma):
--   DT-YYMMDD-NNN  đơn thuê          ví dụ DT-261103-012
--   DL-YYMMDD-NNN  đơn đặt lịch      ví dụ DL-261103-001
--   TT-YYMMDD-NNN  mã thanh toán     ví dụ TT-261103-001
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ma_tu_dong (
  khoa     TEXT PRIMARY KEY,
  gia_tri  INTEGER NOT NULL DEFAULT 0
);

-- Tài khoản đăng nhập (khách hàng, nhân viên, chủ cửa hàng)
CREATE TABLE IF NOT EXISTS tai_khoan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ma            TEXT NOT NULL UNIQUE,
  ho_ten        TEXT NOT NULL,
  sdt           TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  mat_khau_hash TEXT NOT NULL,
  vai_tro       TEXT NOT NULL CHECK (vai_tro IN ('KH','NV','CH')),
  trang_thai    TEXT NOT NULL DEFAULT 'MO' CHECK (trang_thai IN ('MO','DONG')),
  ngay_tao      TEXT NOT NULL,
  ngay_cap_nhat TEXT
);

-- Quyền của nhân viên (chủ cửa hàng mặc định có toàn quyền)
CREATE TABLE IF NOT EXISTS phan_quyen (
  tai_khoan_id INTEGER NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
  ma_quyen     TEXT NOT NULL,
  PRIMARY KEY (tai_khoan_id, ma_quyen)
);

CREATE TABLE IF NOT EXISTS phien (
  token        TEXT PRIMARY KEY,
  tai_khoan_id INTEGER NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
  het_han      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp (
  id        TEXT PRIMARY KEY,
  sdt       TEXT NOT NULL,
  ma        TEXT NOT NULL,
  het_han   TEXT NOT NULL,
  so_lan_sai INTEGER NOT NULL DEFAULT 0,
  du_lieu   TEXT NOT NULL,           -- JSON thông tin đăng ký chờ xác thực
  da_dung   INTEGER NOT NULL DEFAULT 0
);

-- Khách hàng (có thể có hoặc chưa có tài khoản – khách tại quầy)
CREATE TABLE IF NOT EXISTS khach_hang (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ma           TEXT NOT NULL UNIQUE,
  ho_ten       TEXT NOT NULL,
  sdt          TEXT NOT NULL UNIQUE,
  email        TEXT,
  cccd         TEXT UNIQUE,
  dia_chi      TEXT,
  ghi_chu      TEXT,
  tai_khoan_id INTEGER UNIQUE REFERENCES tai_khoan(id),
  ngay_tao     TEXT NOT NULL
);

-- Dòng máy (danh mục) + bảng giá
CREATE TABLE IF NOT EXISTS dong_may (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ma          TEXT NOT NULL UNIQUE,
  ten         TEXT NOT NULL UNIQUE,
  hang        TEXT NOT NULL,
  loai        TEXT NOT NULL DEFAULT 'Mirrorless',
  mo_ta       TEXT,
  thong_so    TEXT,                  -- JSON: cảm biến, video, trọng lượng...
  anh         TEXT,
  -- Bảng giá theo gói (đúng màn "Chi tiết thiết bị" trong Figma)
  gia_buoi       INTEGER NOT NULL CHECK (gia_buoi >= 0),       -- gói 6 tiếng
  gia_ngay       INTEGER NOT NULL CHECK (gia_ngay >= 0),       -- gói 1 ngày (24 giờ)
  gia_2_ngay     INTEGER NOT NULL CHECK (gia_2_ngay >= 0),     -- gói 2 ngày (48 giờ)
  gia_3_ngay     INTEGER NOT NULL CHECK (gia_3_ngay >= 0),     -- gói 3 ngày (72 giờ)
  gia_ngay_them  INTEGER NOT NULL CHECK (gia_ngay_them >= 0),  -- từ ngày thứ 4: + mỗi ngày
  tien_coc       INTEGER NOT NULL CHECK (tien_coc >= 0),       -- cọc khi nhận máy
  trang_thai  TEXT NOT NULL DEFAULT 'HOAT_DONG' CHECK (trang_thai IN ('HOAT_DONG','NGUNG')),
  ngay_tao    TEXT NOT NULL
);

-- Thiết bị cụ thể (từng thân máy)
CREATE TABLE IF NOT EXISTS thiet_bi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ma          TEXT NOT NULL UNIQUE,
  dong_may_id INTEGER NOT NULL REFERENCES dong_may(id),
  so_serial   TEXT NOT NULL UNIQUE,
  mau         TEXT,
  tinh_trang  TEXT NOT NULL DEFAULT 'SAN_SANG' CHECK (tinh_trang IN ('SAN_SANG','BAO_TRI','NGUNG')),
  ghi_chu     TEXT,
  ngay_tao    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phu_kien (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ma        TEXT NOT NULL UNIQUE,
  ten       TEXT NOT NULL UNIQUE,
  gia_ngay  INTEGER NOT NULL CHECK (gia_ngay >= 0),
  so_luong  INTEGER NOT NULL CHECK (so_luong >= 0),
  anh       TEXT,
  ngay_tao  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS khuyen_mai (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ma           TEXT NOT NULL UNIQUE,
  ten          TEXT NOT NULL,
  loai         TEXT NOT NULL CHECK (loai IN ('PHAN_TRAM','TIEN')),
  gia_tri      INTEGER NOT NULL CHECK (gia_tri > 0),
  don_toi_thieu INTEGER NOT NULL DEFAULT 0,
  tu_ngay      TEXT NOT NULL,
  den_ngay     TEXT NOT NULL,
  trang_thai   TEXT NOT NULL DEFAULT 'BAT' CHECK (trang_thai IN ('BAT','TAT')),
  ngay_tao     TEXT NOT NULL,
  CHECK (den_ngay >= tu_ngay)
);

-- Đơn thuê / đơn đặt lịch
--   CHO_COC      : khách đặt online, đang giữ máy 15 phút chờ đặt cọc
--   CHO_BAN_GIAO : đã đặt lịch / tạo đơn, chờ khách nhận máy
--   DANG_THUE    : đã bàn giao máy
--   CHO_KIEM_TRA : khách đã trả máy, chờ kiểm tra lỗi
--   HOAN_TAT     : đã tất toán
--   DA_HUY       : đã hủy
CREATE TABLE IF NOT EXISTS don_thue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ma             TEXT NOT NULL UNIQUE,            -- DT-YYMMDD-NNN (đơn thuê)
  ma_dat_lich    TEXT UNIQUE,                     -- DL-YYMMDD-NNN (chỉ đơn khách đặt online)
  ma_tham_chieu  TEXT UNIQUE,                     -- TT-YYMMDD-NNN: mã tham chiếu chuyển khoản cọc online
  khach_hang_id  INTEGER NOT NULL REFERENCES khach_hang(id),
  nguoi_tao_id   INTEGER REFERENCES tai_khoan(id),
  kenh           TEXT NOT NULL CHECK (kenh IN ('ONLINE','TAI_QUAY')),
  ngay_nhan      TEXT NOT NULL,
  ngay_tra       TEXT NOT NULL,
  trang_thai     TEXT NOT NULL CHECK (trang_thai IN ('CHO_COC','CHO_BAN_GIAO','DANG_THUE','CHO_KIEM_TRA','HOAN_TAT','DA_HUY')),
  tien_thue      INTEGER NOT NULL DEFAULT 0,
  tien_phu_kien  INTEGER NOT NULL DEFAULT 0,
  giam_gia       INTEGER NOT NULL DEFAULT 0,
  khuyen_mai_id  INTEGER REFERENCES khuyen_mai(id),
  tien_coc_may   INTEGER NOT NULL DEFAULT 0,
  coc_dat_lich   INTEGER NOT NULL DEFAULT 0,
  phi_den_bu     INTEGER NOT NULL DEFAULT 0,
  phi_tra_tre    INTEGER NOT NULL DEFAULT 0,      -- 30.000đ / giờ trả trễ
  giu_den        TEXT,
  ghi_chu        TEXT,
  ly_do_huy      TEXT,
  ngay_tao       TEXT NOT NULL,
  ngay_cap_nhat  TEXT,
  CHECK (ngay_tra > ngay_nhan)
);
CREATE INDEX IF NOT EXISTS idx_don_thue_tg ON don_thue(ngay_nhan, ngay_tra);

CREATE TABLE IF NOT EXISTS chi_tiet_don (
  don_id      INTEGER NOT NULL REFERENCES don_thue(id) ON DELETE CASCADE,
  thiet_bi_id INTEGER NOT NULL REFERENCES thiet_bi(id),
  thanh_tien  INTEGER NOT NULL,
  PRIMARY KEY (don_id, thiet_bi_id)
);

CREATE TABLE IF NOT EXISTS chi_tiet_phu_kien (
  don_id      INTEGER NOT NULL REFERENCES don_thue(id) ON DELETE CASCADE,
  phu_kien_id INTEGER NOT NULL REFERENCES phu_kien(id),
  so_luong    INTEGER NOT NULL CHECK (so_luong > 0),
  thanh_tien  INTEGER NOT NULL,
  PRIMARY KEY (don_id, phu_kien_id)
);

-- Ghi nhận CCCD khi bàn giao máy (UC 4.5)
CREATE TABLE IF NOT EXISTS ghi_nhan_cccd (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  don_id        INTEGER NOT NULL UNIQUE REFERENCES don_thue(id) ON DELETE CASCADE,
  so_cccd       TEXT NOT NULL,
  ho_ten        TEXT NOT NULL,
  ngay_sinh     TEXT,
  ngay_cap      TEXT,
  noi_cap       TEXT,
  nguoi_ghi_id  INTEGER REFERENCES tai_khoan(id),
  thoi_gian     TEXT NOT NULL
);

-- Ghi nhận lỗi máy & phụ kiện (UC 4.6)
CREATE TABLE IF NOT EXISTS loi_ghi_nhan (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ma           TEXT NOT NULL UNIQUE,
  don_id       INTEGER NOT NULL REFERENCES don_thue(id) ON DELETE CASCADE,
  doi_tuong    TEXT NOT NULL CHECK (doi_tuong IN ('MAY','PHU_KIEN')),
  thiet_bi_id  INTEGER REFERENCES thiet_bi(id),
  phu_kien_id  INTEGER REFERENCES phu_kien(id),
  muc_do       TEXT NOT NULL CHECK (muc_do IN ('NHE','TRUNG_BINH','NANG')),
  mo_ta        TEXT NOT NULL,
  phi_den_bu   INTEGER NOT NULL DEFAULT 0 CHECK (phi_den_bu >= 0),
  nguoi_ghi_id INTEGER REFERENCES tai_khoan(id),
  thoi_gian    TEXT NOT NULL
);

-- Thanh toán (nguồn dữ liệu báo cáo doanh thu)
--   DAT_LICH: cọc đặt lịch online   THUE: tiền thuê tất toán
--   DEN_BU: phí đền bù               HOAN_DAT_LICH: hoàn cọc đặt lịch khi hủy
--   TRA_TRE: phí trả máy trễ
CREATE TABLE IF NOT EXISTS thanh_toan (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ma           TEXT NOT NULL UNIQUE,
  don_id       INTEGER NOT NULL REFERENCES don_thue(id),
  loai         TEXT NOT NULL CHECK (loai IN ('DAT_LICH','THUE','DEN_BU','TRA_TRE','HOAN_DAT_LICH')),
  so_tien      INTEGER NOT NULL,
  phuong_thuc  TEXT NOT NULL DEFAULT 'TIEN_MAT',
  thoi_gian    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thanh_toan_tg ON thanh_toan(thoi_gian);
