// Mật khẩu (scrypt), phiên đăng nhập (cookie), phân quyền
const crypto = require('node:crypto');
const { one, run, all, fmt } = require('../db');
const { AppError } = require('./http');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

const SESSION_HOURS = 12;
function createSession(taiKhoanId) {
  const token = crypto.randomBytes(24).toString('hex');
  const permissions = all('SELECT ma_quyen FROM phan_quyen WHERE tai_khoan_id=?', taiKhoanId).map(r=>r.ma_quyen).filter(p=>!OWNER_ONLY.includes(p));
  run('INSERT INTO phien(token, tai_khoan_id, het_han, quyen_phien) VALUES (?,?,?,?)', token, taiKhoanId,
    fmt(new Date(Date.now() + SESSION_HOURS * 3600e3)), JSON.stringify(permissions));
  return token;
}
const cookieFor = (token) => `sid=${token}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

/* Danh sách quyền nghiệp vụ */
const QUYEN = {
  XU_LY_DON: 'Xử lý đơn thuê',
  QL_LICH: 'Quản lý lịch',
  TRA_CUU_NOI_BO: 'Tra cứu nội bộ',
  QL_KHACH_HANG: 'Quản lý khách hàng',
  QL_THIET_BI: 'Quản lý tồn kho (máy ảnh, thiết bị, phụ kiện)',
  QL_GIA_KM: 'Quản lý bảng giá & khuyến mãi',
  BAO_CAO: 'Xem báo cáo doanh thu',
  QL_TAI_KHOAN: 'Quản lý tài khoản & phân quyền',
};
const OWNER_ONLY = ['QL_TAI_KHOAN','QL_GIA_KM','BAO_CAO'];
const QUYEN_MAC_DINH_NV = ['XU_LY_DON', 'QL_LICH', 'QL_KHACH_HANG'];

function loadUser(token) {
  if (!token) return null;
  const u = one(`SELECT tk.id, tk.ma, tk.ho_ten, tk.sdt, tk.email, tk.vai_tro, tk.trang_thai, tk.ten_dang_nhap, p.quyen_phien
                 FROM phien p JOIN tai_khoan tk ON tk.id = p.tai_khoan_id
                 WHERE p.token = ? AND p.het_han > ?`, token, fmt(new Date()));
  if (!u || u.trang_thai !== 'MO') return null;
  u.quyen = u.vai_tro === 'CH' ? Object.keys(QUYEN)
    : u.vai_tro === 'NV' ? (u.quyen_phien ? JSON.parse(u.quyen_phien) : all('SELECT ma_quyen FROM phan_quyen WHERE tai_khoan_id=?', u.id).map(r=>r.ma_quyen)).filter(p=>!OWNER_ONLY.includes(p))
    : [];
  delete u.quyen_phien;
  if (u.vai_tro === 'KH') {
    const kh = one('SELECT id, ma FROM khach_hang WHERE tai_khoan_id=?', u.id);
    u.khach_hang_id = kh?.id; u.ma_khach_hang = kh?.ma;
  }
  return u;
}

/* Middleware */
const requireLogin = (ctx) => {
  if (!ctx.user) throw new AppError(401, 'CHUA_DANG_NHAP', 'Vui lòng đăng nhập để tiếp tục.');
};
const requireRole = (...roles) => (ctx) => {
  requireLogin(ctx);
  if (!roles.includes(ctx.user.vai_tro)) throw new AppError(403, 'KHONG_CO_QUYEN', 'Bạn không có quyền thực hiện chức năng này.');
};
const requirePerm = (perm) => (ctx) => {
  requireLogin(ctx);
  if ((OWNER_ONLY.includes(perm) && ctx.user.vai_tro !== 'CH') || !ctx.user.quyen.includes(perm)) throw new AppError(403, 'KHONG_CO_QUYEN', `Bạn chưa được cấp quyền "${QUYEN[perm]}".`);
};

module.exports = { hashPassword, verifyPassword, createSession, cookieFor, loadUser, requireLogin, requireRole, requirePerm, QUYEN, QUYEN_MAC_DINH_NV, OWNER_ONLY };
