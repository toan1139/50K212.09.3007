import {route,api,esc,money,dt,pageHead,field,onSubmit,go,$,$$,qs,table,badge,alertBox,confirmBox,ApiError,TRANG_THAI} from '../core.js';
const perm='QL_KHACH_HANG',crumbs=[['Quản lý khách hàng','/khach-hang']];
// Tìm kiếm khách hàng: lọc ngay khi gõ (không cần Enter); không có kết quả -> thanh báo lỗi phía trên tiêu đề bảng
const KH_COLS=[{label:'Khách hàng',key:'ho_ten'},{label:'Số điện thoại',key:'sdt'},{label:'Email',key:'email'},{label:'CCCD',key:'cccd'},{label:'',render:r=>`<a href="#/khach-hang/${r.id}">Xem thông tin khách hàng</a><a href="#/khach-hang/${r.id}/sua">Cập nhật thông tin khách hàng</a>`}];
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
let khCache=[];
route('/khach-hang',{title:'Danh sách khách hàng',crumbs:['Quản lý khách hàng'],perm,async render(){
 khCache=await api('/khach-hang');return `<div class="customer-list">${pageHead('Danh sách khách hàng')}<form id="sf"><input class="input" name="q" value="${esc(qs().q||'')}" placeholder="Tìm kiếm khách hàng theo họ tên, số điện thoại, CCCD..." aria-label="Tìm kiếm khách hàng" autocomplete="off"></form><div id="kh-alert"></div><div id="kh-table"></div></div>`;
},mount(v){const inp=$('[name=q]',v);
 const draw=()=>{const q=fold(inp.value.trim()),rows=khCache.filter(x=>!q||fold([x.ma,x.ho_ten,x.sdt,x.cccd,x.email].join(' ')).includes(q));
  $('#kh-alert',v).innerHTML=rows.length?'':alertBox('error','Không tìm thấy khách hàng phù hợp');
  $('#kh-table',v).innerHTML=rows.length?table({rows,cols:KH_COLS}):`<div class="table-wrap kh-empty"><table class="table"><thead><tr>${KH_COLS.slice(0,4).map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;};
 inp.oninput=draw;$('#sf',v).onsubmit=e=>{e.preventDefault();draw();};draw();}});
const fields=(k={},edit=true)=>`<div class="form-grid">${[
 ['Họ và tên','ho_ten'],['Ngày sinh','ngay_sinh'],['Số điện thoại','sdt'],['Email','email'],['Địa chỉ','dia_chi'],['CCCD','cccd']
].map(([label,name])=>{const val=name==='ngay_sinh'&&k[name]?dt(k[name],{time:false}):k[name];
  // Xem thông tin: ô chỉ đọc dạng hộp chữ, không đặt con trỏ được để không bị hiểu nhầm là sửa được
  return edit?field({label,name,value:val,placeholder:name==='ngay_sinh'?'dd/mm/yyyy':''}):`<div class="field"><label>${esc(label)}</label><div class="input ro-box">${esc(val||'')}</div></div>`;}).join('')}</div>`;
const history=k=>`<section class="customer-history"><h2>Lịch sử thuê &amp; đặt lịch</h2>${k.don.length?table({rows:k.don,cols:[{label:'Tên máy đã thuê',key:'thiet_bi'},{label:'Ngày nhận',render:r=>dt(r.ngay_nhan,{time:false})},{label:'Ngày trả',render:r=>dt(r.ngay_tra,{time:false})},{label:'Tổng tiền',render:r=>money(r.tong_tien)},{label:'Trạng thái',render:r=>`<span class="hist-st st-${r.trang_thai}">${esc(TRANG_THAI[r.trang_thai]||r.trang_thai)}</span>`}]}):alertBox('error','Chưa có lịch sử thuê')}</section>`;
function customer(edit){return {title:edit?'Cập nhật thông tin khách hàng':'Xem thông tin khách hàng',crumbs:[...crumbs,edit?'Cập nhật thông tin khách hàng':'Xem thông tin khách hàng'],perm,
 async render({id}){const k=await api('/khach-hang/'+id);return `${pageHead(edit?'Cập nhật thông tin khách hàng':'Xem thông tin khách hàng')}<div id="result"></div><form id="f" novalidate><div class="form-alert"></div><div class="customer-form"><h2>Thông tin cá nhân</h2><section class="card">${fields(k,edit)}${edit?'<div class="form-actions"><button class="btn btn-primary" type="submit">Lưu</button><button class="btn btn-secondary" type="button" id="cancel">Hủy</button></div>':''}</section></div></form><div id="cancel-result"></div><div id="history">${edit?'':history(k)}</div>`;},
 mount(v,{id}){if(!edit)return;const f=$('#f',v);
  // Hủy: không hỏi lại, khôi phục dữ liệu cũ và hiện "Không lưu thay đổi" bên dưới
  $('#cancel',v).onclick=()=>{f.reset();$$('.field',f).forEach(x=>{x.classList.remove('invalid');$('.err',x)?.remove();});$('.form-alert',f).innerHTML='';$('#result',v).innerHTML='';$('#cancel-result',v).innerHTML=alertBox('error','Không lưu thay đổi');};
  // Thông báo lỗi dưới từng ô theo mẫu "Chủ 5.1.2"; lỗi hệ thống hiện thanh đỏ phía trên (mẫu "Chủ 5.1.1")
  const MSG={ho_ten:'Họ và tên không hợp lệ',ngay_sinh:'Vui lòng nhập theo vd: dd/mm/yyyy',sdt:'Số điện thoại không hợp lệ',email:'Vui lòng nhập theo vd: abcd@gmail.com',cccd:'CCCD nhập không hợp lệ',dia_chi:'Địa chỉ không hợp lệ'};
  const check=d=>{const e={},t=k=>String(d[k]||'').trim();
   if(!/^[\p{L}\s'.-]{2,60}$/u.test(t('ho_ten')))e.ho_ten=MSG.ho_ten;
   const m=t('ngay_sinh').match(/^(\d{2})\/(\d{2})\/(\d{4})$/),bd=m&&new Date(+m[3],m[2]-1,+m[1]);if(!m||!bd||bd.getDate()!==+m[1]||bd.getMonth()!==m[2]-1||bd>new Date())e.ngay_sinh=MSG.ngay_sinh;
   if(!/^0\d{9}$/.test(t('sdt')))e.sdt=MSG.sdt;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t('email')))e.email=MSG.email;
   if(!/^\d{12}$/.test(t('cccd')))e.cccd=MSG.cccd;
   if(!t('dia_chi'))e.dia_chi=MSG.dia_chi;
   if(Object.keys(e).length)throw new ApiError({code:'E02_KHONG_HOP_LE',message:'Thông tin không hợp lệ',fields:e});};
  onSubmit(f,async d=>{$('#cancel-result',v).innerHTML='';check(d);try{await api('/khach-hang/'+id,{method:'PUT',body:d});}catch(e){if(e instanceof ApiError&&Object.keys(e.fields||{}).length)throw new ApiError({...e,fields:Object.fromEntries(Object.keys(e.fields).map(k=>[k,e.code==='TRUNG_THONG_TIN'?e.fields[k]:MSG[k]||e.fields[k]]))});throw new ApiError({code:'CAP_NHAT_THAT_BAI',message:'Cập nhật thông tin khách hàng thất bại, vui lòng thử lại sau'});}$('#result',v).innerHTML=alertBox('ok','Cập nhật thông tin khách hàng thành công');$('#history',v).innerHTML=history(await api('/khach-hang/'+id));},{errOpts:{missingText:true}});
 }
};}
route('/khach-hang/:id',customer(false));route('/khach-hang/:id/sua',customer(true));
