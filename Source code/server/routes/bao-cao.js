// Revenue is recognized only when a rental order is completed.
const {route,AppError}=require('../lib/http');
const {all,today,parse,fmt}=require('../db');
const {requirePerm}=require('../lib/auth');
const {fold}=require('../lib/validate');
const gate=requirePerm('BAO_CAO');
const day=86400000;
function period(q){
 const tu=q.tu,den=q.den,fields={};
 if(!tu)fields.tu='Vui lòng chọn Từ ngày.';
 if(!den)fields.den='Vui lòng chọn Đến ngày.';
 if(Object.keys(fields).length)throw new AppError(422,'E01_THIEU_THONG_TIN','Vui lòng chọn khoảng thời gian báo cáo.',fields);
 if(!parse(tu)||!parse(den)||tu.length!==10||den.length!==10)throw new AppError(422,'E02_KHONG_HOP_LE','Ngày không hợp lệ.');
 if(tu>den)throw new AppError(422,'E01_TU_NGAY_LON_HON_DEN_NGAY','Từ ngày không được lớn hơn Đến ngày!',{tu:'Từ ngày không được lớn hơn Đến ngày.'});
 if(den>today())throw new AppError(422,'E02_DEN_NGAY_TUONG_LAI','Đến ngày không được lớn hơn ngày hiện tại!',{den:'Đến ngày không được lớn hơn ngày hiện tại!'});
 const loai=q.loai||'';if(!['','MAY','PHU_KIEN'].includes(loai))throw new AppError(422,'E02_KHONG_HOP_LE','Loại thiết bị không hợp lệ.');
 return {tu,den,loai};
}
function shift(date,n){const d=parse(date);d.setDate(d.getDate()+n);return fmt(d).slice(0,10);}
function duration(a,b){const hours=Math.max(1,Math.round((parse(b)-parse(a))/3600000));const d=Math.floor(hours/24),h=hours%24;return (d?d+' ngày':'')+(d&&h?' ':'')+(h?h+' giờ':'');}
function records(tu,den,loai){
 const sql="SELECT d.id,d.ma AS ma_don,COALESCE(d.hoan_tat_luc,d.ngay_cap_nhat) AS thoi_gian,kh.ho_ten AS khach_hang,d.ngay_nhan,d.ngay_tra,d.tien_thue,d.tien_phu_kien,d.giam_gia,d.phi_den_bu,d.phi_tra_tre,tk.ho_ten AS nhan_vien,"
 +"(SELECT GROUP_CONCAT(dm.ten, ', ') FROM chi_tiet_don c JOIN thiet_bi tb ON tb.id=c.thiet_bi_id JOIN dong_may dm ON dm.id=tb.dong_may_id WHERE c.don_id=d.id) AS may,"
 +"(SELECT GROUP_CONCAT(pk.ten || ' x' || c.so_luong, ', ') FROM chi_tiet_phu_kien c JOIN phu_kien pk ON pk.id=c.phu_kien_id WHERE c.don_id=d.id) AS pk "
 +"FROM don_thue d JOIN khach_hang kh ON kh.id=d.khach_hang_id LEFT JOIN tai_khoan tk ON tk.id=d.nguoi_tao_id "
 +"WHERE d.trang_thai='HOAN_TAT' AND substr(COALESCE(d.hoan_tat_luc,d.ngay_cap_nhat),1,10) BETWEEN ? AND ? ORDER BY thoi_gian DESC,d.id DESC";
 return all(sql,tu,den).map(r=>{
  const base=r.tien_thue+r.tien_phu_kien,mayDisc=base?Math.round(r.giam_gia*r.tien_thue/base):0;
  const may=r.tien_thue-mayDisc+r.phi_den_bu+r.phi_tra_tre,pk=r.tien_phu_kien-(r.giam_gia-mayDisc);
  const revenue=loai==='MAY'?may:loai==='PHU_KIEN'?pk:may+pk;
  const rent=loai==='MAY'?r.tien_thue:loai==='PHU_KIEN'?r.tien_phu_kien:base;
  const disc=loai==='MAY'?mayDisc:loai==='PHU_KIEN'?r.giam_gia-mayDisc:r.giam_gia;
  const fees=loai==='PHU_KIEN'?0:r.phi_den_bu+r.phi_tra_tre;
  return {ma_don:r.ma_don,don_id:r.id,thoi_gian:r.thoi_gian,khach_hang:r.khach_hang,
   thiet_bi:loai==='MAY'?r.may:loai==='PHU_KIEN'?r.pk:[r.may,r.pk].filter(Boolean).join(', '),
   thoi_luong:duration(r.ngay_nhan,r.ngay_tra),tien_thue:rent,giam_gia:disc,phi_phat_sinh:fees,doanh_thu:revenue,
   nhan_vien:r.nhan_vien||'—',may,pk};
 }).filter(r=>!loai||r.tien_thue>0);
}
function groupKey(date,type){
 if(type==='thang')return date.slice(0,7);
 if(type==='tuan'){const d=parse(date);d.setDate(d.getDate()-((d.getDay()+6)%7));return fmt(d).slice(0,10);}
 return date;
}
route('GET','/api/bao-cao/doanh-thu',gate,ctx=>{
 const {tu,den,loai}=period(ctx.query),type=ctx.query.nhom||'ngay';
 if(!['ngay','tuan','thang'].includes(type))throw new AppError(422,'NHOM_KHONG_HOP_LE','Cách nhóm không hợp lệ.');
 const rows=records(tu,den,loai);
 if(!rows.length)throw new AppError(404,'E03_KHONG_CO_DU_LIEU','Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!');
 const len=Math.round((parse(den)-parse(tu))/day)+1,by=new Map();
 for(const r of rows){const key=groupKey(r.thoi_gian.slice(0,10),type),item=by.get(key)||{ky:key,doanh_thu:0,so_don:0};item.doanh_thu+=r.doanh_thu;item.so_don++;by.set(key,item);}
 const keys=new Set();for(let i=0;i<len;i++)keys.add(groupKey(shift(tu,i),type));
 const series=[...keys].map(key=>by.get(key)||{ky:key,doanh_thu:0,so_don:0});
 const total=rows.reduce((sum,r)=>sum+r.doanh_thu,0),prevEnd=shift(tu,-1),prevStart=shift(prevEnd,-len+1);
 const prev=records(prevStart,prevEnd,loai).reduce((sum,r)=>sum+r.doanh_thu,0);
 const may=rows.reduce((sum,r)=>sum+r.may,0),pk=rows.reduce((sum,r)=>sum+r.pk,0);
 const coCau=loai==='MAY'?[{ten:'Máy ảnh',so_tien:total}]:loai==='PHU_KIEN'?[{ten:'Phụ kiện',so_tien:total}]:[{ten:'Máy ảnh',so_tien:may},{ten:'Phụ kiện',so_tien:pk}];
 return {tu,den,nhom:type,series,tong_doanh_thu:total,don_hoan_tat:rows.length,trung_binh:Math.round(total/rows.length),
  thay_doi:prev?Math.round((total-prev)/prev*1000)/10:null,ky_truoc:{tu:prevStart,den:prevEnd,tong:prev},
  co_cau:coCau,theo_loai:coCau};
});
route('GET','/api/bao-cao/chi-tiet',gate,ctx=>{
 const {tu,den,loai}=period(ctx.query),text=fold(ctx.query.q||'');
 let rows=records(tu,den,loai);
 if(text)rows=rows.filter(r=>fold([r.ma_don,r.khach_hang,r.thiet_bi].join(' ')).includes(text));
 if(!rows.length&&!text)throw new AppError(404,'E03_KHONG_CO_DU_LIEU','Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!');
 const size=Math.min(100000,Math.max(1,Number(ctx.query.kich_thuoc)||10)),pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(pages,Math.max(1,Number(ctx.query.trang)||1));
 return {tu,den,tong:rows.length,trang:page,so_trang:pages,kich_thuoc:size,tong_doanh_thu:rows.reduce((sum,r)=>sum+r.doanh_thu,0),tong_thue:rows.reduce((sum,r)=>sum+(r.tien_thue||0),0),tong_giam:rows.reduce((sum,r)=>sum+(r.giam_gia||0),0),tong_phi:rows.reduce((sum,r)=>sum+(r.phi_phat_sinh||0),0),du_lieu:rows.slice((page-1)*size,page*size)};
});
