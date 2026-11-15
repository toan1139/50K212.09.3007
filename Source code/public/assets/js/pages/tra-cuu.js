import {route,api,state,esc,money,dt,dShort,icon,pageHead,field,alertBox,onSubmit,go,link,$,$$,qs,img,photos,kv,isStaff,showErrors,ApiError,todayStr,cardPhoto} from '../core.js';
import {timeFields,readTime,mapTimeErrors,monthCalendar,productCard,rentHref,plainDates} from '../widgets.js';
const models=async()=>(await api('/dong-may',{query:{kich_thuoc:100}})).du_lieu;
route('/tra-cuu',{title:'Tra cứu thông tin',crumbs:['Tra cứu thông tin'],render:()=>`${pageHead('Tra cứu thông tin bạn cần','Biết trước chuyến đi của bạn')}<div class="lookup-hub">${[
 ['Tra cứu lịch trống','Tra cứu lịch còn trống của shop để lựa chọn chuyến đi của bạn.','/tra-cuu/lich-trong'],
 ['Tra cứu giá','Tra cứu giá giúp bạn biết trước và tối ưu chi phí của chuyến đi.','/tra-cuu/gia'],
 ['Tra cứu máy','Tra cứu thông tin của từng chiếc máy ảnh về màu sắc, độ phân giải, chất lượng phù hợp với phong cách của bạn.','/thiet-bi']
 ].map(([t,d,h])=>`<section class="lookup-row"><div><h3>${t}</h3><p>${d}</p></div><a class="btn btn-primary" href="#${h}">${t}</a></section>`).join('')}</div>`});
route('/tra-cuu/lich-trong',{
 title:'Tra cứu lịch trống',crumbs:[['Tra cứu thông tin','/tra-cuu'],'Tra cứu lịch trống'],
 async render(){const ds=await models(),q=qs();return `${pageHead('Chọn máy tiện, đặt lịch nhanh chóng.','Tra cứu một khoảng tối đa 60 ngày.')}
 <div class="layout-form-cal"><form id="f" class="no-field-icons" novalidate><h3>Lịch của bạn</h3><div class="stack">
 ${field({label:'Dòng máy',name:'dong_may_id',type:'select',placeholder:'Chọn dòng máy',options:ds.map(d=>[d.id,d.ten]),value:q.dong_may_id})}
 ${timeFields({nhan:q.nhan,tra:q.tra,blank:true})}</div><div class="form-alert"></div><button type="submit" class="btn btn-primary btn-block">Tra cứu</button></form>
 <div><div id="cal"></div></div></div>`;},
 mount(v){const f=$('#f',v);plainDates(f);let thang=todayStr().slice(0,7),selection={};
  $('#cal',v).onclick=async e=>{const b=e.target.closest('[data-cal]');if(!b)return;const [y,m]=thang.split('-').map(Number),d=new Date(y,m-1+Number(b.dataset.cal),1);thang=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');try{const days=await api('/tra-cuu/lich-thang',{query:{dong_may_id:f.elements.dong_may_id.value,thang}});$('#cal',v).innerHTML=monthCalendar(thang,days,selection);}catch(er){showErrors(f,er);}};
  onSubmit(f,async d=>{$$('.row-alert',f).forEach(x=>x.remove());try{
   const r=await api('/tra-cuu/lich-trong',{method:'POST',body:{dong_may_id:d.dong_may_id,...readTime(d)}});
   thang=r.thang;selection={selFrom:r.ngay_nhan.slice(0,10),selTo:r.ngay_tra.slice(0,10)};
   $('#cal',v).className='card';$('#cal',v).innerHTML=monthCalendar(thang,r.lich,selection);
   if(!r.so_trong)$('.form-alert',f).innerHTML=alertBox('error','Không tìm thấy thiết bị trống!');
  }catch(e){mapTimeErrors(e);if(e instanceof ApiError&&Object.keys(e.fields||{}).length){formErrors(f,e,e.code==='E01_THIEU_THONG_TIN'?'Vui lòng nhập đầy đủ thông tin':e.message);return;}throw e;}});
  if(qs().nhan)f.requestSubmit();
 }
});
/** Lỗi gom vào một thanh báo lỗi phía trên nút (ô vuông đỏ + chữ đỏ), các ô liên quan viền đỏ, không hiện chữ dưới từng ô */
function formErrors(f,e,msg){showErrors(f,e,null,{scroll:false});$$('.field .err',f).forEach(x=>x.remove());$('.form-alert',f).innerHTML=alertBox('error',msg);}
/** Lỗi ngày (đã qua / trả trước nhận): viền đỏ ô ngày + thanh lỗi có ô vuông đỏ ngay dưới hàng đó, theo ảnh mẫu */
const DATE_MSG={E02_NGAY_NHAN_QUA_KHU:'Ngày nhận không được nhỏ hơn ngày hiện tại!',E03_NGAY_TRA_KHONG_HOP_LE:'Ngày trả phải sau ngày nhận!'};
function dateRowErrors(f,e){showErrors(f,e,null,{scroll:false});
 for(const [k,gio] of [['ngay_nhan_d','gio_nhan'],['ngay_tra_d','gio_tra']]){const msg=e.fields[k];if(!msg)continue;
  $(`[data-field="${k}"] .err`,f)?.remove();
  const after=$(`[data-field="${gio}"]`,f);after?.insertAdjacentHTML('afterend',`<div class="row-alert">${alertBox('error',DATE_MSG[e.code]||msg)}</div>`);}
 $('.row-alert',f)?.scrollIntoView({block:'center',behavior:'smooth'});}
const packages=[['6h','6 tiếng',6],['1d','1 ngày',24],['2d','2 ngày',48],['3d','3 ngày',72],['tc','Tùy chọn',null]];
const packHint=k=>`Gói đang tính: ${packages.find(p=>p[0]===k)[1].toLowerCase()}. Tùy chọn từ ngày thứ 4 tính thêm 180.000đ`;
route('/tra-cuu/gia',{
 title:'Tra cứu giá',crumbs:[['Tra cứu thông tin','/tra-cuu'],'Tra cứu giá'],
 async render(){const ds=await models(),d=ds.find(d=>String(d.id)===qs().dong_may_id)||ds.find(d=>d.ten.includes('R50'))||ds[0];return `${pageHead('Tra cứu chi phí cho chuyến đi của bạn','Ước tính tiền thuê theo dòng máy và thời lượng bạn chọn.')}
 <div class="price-lookup"><form id="f" class="card price-form" novalidate><h3>Máy &amp; thời lượng</h3><div class="stack">
 ${field({label:'Thiết bị',name:'dong_may_id',type:'select',placeholder:'Chọn máy',value:d?.id,options:ds.map(x=>[x.id,x.ten])})}
 <div class="field" data-field="so_gio"><div class="chips">${packages.map(([k,l])=>`<button type="button" class="chip ${k==='2d'?'on':''}" data-package="${k}">${l}</button>`).join('')}</div></div>
 <div class="form-grid">${field({label:'Tùy chọn · số ngày (từ 4)',name:'so_ngay',type:'number',value:4,attrs:'min="4" step="1"'})}${field({label:'Phiên thêm 6 tiếng',name:'buoi_le',type:'select',options:[['0','0'],['1','1']],value:'0'})}</div>
 </div><button type="submit" class="btn btn-primary btn-block mt-24">Tra cứu</button><div id="pic">${d?img(cardPhoto(d.anh),d.ten):''}</div></form><aside class="card" id="out" hidden></aside></div>`;},
 async mount(v){const ds=await models(),f=$('#f',v);let pack='2d';
  v.onclick=e=>{const b=e.target.closest('[data-package]');if(!b)return;pack=b.dataset.package;$$('[data-package]',v).forEach(x=>x.classList.toggle('on',x===b));};
  f.elements.dong_may_id.onchange=()=>{const d=ds.find(x=>String(x.id)===f.elements.dong_may_id.value);$('#pic',v).innerHTML=d?img(cardPhoto(d.anh),d.ten):'';$('#out',v).hidden=true;};
  onSubmit(f,async d=>{const out=$('#out',v);out.hidden=false;const p=packages.find(p=>p[0]===pack);const hours=(p[2]??Number(d.so_ngay)*24)+Number(d.buoi_le)*6;
   try{const r=await api('/tra-cuu/gia-goi',{method:'POST',body:{dong_may_id:d.dong_may_id,so_gio:hours,tuy_chon:pack==='tc'}});
    const m=r.may[0];out.innerHTML=`<h3>Chi tiết giá thuê</h3>${kv([['Khoản mục','Số tiền'],...m.chi_tiet.map(c=>[c.sl>1?`${c.goi}: ${c.sl} × ${money(c.don_gia)}`:c.goi,money(c.thanh_tien)]),['Khuyến mãi áp dụng','0đ'],['Tạm tính',money(r.tong_tien_thue),'total hl']])}<p class="price-note mt-24">Phí trả trễ: 30.000đ/giờ, chỉ tính khi phát sinh. Cọc được xác định theo từng đơn, không tính trong bảng giá này.</p>${state.user?.vai_tro==='KH'?`<a class="btn btn-primary btn-block mt-24" href="${rentHref(d.dong_may_id)}">Chọn ngày đặt lịch →</a>`:''}`;
   }catch(e){if(!(e instanceof ApiError))throw e;out.innerHTML='<h3>Chi tiết giá thuê</h3><div class="price-err">'+alertBox('error',e.code==='E01_THIEU_THONG_TIN'?'Vui lòng chọn đầy đủ thông tin tra cứu':e.message)+'</div>';showErrors(f,e,null,{scroll:false,alertTarget:document.createElement('div')});$$('.field .err',f).forEach(x=>x.remove());}
  });
 }
});
route('/thiet-bi',{
 title:'Tra cứu máy',crumbs:[['Tra cứu thông tin','/tra-cuu'],'Tra cứu máy'],
 async render(){const q=qs(),[ds,all,hang,pk]=await Promise.all([api('/dong-may',{query:{...q,kich_thuoc:3}}),models(),api('/hang'),api('/phu-kien')]);
  const href=p=>'#/thiet-bi?'+new URLSearchParams({...q,trang:p});
  return `${pageHead(isStaff()?'Tra cứu thiết bị và thông tin nội bộ':state.user?'Chọn một chiếc máy ưng ý và phù hợp với bạn.':'Chọn máy cho chuyến đi của bạn.','Tìm một chiếc máy phù hợp, lưu giữ những hình ảnh cùng những thước phim kỉ niệm.')}
  <form class="catalog-filters" id="f">${field({label:'Dòng máy',name:'dong_may_id',type:'select',placeholder:'Tất cả dòng máy',options:all.map(x=>[x.id,x.ten]),value:q.dong_may_id})}${field({label:'Hãng máy',name:'hang',type:'select',placeholder:'Tất cả hãng',options:hang.map(x=>[x,x]),value:q.hang})}<button class="btn btn-primary" type="submit">Tra cứu</button></form>
  ${ds.du_lieu.length?`<div class="grid grid-3 catalog-grid">${ds.du_lieu.map(x=>productCard(x)).join('')}</div><div class="row between small muted mt-24"><span>Hiển thị ${(ds.trang-1)*3+1}–${Math.min(ds.trang*3,ds.tong)} / ${ds.tong} kết quả</span><div class="row">${ds.trang>1?`<a href="${href(ds.trang-1)}">← Trước</a>`:'<span>← Trước</span>'}${Array.from({length:ds.so_trang},(_,i)=>`<a href="${href(i+1)}">${i+1===ds.trang?'['+(i+1)+']':i+1}</a>`).join('')}${ds.trang<ds.so_trang?`<a href="${href(ds.trang+1)}">Sau →</a>`:'<span>Sau →</span>'}</div></div>
  <section class="catalog-accessories"><h2 class="section-title">Phụ kiện đồng hành</h2><div class="grid grid-2">${pk.filter(x=>/chân|hắt/i.test(x.ten)).map(x=>`<div class="acc">${img(x.anh,x.ten)}<b>${esc(x.ten)}</b></div>`).join('')}</div><div class="acc-more"><button type="button" class="btn btn-secondary" id="acc-more">Xem chi tiết</button></div><div id="acc-detail" hidden><table class="table mt-16"><thead><tr><th>Phụ kiện</th><th>Giá thuê / ngày</th><th>Số lượng</th></tr></thead><tbody>${pk.map(x=>`<tr><td>${esc(x.ten)}</td><td>${money(x.gia_ngay)}</td><td>${x.so_luong}</td></tr>`).join('')}</tbody></table></div></section>`:alertBox('error','Không tìm thấy kết quả phù hợp!')}`;},
 mount(v){$('#f',v).onsubmit=e=>{e.preventDefault();go('/thiet-bi?'+new URLSearchParams(new FormData(e.target)));};const m=$('#acc-more',v);if(m)m.onclick=()=>{const d=$('#acc-detail',v);d.hidden=!d.hidden;m.textContent=d.hidden?'Xem chi tiết':'Thu gọn';};}
});
route('/thiet-bi/:id',{
 title:'Chi tiết thiết bị',crumbs:[['Tra cứu thông tin','/tra-cuu'],['Tra cứu máy','/thiet-bi'],'Chi tiết thiết bị'],
 async render({id}){const d=await api('/dong-may/'+id),[first,...rest]=(d.mo_ta||'').split('. ');
  return `${pageHead(d.ten)}<div class="detail"><div class="gallery">${(()=>{const ph=photos(d.anh);const list=ph.length?ph:[d.anh,...(d.anh_phu||[])];return `<div class="main">${img(list[0],d.ten)}</div>${list.length>1?`<div class="thumbs">${list.slice(1,3).map(x=>`<img src="${esc(x)}" alt="${esc(d.ten)}" data-pic>`).join('')}</div>`:''}`;})()}</div>
  <div><span class="status">${d.so_trong_hien_tai?'Trống':'Đang thuê'}</span><h2 class="tagline">${esc(first)}.</h2><p class="small muted">${esc(rest.join('. '))}</p>
  ${isStaff()?`<section class="card mt-24"><h3>Nhận diện thiết bị</h3>${kv([['Mã máy',esc(d.thiet_bi?.[0]?.ma||d.ma)],['Hãng',esc(d.hang)],['Serial',esc(d.thiet_bi?.[0]?.so_serial||'')]])}</section>`:''}
  <table class="price-table"><thead><tr><th>Gói thuê</th><th>Giá thuê</th></tr></thead><tbody>${[['6 tiếng',d.gia_buoi],['1 ngày',d.gia_ngay],['2 ngày',d.gia_2_ngay],['3 ngày',d.gia_3_ngay],['Từ ngày thứ 4',d.gia_ngay_them]].map(([l,n])=>`<tr><td>${l}</td><td>${money(n)}</td></tr>`).join('')}</tbody></table>
  ${!state.user?`<div class="row mt-24"><a class="btn btn-primary" href="${rentHref(d.id)}">Đăng nhập đặt lịch</a><a class="btn btn-secondary" href="#/dang-ky">Đăng ký tài khoản</a></div>`:''}</div></div>
  <div class="grid grid-2 detail-notes"><section><h3>Đi cùng máy ảnh</h3><p class="mt-24">02 viên pin<br>Túi máy ảnh<br>Dây đeo</p><p class="small muted mt-24">Được kiểm tra và bàn giao cùng máy tại cửa hàng.</p></section><section><h3>Nhận &amp; trả máy</h3><p class="mt-24">CCCD được xác minh tại cửa hàng.</p><p class="small muted mt-24">Thanh toán phần còn lại khi nhận máy. Trả trễ: 30.000đ/giờ.</p></section></div>
  ${isStaff()?`<div id="internal-calendar" class="mt-24"></div>`:''}`;},
 async mount(v,{id}){$$('[data-pic]',v).forEach(x=>x.onclick=()=>$('.gallery .main img',v).src=x.src);
  if(isStaff()){try{const r=await api('/lich-chung',{query:{dong_may_id:id,tu:todayStr(),so_ngay:3}});$('#internal-calendar',v).innerHTML='<h3 class="section-title">Lịch chung</h3>'+scheduleTable(r);}catch(e){$('#internal-calendar',v).innerHTML=alertBox('error',e.message);}}
 }
});
export function scheduleTable(r){return `<div class="table-wrap"><table class="table"><thead><tr><th>Thiết bị / serial</th>${r.ngay.map(n=>`<th>${dt(n,{time:false})}</th>`).join('')}</tr></thead><tbody>${r.thiet_bi.map(t=>`<tr><td>${esc(t.dong_may)}<br>${esc(t.ma)}</td>${t.o.map(o=>`<td>${o?`<a href="#/don-thue/${o.don_id}">${esc(o.khach)}<br>${esc(o.ma)}</a>`:t.tinh_trang==='BAO_TRI'?'Bảo trì':'Trống'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
