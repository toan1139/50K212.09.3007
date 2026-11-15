// UC_5 Quản lý khách hàng: 5.1 Thêm · 5.2 Tìm kiếm · 5.3 Xem / cập nhật thông tin
const { route, AppError } = require('../lib/http');
const { one, all, run, tx, now, sinhMa } = require('../db');
const { requirePerm } = require('../lib/auth');
const { check, str, birthDate, fold } = require('../lib/validate');
const NV = require('../services/nghiep-vu');

const quyen = requirePerm('QL_KHACH_HANG');
const RULES = {
  ho_ten: ['Họ và tên', 'required', 'ten'],
  sdt: ['Số điện thoại', 'required', 'sdt'],
  email: ['Email', 'email'],
  cccd: ['Số CCCD', 'cccd'],
  dia_chi: ['Địa chỉ', { len: 200 }],
  ghi_chu: ['Ghi chú', { len: 500 }],
};
/** Thêm / cập nhật trong Quản lý khách hàng: bắt buộc nhập đầy đủ thông tin */
const RULES_DAY_DU = {
  ...RULES,
  email: ['Email', 'required', 'email'],
  cccd: ['Số CCCD', 'required', 'cccd'],
  dia_chi: ['Địa chỉ', 'required', { len: 200 }],
  ngay_sinh: ['Ngày sinh', 'required'],
};

function kiemTraTrung(b, boQuaId = 0) {
  const fields = {};
  if (one('SELECT 1 FROM khach_hang WHERE sdt=? AND id<>?', str(b.sdt), boQuaId)) fields.sdt = 'Số điện thoại đã tồn tại trong hệ thống.';
  if (str(b.cccd) && one('SELECT 1 FROM khach_hang WHERE cccd=? AND id<>?', str(b.cccd), boQuaId)) fields.cccd = 'Số CCCD đã tồn tại trong hệ thống.';
  if (Object.keys(fields).length) throw new AppError(409, 'TRUNG_THONG_TIN', 'Thông tin khách hàng bị trùng.', fields);
}

/** Dùng khi tạo đơn tại quầy: tìm theo SĐT, chưa có thì tạo mới (phải gọi trong tx) */
function timHoacTaoKhach(k = {}) {
  check(k, { ho_ten: RULES.ho_ten, sdt: RULES.sdt, cccd: RULES.cccd });
  const ton = one('SELECT id FROM khach_hang WHERE sdt=?', str(k.sdt));
  if (ton) return ton.id;
  kiemTraTrung(k);
  const r = run('INSERT INTO khach_hang(ma, ho_ten, sdt, cccd, ngay_tao) VALUES (?,?,?,?,?)', sinhMa('KH'), str(k.ho_ten), str(k.sdt), str(k.cccd) || null, now());
  return Number(r.lastInsertRowid);
}

route('GET', '/api/khach-hang', quyen, (ctx) => {
  const q = str(ctx.query.q);
  const p = [];
  const rows = all(`SELECT kh.*, (tk.id IS NOT NULL) AS co_tai_khoan,
      (SELECT COUNT(*) FROM don_thue d WHERE d.khach_hang_id=kh.id AND d.trang_thai<>'DA_HUY') AS so_don,
      (SELECT MAX(ngay_tao) FROM don_thue d WHERE d.khach_hang_id=kh.id) AS lan_thue_gan_nhat
    FROM khach_hang kh LEFT JOIN tai_khoan tk ON tk.id=kh.tai_khoan_id
    
    ORDER BY kh.id DESC LIMIT 500`, ...p);
  return rows.filter(x=>!q||fold([x.ma,x.ho_ten,x.sdt,x.cccd,x.email].join(' ')).includes(fold(q)));
});

route('GET', '/api/khach-hang/:id', quyen, (ctx) => {
  const kh = one('SELECT * FROM khach_hang WHERE id=? OR ma=?', Number(ctx.params.id) || 0, ctx.params.id);
  if (!kh) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy khách hàng.');
  kh.don = all(`SELECT id, ma, trang_thai, ngay_nhan, ngay_tra, tien_thue + tien_phu_kien - giam_gia AS tong_tien FROM don_thue WHERE khach_hang_id=? ORDER BY id DESC`, kh.id)
    .map((d) => ({ ...d, ten_trang_thai: NV.TRANG_THAI[d.trang_thai], thiet_bi: all('SELECT dm.ten FROM chi_tiet_don c JOIN thiet_bi t ON t.id=c.thiet_bi_id JOIN dong_may dm ON dm.id=t.dong_may_id WHERE c.don_id=?',d.id).map(x=>x.ten).join(', ') }));
  kh.tong_chi_tieu = kh.don.filter((d) => d.trang_thai === 'HOAN_TAT').reduce((s, d) => s + d.tong_tien, 0);
  return kh;
});

route('POST', '/api/khach-hang', quyen, (ctx) => {
  const b = ctx.body; check(b, RULES_DAY_DU); kiemTraTrung(b);
  const id = tx(() => Number(run(`INSERT INTO khach_hang(ma, ho_ten, sdt, email, cccd, dia_chi, ghi_chu, ngay_sinh, ngay_tao) VALUES (?,?,?,?,?,?,?,?,?)`,
    sinhMa('KH'), str(b.ho_ten), str(b.sdt), str(b.email) || null, str(b.cccd) || null, str(b.dia_chi) || null, str(b.ghi_chu) || null, birthDate(b.ngay_sinh), now()).lastInsertRowid));
  return one('SELECT * FROM khach_hang WHERE id=?', id);
});

route('PUT', '/api/khach-hang/:id', quyen, (ctx) => {
  const kh = one('SELECT * FROM khach_hang WHERE id=?', Number(ctx.params.id));
  if (!kh) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy khách hàng.');
  const b = ctx.body; check(b, RULES_DAY_DU); kiemTraTrung(b, kh.id);
  if (kh.tai_khoan_id && str(b.sdt) !== kh.sdt && one('SELECT 1 FROM tai_khoan WHERE sdt=? AND id<>?', str(b.sdt), kh.tai_khoan_id))
    throw new AppError(409, 'TRUNG_THONG_TIN', 'Số điện thoại đã được dùng cho tài khoản khác.', { sdt: 'Số điện thoại đã được dùng.' });
  tx(() => {
    run(`UPDATE khach_hang SET ho_ten=?, sdt=?, email=?, cccd=?, dia_chi=?, ghi_chu=?, ngay_sinh=? WHERE id=?`,
      str(b.ho_ten), str(b.sdt), str(b.email) || null, str(b.cccd) || null, str(b.dia_chi) || null, str(b.ghi_chu) || null, str(b.ngay_sinh)?birthDate(b.ngay_sinh):kh.ngay_sinh, kh.id);
    if (kh.tai_khoan_id) run('UPDATE tai_khoan SET ho_ten=?, sdt=?, email=?, ngay_cap_nhat=? WHERE id=?', str(b.ho_ten), str(b.sdt), str(b.email)||null, now(), kh.tai_khoan_id);
  });
  return one('SELECT * FROM khach_hang WHERE id=?', kh.id);
});

module.exports = { timHoacTaoKhach };
