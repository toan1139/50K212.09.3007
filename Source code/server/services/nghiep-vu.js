// Quy tắc nghiệp vụ dùng chung: kiểm tra thời gian, lịch trống, tính giá, khuyến mãi
const { one, all, run, now, today, fmt, parse, pad } = require('../db');
const { AppError } = require('../lib/http');

const QUY_DINH = {
  GIO_MO: 8, GIO_DONG: 21,          // giờ nhận & trả máy
  MAX_TRA_CUU_NGAY: 60,             // UC 2.1 E04
  MAX_DAT_TRUOC_NGAY: 60,           // UC 3.2 E03
  COC_DAT_LICH: 50000,              // cọc đặt lịch online / 1 máy
  GIU_MAY_PHUT: 15,                 // giữ máy chờ đặt cọc
  NGAY_THEM: 180000,                // BR03/BR04: chung cho mọi dòng máy
  GIO_MOT_BUOI: 6,
  PHI_TRE_GIO: 30000,               // trả trễ: 30.000đ / giờ (Figma – Nhận & trả máy)
  MIEN_PHI_TRE_PHUT: 0,            // không có thời gian miễn phí trong thiết kế
};

const TRANG_THAI = {
  CHO_COC: 'Chờ đặt cọc', CHO_BAN_GIAO: 'Chờ bàn giao', DANG_THUE: 'Đang thuê',
  CHO_KIEM_TRA: 'Chờ kiểm tra', HOAN_TAT: 'Hoàn tất', DA_HUY: 'Đã hủy',
};

/** Hủy các đơn online quá thời gian giữ máy mà chưa đặt cọc */
function donDepGiuMay() {
  // Đọc cục bộ trước (rất nhanh); chỉ ghi lên CSDL online khi thật sự có đơn hết hạn giữ máy.
  if (!one(`SELECT 1 FROM don_thue WHERE trang_thai='CHO_COC' AND giu_den < ? LIMIT 1`, now())) return;
  run(`UPDATE don_thue SET trang_thai='DA_HUY', ly_do_huy='Hết thời gian giữ máy, chưa đặt cọc', ngay_cap_nhat=?
       WHERE trang_thai='CHO_COC' AND giu_den < ?`, now(), now());
}

/**
 * Kiểm tra khoảng thời gian nhận – trả.
 * mode: 'TRA_CUU' (UC 2.1/2.2) | 'DAT_LICH' (UC 3.2) | 'TAI_QUAY' (UC 4.3/4.4)
 */
function kiemTraThoiGian(nhanStr, traStr, mode = 'TRA_CUU', { boQuaQuaKhu = false } = {}) {
  const fields = {};
  if (!nhanStr) fields.ngay_nhan = 'Vui lòng chọn ngày & giờ nhận.';
  if (!traStr) fields.ngay_tra = 'Vui lòng chọn ngày & giờ trả.';
  if (Object.keys(fields).length) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng nhập đầy đủ thông tin thời gian nhận và trả máy.', fields);

  const nhan = parse(nhanStr), tra = parse(traStr);
  if (!nhan) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Ngày nhận không đúng định dạng.', { ngay_nhan: 'Ngày giờ không hợp lệ.' });
  if (!tra) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Ngày trả không đúng định dạng.', { ngay_tra: 'Ngày giờ không hợp lệ.' });

  const nowD = new Date(); nowD.setSeconds(0, 0);
  const tolerance = mode === 'TAI_QUAY' ? 30 * 60e3 : 0;
  if (!boQuaQuaKhu && nhan.getTime() < nowD.getTime() - tolerance)
    throw new AppError(422, 'E02_NGAY_NHAN_QUA_KHU', 'Ngày nhận không được nhỏ hơn ngày hiện tại!', { ngay_nhan: 'Ngày nhận không được nhỏ hơn ngày hiện tại!' });
  if (tra <= nhan)
    throw new AppError(422, 'E03_NGAY_TRA_KHONG_HOP_LE', 'Ngày trả phải lớn hơn hoặc bằng ngày nhận!', { ngay_tra: 'Ngày trả phải lớn hơn hoặc bằng ngày nhận!' });
  // Tạo đơn tại quầy: chỉ nhận lịch trước tối đa 60 ngày (đặt lịch online cũng tối đa 60 ngày)
  if (!boQuaQuaKhu && mode === 'TAI_QUAY' && nhan.getTime() > nowD.getTime() + 60 * 864e5)
    throw new AppError(422, 'E05_DAT_TRUOC_QUA_60_NGAY', 'Chỉ được đặt lịch trước tối đa 60 ngày!', { ngay_nhan: 'Chỉ được đặt lịch trước tối đa 60 ngày!' });

  // Tại quầy / cập nhật đơn: ngày trả không được quá 60 ngày so với ngày nhận
  if (mode === 'TAI_QUAY' && (tra - nhan) / 864e5 > 60)
    throw new AppError(422, 'E06_THUE_QUA_60_NGAY', 'Ngày trả không được quá 60 ngày so với ngày nhận!', { ngay_tra: 'Ngày trả không được quá 60 ngày so với ngày nhận!' });
  const gioOk = (d) => {
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= QUY_DINH.GIO_MO * 60 && m <= QUY_DINH.GIO_DONG * 60;
  };
  if (!gioOk(nhan)) throw new AppError(422, 'E_GIO_LAM_VIEC', `Giờ nhận máy trong khoảng ${QUY_DINH.GIO_MO}:00 – ${QUY_DINH.GIO_DONG}:00.`, { gio_nhan: 'Ngoài giờ làm việc.' });
  if (!gioOk(tra)) throw new AppError(422, 'E_GIO_LAM_VIEC', `Giờ trả máy trong khoảng ${QUY_DINH.GIO_MO}:00 – ${QUY_DINH.GIO_DONG}:00.`, { gio_tra: 'Ngoài giờ làm việc.' });

  const soNgay = (tra - nhan) / 86400e3;
  if (mode === 'TRA_CUU' && soNgay > QUY_DINH.MAX_TRA_CUU_NGAY)
    throw new AppError(422, 'E04_QUA_60_NGAY', `Khoảng thời gian tra cứu tối đa ${QUY_DINH.MAX_TRA_CUU_NGAY} ngày`, { ngay_nhan: `Khoảng thời gian tra cứu tối đa ${QUY_DINH.MAX_TRA_CUU_NGAY} ngày`, ngay_tra: `Khoảng thời gian tra cứu tối đa ${QUY_DINH.MAX_TRA_CUU_NGAY} ngày` });
  if (mode === 'DAT_LICH' && (nhan - nowD) / 86400e3 > QUY_DINH.MAX_DAT_TRUOC_NGAY)
    throw new AppError(422, 'E03_DAT_TRUOC_QUA_60_NGAY', `Chỉ được đặt lịch trước tối đa ${QUY_DINH.MAX_DAT_TRUOC_NGAY} ngày!`, { ngay_nhan: `Chỉ được đặt lịch trước tối đa ${QUY_DINH.MAX_DAT_TRUOC_NGAY} ngày!` });

  return { nhan: fmt(nhan), tra: fmt(tra), soGio: (tra - nhan) / 3600e3 };
}

/** Danh sách id thiết bị đang bận trong khoảng [nhan, tra) */
function thietBiBan(nhan, tra, boQuaDonId = 0) {
  donDepGiuMay();
  return new Set(all(`SELECT c.thiet_bi_id AS id FROM chi_tiet_don c JOIN don_thue d ON d.id = c.don_id
     WHERE d.trang_thai NOT IN ('DA_HUY','HOAN_TAT') AND d.id <> ?
       AND NOT (d.kenh='ONLINE' AND d.trang_thai='CHO_BAN_GIAO' AND substr(d.ngay_nhan,1,10) < ?)
       AND d.ngay_nhan < ? AND (d.ngay_tra > ? OR (d.trang_thai IN ('DANG_THUE','CHO_KIEM_TRA') AND d.ngay_tra < ?))`, boQuaDonId, today(), tra, nhan, now()).map((r) => r.id));
}

function thietBiTrong(dongMayId, nhan, tra, boQuaDonId = 0) {
  const ban = thietBiBan(nhan, tra, boQuaDonId);
  return all(`SELECT * FROM thiet_bi WHERE dong_may_id=? AND tinh_trang='SAN_SANG' ORDER BY ma`, dongMayId)
    .filter((t) => !ban.has(t.id));
}

/** Lịch theo tháng cho một dòng máy: trạng thái từng ngày (giờ làm việc 08–21) */
function lichThang(dongMayId, thang) {
  const [y, m] = thang.split('-').map(Number);
  const soNgay = new Date(y, m, 0).getDate();
  const tong = one(`SELECT COUNT(*) n FROM thiet_bi WHERE dong_may_id=? AND tinh_trang='SAN_SANG'`, dongMayId).n;
  const homNay = today();
  const days = [];
  for (let d = 1; d <= soNgay; d++) {
    const ngay = `${y}-${pad(m)}-${pad(d)}`;
    const trong = thietBiTrong(dongMayId, `${ngay} ${pad(QUY_DINH.GIO_MO)}:00`, `${ngay} ${QUY_DINH.GIO_DONG}:00`).length;
    days.push({ ngay, so_trong: trong, tong, trang_thai: ngay < homNay ? 'QUA' : (trong > 0 ? 'TRONG' : 'DANG_THUE') });
  }
  return days;
}

/**
 * Tính giá thuê máy theo bảng giá gói (Figma – Chi tiết thiết bị):
 *   6 tiếng · 1 ngày · 2 ngày · 3 ngày · từ ngày thứ 4: + giá mỗi ngày thêm
 * Thời lượng = d ngày trọn + phần lẻ r giờ:
 *   r = 0      -> gói d ngày
 *   0 < r ≤ 6  -> gói d ngày + 1 buổi lẻ 6 tiếng
 *   r > 6      -> làm tròn lên d + 1 ngày
 * Buổi lẻ cộng đúng giá gói 6 tiếng, không thay bằng gói rẻ hơn.
 */
function giaGoiNgay(dm, d) {
  if (d <= 0) return 0;
  if (d === 1) return dm.gia_ngay;
  if (d === 2) return dm.gia_2_ngay;
  if (d === 3) return dm.gia_3_ngay;
  return dm.gia_3_ngay + (d - 3) * QUY_DINH.NGAY_THEM;
}
function dongGoiNgay(dm, d) {
  if (d <= 0) return [];
  if (d <= 3) return [{ goi: `Gói ${d} ngày`, sl: 1, don_gia: giaGoiNgay(dm, d), thanh_tien: giaGoiNgay(dm, d) }];
  return [
    { goi: 'Gói 3 ngày', sl: 1, don_gia: dm.gia_3_ngay, thanh_tien: dm.gia_3_ngay },
    { goi: 'Ngày thêm (từ ngày thứ 4)', sl: d - 3, don_gia: QUY_DINH.NGAY_THEM, thanh_tien: (d - 3) * QUY_DINH.NGAY_THEM },
  ];
}
function tinhGiaMay(dm, soGio) {
  const gb = dm.gia_buoi;
  if (soGio <= QUY_DINH.GIO_MOT_BUOI) return { tong: gb, dong: [{ goi: 'Gói 6 tiếng', sl: 1, don_gia: gb, thanh_tien: gb }] };
  const ngay = Math.floor(soGio / 24 + 1e-9);
  const du = soGio - ngay * 24;
  // Phương án A: d ngày + buổi lẻ (khi dư ≤ 6 giờ)
  const coBuoi = du > 1e-9 && du <= QUY_DINH.GIO_MOT_BUOI && ngay > 0;
  const ngayA = coBuoi || du <= 1e-9 ? ngay : ngay + 1;
  const giaA = giaGoiNgay(dm, ngayA) + (coBuoi ? gb : 0);
  const dong = dongGoiNgay(dm, ngayA);
  if (coBuoi) dong.push({ goi: 'Buổi lẻ (thêm 6 tiếng)', sl: 1, don_gia: gb, thanh_tien: gb });
  return { tong: giaA, dong };
}

/** Phí trả máy trễ: theo giờ, làm tròn lên (Figma: "Trả trễ: 30.000đ/giờ") */
function phiTraTre(ngayTraDuKien, thoiDiemTra = new Date()) {
  const han = parse(ngayTraDuKien);
  if (!han) return { gio: 0, phi: 0 };
  const tre = (thoiDiemTra - han) / 3600e3;
  if (tre <= QUY_DINH.MIEN_PHI_TRE_PHUT / 60) return { gio: 0, phi: 0 };
  const gio = Math.ceil(tre);
  return { gio, phi: gio * QUY_DINH.PHI_TRE_GIO };
}

function soNgayTinhPhuKien(soGio) { return Math.max(1, Math.ceil(soGio / 24)); }

function timKhuyenMai(maKm, tongTruocGiam, may = []) {
  if (!maKm) return null;
  const km = one(`SELECT * FROM khuyen_mai WHERE ma = ? COLLATE NOCASE`, String(maKm).trim());
  const t = today();
  if (!km || km.trang_thai !== 'BAT' || km.tu_ngay > t || km.den_ngay < t)
    throw new AppError(422, 'KM_KHONG_HOP_LE', 'Mã khuyến mãi không tồn tại hoặc đã hết hạn.', { ma_km: 'Mã khuyến mãi không hợp lệ.' });
  if (tongTruocGiam < km.don_toi_thieu)
    throw new AppError(422, 'KM_CHUA_DU_DIEU_KIEN', `Đơn tối thiểu ${km.don_toi_thieu.toLocaleString('vi-VN')}đ để dùng mã này.`, { ma_km: 'Chưa đủ giá trị đơn tối thiểu.' });
  const ids=JSON.parse(km.dong_may_ids||'[]');
  const eligible=ids.length?may.filter(m=>ids.includes(m.dong_may_id)).reduce((sum,m)=>sum+m.thanh_tien,0):tongTruocGiam;
  if(eligible<=0)throw new AppError(422,'KM_CHUA_DU_DIEU_KIEN','Thiết bị không thuộc chương trình khuyến mãi.',{ma_km:'Khuyến mãi không áp dụng cho thiết bị đã chọn.'});
  const giam = km.loai === 'PHAN_TRAM' ? Math.round((eligible * km.gia_tri) / 100 / 1000) * 1000 : Math.min(km.gia_tri, eligible);
  return { km, giam };
}

/**
 * Báo giá đầy đủ cho một đơn: nhiều thiết bị (theo dòng máy) + phụ kiện + khuyến mãi
 * mayList: [{dong_may, so_luong}]  phuKien: [{id, so_luong}]
 */
function baoGia({ mayList, phuKien = [], soGio, maKm, coDatLich = false, nhan, tra, boQuaDonId=0 }) {
  if(!Array.isArray(mayList)||!mayList.length||!Number.isFinite(soGio)||soGio<=0)throw new AppError(422,'THOI_GIAN_KHONG_HOP_LE','Thời gian thuê không hợp lệ.');
  if(!Array.isArray(phuKien))throw new AppError(422,'PK_KHONG_HOP_LE','Danh sách phụ kiện không hợp lệ.');
  const may = mayList.map(({ dong_may, so_luong = 1 }) => {
    if(!Number.isInteger(so_luong)||so_luong<1||so_luong>100)throw new AppError(422,'SO_LUONG_KHONG_HOP_LE','Số lượng phải là số nguyên dương.');
    const g = tinhGiaMay(dong_may, soGio);
    return { dong_may_id: dong_may.id, ten: dong_may.ten, so_luong, don_gia: g.tong, thanh_tien: g.tong * so_luong, chi_tiet: g.dong, tien_coc: dong_may.tien_coc * so_luong };
  });
  const ngayPK = soNgayTinhPhuKien(soGio);
  const pk = [];
  const seen = new Set();
  for (const p of phuKien) {
    if(seen.has(Number(p.id)))throw new AppError(422,'PK_TRUNG','Phụ kiện bị trùng.');
    seen.add(Number(p.id));
    const sl = Number(p.so_luong || 0);
    if (!sl) continue;
    const row = one('SELECT * FROM phu_kien WHERE id=?', p.id);
    if (!row) throw new AppError(422, 'PK_KHONG_TON_TAI', 'Phụ kiện không tồn tại.');
    const available=nhan&&tra?phuKienTrong(row.id,nhan,tra,boQuaDonId):row.so_luong;
    if (!Number.isInteger(sl) || sl < 0 || sl > available) throw new AppError(422, 'PK_VUOT_SO_LUONG', `${row.ten} chỉ còn ${available} cái trong thời gian đã chọn.`);
    pk.push({ id: row.id, ten: row.ten, so_luong: sl, don_gia: row.gia_ngay, so_ngay: ngayPK, thanh_tien: row.gia_ngay * sl * ngayPK });
  }
  const tienThue = may.reduce((s, x) => s + x.thanh_tien, 0);
  const tienPK = pk.reduce((s, x) => s + x.thanh_tien, 0);
  const kmr = timKhuyenMai(maKm, tienThue + tienPK, may);
  const giam = kmr ? kmr.giam : 0;
  const tong = tienThue + tienPK - giam;
  const soMay = may.reduce((s, x) => s + x.so_luong, 0);
  const cocDatLich = coDatLich ? QUY_DINH.COC_DAT_LICH * soMay : 0;
  return {
    so_gio: soGio, may, phu_kien: pk, tien_thue: tienThue, tien_phu_kien: tienPK,
    khuyen_mai: kmr ? { id: kmr.km.id, ma: kmr.km.ma, ten: kmr.km.ten } : null, giam_gia: giam,
    tong_tien_thue: tong, tien_coc_may: may.reduce((s, x) => s + x.tien_coc, 0),
    coc_dat_lich: cocDatLich, con_thanh_toan: Math.max(0, tong - cocDatLich),
  };
}

function phuKienTrong(id, nhan, tra, boQuaDonId = 0) {
  const pk = one('SELECT so_luong FROM phu_kien WHERE id=?', Number(id));
  if (!pk) return 0;
  const rows = all(`SELECT c.so_luong, d.ngay_nhan, d.ngay_tra, d.trang_thai
    FROM chi_tiet_phu_kien c JOIN don_thue d ON d.id=c.don_id
    WHERE c.phu_kien_id=? AND d.id<>? AND d.trang_thai NOT IN ('DA_HUY','HOAN_TAT')
    AND NOT (d.kenh='ONLINE' AND d.trang_thai='CHO_BAN_GIAO' AND substr(d.ngay_nhan,1,10) < ?)
    AND d.ngay_nhan<? AND (d.ngay_tra>? OR (d.trang_thai IN ('DANG_THUE','CHO_KIEM_TRA') AND d.ngay_tra<?))`,
    Number(id), boQuaDonId, today(), tra, nhan, now());
  const events = [];
  for (const row of rows) {
    const overdue = ['DANG_THUE', 'CHO_KIEM_TRA'].includes(row.trang_thai) && row.ngay_tra < now();
    const from = row.ngay_nhan > nhan ? row.ngay_nhan : nhan;
    const until = overdue ? tra : row.ngay_tra < tra ? row.ngay_tra : tra;
    if (from >= until) continue;
    events.push([from, Number(row.so_luong)], [until, -Number(row.so_luong)]);
  }
  events.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let busy = 0, peak = 0;
  for (const [, delta] of events) { busy += delta; peak = Math.max(peak, busy); }
  return Math.max(0, pk.so_luong - peak);
}
function moTaThoiLuong(soGio) {
  const ngay = Math.floor(soGio / 24), gio = Math.round(soGio - ngay * 24);
  return [ngay ? `${ngay} ngày` : '', gio ? `${gio} giờ` : ''].filter(Boolean).join(' ') || '0 giờ';
}

module.exports = { QUY_DINH, TRANG_THAI, donDepGiuMay, kiemTraThoiGian, thietBiBan, thietBiTrong, lichThang, tinhGiaMay, giaGoiNgay, phiTraTre, baoGia, timKhuyenMai, moTaThoiLuong, phuKienTrong };
