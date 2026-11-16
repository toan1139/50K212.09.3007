// Authentication screens from the supplied Figma exports.
import {route,api,state,esc,field,stepper,alertBox,onSubmit,go,$,$$,showErrors,confirmBox} from '../core.js';
const steps=['Thông tin đăng ký','Xác thực OTP','Hoàn tất'];
const otpDemo=o=>o&&o.otp_demo?`<div class="otp-demo" role="status">Mã OTP của bạn (hệ thống tự sinh): <b>${esc(o.otp_demo)}</b></div>`:'';
const heading=(title,sub='')=>`<div class="auth-heading"><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>`;
const otpFields=()=>`<div class="field" data-field="ma"><div class="otp">${Array.from({length:6},(_,i)=>`<input inputmode="numeric" maxlength="1" autocomplete="${i?'off':'one-time-code'}" placeholder="–" aria-label="Chữ số OTP ${i+1}">`).join('')}</div></div>`;
function bindOtp(root,submit){
 const ins=$$('.otp input',root);
 const filled=()=>{if(ins.every(x=>/^\d$/.test(x.value)))submit(ins.map(x=>x.value).join(''));};
 ins.forEach((el,i)=>{
  el.oninput=()=>{el.value=el.value.replace(/\D/g,'').slice(-1);if(el.value)ins[i+1]?.focus();filled();};
  el.onkeydown=e=>{if(e.key==='Backspace'&&!el.value)ins[i-1]?.focus();};
  el.onpaste=e=>{const code=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);if(code){e.preventDefault();code.split('').forEach((x,k)=>{if(ins[i+k])ins[i+k].value=x;});filled();}};
 });
 ins[0]?.focus();
}
/** Khung OTP dùng chung: đếm thời gian hiệu lực, sai mã -> "Nhập lại mã OTP", hết hạn -> "Gửi lại mã OTP"
 *  o: { timer, topAlert (thông báo sai mã ở thanh trên thay vì dưới ô), verify(ma), resend() } */
function otpPanel(root,otp,o){
 const ins=$$('.otp input',root),msg=$('.otp-msg',root),rem=$('.otp-remaining',root),btn=$('.otp-btn',root),top=$('.form-alert',root);
 let busy=false,expired=false,timer=null;const deadline=Date.now()+otp.het_han_phut*60000;
 const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
 const demoBox=$('.otp-demo',root),clear=()=>{if(msg)msg.textContent='';if(top)top.innerHTML='';ins.forEach(x=>x.classList.remove('bad'));};
 const setExpired=(text='Mã OTP đã hết hạn.')=>{expired=true;clearInterval(timer);clear();
  if(o.topAlert&&top){top.innerHTML=alertBox('error',text.replace(/\.$/,''));if(demoBox)demoBox.hidden=true;}else if(msg)msg.textContent=text;
  if(rem){rem.textContent='Thời gian hiệu lực: 00:00 - Đã hết hạn';rem.classList.add('expired');}
  ins.forEach(x=>{x.disabled=true;});btn.textContent='Gửi lại mã OTP';btn.classList.add('otp-resend');btn.hidden=false;btn.onclick=o.resend;};
 const setWrong=()=>{clear();
  if(o.topAlert&&top){top.innerHTML=alertBox('error','Mã OTP không chính xác');if(demoBox)demoBox.hidden=true;}
  else{if(msg)msg.textContent='Mã OTP không chính xác.';ins.forEach((x,i)=>x.classList.toggle('bad',otp.otp_demo?x.value!==otp.otp_demo[i]:true));}
  btn.textContent='Nhập lại mã OTP';btn.classList.remove('otp-resend');btn.hidden=false;btn.onclick=()=>{clear();ins.forEach(x=>{x.value='';});btn.hidden=true;ins[0].focus();};};
 if(o.timer!==false&&rem){const tick=()=>{if(!root.isConnected)return clearInterval(timer);const sec=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(!expired)rem.textContent='Thời gian hiệu lực: '+fmt(sec);if(!sec&&!expired)setExpired();};tick();timer=setInterval(tick,1000);}
 else timer=setInterval(()=>{if(!root.isConnected)return clearInterval(timer);if(Date.now()>=deadline&&!expired)setExpired();},1000);
 bindOtp(root,async ma=>{if(busy||expired)return;busy=true;clear();
  try{await o.verify(ma);clearInterval(timer);}
  catch(e){if(e.code==='OTP_HET_HAN')setExpired();else if(e.code==='OTP_KHOA')setExpired(e.message);else if(e.code==='OTP_SAI')setWrong();else if(top)top.innerHTML=alertBox('error',e.message);}
  finally{busy=false;}});
}
const otpBlock=(intro,otp,{timer=true,demo=true}={})=>`<h3>Xác thực OTP</h3><p class="small muted">${intro}</p>${demo?otpDemo(otp):''}<div class="form-alert"></div>${otpFields()}<p class="otp-msg"></p>${timer?'<p class="otp-remaining"></p>':''}<button class="btn btn-primary otp-btn" type="button" hidden></button>`;
const loginSteps=['Nhập thông tin','Kiểm tra tài khoản','Hoàn tất'];
route('/dang-nhap',{
 title:'Đăng nhập',crumbs:['Trang chủ','Đăng nhập'],layout:'plain',guestOnly:true,
 render:()=>`<div class="login-view">${heading('Đăng nhập','Đăng nhập vào hệ thống bằng số điện thoại và mật khẩu.')}<div id="steps">${stepper(loginSteps,1,{tick:false})}</div>
 <form class="card auth-card" id="f" novalidate><h3>Thông tin đăng nhập</h3><p class="small muted">Vui lòng nhập thông tin để truy cập tài khoản.</p><div class="form-alert"></div>
 <div class="login-fields">${field({label:'Số điện thoại',name:'sdt',required:true,placeholder:'VD: 0912345678',attrs:'autocomplete="username"'})}${field({label:'Mật khẩu',name:'mat_khau',required:true,type:'password',placeholder:'Nhập mật khẩu'})}</div>
 <div class="login-actions"><a href="#/quen-mat-khau">Quên mật khẩu?</a><button type="submit" class="btn btn-primary btn-block">Đăng nhập</button></div></form><div id="login-result"></div></div>`,
 mount(v){const loginView=$('.login-view',v);onSubmit($('#f',v),async d=>{
  loginView.classList.remove('login-missing');
  $('#steps',v).innerHTML=stepper(loginSteps,2,{tick:false});
  let r;try{r=await api('/auth/dang-nhap',{method:'POST',body:d});}catch(e){$('#steps',v).innerHTML=stepper(loginSteps,1,{tick:false});throw e;}
  state.user=r.user;
  $('#steps',v).innerHTML=stepper(loginSteps,3,{tick:false});
  $('#login-result',v).innerHTML=alertBox('ok','Đăng nhập thành công');
  const back=sessionStorage.getItem('after_login');sessionStorage.removeItem('after_login');await new Promise(r=>setTimeout(r,900));go(back?back.replace(/^#/,''):'/');
 },{errOpts:err=>{loginView.classList.toggle('login-missing',err.code==='E01_THIEU_THONG_TIN');return {scroll:false};}});}
});
route('/dang-ky',{
 title:'Đăng ký tài khoản',crumbs:['Trang chủ','Đăng ký'],layout:'plain',guestOnly:true,
 render:()=>`<div class="register-view">${heading('Đăng ký tài khoản','Tạo tài khoản để sử dụng dịch vụ thuê máy ảnh ME.E và lưu giữ mọi khoảnh khắc.')}<div id="reg"></div></div>`,
 mount(v){
  const box=$('#reg',v);let otp,busy=false;
  const step1=()=>{
   box.innerHTML=`${stepper(steps,1,{tick:false,plain:true})}<form class="card auth-card" id="reg-form" novalidate><h3>Thông tin đăng ký</h3><div class="form-alert"></div><div class="form-grid">
   ${field({label:'Họ và tên',name:'ho_ten',required:true,attrs:'autocomplete="name"'})}
   ${field({label:'Số điện thoại',name:'sdt',required:true,type:'tel',attrs:'inputmode="numeric" maxlength="10" autocomplete="tel"'})}
   ${field({label:'Ngày sinh',name:'ngay_sinh',required:true,placeholder:'dd/mm/yyyy',attrs:'inputmode="numeric"'})}
   ${field({label:'Địa chỉ',name:'dia_chi',required:true,attrs:'autocomplete="street-address"'})}
   ${field({label:'Email',name:'email',required:true,type:'email',placeholder:'abc@gmail.com',attrs:'autocomplete="email"'})}
   ${field({label:'CCCD',name:'cccd',required:true,attrs:'inputmode="numeric" maxlength="12"'})}
   ${field({label:'Mật khẩu',name:'mat_khau',required:true,type:'password',autocomplete:'new-password'})}
   ${field({label:'Xác nhận mật khẩu',name:'xac_nhan_mat_khau',required:true,type:'password',autocomplete:'new-password'})}
   </div><div class="form-actions"><button class="btn btn-secondary" type="button" id="cancel">Hủy</button><button class="btn btn-primary" type="submit">Đăng ký</button></div></form><div id="reg-result"></div>`;
   $('#cancel',box).onclick=async()=>{if(await confirmBox({title:'Xác nhận hủy',msg:'Bạn có chắc muốn hủy đăng ký không?',ok:'Có',cancel:'Không'})){$('#reg-form',box).reset();$('#reg-result',box).innerHTML=alertBox('error','Đã hủy đăng ký');}};
   onSubmit($('#reg-form',box),async d=>{otp=await api('/auth/dang-ky',{method:'POST',body:d});step2(d.sdt);});
  };
  const step2=sdt=>{
   box.innerHTML=`${stepper(steps,2,{tick:false,plain:true})}<form class="card auth-card stage-card otp-card" id="otp-form" novalidate>${otpBlock(`Mã OTP đã được gửi đến số điện thoại ${esc(sdt.slice(0,4)+'***'+sdt.slice(-3))}.`,otp)}</form>`;
   if(otp.otp_demo)console.info('Mã OTP đăng ký (chỉ dùng thử):',otp.otp_demo);
   otpPanel($('#otp-form',box),otp,{
    verify:async ma=>{await api('/auth/xac-thuc-otp',{method:'POST',body:{otp_id:otp.otp_id,ma}});
     box.innerHTML=`${stepper(steps,3,{tick:false,plain:true})}<div class="card auth-card stage-card"><div class="status-result">${alertBox('ok','Đăng ký thành công')}</div></div>`;},
    resend:async()=>{try{otp=await api('/auth/gui-lai-otp',{method:'POST',body:{otp_id:otp.otp_id}});step2(sdt);}catch(e){showErrors($('#otp-form',box),e);}}
   });
  };
  step1();
 }
});
route('/quen-mat-khau',{
 title:'Quên mật khẩu',crumbs:[['Đăng nhập','/dang-nhap'],'Quên mật khẩu'],layout:'plain',guestOnly:true,
 render:()=>`<div class="forgot-view">${heading('Quên mật khẩu','Khôi phục mật khẩu đăng nhập vào hệ thống.')}<div id="forgot"></div></div>`,
 mount(v){
  const box=$('#forgot',v),names=['Nhập số điện thoại','Xác thực OTP','Tạo mật khẩu mới'],st=n=>stepper(names,n,{tick:false});let otp;
  const start=()=>{box.innerHTML=`${st(1)}<form class="card auth-card" id="f" novalidate><h3>Khôi phục mật khẩu</h3><p class="small muted mb-16">Nhập số điện thoại đã đăng ký để nhận mã OTP.</p><div class="form-alert"></div>${field({label:'Số điện thoại',name:'sdt',type:'tel',attrs:'inputmode="numeric" maxlength="10"'})}<div class="form-actions"><button class="btn btn-primary" type="submit">Gửi mã OTP</button><a class="btn btn-secondary" href="#/dang-nhap">Quay lại đăng nhập</a></div></form>`;
   onSubmit($('#f',box),async d=>{otp=await api('/auth/quen-mat-khau',{method:'POST',body:d});verify();});};
  const resetForm=token=>{box.innerHTML=`${st(3)}<form class="card auth-card" id="f" novalidate><h3>Tạo mật khẩu mới</h3><p class="small muted mb-16">Nhập mật khẩu mới và xác nhận mật khẩu mới.</p><div class="form-alert"></div><div class="reset-grid">${field({label:'Mật khẩu mới',name:'mat_khau',type:'password',autocomplete:'new-password'})}<span></span>${field({label:'Xác nhận mật khẩu mới',name:'xac_nhan_mat_khau',type:'password',autocomplete:'new-password'})}<button class="btn btn-primary" type="submit">Xác nhận</button></div></form><div id="reset-result"></div>`;
    const f=$('#f',box);
    onSubmit(f,async d=>{await api('/auth/dat-lai-mat-khau',{method:'POST',body:{...d,reset_token:token}});$('#reset-result',box).innerHTML=alertBox('ok','Đặt lại mật khẩu thành công');$$('input,button',f).forEach(x=>{x.disabled=true;});});
  };
  const verify=()=>{box.innerHTML=`${st(2)}<form class="card auth-card" id="f" novalidate>${otpBlock('Nhập mã OTP đã được gửi đến số điện thoại của bạn.',otp,{timer:false})}</form>`;
   otpPanel($('#f',box),otp,{timer:false,topAlert:true,
    verify:async ma=>{const r=await api('/auth/xac-thuc-khoi-phuc',{method:'POST',body:{otp_id:otp.otp_id,ma}});resetForm(r.reset_token);},
    resend:async()=>{try{otp=await api('/auth/gui-lai-otp',{method:'POST',body:{otp_id:otp.otp_id}});verify();}catch(e){showErrors($('#f',box),e);}}});
  };
  start();
 }
});
