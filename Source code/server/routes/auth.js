// Authentication and one-time-code flows.
const crypto=require('node:crypto');
const {route,AppError}=require('../lib/http');
const {one,run,tx,sinhMa,now,fmt}=require('../db');
const {check,str,birthDate,RE}=require('../lib/validate');
const A=require('../lib/auth');
const OTP_PHUT=5,OTP_SAI_TOI_DA=5;
const passwordRule=v=>v.length<8||!/[A-Za-z]/.test(v)||!/\d/.test(v)?'Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số.':'';
const passwordFields={mat_khau:['Mật khẩu','required',passwordRule],xac_nhan_mat_khau:['Xác nhận mật khẩu','required',(v,b)=>v!==str(b.mat_khau)?'Mật khẩu xác nhận không khớp.':'']};
function taoOtp(sdt,data){
 if(require('../lib/env').PROD)throw new AppError(503,'SMS_CHUA_CAU_HINH','Tính năng gửi OTP chưa được cấu hình.');
 const id=crypto.randomBytes(12).toString('hex'),ma=String(crypto.randomInt(0,1e6)).padStart(6,'0');
 run('INSERT INTO otp(id,sdt,ma,het_han,du_lieu) VALUES (?,?,?,?,?)',id,sdt,ma,fmt(new Date(Date.now()+OTP_PHUT*60000)),JSON.stringify(data));
 // Local development transport. Production requires an SMS provider.
 if(!require('../lib/env').PROD)console.log('[OTP] '+sdt+': '+ma);
 return {otp_id:id,het_han_phut:OTP_PHUT,...(!require('../lib/env').PROD?{otp_demo:ma}:{})};
}
function verifyOtp(body,purpose){
 const ma=str(body.ma);
 if(!/^\d{6}$/.test(ma))throw new AppError(422,'OTP_SAI','Vui lòng nhập mã OTP gồm 6 chữ số.',{ma:'Mã OTP gồm 6 chữ số.'});
 const o=one('SELECT * FROM otp WHERE id=? AND da_dung=0',str(body.otp_id));
 if(!o||JSON.parse(o.du_lieu).purpose!==purpose)throw new AppError(404,'OTP_KHONG_TON_TAI','Phiên xác thực không tồn tại.');
 if(o.het_han<=now())throw new AppError(410,'OTP_HET_HAN','Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.',{ma:'Mã OTP đã hết hạn.'});
 if(o.so_lan_sai>=OTP_SAI_TOI_DA)throw new AppError(429,'OTP_KHOA','Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.');
 if(o.ma!==ma){
  try{run('UPDATE otp SET so_lan_sai=so_lan_sai+1 WHERE id=?',o.id);}catch(e){console.error('Không ghi được số lần sai OTP:',e.message);}
  throw new AppError(o.so_lan_sai===4?429:422,o.so_lan_sai===4?'OTP_KHOA':'OTP_SAI',o.so_lan_sai===4?'Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.':'Mã OTP không chính xác.',{ma:'Mã OTP không chính xác.'});
 }
 return {...o,data:JSON.parse(o.du_lieu)};
}
function uniqueRegistration(d){
 const f={};
 if(one('SELECT 1 FROM tai_khoan WHERE sdt=?',d.sdt))f.sdt='Số điện thoại đã được sử dụng để đăng ký tài khoản.';
 if(one('SELECT 1 FROM tai_khoan WHERE email=? COLLATE NOCASE',d.email))f.email='Email đã được sử dụng để đăng ký tài khoản.';
 if(one('SELECT 1 FROM khach_hang WHERE cccd=? AND sdt<>?',d.cccd,d.sdt))f.cccd='CCCD đã được sử dụng để đăng ký tài khoản.';
 if(Object.keys(f).length)throw new AppError(409,'THONG_TIN_BI_TRUNG','Thông tin đã được sử dụng.',f);
}
// Thông báo lỗi theo mẫu màn hình đăng ký
const sai=(re,msg)=>v=>re.test(v)?'':msg;
const ngayHopLe=v=>{try{birthDate(v);return '';}catch{return 'Vui lòng nhập theo dd/mm/yyyy.';}};
const REG_RULES={
 ho_ten:['Họ và tên','required',sai(RE.ten,'Họ và tên không hợp lệ.')],
 sdt:['Số điện thoại','required',sai(RE.sdt,'Số điện thoại không hợp lệ.')],
 ngay_sinh:['Ngày sinh','required',ngayHopLe],
 dia_chi:['Địa chỉ','required',{len:300}],
 email:['Email','required',sai(RE.email,'Vui lòng nhập theo vd: abcd@gmail.com.')],
 cccd:['CCCD','required',sai(RE.cccd,'CCCD nhập không hợp lệ.')],
 ...passwordFields};
route('POST','/api/auth/dang-ky',ctx=>{
 const b=ctx.body;
 check(b,REG_RULES);
 const d={purpose:'register',ho_ten:str(b.ho_ten),sdt:str(b.sdt),email:str(b.email).toLowerCase(),ngay_sinh:birthDate(b.ngay_sinh),dia_chi:str(b.dia_chi),cccd:str(b.cccd),mat_khau_hash:A.hashPassword(str(b.mat_khau))};
 uniqueRegistration(d);return taoOtp(d.sdt,d);
});
route('POST','/api/auth/gui-lai-otp',ctx=>{
 const o=one('SELECT * FROM otp WHERE id=? AND da_dung=0',str(ctx.body.otp_id));
 if(!o)throw new AppError(404,'OTP_KHONG_TON_TAI','Phiên xác thực không tồn tại.');
 return tx(()=>{run('UPDATE otp SET da_dung=1 WHERE id=?',o.id);return taoOtp(o.sdt,JSON.parse(o.du_lieu));});
});
route('POST','/api/auth/xac-thuc-otp',ctx=>{
 const o=verifyOtp(ctx.body,'register'),d=o.data;
 tx(()=>{
  uniqueRegistration(d);run('UPDATE otp SET da_dung=1 WHERE id=?',o.id);
  const id=Number(run("INSERT INTO tai_khoan(ma,ho_ten,sdt,email,mat_khau_hash,vai_tro,ngay_tao,ten_dang_nhap) VALUES (?,?,?,?,?,'KH',?,?)",sinhMa('KH'),d.ho_ten,d.sdt,d.email,d.mat_khau_hash,now(),d.sdt).lastInsertRowid);
  const kh=one('SELECT id FROM khach_hang WHERE sdt=?',d.sdt);
  if(kh)run('UPDATE khach_hang SET tai_khoan_id=?,ho_ten=?,email=?,ngay_sinh=?,dia_chi=?,cccd=? WHERE id=?',id,d.ho_ten,d.email,d.ngay_sinh,d.dia_chi,d.cccd,kh.id);
  else run('INSERT INTO khach_hang(ma,ho_ten,sdt,email,ngay_sinh,dia_chi,cccd,tai_khoan_id,ngay_tao) VALUES (?,?,?,?,?,?,?,?,?)',sinhMa('KH'),d.ho_ten,d.sdt,d.email,d.ngay_sinh,d.dia_chi,d.cccd,id,now());
 });return {ok:true};
});
route('POST','/api/auth/dang-nhap',ctx=>{
 check(ctx.body,{sdt:['Số điện thoại','required'],mat_khau:['Mật khẩu','required']});
 const tk=one('SELECT * FROM tai_khoan WHERE sdt=? OR ten_dang_nhap=? COLLATE NOCASE',str(ctx.body.sdt),str(ctx.body.sdt));
 if(tk?.trang_thai==='DONG')throw new AppError(403,'E03_TAI_KHOAN_BI_KHOA','Tài khoản đã bị khóa. Vui lòng liên hệ cửa hàng để được hỗ trợ.');
 if(!tk||!A.verifyPassword(str(ctx.body.mat_khau),tk.mat_khau_hash)){
  if(tk){
   const attempts=tk.so_lan_dang_nhap_sai+1;
   run("UPDATE tai_khoan SET so_lan_dang_nhap_sai=?,trang_thai=? WHERE id=?",attempts,attempts>=5?'DONG':'MO',tk.id);
   if(attempts>=5){run('DELETE FROM phien WHERE tai_khoan_id=?',tk.id);throw new AppError(403,'E03_TAI_KHOAN_BI_KHOA','Tài khoản đã bị khóa do nhập sai 5 lần liên tiếp.');}
  }
  throw new AppError(401,'E02_THONG_TIN_KHONG_HOP_LE','Số điện thoại hoặc mật khẩu không chính xác.',tk?{mat_khau:'Mật khẩu không hợp lệ.'}:{sdt:'Số điện thoại không hợp lệ.',mat_khau:'Mật khẩu không hợp lệ.'});
 }
 run('UPDATE tai_khoan SET so_lan_dang_nhap_sai=0 WHERE id=?',tk.id);
 const token=A.createSession(tk.id);ctx.headers['Set-Cookie']=A.cookieFor(token);return {user:A.loadUser(token)};
});
route('POST','/api/auth/quen-mat-khau',ctx=>{
 check(ctx.body,{sdt:['Số điện thoại','required','sdt']});
 const tk=one('SELECT id FROM tai_khoan WHERE sdt=?',str(ctx.body.sdt));
 if(!tk)throw new AppError(404,'SDT_CHUA_DANG_KY','Số điện thoại chưa được đăng ký.',{sdt:'Không tìm thấy tài khoản.'});
 return taoOtp(str(ctx.body.sdt),{purpose:'reset',tai_khoan_id:tk.id});
});
route('POST','/api/auth/xac-thuc-khoi-phuc',ctx=>{
 const o=verifyOtp(ctx.body,'reset'),token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
 tx(()=>{run('UPDATE otp SET da_dung=1 WHERE id=?',o.id);run('DELETE FROM khoi_phuc WHERE tai_khoan_id=?',o.data.tai_khoan_id);run('INSERT INTO khoi_phuc VALUES (?,?,?)',hash,o.data.tai_khoan_id,fmt(new Date(Date.now()+5*60000)));});
 return {reset_token:token};
});
route('POST','/api/auth/dat-lai-mat-khau',ctx=>{
 check(ctx.body,{mat_khau:['Mật khẩu mới','required'],xac_nhan_mat_khau:['Xác nhận mật khẩu mới','required']});
 if(str(ctx.body.mat_khau)!==str(ctx.body.xac_nhan_mat_khau))throw new AppError(422,'MAT_KHAU_KHONG_TRUNG','Mật khẩu mới và xác nhận mật khẩu mới không trùng nhau');
 const hash=crypto.createHash('sha256').update(str(ctx.body.reset_token)).digest('hex'),r=one('SELECT * FROM khoi_phuc WHERE token_hash=? AND het_han>?',hash,now());
 if(!r)throw new AppError(410,'PHIEN_HET_HAN','Phiên khôi phục đã hết hạn. Vui lòng xác thực lại.');
 tx(()=>{run('UPDATE tai_khoan SET mat_khau_hash=?,ngay_cap_nhat=? WHERE id=?',A.hashPassword(str(ctx.body.mat_khau)),now(),r.tai_khoan_id);run('DELETE FROM khoi_phuc WHERE tai_khoan_id=?',r.tai_khoan_id);run('DELETE FROM phien WHERE tai_khoan_id=?',r.tai_khoan_id);});
 return {ok:true};
});
route('POST', '/api/auth/dang-xuat', (ctx) => {
  if (ctx.token) run('DELETE FROM phien WHERE token=?', ctx.token);
  ctx.headers['Set-Cookie'] = 'sid=; HttpOnly; Path=/; Max-Age=0';
  return { ok: true };
});

route('GET', '/api/auth/me', (ctx) => ({ user: ctx.user || null }));

route('PUT', '/api/auth/ho-so', A.requireLogin, (ctx) => {
  const b = ctx.body;
  check(b, { ho_ten: ['Họ và tên', 'required', 'ten'], email: ['Email', 'email'] });
  if (str(b.email) && one('SELECT 1 FROM tai_khoan WHERE email=? AND id<>?', str(b.email), ctx.user.id))
    throw new AppError(409, 'TRUNG_THONG_TIN', 'Email đã được sử dụng.', { email: 'Email đã được sử dụng.' });
  tx(() => {
    if (str(b.mat_khau_moi)) {
      const tk = one('SELECT mat_khau_hash FROM tai_khoan WHERE id=?', ctx.user.id);
      if (!A.verifyPassword(str(b.mat_khau_cu), tk.mat_khau_hash)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Mật khẩu hiện tại không đúng.', { mat_khau_cu: 'Mật khẩu hiện tại không đúng.' });
      const v = str(b.mat_khau_moi);
      if (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v)) throw new AppError(422, 'E02_KHONG_HOP_LE', 'Mật khẩu mới chưa đạt yêu cầu.', { mat_khau_moi: 'Tối thiểu 8 ký tự, gồm cả chữ và số.' });
      run('UPDATE tai_khoan SET mat_khau_hash=? WHERE id=?', A.hashPassword(v), ctx.user.id);
    }
    run('UPDATE tai_khoan SET ho_ten=?, email=?, ngay_cap_nhat=? WHERE id=?', str(b.ho_ten), str(b.email) || null, now(), ctx.user.id);
    if (ctx.user.vai_tro === 'KH') run('UPDATE khach_hang SET ho_ten=?, email=? WHERE tai_khoan_id=?', str(b.ho_ten), str(b.email) || null, ctx.user.id);
  });
  return { user: A.loadUser(ctx.token) };
});
