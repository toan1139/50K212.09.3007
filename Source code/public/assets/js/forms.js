import {api,esc,icon,$,$$,showErrors,ApiError} from './core.js';
const lab=l=>esc(l).replace(/ \*$/,' <span class="req">*</span>');
export function photoField(name,label,value='',{large=false,change='',drop=false}={}){
 if(drop)return `<div class="field drop-field" data-field="${name}" data-photo="${name}"><label>${lab(label)}</label><label class="drop-zone"><span class="file-preview">${value?`<img src="${esc(value)}" alt="${esc(label)}">`:`${icon('upload')}`}</span><span class="small">Kéo thả ảnh vào đây hoặc <u>chọn từ thiết bị</u></span><span class="tiny muted">Hỗ trợ PNG, JPG (Tối đa 5MB)</span><input type="file" accept="image/png,image/jpeg" hidden></label><input type="hidden" name="${name}" value="${esc(value)}"></div>`;
 if(large)return `<div class="file-panel cccd-panel" data-field="${name}" data-photo="${name}" data-change="${esc(change)}"><div class="fp-head"><label>${lab(label)}</label><span class="tiny muted">Ảnh CCCD chỉ nhận định dạng JPG, PNG, tối đa 5MB</span></div><div class="file-preview">${value?`<img src="${esc(value)}" alt="${esc(label)}">`:`<div>${icon('upload')}<p class="small muted">Kéo thả ảnh vào đây hoặc tải ảnh lên</p></div>`}</div><label class="btn btn-dark-pill">${icon(value?'camera':'upload')}<span>${value&&change?esc(change):'Tải ảnh lên'}</span><input type="file" accept="image/png,image/jpeg" hidden></label><input type="hidden" name="${name}" value="${esc(value)}"></div>`;
 return `<div class="field" data-field="${name}" data-photo="${name}"><label>${lab(label)}</label><div class="file-preview">${value?`<img src="${esc(value)}" alt="${esc(label)}">`:`<div>${icon('upload')}<p class="small muted">Kéo thả ảnh vào đây hoặc tải ảnh lên</p></div>`}</div><label class="btn btn-secondary">${icon('upload')} ${value?'Thay đổi ảnh':'Tải ảnh lên'}<input type="file" accept="image/png,image/jpeg" hidden></label><p class="tiny muted mt-8">JPG, PNG có kích cỡ &lt; 5MB</p><input type="hidden" name="${name}" value="${esc(value)}"></div>`;
}
export function bindPhotos(root){
 $$('[data-photo]',root).forEach(box=>{
  let pending=false;
  const upload=async file=>{
   if(!file||pending)return;
   const form=box.closest('form');try{
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>=5*1024*1024)throw new ApiError({message:'Vui lòng chọn ảnh JPG, PNG có kích cỡ dưới 5MB.',fields:{[box.dataset.photo]:'Ảnh không hợp lệ.'}});
    pending=true;box.dataset.uploading='true';
    const data_url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
    const r=await api('/upload',{method:'POST',body:{data_url,rieng_tu:box.dataset.photo.startsWith('anh_')}});
    $('input[type=hidden]',box).value=r.url;$('.file-preview',box).innerHTML=`<img src="${esc(r.url)}" alt="${esc(box.querySelector('label').textContent)}">`;if(box.dataset.change){const b=box.querySelector('.btn-dark-pill span');if(b)b.textContent=box.dataset.change;const sv=box.querySelector('.btn-dark-pill svg');if(sv)sv.outerHTML=icon('camera');}box.classList.remove('invalid');box.querySelectorAll(':scope > .err').forEach(e=>e.remove());
   }catch(e){showErrors(form||root,e);}finally{pending=false;delete box.dataset.uploading;}
  };
  $('input[type=file]',box).onchange=e=>upload(e.target.files[0]);
  box.ondragover=e=>e.preventDefault();box.ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files[0]);};
 });
}
export function assertUploads(root){if($('[data-uploading]',root))throw new ApiError({message:'Vui lòng đợi ảnh tải lên hoàn tất.'});}
