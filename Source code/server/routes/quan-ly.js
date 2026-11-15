// Quản lý danh mục (chủ cửa hàng): dòng máy, thiết bị, phụ kiện, bảng giá, khuyến mãi, tải ảnh
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { route, AppError } = require('../lib/http');
const { one, all, run, tx, now, today, sinhMa } = require('../db');
const { requirePerm, requireRole } = require('../lib/auth');
const { check, str } = require('../lib/validate');
const NV = require('../services/nghiep-vu');

const quyenTB = requirePerm('QL_THIET_BI');
const quyenGia = requirePerm('QL_GIA_KM');
const tien = (label) => [label, 'required', { min: 0, max: 100000000, int: true }];

/* ---------- Dòng máy ---------- */
const RULES_DM = {
  ten: ['Tên dòng máy', 'required', { len: 80 }], hang: ['Hãng', 'required', { len: 40 }], loai: ['Loại máy', { len: 40 }],
  mo_ta: ['Mô tả', { len: 1000 }],
  gia_buoi: tien('Giá gói 6 tiếng'), gia_ngay: tien('Giá gói 1 ngày'), gia_2_ngay: tien('Giá gói 2 ngày'),
  gia_3_ngay: tien('Giá gói 3 ngày'), gia_ngay_them: tien('Giá mỗi ngày từ ngày thứ 4'), tien_coc: tien('Tiền cọc'),
};
const COT_GIA = ['gia_buoi', 'gia_ngay', 'gia_2_ngay', 'gia_3_ngay', 'gia_ngay_them', 'tien_coc'];
/** Bảng giá phải tăng dần theo thời lượng gói: 6 tiếng ≤ 1 ngày ≤ 2 ngày ≤ 3 ngày */
function kiemTraGia(b) {
  const f = {}; const n = (k) => Number(b[k]);
  if (n('gia_buoi') > n('gia_ngay')) f.gia_buoi = 'Giá gói 6 tiếng không được lớn hơn giá gói 1 ngày.';
  if (n('gia_2_ngay') < n('gia_ngay')) f.gia_2_ngay = 'Giá gói 2 ngày phải lớn hơn hoặc bằng giá gói 1 ngày.';
  else if (n('gia_2_ngay') > 2 * n('gia_ngay')) f.gia_2_ngay = 'Giá gói 2 ngày không được lớn hơn 2 lần giá gói 1 ngày.';
  if (n('gia_3_ngay') < n('gia_2_ngay')) f.gia_3_ngay = 'Giá gói 3 ngày phải lớn hơn hoặc bằng giá gói 2 ngày.';
  else if (n('gia_3_ngay') > 3 * n('gia_ngay')) f.gia_3_ngay = 'Giá gói 3 ngày không được lớn hơn 3 lần giá gói 1 ngày.';
  if (Object.keys(f).length) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Bảng giá không hợp lệ.', f);
}
const thongSo = (b) => JSON.stringify(Object.fromEntries(Object.entries(b.thong_so || {}).map(([k, v]) => [k, str(v)]).filter(([, v]) => v)));

route('POST', '/api/dong-may', quyenTB, (ctx) => {
  const b={...ctx.body,gia_buoi:0,gia_ngay:0,gia_2_ngay:0,gia_3_ngay:0,gia_ngay_them:180000,tien_coc:0}; check(b,RULES_DM); kiemTraGia(b);
  if (one('SELECT 1 FROM dong_may WHERE ten=? COLLATE NOCASE', str(b.ten))) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên dòng máy đã tồn tại.', { ten: 'Tên dòng máy đã tồn tại.' });
  const id = tx(() => Number(run(`INSERT INTO dong_may(ma, ten, hang, loai, mo_ta, thong_so, anh, ${COT_GIA.join(', ')}, ngay_tao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sinhMa('DM'), str(b.ten), str(b.hang), str(b.loai) || 'Mirrorless', str(b.mo_ta) || null, thongSo(b), str(b.anh) || null,
    ...COT_GIA.map((k) => +b[k]), now()).lastInsertRowid));
  return one('SELECT * FROM dong_may WHERE id=?', id);
});

route('PUT', '/api/dong-may/:id', quyenTB, (ctx) => {
  const dm = one('SELECT * FROM dong_may WHERE id=?', Number(ctx.params.id));
  if (!dm) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy dòng máy.');
  const b = { ...dm, ...ctx.body,...Object.fromEntries(COT_GIA.map(k=>[k,dm[k]])) }; check(b, RULES_DM); kiemTraGia(b);
  if (one('SELECT 1 FROM dong_may WHERE ten=? COLLATE NOCASE AND id<>?', str(b.ten), dm.id)) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên dòng máy đã tồn tại.', { ten: 'Tên dòng máy đã tồn tại.' });
  const tt = ['HOAT_DONG', 'NGUNG'].includes(b.trang_thai) ? b.trang_thai : dm.trang_thai;
  run(`UPDATE dong_may SET ten=?, hang=?, loai=?, mo_ta=?, thong_so=?, anh=?, ${COT_GIA.map((k) => k + '=?').join(', ')}, trang_thai=? WHERE id=?`,
    str(b.ten), str(b.hang), str(b.loai), str(b.mo_ta) || null, ctx.body.thong_so ? thongSo(b) : dm.thong_so, str(b.anh) || null,
    ...COT_GIA.map((k) => +b[k]), tt, dm.id);
  return one('SELECT * FROM dong_may WHERE id=?', dm.id);
});

/* Bảng giá: cập nhật riêng phần giá (màn "Giá") */
route('PUT', '/api/dong-may/:id/gia', quyenGia, (ctx) => {
  const dm = one('SELECT * FROM dong_may WHERE id=?', Number(ctx.params.id));
  if (!dm) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy dòng máy.');
  const b = {...dm,...ctx.body};
  check(b, Object.fromEntries(COT_GIA.map((k) => [k, RULES_DM[k]])));
  kiemTraGia(b);
  const custom=customPrices(ctx.body,dm.goi_gia);
  run(`UPDATE dong_may SET ${COT_GIA.map(k=>k+'=?').join(', ')},goi_gia=? WHERE id=?`,...COT_GIA.map(k=>+b[k]),JSON.stringify(custom),dm.id);
  return one('SELECT * FROM dong_may WHERE id=?', dm.id);
});

function customPrices(body,old){
 let list=JSON.parse(old||'[]');
 if(typeof body.goi_ds==='string'&&body.goi_ds.trim()){let ds;try{ds=JSON.parse(body.goi_ds);}catch{ds=null;}
  if(!Array.isArray(ds)||ds.length>50||ds.some(x=>!x||!['gio','ngay'].includes(x.don_vi)||!Number.isInteger(x.thoi_luong)||x.thoi_luong<1||x.thoi_luong>3650||!Number.isInteger(x.gia)||x.gia<1||x.gia>100000000))throw new AppError(422,'GIA_KHONG_HOP_LE','Gói tùy chỉnh không hợp lệ.');
  list=ds.map(x=>({don_vi:x.don_vi,thoi_luong:x.thoi_luong,gia:x.gia}));}
 if(!body.gia_tuy_chinh)return list;
 const unit=str(body.don_vi),length=Number(body.thoi_luong),price=Number(body.gia_tuy_chinh);
 if(!['gio','ngay'].includes(unit)||!Number.isInteger(length)||length<1||length>3650||!Number.isInteger(price)||price<1||price>100000000)throw new AppError(422,'GIA_KHONG_HOP_LE','Gói tùy chỉnh không hợp lệ.');
 list=list.filter(x=>!(x.don_vi===unit&&x.thoi_luong===length));
 list.push({don_vi:unit,thoi_luong:length,gia:price});return list;
}
/* ---------- Thiết bị ---------- */
route('GET', '/api/thiet-bi', quyenTB, (ctx) => {
  const q = str(ctx.query.q); const dmId = Number(ctx.query.dong_may_id) || 0;
  const rows = all(`SELECT tb.*, dm.ten AS dong_may, dm.hang FROM thiet_bi tb JOIN dong_may dm ON dm.id=tb.dong_may_id
    WHERE (? = '' OR tb.ma LIKE ? OR tb.so_serial LIKE ? OR dm.ten LIKE ?) AND (? = 0 OR dm.id = ?) ORDER BY tb.ma`,
  q, `%${q}%`, `%${q}%`, `%${q}%`, dmId, dmId);
  const ban = NV.thietBiBan(now(), now().slice(0, 10) + ' 23:59');
  rows.forEach((r) => (r.dang_cho_thue = ban.has(r.id)));
  return rows;
});

const RULES_TB = { dong_may_id: ['Dòng máy', 'required'], so_serial: ['Số serial', { len: 40 }, (v) => (/^[A-Za-z0-9-]+$/.test(v) ? '' : 'Số serial chỉ gồm chữ, số và dấu gạch ngang.')], mau: ['Màu', { len: 30 }], ghi_chu: ['Ghi chú', { len: 300 }] };
route('POST', '/api/thiet-bi', quyenTB, (ctx) => {
  const b = ctx.body; check(b, RULES_TB);
  if (!one('SELECT 1 FROM dong_may WHERE id=?', Number(b.dong_may_id))) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Dòng máy không tồn tại.', { dong_may_id: 'Dòng máy không tồn tại.' });
  if (one('SELECT 1 FROM thiet_bi WHERE so_serial=?', str(b.so_serial))) throw new AppError(409, 'TRUNG_THONG_TIN', 'Số serial đã tồn tại.', { so_serial: 'Số serial đã tồn tại.' });
  const id = tx(() => {const newMa=sinhMa('TB');return Number(run(`INSERT INTO thiet_bi(ma, dong_may_id, so_serial, mau, tinh_trang, ghi_chu, ngay_tao) VALUES (?,?,?,?,?,?,?)`,
    newMa, Number(b.dong_may_id), str(b.so_serial)||newMa, str(b.mau) || null, 'SAN_SANG', str(b.ghi_chu) || null, now()).lastInsertRowid)});
  return one('SELECT * FROM thiet_bi WHERE id=?', id);
});

route('PUT', '/api/thiet-bi/:id', quyenTB, (ctx) => {
  const tb = one('SELECT * FROM thiet_bi WHERE id=?', Number(ctx.params.id));
  if (!tb) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy thiết bị.');
  const b = { ...tb, ...ctx.body }; check(b, RULES_TB);
  if (one('SELECT 1 FROM thiet_bi WHERE so_serial=? AND id<>?', str(b.so_serial), tb.id)) throw new AppError(409, 'TRUNG_THONG_TIN', 'Số serial đã tồn tại.', { so_serial: 'Số serial đã tồn tại.' });
  if (!['SAN_SANG', 'BAO_TRI', 'NGUNG'].includes(b.tinh_trang)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Tình trạng không hợp lệ.');
  if (b.tinh_trang !== 'SAN_SANG') {
    const tuongLai = one(`SELECT d.ma FROM chi_tiet_don c JOIN don_thue d ON d.id=c.don_id WHERE c.thiet_bi_id=? AND d.trang_thai IN ('CHO_COC','CHO_BAN_GIAO','DANG_THUE') LIMIT 1`, tb.id);
    // BR07: staff must be able to mark a broken item and contact affected customers.
  }
  run('UPDATE thiet_bi SET dong_may_id=?, so_serial=?, mau=?, tinh_trang=?, ghi_chu=?,anh_tinh_trang=? WHERE id=?', Number(b.dong_may_id), str(b.so_serial)||tb.so_serial, str(b.mau) || null, b.tinh_trang, str(b.ghi_chu) || null, str(b.anh_tinh_trang)||tb.anh_tinh_trang, tb.id);
  const saved=one('SELECT * FROM thiet_bi WHERE id=?', tb.id);
  if(saved.tinh_trang!=='SAN_SANG')saved.canh_bao_don=all("SELECT DISTINCT d.ma FROM chi_tiet_don c JOIN don_thue d ON d.id=c.don_id WHERE c.thiet_bi_id=? AND d.trang_thai IN ('CHO_COC','CHO_BAN_GIAO','DANG_THUE')",tb.id).map(x=>x.ma);
  return saved;
});

/* ---------- Phụ kiện ---------- */
const RULES_PK = { ten: ['Tên phụ kiện', 'required', { len: 60 }], gia_ngay: tien('Giá thuê / ngày'), so_luong: ['Số lượng', 'required', { min: 0, max: 999, int: true }] };
route('POST', '/api/phu-kien', quyenTB, (ctx) => {
  const b = ctx.body; check(b, RULES_PK);
  if (one('SELECT 1 FROM phu_kien WHERE ten=? COLLATE NOCASE', str(b.ten))) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên phụ kiện đã tồn tại.', { ten: 'Tên phụ kiện đã tồn tại.' });
  const id = tx(() => Number(run('INSERT INTO phu_kien(ma, ten, gia_ngay, so_luong, anh, ngay_tao) VALUES (?,?,?,?,?,?)', sinhMa('PK'), str(b.ten), +b.gia_ngay, +b.so_luong, str(b.anh) || null, now()).lastInsertRowid));
  return one('SELECT * FROM phu_kien WHERE id=?', id);
});
route('PUT', '/api/phu-kien/:id', quyenTB, (ctx) => {
  const pk = one('SELECT * FROM phu_kien WHERE id=?', Number(ctx.params.id));
  if (!pk) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy phụ kiện.');
  const b = { ...pk, ...ctx.body }; check(b, RULES_PK);
  if (one('SELECT 1 FROM phu_kien WHERE ten=? COLLATE NOCASE AND id<>?', str(b.ten), pk.id)) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên phụ kiện đã tồn tại.', { ten: 'Tên phụ kiện đã tồn tại.' });
  run('UPDATE phu_kien SET ten=?, gia_ngay=?, so_luong=?, anh=? WHERE id=?', str(b.ten), +b.gia_ngay, +b.so_luong, str(b.anh) || null, pk.id);
  return one('SELECT * FROM phu_kien WHERE id=?', pk.id);
});

route('PUT','/api/phu-kien/:id/gia',quyenGia,ctx=>{
 const pk=one('SELECT * FROM phu_kien WHERE id=?',Number(ctx.params.id));
 if(!pk)throw new AppError(404,'KHONG_TIM_THAY','Không tìm thấy phụ kiện.');
 const b=ctx.body;
 const fields=['gia_buoi','gia_ngay','gia_2_ngay','gia_3_ngay','gia_ngay_them'];
 check(b,Object.fromEntries(fields.map(k=>[k,tien(k)])));
 const custom=customPrices(b,pk.goi_gia);
 run('UPDATE phu_kien SET gia_buoi=?,gia_ngay=?,gia_2_ngay=?,gia_3_ngay=?,gia_ngay_them=?,goi_gia=? WHERE id=?',...fields.map(k=>+b[k]),JSON.stringify(custom),pk.id);
 return one('SELECT * FROM phu_kien WHERE id=?',pk.id);
});
/* ---------- Khuyến mãi ---------- */
function promoBody(input){
 const b={...input};
 b.khong_gioi_han=!!b.khong_gioi_han;
 if(b.khong_gioi_han){b.tu_ngay='0001-01-01';b.den_ngay='9999-12-31';}
 b.dong_may_ids=b.tat_ca?[]:Array.isArray(b.dong_may_ids)?[...new Set(b.dong_may_ids.map(Number))]:typeof b.dong_may_ids==='string'?JSON.parse(b.dong_may_ids):[];
 if(b.dong_may_ids.some(id=>!Number.isInteger(id)||!one('SELECT 1 FROM dong_may WHERE id=?',id)))throw new AppError(422,'THIET_BI_KHONG_HOP_LE','Thiết bị áp dụng không hợp lệ.');
 return b;
}
route('GET', '/api/khuyen-mai', quyenGia, () => {
  const t = today();
  return all('SELECT * FROM khuyen_mai ORDER BY id DESC').map((k) => ({
    ...k,dong_may_ids:JSON.parse(k.dong_may_ids||'[]'), hieu_luc: k.trang_thai === 'BAT' && k.tu_ngay <= t && k.den_ngay >= t ? 'DANG_AP_DUNG' : (k.den_ngay < t ? 'HET_HAN' : (k.tu_ngay > t ? 'SAP_DIEN_RA' : 'TAM_TAT')),
    so_lan_dung: one(`SELECT COUNT(*) n FROM don_thue WHERE khuyen_mai_id=? AND trang_thai<>'DA_HUY'`, k.id).n,
  }));
});
const RULES_KM = {
  ten: ['Tên chương trình', 'required', { len: 80 }], loai: ['Loại giảm', 'required'],
  gia_tri: ['Giá trị giảm', 'required', { min: 1, int: true }], don_toi_thieu: ['Đơn tối thiểu', { min: 0, int: true }],
  tu_ngay: ['Ngày bắt đầu', 'required'], den_ngay: ['Ngày kết thúc', 'required'],
};
function kiemTraKm(b, cu) {
  const f = {};
  if (b.loai !== 'PHAN_TRAM') f.loai = 'Khuyến mãi chỉ áp dụng theo phần trăm.';
  if (!Number.isInteger(Number(b.gia_tri)) || Number(b.gia_tri) < 1 || Number(b.gia_tri) > 50) f.gia_tri = 'Phần trăm giảm không hợp lệ';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tu_ngay)) f.tu_ngay = 'Ngày không hợp lệ.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.den_ngay)) f.den_ngay = 'Ngày không hợp lệ.';
  else if (b.den_ngay < b.tu_ngay) f.den_ngay = 'Ngày kết thúc phải sau ngày bắt đầu.';
  else if (!cu && b.den_ngay < today()) f.den_ngay = 'Ngày kết thúc không được ở trong quá khứ.';
  if (Object.keys(f).length) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Thông tin khuyến mãi không hợp lệ.', f);
}
route('POST', '/api/khuyen-mai', quyenGia, (ctx) => {
  const b=promoBody(ctx.body); check(b,RULES_KM); kiemTraKm(b);
  if (one('SELECT 1 FROM khuyen_mai WHERE ten=? COLLATE NOCASE', str(b.ten))) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên chương trình đã tồn tại.', { ten: 'Tên chương trình đã tồn tại.' });
  const id = tx(() => Number(run(`INSERT INTO khuyen_mai(ma, ten, loai, gia_tri, don_toi_thieu, tu_ngay, den_ngay, trang_thai, ngay_tao,khong_gioi_han,dong_may_ids,dieu_kien) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    sinhMa('KM'), str(b.ten), b.loai, +b.gia_tri, +b.don_toi_thieu || 0, b.tu_ngay, b.den_ngay, b.trang_thai === 'TAT' ? 'TAT' : 'BAT', now(),b.khong_gioi_han?1:0,JSON.stringify(b.dong_may_ids),str(b.dieu_kien)||null).lastInsertRowid));
  return one('SELECT * FROM khuyen_mai WHERE id=?', id);
});
route('PUT', '/api/khuyen-mai/:id', quyenGia, (ctx) => {
  const km = one('SELECT * FROM khuyen_mai WHERE id=?', Number(ctx.params.id));
  if (!km) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy khuyến mãi.');
  const b = promoBody({...km,...ctx.body}); check(b,RULES_KM); kiemTraKm(b, km);
  if (one('SELECT 1 FROM khuyen_mai WHERE ten=? COLLATE NOCASE AND id<>?', str(b.ten), km.id)) throw new AppError(409, 'TRUNG_THONG_TIN', 'Tên chương trình đã tồn tại.', { ten: 'Tên chương trình đã tồn tại.' });
  run('UPDATE khuyen_mai SET ten=?, loai=?, gia_tri=?, don_toi_thieu=?, tu_ngay=?, den_ngay=?, trang_thai=?,khong_gioi_han=?,dong_may_ids=?,dieu_kien=? WHERE id=?',
    str(b.ten), b.loai, +b.gia_tri, +b.don_toi_thieu || 0, b.tu_ngay, b.den_ngay, b.trang_thai === 'TAT' ? 'TAT' : 'BAT',b.khong_gioi_han?1:0,JSON.stringify(b.dong_may_ids),str(b.dieu_kien)||null, km.id);
  return one('SELECT * FROM khuyen_mai WHERE id=?', km.id);
});

/* ---------- Tải ảnh (data URL) ---------- */
const { UPLOAD_DIR } = require('../lib/uploads');
route('POST', '/api/upload', requireRole('NV', 'CH'), (ctx) => {
  const m = String(ctx.body.data_url || '').match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Chỉ nhận ảnh PNG hoặc JPG.');
  const buf = Buffer.from(m[2], 'base64');
  if(buf.length>=5*1024*1024)throw new AppError(413,'QUA_LON','Ảnh phải nhỏ hơn 5MB.');
  const png=m[1]==='png',valid=png?buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buf[0]===255&&buf[1]===216&&buf[buf.length-2]===255&&buf[buf.length-1]===217;
  if(!valid)throw new AppError(422,'ANH_KHONG_HOP_LE','Tệp ảnh không hợp lệ.');
  const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); fs.writeFileSync(path.join(UPLOAD_DIR, name), buf); } catch { /* đĩa chỉ đọc (Vercel): ảnh vẫn nằm trong CSDL */ }
  // Đăng ký tệp để các nghiệp vụ (ảnh CCCD, ảnh lỗi…) kiểm tra được; ảnh CCCD là riêng tư
  run('INSERT INTO tep_tai_len(ten, nguoi_id, rieng_tu, du_lieu) VALUES (?,?,?,?)', name, ctx.user.id, ctx.body.rieng_tu ? 1 : 0, buf);
  return { url: '/uploads/' + name };
});
