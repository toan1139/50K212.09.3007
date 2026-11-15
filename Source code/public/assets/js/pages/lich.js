// UC_8 Quản lý lịch: lịch tổng theo tháng của từng dòng máy + trạng thái thiết bị theo ngày
import {route,api,esc,dt,pad,icon,pageHead,qs,todayStr,alertBox,$} from '../core.js';
export const caseColor=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:({Đỏ:'var(--err)',Xanh:'var(--info)',Đen:'var(--espresso)',Trắng:'var(--surface)',Nâu:'var(--brand)',Bạc:'var(--line)'}[value]||'var(--sand)');
const dot=t=>`<i class="case-dot" style="--case-color:${caseColor(t.mau)}" title="${esc(t.ma)}"></i>`;
const THU=['CHỦ NHẬT','THỨ 2','THỨ 3','THỨ 4','THỨ 5','THỨ 6','THỨ 7'];
const shortName=ten=>ten.replace(/^(Canon EOS|Canon|Fujifilm|Sony)\s*/i,'');
/** Thiết bị "Đang thuê" trong ngày: mọi đơn còn hiệu lực (đã đặt hoặc đang thuê) */
const activeOn=(r,i)=>r.thiet_bi.filter(t=>t.o[i]&&!['HOAN_TAT','DA_HUY'].includes(t.o[i].trang_thai));
route('/lich-chung',{title:'Quản lý lịch',crumbs:['Quản lý lịch'],perm:'QL_LICH',
 async render(){const q=qs(),ds=(await api('/dong-may',{query:{kich_thuoc:100}})).du_lieu;
 const thang=/^\d{4}-\d{2}$/.test(q.thang||'')?q.thang:todayStr().slice(0,7),[y,m]=thang.split('-').map(Number);
 const href=more=>'#/lich-chung?'+new URLSearchParams({...q,...more});
 let content='';
 if(q.dong_may_id){try{
  const n=new Date(y,m,0).getDate(),r=await api('/lich-chung',{query:{tu:thang+'-01',so_ngay:n,dong_may_id:q.dong_may_id}});
  const dm=ds.find(d=>String(d.id)===q.dong_may_id);
  if(q.ngay&&r.ngay.includes(q.ngay)){
   const i=r.ngay.indexOf(q.ngay),rented=activeOn(r,i),maintenance=r.thiet_bi.filter(t=>t.tinh_trang==='BAO_TRI'&&!rented.includes(t)),free=r.thiet_bi.filter(t=>!rented.includes(t)&&t.tinh_trang==='SAN_SANG');
   const wd=THU[new Date(q.ngay+'T00:00').getDay()],dn=Number(q.ngay.slice(8));
   const pop=(k,label,list)=>`<div class="more-pop status-pop" id="pop-${k}" role="dialog" aria-label="${label}" hidden><button type="button" class="more-close" data-close aria-label="Đóng">${icon('x')}</button><b class="thu">${wd}</b><span class="ngay">Ngày ${dn}</span><span class="pill">${label}</span><div class="case-dots">${list.map(dot).join('')}</div></div>`;
   content=`<div class="calendar-day-detail day-v2"><div class="dd-head"><h3>Trạng thái thiết bị ngày ${dt(q.ngay,{time:false})}</h3><span class="day-model">Dòng máy: ${esc(dm?shortName(dm.ten):'')}</span></div><div class="dd-body">
   <h4>1. ĐANG THUÊ</h4><div class="rented-list">${rented.length?rented.map(t=>`<div class="calendar-device-row">${dot(t)}<a href="#/don-thue/${t.o[i].don_id}" title="${esc(t.o[i].ma)}">Xem chi tiết đơn</a></div>`).join(''):'<p class="small muted">Không có máy đang thuê trong ngày này.</p>'}</div>
   <h4>2. CÒN TRỐNG</h4><div class="calendar-device-row st-free"><span>Số lượng thiết bị sẵn sàng cho thuê</span><div class="pop-anchor"><button type="button" class="day-count free" data-pop="free">Còn trống: ${free.length}</button>${pop('free','Còn trống',free)}</div></div>
   <h4>3. ĐANG BẢO TRÌ</h4><div class="calendar-device-row st-maint"><span>Số lượng thiết bị đang bảo trì</span><div class="pop-anchor"><button type="button" class="day-count maint" data-pop="maint">Đang bảo trì: ${maintenance.length}</button>${pop('maint','Đang bảo trì',maintenance)}</div></div></div></div>`;
  }else{
   const change=delta=>{const d=new Date(y,m-1+delta,1);return href({thang:d.getFullYear()+'-'+pad(d.getMonth()+1),ngay:''});};
   const lead=(new Date(y,m-1,1).getDay()+6)%7;
   content=`<div class="month-calendar"><div class="cal-head"><h3>Tháng ${m}, ${y}</h3><div class="row"><a class="icon-btn" href="${change(-1)}" aria-label="Tháng trước">&lt;</a><a class="icon-btn" href="${change(1)}" aria-label="Tháng sau">&gt;</a></div></div><div class="month-grid">${['T2','T3','T4','T5','T6','T7','CN'].map(x=>`<div class="small muted">${x}</div>`).join('')}${'<div class="month-cell empty"></div>'.repeat(lead)}${r.ngay.map((day,i)=>{
    const act=activeOn(r,i),maint=r.thiet_bi.filter(t=>t.tinh_trang==='BAO_TRI'&&!act.includes(t)),more=act.length-3;
    const pop=`<div class="more-pop" role="dialog" aria-label="Máy đang thuê ngày ${Number(day.slice(8))}" hidden><button type="button" class="more-close" data-close aria-label="Đóng">${icon('x')}</button><b class="thu">${THU[new Date(day+'T00:00').getDay()]}</b><span class="ngay">Ngày ${Number(day.slice(8))}</span><span class="pill">Đang thuê</span><div class="case-dots">${act.map(dot).join('')}</div></div>`;
    return `<div class="month-cell" role="link" tabindex="0" data-href="${href({ngay:day})}"><b>${Number(day.slice(8))}</b><div class="case-dots">${act.slice(0,3).map(dot).join('')}</div>${act.length?`<span>Đang thuê: ${act.length}</span>`:''}${maint.length?`<span>Đang bảo trì: ${maint.length}</span>`:''}${more>0?`<button type="button" class="left" data-more>Còn lại: ${more}</button>${pop}`:''}</div>`;
   }).join('')}${'<div class="month-cell empty"></div>'.repeat(42-lead-r.ngay.length)}</div></div>`;
  }
 }catch(e){content=alertBox('error','Hệ thống lỗi, vui lòng thử lại sau');}}
 return `${pageHead('Quản lý lịch')}<h3>Chọn dòng máy ảnh</h3><div class="month-layout"><nav class="model-selector" aria-label="Dòng máy">${ds.map(d=>`<a href="${href({dong_may_id:d.id,ngay:''})}" class="${q.dong_may_id===String(d.id)?'active':''}">${esc(shortName(d.ten))}</a>`).join('')}</nav><div>${content}</div></div>`;
 },
 mount(v){
  const closeAll=()=>{v.querySelectorAll('.more-pop').forEach(p=>{p.hidden=true;});v.querySelectorAll('[data-pop].on').forEach(b=>b.classList.remove('on'));};
  v.addEventListener('click',e=>{
   if(e.target.closest('[data-close]')){e.stopPropagation();closeAll();return;}
   const more=e.target.closest('[data-more]');
   if(more){e.stopPropagation();const p=more.nextElementSibling,open=p.hidden;closeAll();p.hidden=!open;return;}
   if(e.target.closest('.more-pop'))return;
   const sp=e.target.closest('[data-pop]');
   if(sp){e.stopPropagation();const p=$('#pop-'+sp.dataset.pop,v),open=p.hidden;closeAll();p.hidden=!open;sp.classList.toggle('on',open);return;}
   const cell=e.target.closest('.month-cell[data-href]');
   if(cell)location.hash=cell.dataset.href.slice(1);
  });
  v.addEventListener('keydown',e=>{const cell=e.target.closest?.('.month-cell[data-href]');if(cell&&e.target===cell&&(e.key==='Enter'||e.key===' ')){e.preventDefault();location.hash=cell.dataset.href.slice(1);}if(e.key==='Escape')closeAll();});
 }
});
