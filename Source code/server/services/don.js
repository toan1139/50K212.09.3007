// Tạo / đọc / cập nhật đơn thuê – dùng chung cho khách hàng (online) và nhân viên (tại quầy)
const { one, all, run, now, sinhMa, tx } = require('../db');
const { AppError } = require('../lib/http');
const NV = require('./nghiep-vu');

/** Chọn thiết bị cho đơn.
 *  chon: [{dong_may_id, so_luong}] hoặc thietBiIds cụ thể  */
function chonThietBi({ chon = [], thietBiIds = [], nhan, tra, boQuaDonId = 0 }) {
  const ban = NV.thietBiBan(nhan, tra, boQuaDonId);
  const ketQua = [];
  if (thietBiIds.length) {
    for (const id of [...new Set(thietBiIds.map(Number))]) {
      const tb = one('SELECT * FROM thiet_bi WHERE id=?', id);
      if (!tb) throw new AppError(422, 'TB_KHONG_TON_TAI', 'Thiết bị không tồn tại.');
      if (tb.tinh_trang !== 'SAN_SANG') throw new AppError(409, 'TB_KHONG_SAN_SANG', `Thiết bị ${tb.ma} đang ${tb.tinh_trang === 'BAO_TRI' ? 'bảo trì' : 'ngừng sử dụng'}.`);
      if (ban.has(tb.id)) throw new AppError(409, 'E04_KHONG_CO_THIET_BI_TRONG', `Thiết bị ${tb.ma} đã có lịch trong khoảng thời gian này.`);
      ketQua.push(tb);
    }
    return ketQua;
  }
  for (const c of chon) {
    const sl = Number(c.so_luong ?? 1);
    if(!Number.isInteger(sl)||sl<1||sl>100)throw new AppError(422,'SO_LUONG_KHONG_HOP_LE','Số lượng phải là số nguyên dương.');
    const trong = all(`SELECT * FROM thiet_bi WHERE dong_may_id=? AND tinh_trang='SAN_SANG' ORDER BY ma`, c.dong_may_id).filter((t) => !ban.has(t.id));
    if (trong.length < sl) {
      const dm = one('SELECT ten FROM dong_may WHERE id=?', c.dong_may_id);
      throw new AppError(409, 'E04_KHONG_CO_THIET_BI_TRONG', `${dm?.ten || 'Dòng máy'} không còn đủ thiết bị trống trong thời gian đã chọn.`);
    }
    ketQua.push(...trong.slice(0, sl));
    trong.slice(0,sl).forEach(t=>ban.add(t.id));
  }
  return ketQua;
}

function gomTheoDongMay(thietBis) {
  const map = new Map();
  for (const tb of thietBis) {
    if (!map.has(tb.dong_may_id)) map.set(tb.dong_may_id, { dong_may: one('SELECT * FROM dong_may WHERE id=?', tb.dong_may_id), so_luong: 0 });
    map.get(tb.dong_may_id).so_luong++;
  }
  return [...map.values()];
}

/** Ghi đơn vào CSDL (phải gọi bên trong tx) */
function ghiDon({ khachHangId, nguoiTaoId = null, kenh, nhan, tra, soGio, thietBis, phuKien, maKm, ghiChu, trangThai, giuDen = null }) {
  const bg = NV.baoGia({ mayList: gomTheoDongMay(thietBis), phuKien, soGio, maKm, coDatLich: kenh === 'ONLINE',nhan,tra });
  const ma = sinhMa('DT');
  const maDatLich = kenh === 'ONLINE' ? sinhMa('DL') : null;   // khách đặt online có thêm mã DL-YYMMDD-NNN
  const maThamChieu = kenh === 'ONLINE' ? sinhMa('TT') : null; // mã tham chiếu chuyển khoản cọc TT-YYMMDD-NNN
  const r = run(`INSERT INTO don_thue(ma, ma_dat_lich, ma_tham_chieu, khach_hang_id, nguoi_tao_id, kenh, ngay_nhan, ngay_tra, trang_thai, tien_thue, tien_phu_kien,
      giam_gia, khuyen_mai_id, tien_coc_may, coc_dat_lich, giu_den, ghi_chu, ngay_tao)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ma, maDatLich, maThamChieu, khachHangId, nguoiTaoId, kenh, nhan, tra, trangThai, bg.tien_thue, bg.tien_phu_kien, bg.giam_gia,
    bg.khuyen_mai?.id ?? null, bg.tien_coc_may, bg.coc_dat_lich, giuDen, ghiChu || null, now());
  const donId = Number(r.lastInsertRowid);
  ghiChiTiet(donId, thietBis, bg);
  return { id: donId, ma, ma_dat_lich: maDatLich, bao_gia: bg };
}

function ghiChiTiet(donId, thietBis, bg) {
  run('DELETE FROM chi_tiet_don WHERE don_id=?', donId);
  run('DELETE FROM chi_tiet_phu_kien WHERE don_id=?', donId);
  for (const tb of thietBis) {
    const m = bg.may.find((x) => x.dong_may_id === tb.dong_may_id);
    run('INSERT INTO chi_tiet_don(don_id, thiet_bi_id, thanh_tien) VALUES (?,?,?)', donId, tb.id, m.don_gia);
  }
  for (const p of bg.phu_kien) run('INSERT INTO chi_tiet_phu_kien(don_id, phu_kien_id, so_luong, thanh_tien) VALUES (?,?,?,?)', donId, p.id, p.so_luong, p.thanh_tien);
}

/** Đọc đầy đủ đơn thuê */
function docDon(id) {
  const d = one(`SELECT d.*, kh.ma AS ma_khach_hang, kh.ho_ten AS ten_khach_hang, kh.sdt AS sdt_khach_hang, kh.cccd AS cccd_khach_hang,
      kh.email AS email_khach_hang, tk.ho_ten AS ten_nguoi_tao, tk.vai_tro AS vai_tro_nguoi_tao, km.ma AS ma_km, km.ten AS ten_km
    FROM don_thue d JOIN khach_hang kh ON kh.id=d.khach_hang_id
    LEFT JOIN tai_khoan tk ON tk.id=d.nguoi_tao_id LEFT JOIN khuyen_mai km ON km.id=d.khuyen_mai_id
    WHERE d.id=? OR d.ma=?`, Number(id) || 0, String(id));
  if (!d) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy đơn thuê.');
  d.thiet_bi = all(`SELECT tb.id, tb.ma, tb.so_serial, tb.mau, dm.id AS dong_may_id, dm.ten AS dong_may, dm.hang, dm.anh, c.thanh_tien
    FROM chi_tiet_don c JOIN thiet_bi tb ON tb.id=c.thiet_bi_id JOIN dong_may dm ON dm.id=tb.dong_may_id WHERE c.don_id=? ORDER BY tb.ma`, d.id);
  d.phu_kien = all(`SELECT pk.id, pk.ma, pk.ten, c.so_luong, c.thanh_tien FROM chi_tiet_phu_kien c JOIN phu_kien pk ON pk.id=c.phu_kien_id WHERE c.don_id=?`, d.id);
  d.cccd = one(`SELECT g.*, tk.ho_ten AS nguoi_ghi FROM ghi_nhan_cccd g LEFT JOIN tai_khoan tk ON tk.id=g.nguoi_ghi_id WHERE don_id=?`, d.id) || null;
  d.loi = all(`SELECT l.*, tb.ma AS ma_thiet_bi, pk.ten AS ten_phu_kien, tk.ho_ten AS nguoi_ghi FROM loi_ghi_nhan l
    LEFT JOIN thiet_bi tb ON tb.id=l.thiet_bi_id LEFT JOIN phu_kien pk ON pk.id=l.phu_kien_id LEFT JOIN tai_khoan tk ON tk.id=l.nguoi_ghi_id
    WHERE don_id=? ORDER BY l.id`, d.id);
  d.lich_su = all('SELECT l.*,tk.ho_ten AS nguoi_cap_nhat FROM lich_su_don l LEFT JOIN tai_khoan tk ON tk.id=l.nguoi_id WHERE l.don_id=? ORDER BY l.id DESC',d.id);
  d.qua_han_nhan = d.kenh==='ONLINE' && d.trang_thai==='CHO_BAN_GIAO' && d.ngay_nhan.slice(0,10)<now().slice(0,10);
  d.thanh_toan = all('SELECT * FROM thanh_toan WHERE don_id=? ORDER BY id', d.id);
  d.ten_trang_thai = NV.TRANG_THAI[d.trang_thai];
  d.tong_tien = d.tien_thue + d.tien_phu_kien - d.giam_gia;
  d.tong_thanh_toan = d.tong_tien + d.phi_den_bu + d.phi_tra_tre;
  d.qua_han = d.trang_thai === 'DANG_THUE' && new Date(d.ngay_tra.replace(' ', 'T')) < new Date();
  if (d.trang_thai === 'DANG_THUE') d.phi_tre_tam_tinh = NV.phiTraTre(d.ngay_tra).phi;
  d.thoi_luong = NV.moTaThoiLuong((new Date(d.ngay_tra.replace(' ', 'T')) - new Date(d.ngay_nhan.replace(' ', 'T'))) / 3600e3);
  return d;
}

const CHUYEN_HOP_LE = {
  CHO_BAN_GIAO: ['DANG_THUE'],
  DANG_THUE: ['CHO_KIEM_TRA'],
  CHO_KIEM_TRA: ['HOAN_TAT'],
};

module.exports = { chonThietBi, gomTheoDongMay, ghiDon, ghiChiTiet, docDon, CHUYEN_HOP_LE };
