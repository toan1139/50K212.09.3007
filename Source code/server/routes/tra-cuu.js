// UC_2 Tra cứu thông tin: 2.1 lịch trống · 2.2 tra cứu giá · 2.3 thông tin thiết bị (cho mọi vai trò, kể cả khách vãng lai)
const { route, AppError } = require('../lib/http');
const { one, all, now, today, fmt, pad } = require('../db');
const NV = require('../services/nghiep-vu');
const { str,fold } = require('../lib/validate');

// ban: tập máy đang bận trong 6 giờ tới – truyền vào khi xử lý cả danh sách để chỉ tính một lần.
function dongMayCongKhai(dm, ban) {
  const tbs = all(`SELECT id FROM thiet_bi WHERE dong_may_id=? AND tinh_trang='SAN_SANG'`, dm.id);
  const tong = tbs.length;
  if (!(ban instanceof Set)) ban = NV.thietBiBan(now(), fmt(new Date(Date.now() + 6 * 3600e3)));
  const trong = tbs.filter((t) => !ban.has(t.id)).length;
  return { ...dm, gia_ngay_them:NV.QUY_DINH.NGAY_THEM, goi_gia:JSON.parse(dm.goi_gia||'[]'), thong_so: dm.thong_so ? JSON.parse(dm.thong_so) : {}, so_thiet_bi: tong, so_trong_hien_tai: trong };
}

route('GET', '/api/dong-may', (ctx) => {
  const { q = '', hang = '', dong_may_id = '', trang = '1', kich_thuoc = '6', tat_ca = '', sap_xep = '' } = ctx.query;
  const where = [tat_ca && ['NV','CH'].includes(ctx.user?.vai_tro) ? `trang_thai<>'AN'` : `trang_thai='HOAT_DONG'`]; const p = [];
  
  if (hang) { where.push('hang = ?'); p.push(hang); }
  if (dong_may_id) { where.push('id = ?'); p.push(Number(dong_may_id)); }
  // sap_xep=noi_bat: dòng máy được thuê nhiều nhất trước (trang chủ – Sản phẩm nổi bật)
  const order = sap_xep === 'noi_bat'
    ? `(SELECT COUNT(*) FROM chi_tiet_don c JOIN thiet_bi tb ON tb.id=c.thiet_bi_id JOIN don_thue d ON d.id=c.don_id WHERE tb.dong_may_id=dong_may.id AND d.trang_thai<>'DA_HUY') DESC, gia_ngay DESC`
    : 'hang, ten';
  const rows = all(`SELECT * FROM dong_may WHERE ${where.join(' AND ')} ORDER BY ${order}`, ...p).filter(x=>!q||fold(x.ten+' '+x.hang+' '+x.ma).includes(fold(q)));
  const size = Math.max(1, Math.min(100, Number(kich_thuoc) || 6));
  const page = Math.max(1, Number(trang) || 1);
  return {
    tong: rows.length, trang: page, kich_thuoc: size, so_trang: Math.max(1, Math.ceil(rows.length / size)),
    du_lieu: (() => {
      const trangNay = rows.slice((page - 1) * size, page * size);
      const ban = trangNay.length ? NV.thietBiBan(now(), fmt(new Date(Date.now() + 6 * 3600e3))) : null;
      return trangNay.map((dm) => dongMayCongKhai(dm, ban));
    })(),
  };
});

route('GET', '/api/hang', () => all(`SELECT DISTINCT hang FROM dong_may WHERE trang_thai='HOAT_DONG' ORDER BY hang`).map((r) => r.hang));

route('GET', '/api/dong-may/:id', (ctx) => {
  const dm = one('SELECT * FROM dong_may WHERE id=? OR ma=?', Number(ctx.params.id) || 0, ctx.params.id);
  if (!dm || (dm.trang_thai!=='HOAT_DONG' && !['NV','CH'].includes(ctx.user?.vai_tro))) throw new AppError(404, 'E01_KHONG_TIM_THAY', 'Không tìm thấy thiết bị.');
  const out = dongMayCongKhai(dm);
  out.tuong_tu = all(`SELECT id, ma, ten, hang, anh, gia_ngay FROM dong_may WHERE trang_thai='HOAT_DONG' AND id<>? ORDER BY (hang=?) DESC, ABS(gia_ngay-?) LIMIT 3`, dm.id, dm.hang, dm.gia_ngay);
  out.phu_kien = all('SELECT id, ma, ten, gia_ngay, anh FROM phu_kien WHERE so_luong>0 ORDER BY ten LIMIT 4');
  if (ctx.user && ['NV', 'CH'].includes(ctx.user.vai_tro)) {
    // Thông tin nội bộ cho nhân viên (UC 2.3 – chi tiết thiết bị nội bộ)
    out.thiet_bi = all('SELECT id, ma, so_serial, mau, tinh_trang, ghi_chu FROM thiet_bi WHERE dong_may_id=? ORDER BY ma', dm.id);
    const ban = NV.thietBiBan(now(), fmt(new Date(Date.now() + 60e3)));
    out.thiet_bi.forEach((t) => { t.dang_cho_thue = ban.has(t.id); });
  }
  return out;
});

route('GET', '/api/phu-kien', ctx => all('SELECT * FROM phu_kien ORDER BY ten').map(p=>({...p,goi_gia:JSON.parse(p.goi_gia||'[]'),so_trong:ctx.query.ngay_nhan&&ctx.query.ngay_tra?NV.phuKienTrong(p.id,ctx.query.ngay_nhan,ctx.query.ngay_tra,Number(ctx.query.don_id)||0):p.so_luong})));

/* UC 2.1 – Tra cứu lịch trống */
route('POST', '/api/tra-cuu/lich-trong', (ctx) => {
  const b = ctx.body;
  if (!b.dong_may_id) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng nhập đầy đủ thông tin', { dong_may_id: 'Vui lòng chọn dòng máy.', ...(!b.ngay_nhan && { ngay_nhan: 'Vui lòng chọn ngày nhận.' }), ...(!b.ngay_tra && { ngay_tra: 'Vui lòng chọn ngày trả.' }) });
  const t = NV.kiemTraThoiGian(str(b.ngay_nhan), str(b.ngay_tra), 'TRA_CUU');
  const dm = one('SELECT * FROM dong_may WHERE id=?', Number(b.dong_may_id));
  if (!dm) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy dòng máy.');
  const trong = NV.thietBiTrong(dm.id, t.nhan, t.tra);
  const thang = t.nhan.slice(0, 7);
  const ketQua = {
    dong_may: dongMayCongKhai(dm), ngay_nhan: t.nhan, ngay_tra: t.tra, thoi_luong: NV.moTaThoiLuong(t.soGio),
    so_trong: trong.length, thang, lich: NV.lichThang(dm.id, thang),
  };
  if (!trong.length) {
    // E05 – Không có thiết bị trống: gợi ý dòng máy khác còn trống
    ketQua.goi_y = all(`SELECT * FROM dong_may WHERE trang_thai='HOAT_DONG' AND id<>?`, dm.id)
      .filter((x) => NV.thietBiTrong(x.id, t.nhan, t.tra).length).slice(0, 3).map(dongMayCongKhai);
    ketQua.loi = { code: 'E05_KHONG_CO_THIET_BI_TRONG', message: `${dm.ten} đã kín lịch trong khoảng thời gian này.` };
  }
  return ketQua;
});

route('GET', '/api/tra-cuu/lich-thang', (ctx) => {
  const { dong_may_id, thang } = ctx.query;
  if (!dong_may_id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(thang || '')) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Thiếu dòng máy hoặc tháng.');
  return NV.lichThang(Number(dong_may_id), thang);
});

/* UC 2.2 – Tra cứu giá */
route('POST', '/api/tra-cuu/gia', (ctx) => {
  const b = ctx.body;
  const chon = (Array.isArray(b.may) ? b.may : (b.dong_may_id ? [{ dong_may_id: b.dong_may_id, so_luong: b.so_luong || 1 }] : []))
    .filter((x) => x.dong_may_id);
  if (!chon.length) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng nhập đầy đủ thông tin tra cứu giá.', { dong_may_id: 'Vui lòng chọn dòng máy.' });
  const t = NV.kiemTraThoiGian(str(b.ngay_nhan), str(b.ngay_tra), b.booking && ctx.user?.vai_tro==='KH' ? 'DAT_LICH' : 'TRA_CUU');
  const mayList = chon.map((c) => {
    const dm = one(`SELECT * FROM dong_may WHERE id=?`, Number(c.dong_may_id));
    if (!dm) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy dòng máy.');
    if (!dm.gia_ngay) throw new AppError(422, 'E03_CHUA_CO_BANG_GIA', `${dm.ten} chưa có bảng giá. Vui lòng liên hệ cửa hàng.`);
    return { dong_may: dm, so_luong: Number(c.so_luong ?? 1) };
  });
  const bg = NV.baoGia({ mayList, phuKien: b.phu_kien || [], soGio: t.soGio, maKm: str(b.ma_km), coDatLich: !!b.booking,nhan:t.nhan,tra:t.tra });
  return { ...bg, ngay_nhan: t.nhan, ngay_tra: t.tra, thoi_luong: NV.moTaThoiLuong(t.soGio) };
});

route('GET', '/api/khuyen-mai/hien-hanh', () => {
  const t = today();
  return all(`SELECT ma, ten, loai, gia_tri, don_toi_thieu, den_ngay FROM khuyen_mai WHERE trang_thai='BAT' AND tu_ngay<=? AND den_ngay>=? ORDER BY den_ngay`, t, t);
});

route('GET', '/api/quy-dinh', () => NV.QUY_DINH);

route('POST','/api/tra-cuu/gia-goi',ctx=>{
 const b=ctx.body,dm=one("SELECT * FROM dong_may WHERE id=? AND trang_thai='HOAT_DONG'",Number(b.dong_may_id)||0),h=Number(b.so_gio);
 if(!dm)throw new AppError(422,'E01_THIEU_THONG_TIN','Vui lòng chọn thiết bị.',{dong_may_id:'Vui lòng chọn thiết bị.'});
 if(!dm.gia_ngay)throw new AppError(422,'E03_CHUA_CO_BANG_GIA','Thiết bị chưa có bảng giá.');
 if(!Number.isFinite(h)||h<=0||h>24*3650||(b.tuy_chon ? h<96||![0,6].includes(h%24) : ![6,12,24,30,48,54,72,78].includes(h)))throw new AppError(422,'THOI_GIAN_KHONG_HOP_LE','Thời gian thuê không hợp lệ.',(b.tuy_chon?{so_ngay:'Số ngày tùy chọn phải từ 4 trở lên.'}:{so_gio:'Gói thuê không hợp lệ.'}));
 return NV.baoGia({mayList:[{dong_may:dm,so_luong:1}],soGio:h});
});
