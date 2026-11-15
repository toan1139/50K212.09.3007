// UC_4 Xử lý đơn thuê (nhân viên & chủ cửa hàng)
//  4.0/4.7 Danh sách & tìm kiếm · 4.1 Chi tiết · 4.2 Hủy · 4.3 Tạo · 4.4 Cập nhật · 4.5 Ghi nhận CCCD · 4.6 Ghi nhận lỗi
const { route, AppError } = require('../lib/http');
const { one, all, run, tx, now, sinhMa, today, fmt, pad } = require('../db');
const { requirePerm } = require('../lib/auth');
const { check, str,fold } = require('../lib/validate');
const NV = require('../services/nghiep-vu');
const DON = require('../services/don');
const { timHoacTaoKhach } = require('./khach-hang');

const quyenDon = requirePerm('XU_LY_DON');
const KHOA = ['HOAN_TAT', 'DA_HUY','CHO_KIEM_TRA'];
const {requireImage}=require('../lib/uploads');
const deposit=b=>check(b,{tien_coc_may:['Tiền cọc','required',{min:0,max:1000000000,int:true}]});
const history=(id,user,text)=>run('INSERT INTO lich_su_don(don_id,nguoi_id,noi_dung,thoi_gian) VALUES (?,?,?,?)',id,user,text,now());

route('GET', '/api/don-thue', quyenDon, (ctx) => {
  NV.donDepGiuMay();
  const { q = '', trang_thai = '', tu = '', den = '' } = ctx.query;
  const where = ['1=1']; const p = [];
  
  if (trang_thai) { where.push('d.trang_thai = ?'); p.push(trang_thai); }
  if (tu) { where.push('d.ngay_nhan >= ?'); p.push(tu + ' 00:00'); }
  if (den) { where.push('d.ngay_nhan <= ?'); p.push(den + ' 23:59'); }
  const rows = all(`SELECT d.id, d.ma, d.ma_dat_lich, d.trang_thai, d.kenh, d.ngay_nhan, d.ngay_tra, d.ngay_tao,
      d.tien_thue + d.tien_phu_kien - d.giam_gia AS tong_tien,
      kh.ho_ten AS ten_khach_hang, kh.sdt AS sdt_khach_hang, tk.ho_ten AS ten_nguoi_tao, tk.vai_tro AS vai_tro_nguoi_tao,
      (SELECT GROUP_CONCAT(dm.ten, ', ') FROM chi_tiet_don c JOIN thiet_bi tb ON tb.id=c.thiet_bi_id JOIN dong_may dm ON dm.id=tb.dong_may_id WHERE c.don_id=d.id) AS thiet_bi
    FROM don_thue d JOIN khach_hang kh ON kh.id=d.khach_hang_id LEFT JOIN tai_khoan tk ON tk.id=d.nguoi_tao_id
    WHERE ${where.join(' AND ')} ORDER BY d.ngay_tao DESC, d.id DESC LIMIT 500`, ...p);
  rows.forEach((r) => (r.ten_trang_thai = NV.TRANG_THAI[r.trang_thai]));
  const dem = Object.fromEntries(all(`SELECT trang_thai, COUNT(*) n FROM don_thue GROUP BY trang_thai`).map((r) => [r.trang_thai, r.n]));
  return { du_lieu: rows.filter(r=>!q||fold([r.ma,r.ma_dat_lich,r.ten_khach_hang,r.sdt_khach_hang].join(' ')).includes(fold(q))), dem };
});

route('GET', '/api/don-thue/:id', quyenDon, (ctx) => DON.docDon(ctx.params.id));

/* 4.3 Tạo đơn thuê tại quầy */
route('POST', '/api/don-thue', quyenDon, (ctx) => {
  const b = ctx.body;
  const fields = {};
  if (!b.khach_hang_id && !b.khach_moi) fields.khach_hang_id = 'Vui lòng chọn hoặc nhập khách hàng.';
  const thietBiIds = (b.thiet_bi_ids || []).map(Number).filter(Boolean);
  if (!thietBiIds.length) fields.thiet_bi_ids = 'Vui lòng chọn ít nhất một thiết bị.';
  if (Object.keys(fields).length) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng nhập đầy đủ thông tin đơn thuê.', fields);
  const t = NV.kiemTraThoiGian(str(b.ngay_nhan), str(b.ngay_tra), 'TAI_QUAY');
  if(b.tien_coc_may!==undefined)deposit(b);
  const r = tx(() => {
    const khId = b.khach_hang_id ? Number(b.khach_hang_id) : timHoacTaoKhach(b.khach_moi);
    if (!one('SELECT 1 FROM khach_hang WHERE id=?', khId)) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy khách hàng.');
    const thietBis = DON.chonThietBi({ thietBiIds, nhan: t.nhan, tra: t.tra });
    const created=DON.ghiDon({ khachHangId: khId, nguoiTaoId: ctx.user.id, kenh: 'TAI_QUAY', nhan: t.nhan, tra: t.tra, soGio: t.soGio,
      thietBis, phuKien: b.phu_kien || [], maKm: str(b.ma_km), ghiChu: str(b.ghi_chu), trangThai: 'CHO_BAN_GIAO' });
    if(b.tien_coc_may!==undefined)run('UPDATE don_thue SET tien_coc_may=? WHERE id=?',Number(b.tien_coc_may),created.id);
    history(created.id,ctx.user.id,'Tạo đơn thuê');
    return created;
  });
  return DON.docDon(r.id);
});

/* Báo giá nhanh cho form tạo / cập nhật đơn */
route('POST', '/api/don-thue/bao-gia', quyenDon, (ctx) => {
  const b = ctx.body;
  const t = NV.kiemTraThoiGian(str(b.ngay_nhan), str(b.ngay_tra), 'TAI_QUAY', { boQuaQuaKhu: !!b.don_id });
  const ids = (b.thiet_bi_ids || []).map(Number).filter(Boolean);
  const thietBis = ids.map((id) => one('SELECT * FROM thiet_bi WHERE id=?', id)).filter(Boolean);
  const bg = NV.baoGia({ mayList: DON.gomTheoDongMay(thietBis), phuKien: b.phu_kien || [], soGio: t.soGio, maKm: str(b.ma_km),nhan:t.nhan,tra:t.tra,boQuaDonId:Number(b.don_id)||0 });
  return { ...bg, thoi_luong: NV.moTaThoiLuong(t.soGio) };
});

/* Thiết bị trống cho form tạo / cập nhật đơn */
route('GET', '/api/don-thue/thiet-bi-trong', quyenDon, (ctx) => {
  const { ngay_nhan, ngay_tra, don_id = 0 } = ctx.query;
  const t = NV.kiemTraThoiGian(ngay_nhan, ngay_tra, 'TAI_QUAY', { boQuaQuaKhu: !!Number(don_id) });
  const ban = NV.thietBiBan(t.nhan, t.tra, Number(don_id));
  return all(`SELECT tb.id, tb.ma, tb.so_serial, dm.id AS dong_may_id, dm.ten AS dong_may, dm.hang, dm.gia_ngay, dm.anh, tb.mau
    FROM thiet_bi tb JOIN dong_may dm ON dm.id=tb.dong_may_id WHERE tb.tinh_trang='SAN_SANG' AND dm.trang_thai='HOAT_DONG' ORDER BY dm.ten, tb.ma`)
    .filter((x) => !ban.has(x.id));
});

/* 4.4 Cập nhật thông tin đơn thuê */
route('PUT', '/api/don-thue/:id', quyenDon, (ctx) => {
  const d = DON.docDon(ctx.params.id); const b = ctx.body;
  if (KHOA.includes(d.trang_thai)) throw new AppError(409, 'KHONG_THE_CAP_NHAT', `Không thể cập nhật đơn ở trạng thái "${d.ten_trang_thai}".`);
  const doiThoiGian = ['CHO_BAN_GIAO','CHO_COC'].includes(d.trang_thai);
  if(b.tien_coc_may!==undefined)deposit(b);
  if(!doiThoiGian && b.ngay_nhan && b.ngay_nhan.replace('T',' ')!==d.ngay_nhan)throw new AppError(409,'KHONG_THE_CAP_NHAT','Không thể thay đổi thời điểm nhận sau khi đã bàn giao.');
  if(b.ho_ten!==undefined||b.sdt!==undefined){check(b,{ho_ten:['Họ tên khách','required','ten'],sdt:['Số điện thoại','required','sdt']});
    if(one('SELECT 1 FROM khach_hang WHERE sdt=? AND id<>?',str(b.sdt),d.khach_hang_id))throw new AppError(409,'SDT_TRUNG','Số điện thoại đã thuộc về khách hàng khác.',{sdt:'Số điện thoại đã thuộc về khách hàng khác.'});}
  const nhan = doiThoiGian ? str(b.ngay_nhan) || d.ngay_nhan : d.ngay_nhan;
  const t = NV.kiemTraThoiGian(nhan, str(b.ngay_tra) || d.ngay_tra, 'TAI_QUAY', { boQuaQuaKhu: !doiThoiGian || nhan === d.ngay_nhan });
  const ids = doiThoiGian && Array.isArray(b.thiet_bi_ids) ? b.thiet_bi_ids.map(Number).filter(Boolean) : d.thiet_bi.map((x) => x.id);
  if (!ids.length) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Đơn thuê phải có ít nhất một thiết bị.', { thiet_bi_ids: 'Chưa chọn thiết bị.' });
  tx(() => {
    const thietBis = DON.chonThietBi({ thietBiIds: ids, nhan: t.nhan, tra: t.tra, boQuaDonId: d.id });
    const phuKien = Array.isArray(b.phu_kien) ? b.phu_kien : d.phu_kien.map((p) => ({ id: p.id, so_luong: p.so_luong }));
    const maKm = b.ma_km !== undefined ? str(b.ma_km) : d.ma_km || '';
    const bg = NV.baoGia({ mayList: DON.gomTheoDongMay(thietBis), phuKien, soGio: t.soGio, maKm, coDatLich: d.kenh==='ONLINE',nhan:t.nhan,tra:t.tra,boQuaDonId:d.id });
    run(`UPDATE don_thue SET ngay_nhan=?, ngay_tra=?, tien_thue=?, tien_phu_kien=?, giam_gia=?, khuyen_mai_id=?, tien_coc_may=?, ghi_chu=?, ngay_cap_nhat=? WHERE id=?`,
      t.nhan, t.tra, bg.tien_thue, bg.tien_phu_kien, bg.giam_gia, bg.khuyen_mai?.id ?? null, b.tien_coc_may!==undefined?Number(b.tien_coc_may):d.tien_coc_may,
      b.ghi_chu !== undefined ? str(b.ghi_chu) : d.ghi_chu, now(), d.id);
    if(b.ho_ten!==undefined){
      const kh=one('SELECT * FROM khach_hang WHERE id=?',d.khach_hang_id);
      run('UPDATE khach_hang SET ho_ten=?,sdt=? WHERE id=?',str(b.ho_ten),str(b.sdt),kh.id);
      if(kh.tai_khoan_id){const trung=one('SELECT 1 FROM tai_khoan WHERE sdt=? AND id<>?',str(b.sdt),kh.tai_khoan_id);
        run('UPDATE tai_khoan SET ho_ten=?,sdt=?,ngay_cap_nhat=? WHERE id=?',str(b.ho_ten),trung?kh.sdt:str(b.sdt),now(),kh.tai_khoan_id);}
    }
    DON.ghiChiTiet(d.id, thietBis, bg);
    history(d.id,ctx.user.id,'Cập nhật thông tin đơn thuê');
  });
  return DON.docDon(d.id);
});

/* 4.2 Hủy đơn thuê */
route('POST', '/api/don-thue/:id/huy', quyenDon, (ctx) => {
  const d = DON.docDon(ctx.params.id);
  if (!['CHO_COC', 'CHO_BAN_GIAO'].includes(d.trang_thai)) throw new AppError(409, 'KHONG_THE_HUY', `Không thể hủy đơn ở trạng thái "${d.ten_trang_thai}". Chỉ hủy được đơn chưa bàn giao máy.`);
  const lyDo = str(ctx.body.ly_do);
  if (!lyDo) throw new AppError(422, 'E01_THIEU_THONG_TIN', 'Vui lòng nhập lý do hủy đơn.', { ly_do: 'Vui lòng nhập lý do hủy.' });
  tx(() => {
    run(`UPDATE don_thue SET trang_thai='DA_HUY', ly_do_huy=?, ngay_cap_nhat=? WHERE id=?`, lyDo, now(), d.id);
    history(d.id,ctx.user.id,'Hủy đơn: '+lyDo);
  });
  return DON.docDon(d.id);
});

/* CCCD: exactly two private image files, as in UC_4.5. */
route('POST','/api/don-thue/:id/cccd',quyenDon,ctx=>{
 const d=DON.docDon(ctx.params.id),b=ctx.body;
 if(!['CHO_BAN_GIAO','DANG_THUE'].includes(d.trang_thai))throw new AppError(409,'KHONG_THE_GHI_NHAN','Không thể ghi nhận CCCD ở trạng thái hiện tại.');
 const front=requireImage(b.anh_truoc,'anh_truoc',{privateOnly:true}),back=requireImage(b.anh_sau,'anh_sau',{privateOnly:true});
 tx(()=>{
  run('INSERT INTO ghi_nhan_cccd(don_id,so_cccd,ho_ten,nguoi_ghi_id,thoi_gian,anh_truoc,anh_sau) VALUES (?,?,?,?,?,?,?) ON CONFLICT(don_id) DO UPDATE SET anh_truoc=excluded.anh_truoc,anh_sau=excluded.anh_sau,nguoi_ghi_id=excluded.nguoi_ghi_id,thoi_gian=excluded.thoi_gian',d.id,d.cccd_khach_hang||'',d.ten_khach_hang,ctx.user.id,now(),front,back);
  history(d.id,ctx.user.id,'Ghi nhận hai mặt CCCD');
 });return DON.docDon(d.id);
});
/* Validate every fault before storing the batch. */
route('POST','/api/don-thue/:id/loi',quyenDon,ctx=>{
 const d=DON.docDon(ctx.params.id),list=ctx.body.loi;
 if(d.trang_thai!=='DANG_THUE')throw new AppError(409,'KHONG_THE_GHI_NHAN','Chỉ ghi nhận lỗi cho đơn đang thuê.');
 if(!Array.isArray(list)||!list.length||list.length>30)throw new AppError(422,'E01_THIEU_THONG_TIN','Vui lòng nhập thông tin lỗi.');
 list.forEach((b,i)=>{
  check(b,{doi_tuong:['Đối tượng','required'],muc_do:['Mức độ','required'],mo_ta:['Mô tả lỗi','required',{len:500}],phi_den_bu:['Phí đền bù',{min:0,max:100000000,int:true}]});
  if(!['MAY','PHU_KIEN'].includes(b.doi_tuong)||!['NHE','TRUNG_BINH','NANG'].includes(b.muc_do))throw new AppError(422,'E02_KHONG_HOP_LE','Đối tượng hoặc mức độ lỗi không hợp lệ.');
  const belongs=b.doi_tuong==='MAY'?d.thiet_bi.some(x=>x.id===Number(b.thiet_bi_id)):d.phu_kien.some(x=>x.id===Number(b.phu_kien_id));
  if(!belongs)throw new AppError(422,'TB_KHONG_THUOC_DON','Vui lòng chọn thiết bị hoặc phụ kiện thuộc đơn.');
  requireImage(b.anh,'anh_'+i);
 });
 tx(()=>{
  list.forEach(b=>{
   run('INSERT INTO loi_ghi_nhan(ma,don_id,doi_tuong,thiet_bi_id,phu_kien_id,muc_do,mo_ta,phi_den_bu,nguoi_ghi_id,thoi_gian,anh) VALUES (?,?,?,?,?,?,?,?,?,?,?)',sinhMa('LG'),d.id,b.doi_tuong,b.doi_tuong==='MAY'?Number(b.thiet_bi_id):null,b.doi_tuong==='PHU_KIEN'?Number(b.phu_kien_id):null,b.muc_do,str(b.mo_ta),Number(b.phi_den_bu||0),ctx.user.id,now(),b.anh);
   if(b.doi_tuong==='MAY'&&b.muc_do==='NANG')run("UPDATE thiet_bi SET tinh_trang='BAO_TRI',ghi_chu=? WHERE id=?",'Lỗi nặng từ đơn '+d.ma,Number(b.thiet_bi_id));
  });
  run('UPDATE don_thue SET phi_den_bu=(SELECT COALESCE(SUM(phi_den_bu),0) FROM loi_ghi_nhan WHERE don_id=?),ngay_cap_nhat=? WHERE id=?',d.id,now(),d.id);
  history(d.id,ctx.user.id,'Ghi nhận '+list.length+' lỗi');
 });return DON.docDon(d.id);
});

/* Chuyển trạng thái: bàn giao -> trả máy -> tất toán */
route('POST', '/api/don-thue/:id/trang-thai', quyenDon, (ctx) => {
  const d = DON.docDon(ctx.params.id); const moi = str(ctx.body.trang_thai);
  if (!(DON.CHUYEN_HOP_LE[d.trang_thai] || []).includes(moi))
    throw new AppError(409, 'CHUYEN_KHONG_HOP_LE', `Không thể chuyển đơn từ "${d.ten_trang_thai}" sang "${NV.TRANG_THAI[moi] || moi}".`);
  if (moi === 'DANG_THUE' && (!d.cccd?.anh_truoc || !d.cccd?.anh_sau)) throw new AppError(409, 'CHUA_GHI_NHAN_CCCD', 'Vui lòng ghi nhận CCCD của khách trước khi bàn giao máy.');
  tx(() => {
    if(moi==='DANG_THUE'){
      if(d.qua_han_nhan)throw new AppError(409,'DON_QUA_HAN','Đơn đã quá hạn nhận. Vui lòng cập nhật lịch trước khi bàn giao.');
      DON.chonThietBi({thietBiIds:d.thiet_bi.map(x=>x.id),nhan:d.ngay_nhan,tra:d.ngay_tra,boQuaDonId:d.id});
      run('UPDATE don_thue SET ban_giao_luc=? WHERE id=?',now(),d.id);
    }
    if (moi === 'CHO_KIEM_TRA') {
      // Khách trả máy: tính phí trả trễ 30.000đ/giờ nếu quá hạn
      const tre = NV.phiTraTre(d.ngay_tra);
      run('UPDATE don_thue SET phi_tra_tre=?,tra_thuc_te=? WHERE id=?', tre.phi, now(), d.id);
    }
    if (moi === 'HOAN_TAT') {
      run('UPDATE don_thue SET hoan_tat_luc=? WHERE id=?',now(),d.id);
      const daTra = d.thanh_toan.filter((x) => ['DAT_LICH', 'THUE', 'HOAN_DAT_LICH'].includes(x.loai)).reduce((s, x) => s + x.so_tien, 0);
      const conLai = d.tong_tien - Math.max(0, daTra);
      const pt = str(ctx.body.phuong_thuc) || 'TIEN_MAT';
      if (conLai > 0) run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, sinhMa('TT'), d.id, 'THUE', conLai, pt, now());
      if (d.phi_tra_tre > 0) run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, sinhMa('TT'), d.id, 'TRA_TRE', d.phi_tra_tre, pt, now());
      if (d.phi_den_bu > 0) run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, sinhMa('TT'), d.id, 'DEN_BU', d.phi_den_bu, pt, now());
    }
    run('UPDATE don_thue SET trang_thai=?, ngay_cap_nhat=? WHERE id=?', moi, now(), d.id);
    history(d.id,ctx.user.id,NV.TRANG_THAI[moi]);
  });
  return DON.docDon(d.id);
});

/* Quản lý lịch: lịch chung thiết bị (lưới thiết bị × ngày) */
route('GET', '/api/lich-chung', requirePerm('QL_LICH'), (ctx) => {
  const tu = ctx.query.tu || today();
  const soNgay = Math.min(31, Math.max(1, Number(ctx.query.so_ngay) || 14));
  const d0 = new Date(tu + 'T00:00');
  if (isNaN(d0)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Ngày bắt đầu không hợp lệ.');
  const ngay = Array.from({ length: soNgay }, (_, i) => { const x = new Date(d0); x.setDate(x.getDate() + i); return fmt(x).slice(0, 10); });
  const den = fmt(new Date(new Date(ngay[ngay.length - 1] + 'T00:00').getTime() + 86400e3));
  const dmId=Number(ctx.query.dong_may_id)||0;
  const where=dmId?'AND dm.id = ?':'';
  const tbs = all(`SELECT tb.id, tb.ma, tb.mau, tb.tinh_trang, dm.ten AS dong_may FROM thiet_bi tb JOIN dong_may dm ON dm.id=tb.dong_may_id WHERE tb.tinh_trang<>'NGUNG' ${where} ORDER BY dm.ten, tb.ma`,...(dmId?[dmId]:[]));
  const dons = all(`SELECT c.thiet_bi_id, d.id, d.ma, d.trang_thai, d.ngay_nhan, d.ngay_tra, kh.ho_ten FROM chi_tiet_don c JOIN don_thue d ON d.id=c.don_id JOIN khach_hang kh ON kh.id=d.khach_hang_id
    WHERE d.trang_thai NOT IN ('DA_HUY','HOAN_TAT')
 AND NOT (d.kenh='ONLINE' AND d.trang_thai='CHO_BAN_GIAO' AND substr(d.ngay_nhan,1,10)<?)
 AND d.ngay_nhan < ? AND (d.ngay_tra > ? OR (d.trang_thai IN ('DANG_THUE','CHO_KIEM_TRA') AND d.ngay_tra<?))`,today(),den,tu+' 00:00',now());
  return {
    ngay,
    thiet_bi: tbs.map((tb) => ({
      ...tb,
      o: ngay.map((n) => {
        const dau = n + ' 00:00', cuoi = n + ' 23:59';
        const x = dons.find((dd) => dd.thiet_bi_id === tb.id && dd.ngay_nhan <= cuoi && (dd.ngay_tra > dau || (['DANG_THUE','CHO_KIEM_TRA'].includes(dd.trang_thai)&&dd.ngay_tra<now())));
        return x ? { don_id: x.id, ma: x.ma, trang_thai: x.trang_thai, khach: x.ho_ten } : null;
      }),
    })),
  };
});
