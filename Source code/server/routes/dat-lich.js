// UC_3.2 Tạo đơn đặt lịch (khách hàng) · UC_3.1 Hủy đơn đặt lịch
const { route, AppError } = require('../lib/http');
const { one, all, run, tx, now, fmt, sinhMa } = require('../db');
const { requireRole } = require('../lib/auth');
const { str } = require('../lib/validate');
const NV = require('../services/nghiep-vu');
const DON = require('../services/don');

const laKhach = requireRole('KH');

function donCuaToi(ctx, id) {
  const d = DON.docDon(id);
  if (d.khach_hang_id !== ctx.user.khach_hang_id) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy đơn đặt lịch.');
  return d;
}

/* Bước 1: tạo đơn + giữ máy 15 phút chờ đặt cọc */
route('POST', '/api/dat-lich', laKhach, (ctx) => {
  const b = ctx.body;
  const t = NV.kiemTraThoiGian(str(b.ngay_nhan), str(b.ngay_tra), 'DAT_LICH');
  const chon = (Array.isArray(b.may)?b.may:[]).filter((x) => x.dong_may_id && Number(x.so_luong) > 0);
  if (!chon.length) throw new AppError(422, 'E05_CHUA_CHON_THIET_BI', 'Vui lòng chọn ít nhất một thiết bị.', { may: 'Chưa chọn thiết bị.' });
  const r = tx(() => {
    const thietBis = DON.chonThietBi({ chon, nhan: t.nhan, tra: t.tra });
    return DON.ghiDon({
      khachHangId: ctx.user.khach_hang_id, kenh: 'ONLINE', nhan: t.nhan, tra: t.tra, soGio: t.soGio, thietBis,
      phuKien: b.phu_kien || [], maKm: str(b.ma_km), ghiChu: str(b.ghi_chu), trangThai: 'CHO_COC',
      giuDen: fmt(new Date(Date.now() + NV.QUY_DINH.GIU_MAY_PHUT * 60e3)),
    });
  });
  return DON.docDon(r.id);
});

/* Bước 2: đặt cọc online (mô phỏng cổng thanh toán) */
route('POST', '/api/dat-lich/:id/dat-coc', laKhach, (ctx) => {
  NV.donDepGiuMay();
  const d = donCuaToi(ctx, ctx.params.id);
  if (d.trang_thai === 'DA_HUY') throw new AppError(409, 'E06_DAT_COC_KHONG_THANH_CONG', 'Đặt cọc không thành công: đơn đã hết thời gian giữ máy. Vui lòng đặt lại.');
  if (d.trang_thai !== 'CHO_COC') throw new AppError(409, 'DA_DAT_COC', 'Đơn này đã được đặt cọc.');
  const pt = str(ctx.body.phuong_thuc);
  if (!['CHUYEN_KHOAN', 'VI_DIEN_TU', 'THE'].includes(pt)) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng chọn phương thức thanh toán.', { phuong_thuc: 'Chưa chọn phương thức.' });
  const failure = tx(() => {
    // E07 – thiết bị vừa hết khi xác nhận: kiểm tra lại trùng lịch trước khi chốt
    const ban = NV.thietBiBan(d.ngay_nhan, d.ngay_tra, d.id);
    if (d.thiet_bi.some(x=>ban.has(x.id)||one('SELECT tinh_trang FROM thiet_bi WHERE id=?',x.id)?.tinh_trang!=='SAN_SANG') || d.phu_kien.some(p=>NV.phuKienTrong(p.id,d.ngay_nhan,d.ngay_tra,d.id)<p.so_luong)) {
      run(`UPDATE don_thue SET trang_thai='DA_HUY', ly_do_huy='Thiết bị vừa hết khi xác nhận', ngay_cap_nhat=? WHERE id=?`, now(), d.id);
      return true;
    }
    run(`UPDATE don_thue SET trang_thai='CHO_BAN_GIAO', giu_den=NULL, ngay_cap_nhat=? WHERE id=?`, now(), d.id);
    // Dùng đúng mã tham chiếu TT-YYMMDD-NNN đã hiển thị cho khách trên màn đặt cọc
    run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, d.ma_tham_chieu || sinhMa('TT'), d.id, 'DAT_LICH', d.coc_dat_lich, pt, now());
    // Mã tham chiếu thanh toán TT-YYMMDD-NNN hiển thị trên màn "Đặt cọc online" 
  });
  if(failure)throw new AppError(409,'E07_THIET_BI_VUA_HET','Thiết bị vừa hết hoặc đang bảo trì. Vui lòng chọn thiết bị khác.');
  return DON.docDon(d.id);
});

route('GET', '/api/don-cua-toi', laKhach, (ctx) => {
  NV.donDepGiuMay();
  return all(`SELECT id FROM don_thue WHERE khach_hang_id=? ORDER BY ngay_tao DESC, id DESC`, ctx.user.khach_hang_id)
    .map((r) => {
      const d = DON.docDon(r.id);
      d.co_the_huy = coTheHuy(d).ok;
      return d;
    });
});

route('GET', '/api/don-cua-toi/:id', laKhach, (ctx) => {
  const d = donCuaToi(ctx, ctx.params.id); d.co_the_huy = coTheHuy(d).ok; return d;
});

function coTheHuy(d) {
  if (!['CHO_COC', 'CHO_BAN_GIAO'].includes(d.trang_thai)) return { ok: false, ly_do: 'Chỉ hủy được đơn đang chờ bàn giao máy.' };
  return { ok: true };
}

route('POST', '/api/don-cua-toi/:id/huy', laKhach, (ctx) => {
  const d = donCuaToi(ctx, ctx.params.id);
  const k = coTheHuy(d);
  if (!k.ok) throw new AppError(409, 'E02_KHONG_DU_DIEU_KIEN_HUY', `Không đủ điều kiện hủy đơn. ${k.ly_do}`);
  const lyDo = str(ctx.body.ly_do);
  if(!lyDo)throw new AppError(422,'E01_THIEU_THONG_TIN','Vui lòng nhập lý do hủy.',{ly_do:'Vui lòng nhập lý do hủy.'});
  tx(() => {
    run(`UPDATE don_thue SET trang_thai='DA_HUY', ly_do_huy=?, ngay_cap_nhat=? WHERE id=?`, lyDo, now(), d.id);

  });
  return DON.docDon(d.id);
});

module.exports = { coTheHuy };

route('POST','/api/dat-lich/tim-may',laKhach,ctx=>{
 const t=NV.kiemTraThoiGian(str(ctx.body.ngay_nhan),str(ctx.body.ngay_tra),'DAT_LICH');
 const may=all("SELECT * FROM dong_may WHERE trang_thai='HOAT_DONG' ORDER BY ten").map(d=>({...d,so_trong:NV.thietBiTrong(d.id,t.nhan,t.tra).length,gia_thue:NV.tinhGiaMay(d,t.soGio).tong})).filter(x=>x.so_trong>0);
 const selected=may.find(d=>d.id===Number(ctx.body.dong_may_id));
 return {may,dong_may:selected||null,so_trong:selected?.so_trong||0,phu_kien:all('SELECT * FROM phu_kien ORDER BY ten').map(p=>({...p,kha_dung:NV.phuKienTrong(p.id,t.nhan,t.tra)})),ngay_nhan:t.nhan,ngay_tra:t.tra,thoi_luong:NV.moTaThoiLuong(t.soGio)};
});
