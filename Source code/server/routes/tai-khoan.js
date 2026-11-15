// UC_10 Quản lý tài khoản (chủ cửa hàng): 10.1 Cập nhật · 10.2 Mở/Đóng · 10.3 Phân quyền · tạo tài khoản nhân viên
const { route, AppError } = require('../lib/http');
const { one, all, run, tx, now, sinhMa } = require('../db');
const A = require('../lib/auth');
const { check, str, RE } = require('../lib/validate');

const quyen = A.requirePerm('QL_TAI_KHOAN');
const VAI_TRO = { KH: 'Khách hàng', NV: 'Nhân viên', CH: 'Chủ cửa hàng' };

function docTaiKhoan(id) {
  const tk = one('SELECT id, ma, ho_ten, sdt, email, ten_dang_nhap, vai_tro, trang_thai, ngay_tao, ngay_cap_nhat FROM tai_khoan WHERE id=?', Number(id));
  if (!tk) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy tài khoản.');
  tk.ten_vai_tro = VAI_TRO[tk.vai_tro];
  tk.quyen = tk.vai_tro === 'CH' ? Object.keys(A.QUYEN) : all('SELECT ma_quyen FROM phan_quyen WHERE tai_khoan_id=?', tk.id).map((r) => r.ma_quyen);
  return tk;
}

route('GET', '/api/quyen', quyen, () => A.QUYEN);

route('GET', '/api/tai-khoan', quyen, (ctx) => {
  const { q = '', vai_tro = '', trang_thai = '' } = ctx.query;
  return all(`SELECT id FROM tai_khoan WHERE (? = '' OR ma LIKE ? OR ho_ten LIKE ? OR sdt LIKE ? OR email LIKE ?)
      AND (? = '' OR vai_tro = ?) AND (? = '' OR trang_thai = ?) ORDER BY vai_tro DESC, id`,
  q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, vai_tro, vai_tro, trang_thai, trang_thai).map((r) => docTaiKhoan(r.id));
});

route('GET', '/api/tai-khoan/:id', quyen, (ctx) => docTaiKhoan(ctx.params.id));

const RULES = { ho_ten: ['Họ và tên', 'required', 'ten'], sdt: ['Số điện thoại', 'required', 'sdt'], email: ['Email', 'email'] };
const sai = (re, msg) => (v) => (re.test(v) ? '' : msg);
const RULES_CAP_NHAT = {
  ho_ten: ['Họ và tên', 'required', sai(RE.ten, 'Họ và tên không hợp lệ')],
  sdt: ['Số điện thoại', 'required', sai(RE.sdt, 'Số điện thoại không hợp lệ')],
  email: ['Email', 'required', sai(RE.email, 'Email không hợp lệ')],
  ten_dang_nhap: ['Tên đăng nhập', 'required', sai(/^[A-Za-z0-9._]{3,30}$/, 'Tên đăng nhập không hợp lệ')],
};
function kiemTraTrung(b, boQuaId = 0) {
  const f = {};
  if (one('SELECT 1 FROM tai_khoan WHERE sdt=? AND id<>?', str(b.sdt), boQuaId)) f.sdt = 'Số điện thoại đã được sử dụng.';
  if (str(b.email) && one('SELECT 1 FROM tai_khoan WHERE email=? AND id<>?', str(b.email), boQuaId)) f.email = 'Email đã được sử dụng.';
  if (str(b.ten_dang_nhap) && one('SELECT 1 FROM tai_khoan WHERE ten_dang_nhap=? COLLATE NOCASE AND id<>?', str(b.ten_dang_nhap), boQuaId)) f.ten_dang_nhap = 'Tên đăng nhập đã được sử dụng.';
  if (Object.keys(f).length) throw new AppError(409, 'E03_THONG_TIN_BI_TRUNG', 'Thông tin bị trùng với tài khoản khác.', f);
}

/* Tạo tài khoản nhân viên */
route('POST', '/api/tai-khoan', quyen, (ctx) => {
  const b = ctx.body;
  check(b, { ...RULES, mat_khau: ['Mật khẩu', 'required', (v) => (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v) ? 'Tối thiểu 8 ký tự, gồm cả chữ và số.' : '')] });
  kiemTraTrung(b);
  const id = tx(() => {
    const r = run(`INSERT INTO tai_khoan(ma, ho_ten, sdt, email, mat_khau_hash, vai_tro, ngay_tao) VALUES (?,?,?,?,?, 'NV', ?)`,
      sinhMa('NV'), str(b.ho_ten), str(b.sdt), str(b.email) || null, A.hashPassword(str(b.mat_khau)), now());
    const id = Number(r.lastInsertRowid);
    for (const q of A.QUYEN_MAC_DINH_NV) run('INSERT INTO phan_quyen(tai_khoan_id, ma_quyen) VALUES (?,?)', id, q);
    return id;
  });
  return docTaiKhoan(id);
});

/* 10.1 Cập nhật tài khoản */
route('PUT', '/api/tai-khoan/:id', quyen, (ctx) => {
  const tk = docTaiKhoan(ctx.params.id); const b = ctx.body;
  check(b, RULES_CAP_NHAT); kiemTraTrung(b, tk.id);
  tx(() => {
    run('UPDATE tai_khoan SET ho_ten=?, sdt=?, email=?, ten_dang_nhap=?, ngay_cap_nhat=? WHERE id=?', str(b.ho_ten), str(b.sdt), str(b.email) || null, str(b.ten_dang_nhap), now(), tk.id);
    if (tk.vai_tro === 'KH') {
      if (one('SELECT 1 FROM khach_hang WHERE sdt=? AND tai_khoan_id<>?', str(b.sdt), tk.id)) throw new AppError(409, 'E03_THONG_TIN_BI_TRUNG', 'Số điện thoại đã thuộc hồ sơ khách hàng khác.', { sdt: 'Số điện thoại đã được sử dụng.' });
      run('UPDATE khach_hang SET ho_ten=?, sdt=?, email=? WHERE tai_khoan_id=?', str(b.ho_ten), str(b.sdt), str(b.email) || null, tk.id);
    }
    if (str(b.mat_khau_moi)) {
      const v = str(b.mat_khau_moi);
      if (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Mật khẩu mới chưa đạt yêu cầu.', { mat_khau_moi: 'Tối thiểu 8 ký tự, gồm cả chữ và số.' });
      run('UPDATE tai_khoan SET mat_khau_hash=? WHERE id=?', A.hashPassword(v), tk.id);
      run('DELETE FROM phien WHERE tai_khoan_id=?', tk.id);
    }
  });
  return docTaiKhoan(tk.id);
});

/* 10.2 Mở / Đóng tài khoản */
route('POST', '/api/tai-khoan/:id/trang-thai', quyen, (ctx) => {
  const tk = docTaiKhoan(ctx.params.id); const moi = str(ctx.body.trang_thai);
  if (!['MO', 'DONG'].includes(moi)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Trạng thái không hợp lệ.');
  if (tk.id === ctx.user.id) throw new AppError(409, 'KHONG_THE_TU_KHOA', 'Bạn không thể tự đóng tài khoản của mình.');
  if (tk.vai_tro === 'CH' && moi === 'DONG' && one(`SELECT COUNT(*) n FROM tai_khoan WHERE vai_tro='CH' AND trang_thai='MO'`).n <= 1)
    throw new AppError(409, 'CAP_NHAT_THAT_BAI', 'Hệ thống phải còn ít nhất một chủ cửa hàng đang hoạt động.');
  if (tk.trang_thai === moi) throw new AppError(409, 'KHONG_THAY_DOI', `Tài khoản đang ở trạng thái "${moi === 'MO' ? 'Mở' : 'Đóng'}".`);
  tx(() => {
    run('UPDATE tai_khoan SET trang_thai=?, ngay_cap_nhat=? WHERE id=?', moi, now(), tk.id);
    if (moi === 'DONG') run('DELETE FROM phien WHERE tai_khoan_id=?', tk.id);
  });
  return docTaiKhoan(tk.id);
});

/* 10.3 Phân quyền (chỉ áp dụng cho nhân viên) */
route('PUT', '/api/tai-khoan/:id/quyen', quyen, (ctx) => {
  const tk = docTaiKhoan(ctx.params.id);
  if (tk.vai_tro !== 'NV') throw new AppError(409, 'PHAN_QUYEN_KHONG_THANH_CONG', 'Chỉ phân quyền cho tài khoản nhân viên.');
  const ds = Array.isArray(ctx.body.quyen) ? [...new Set(ctx.body.quyen)] : null;
  if (!ds) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Danh sách quyền không hợp lệ.');
  const sai = ds.filter((q) => !A.QUYEN[q]);
  if (sai.length) throw new AppError(422, 'PHAN_QUYEN_KHONG_THANH_CONG', 'Có quyền không hợp lệ: ' + sai.join(', '));
  if (ds.includes('QL_TAI_KHOAN')) throw new AppError(422, 'PHAN_QUYEN_KHONG_THANH_CONG', 'Quyền quản lý tài khoản chỉ dành cho chủ cửa hàng.');
  tx(() => {
    run('DELETE FROM phan_quyen WHERE tai_khoan_id=?', tk.id);
    for (const q of ds) run('INSERT INTO phan_quyen(tai_khoan_id, ma_quyen) VALUES (?,?)', tk.id, q);
    run('UPDATE tai_khoan SET ngay_cap_nhat=? WHERE id=?', now(), tk.id);
  });
  return docTaiKhoan(tk.id);
});
