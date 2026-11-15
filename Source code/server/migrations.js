// Additive migrations: preserve existing customer, order and inventory records.
module.exports = function migrate(db) {
  const columns = {
    tai_khoan: {ten_dang_nhap:'TEXT', so_lan_dang_nhap_sai:'INTEGER NOT NULL DEFAULT 0'},
    phien: {quyen_phien:'TEXT'},
    khach_hang: {ngay_sinh:'TEXT'},
    dong_may: {goi_gia:"TEXT NOT NULL DEFAULT '[]'"},
    phu_kien: {gia_buoi:'INTEGER',gia_2_ngay:'INTEGER',gia_3_ngay:'INTEGER',gia_ngay_them:'INTEGER',goi_gia:"TEXT NOT NULL DEFAULT '[]'"},
    thiet_bi: {anh_tinh_trang:'TEXT'},
    khuyen_mai: {khong_gioi_han:'INTEGER NOT NULL DEFAULT 0',dong_may_ids:"TEXT NOT NULL DEFAULT '[]'",dieu_kien:'TEXT'},
    ghi_nhan_cccd: {anh_truoc:'TEXT',anh_sau:'TEXT'},
    loi_ghi_nhan: {anh:'TEXT'},
    don_thue: {ban_giao_luc:'TEXT',tra_thuc_te:'TEXT',hoan_tat_luc:'TEXT'}
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, fields] of Object.entries(columns)) {
      const names = new Set(db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name));
      for (const [name, type] of Object.entries(fields)) if (!names.has(name)) db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tai_khoan_username ON tai_khoan(ten_dang_nhap COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS lich_su_don (
        id INTEGER PRIMARY KEY AUTOINCREMENT, don_id INTEGER NOT NULL REFERENCES don_thue(id),
        nguoi_id INTEGER REFERENCES tai_khoan(id), noi_dung TEXT NOT NULL, thoi_gian TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tep_tai_len (
        ten TEXT PRIMARY KEY, nguoi_id INTEGER NOT NULL REFERENCES tai_khoan(id), rieng_tu INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS khoi_phuc (
        token_hash TEXT PRIMARY KEY, tai_khoan_id INTEGER NOT NULL REFERENCES tai_khoan(id), het_han TEXT NOT NULL);
      UPDATE tai_khoan SET ten_dang_nhap=sdt WHERE ten_dang_nhap IS NULL;`);
    // Ảnh tải lên được lưu trong CSDL (cần cho bản chạy trên Vercel + CSDL online)
    if (!db.prepare('PRAGMA table_info(tep_tai_len)').all().some((x) => x.name === 'du_lieu')) db.exec('ALTER TABLE tep_tai_len ADD COLUMN du_lieu BLOB');
    // Cập nhật dữ liệu một lần (đánh dấu trong bảng cap_nhat_du_lieu để không ghi đè giá chủ cửa hàng sửa sau này)
    db.exec('CREATE TABLE IF NOT EXISTS cap_nhat_du_lieu (ma TEXT PRIMARY KEY, thoi_gian TEXT NOT NULL)');
    if (!db.prepare('SELECT 1 FROM cap_nhat_du_lieu WHERE ma=?').get('bang-gia-2026-11')) {
      // Bảng giá cửa hàng 11/2026: [6 tiếng, 1 ngày, 2 ngày, 3 ngày]
      const BANG_GIA = {"Canon EOS M10": [90000, 130000, 250000, 370000], "Canon EOS M50": [120000, 160000, 310000, 460000], "Canon EOS R50": [180000, 220000, 430000, 640000], "Fujifilm X-A3": [110000, 150000, 290000, 430000], "Fujifilm X-T100": [150000, 190000, 370000, 550000], "Fujifilm X-T10": [140000, 180000, 350000, 520000], "Fujifilm X-T20": [180000, 220000, 430000, 640000], "Fujifilm X-T30 II": [200000, 270000, 530000, 790000], "Fujifilm X-S10": [260000, 320000, 630000, 940000], "Fujifilm X-S20": [350000, 400000, 790000, 1180000], "Fujifilm X100V": [320000, 390000, 770000, 1150000], "Fujifilm X-M5": [250000, 300000, 590000, 880000]};
      const up = db.prepare('UPDATE dong_may SET gia_buoi=?, gia_ngay=?, gia_2_ngay=?, gia_3_ngay=? WHERE ten=?');
      for (const [ten, g] of Object.entries(BANG_GIA)) up.run(...g, ten);
      db.prepare('INSERT INTO cap_nhat_du_lieu(ma, thoi_gian) VALUES (?, datetime(\'now\', \'localtime\'))').run('bang-gia-2026-11');
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
};
