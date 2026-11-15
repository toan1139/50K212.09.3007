// Lõi giao diện: gọi API, định tuyến, bố cục chung, thành phần dùng lại
import { icon } from './icons.js';
export { icon };

/* ====================== Tiện ích ====================== */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
export const pad = (n) => String(n).padStart(2, '0');
export const VAI_TRO = { KH: 'Khách hàng', NV: 'Nhân viên', CH: 'Chủ cửa hàng' };
export const TRANG_THAI = { CHO_COC: 'Chờ đặt cọc', CHO_BAN_GIAO: 'Chờ bàn giao', DANG_THUE: 'Đang thuê', CHO_KIEM_TRA: 'Chờ kiểm tra', HOAN_TAT: 'Hoàn tất', DA_HUY: 'Đã hủy' };
/** 'YYYY-MM-DD HH:MM' -> '07/11/2026 09:00' */
export function dt(s, { time = true } = {}) {
  if (!s) return '—';
  const [d, t] = String(s).split(/[ T]/); const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}${time && t ? ' ' + t.slice(0, 5) : ''}`;
}
export const dShort = (s) => { if (!s) return ''; const [d, t] = s.split(' '); const [, m, dd] = d.split('-'); return `${dd}/${m}${t ? ' ' + t : ''}`; };
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const qs = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

/* ====================== API ====================== */
export class ApiError extends Error { constructor(e, status) { super(e.message); this.code = e.code; this.fields = e.fields || {}; this.status = status; } }
export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api' + path;
  if (query) { const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)); if ([...q].length) url += '?' + q; }
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch { throw new ApiError({ code: 'E_MANG', message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.' }, 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user && path !== '/auth/dang-nhap') { state.user = null; toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 'err'); go('/dang-nhap'); }
    throw new ApiError(data.error || { code: 'E_LOI_HE_THONG', message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.' }, res.status);
  }
  return data;
}

/* ====================== Trạng thái ====================== */
export const state = { user: null };
export const hasPerm = (p) => !!state.user?.quyen?.includes(p);
export const isStaff = () => ['NV', 'CH'].includes(state.user?.vai_tro);

/* ====================== Thông báo ====================== */
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'ok' ? icon('check') : ''}<div>${esc(msg)}</div>`;
  $('#toasts').append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3600);
}

/* ====================== Thành phần ====================== */
export const badge = (code, label) => `<span class="badge b-${esc(code)}">${esc(label || TRANG_THAI[code] || code)}</span>`;
/** alertBox(type, title, msg, extra, { icon = true, left = false })
 *  error: ô vuông đỏ (không có dấu chấm than); ok: dấu tích trong vòng tròn, mặc định nằm bên phải */
export function alertBox(type, title, msg = '', extra = '', o = {}) {
  const showIc = o.icon !== false;
  const ic = !showIc ? '' : type === 'error' ? '<span class="alert-sq" aria-hidden="true"></span>' : type === 'ok' ? icon('checkCircle') : type === 'info' ? icon('info') : '';
  return `<div class="alert alert-${type}${o.left ? ' ic-left' : ''}" role="${type === 'error' ? 'alert' : 'status'}">${ic}<div class="alert-body"><b>${esc(title)}</b>${msg ? `<div>${esc(msg)}</div>` : ''}${extra}</div></div>`;
}
export function empty({ ic = 'search', title, msg = '', action = '' }) {
  return `<div class="empty">${ic ? `<div class="ic">${icon(ic)}</div>` : ''}<h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}${action ? `<div class="row">${action}</div>` : ''}</div>`;
}
export function pageHead(title, sub = '', actions = '', eyebrow = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
/** stepper(steps, current, { tick = true, plain = false, cls = '' }) – tick:false giữ số thay cho dấu tích; plain: số 1,2,3 thay cho 01,02,03 */
export function stepper(steps, current, o = {}) {
  const tick = o.tick !== false;
  return `<div class="stepper ${o.cls || ''}">${steps.map((s, i) => `${i ? '<span class="bar"></span>' : ''}<div class="step ${i + 1 === current ? 'active' : i + 1 < current ? 'done' : ''}"><span class="dot">${tick && i + 1 < current ? '✓' : o.plain ? i + 1 : pad(i + 1)}</span>${esc(s)}</div>`).join('')}</div>`;
}
/** field({label, name, type, value, required, options:[[v,l]], hint, attrs, cls}) */
export function field(o) {
  const id = 'f_' + o.name + (o.suffix || '');
  const req = o.required ? ' <span class="req">*</span>' : '';
  const val = o.value ?? '';
  let ctrl;
  if (o.type === 'select') ctrl = `<select class="input" id="${id}" name="${o.name}" ${o.attrs || ''}>${o.placeholder !== undefined ? `<option value="">${esc(o.placeholder)}</option>` : ''}${(o.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (o.type === 'textarea') ctrl = `<textarea class="input" id="${id}" name="${o.name}" placeholder="${esc(o.placeholder || '')}" ${o.attrs || ''}>${esc(val)}</textarea>`;
  else if (o.type === 'password') ctrl = `<div class="input-wrap"><input class="input" id="${id}" type="password" name="${o.name}" value="${esc(val)}" placeholder="${esc(o.placeholder || '')}" autocomplete="${o.autocomplete || 'current-password'}" ${o.attrs || ''}><button type="button" class="addon" data-toggle-pw>Xem</button></div>`;
  else ctrl = `<input class="input" id="${id}" type="${o.type || 'text'}" name="${o.name}" value="${esc(val)}" placeholder="${esc(o.placeholder || '')}" ${o.attrs || ''}>`;
  return `<div class="field ${o.cls || ''}" data-field="${o.name}"><label for="${id}">${esc(o.label)}${req}</label>${ctrl}${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ''}</div>`;
}
export function table({ cols, rows, empty: emp, onRow }) {
  if (!rows.length) return `${emp || ''}<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${cols.length}" class="empty-table"></td></tr></tbody></table></div>`;
  return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr ${onRow ? `class="clickable" data-href="${esc(onRow(r))}"` : ''}>${cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r, i) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function kv(items) {
  return `<dl class="kv">${items.filter(Boolean).map(([k, v, cls = '']) => `<dt class="${cls}">${esc(k)}</dt><dd class="${cls}">${v}</dd>`).join('')}</dl>`;
}
export const loading = () => `<div class="page-loading"><div class="skeleton" style="width:40%;height:34px"></div><div class="skeleton" style="width:60%"></div><div class="skeleton big"></div></div>`;
export const img = (src, alt = '') => `<img src="${esc(src || '/assets/img/products/canon-r50.jpg')}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/img/logo.png'">`;

/* Ảnh chụp thực tế (theo Figma) thay cho ảnh nền trắng khi có */
const PHOTOS = {
  'canon-r50': ['/assets/img/photos/canon-r50-1.jpg', '/assets/img/photos/canon-r50-2.jpg', '/assets/img/photos/canon-r50-3.jpg'],
  'fujifilm-xt30': ['/assets/img/photos/fujifilm-xt30.jpg'],
};
const photoKey = (src) => (String(src || '').match(/\/products\/([\w-]+)\.\w+$/) || [])[1];
export const photos = (src) => PHOTOS[photoKey(src)] || [];
export const cardPhoto = (src) => { const k = photoKey(src); return PHOTOS[k] ? `/assets/img/photos/${k}.jpg` : src; };

/* ====================== Form ====================== */
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') { if ('group' in el.dataset) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  }
  return o;
}
export function clearErrors(root) {
  $$('.field.invalid, [data-field].invalid', root).forEach((f) => { f.classList.remove('invalid'); f.querySelectorAll(':scope > .err').forEach((e) => e.remove()); });
  $$('.form-alert', root).forEach((a) => (a.innerHTML = ''));
}
/** Hiển thị lỗi API lên form theo mẫu Figma:
 *  - Thiếu thông tin: thanh thông báo ở trên (không biểu tượng) + viền đỏ các ô thiếu, không ghi chữ dưới ô
 *  - Không hợp lệ / trùng: chỉ ghi lỗi dưới từng ô, không có thanh thông báo ở trên
 *  - Lỗi không gắn với ô nào: thanh thông báo ở trên (ô vuông đỏ)
 *  o: { missingMsg, missingText, alertFor: {CODE: 'tiêu đề'}, alertTarget } */
export function showErrors(root, err, title, o = {}) {
  clearErrors(root);
  if (o.alertTarget) o.alertTarget.innerHTML = '';
  const box = o.alertTarget || $('.form-alert', root);
  const fields = Object.entries(err.fields || {});
  const missing = err.code === 'E01_THIEU_THONG_TIN';
  let top = null;
  if (title) top = alertBox('error', title, err.message);
  else if (missing) top = alertBox('error', o.missingMsg || 'Vui lòng nhập đầy đủ thông tin bắt buộc', '', '', { icon: !!o.missingIcon });
  else if (o.alertFor?.[err.code]) top = alertBox('error', o.alertFor[err.code]);
  else if (!fields.length) top = alertBox('error', err.message);
  if (top) { if (box) box.innerHTML = top; else toast(err.message, 'err'); }
  let first = null;
  for (const [k, msg] of fields) {
    const f = $(`[data-field="${k}"]`, root);
    if (!f) continue;
    f.classList.add('invalid');
    const inp = $('input,select,textarea', f), empty = !inp || !String(inp.value || '').trim();
    const hide = missing && !o.missingText && empty; // ô bỏ trống: chỉ tô đỏ, không ghi chữ
    if (msg && msg.trim() && !hide) f.insertAdjacentHTML('beforeend', `<span class="err">${esc(msg)}</span>`);
    first ||= f;
  }
  if (o.scroll !== false) ((top && box) || first)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
/** Gắn submit: tự xử lý trạng thái nút, lỗi */
export function onSubmit(form, handler, { errTitle, errOpts } = {}) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.submitting) return;
    form.dataset.submitting = 'true';
    const btn = e.submitter || $('button[type=submit]', form);
    const wasDisabled = btn?.disabled;
    if (btn) btn.disabled = true;
    btn?.classList.add('loading');
    clearErrors(form);
    try { await handler(formData(form), btn); }
    catch (err) { if (err instanceof ApiError) showErrors(form, err, errTitle, typeof errOpts === 'function' ? errOpts(err) : errOpts); else { console.error(err); toast('Có lỗi xảy ra.', 'err'); } }
    finally { delete form.dataset.submitting; btn?.classList.remove('loading'); if (btn) btn.disabled = !!wasDisabled; }
  });
}
document.addEventListener('wheel', (e) => { const a = document.activeElement; if (a && a.type === 'number' && e.target === a) a.blur(); }, { passive: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle-pw]');
  if (t) { const i = t.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? 'Xem' : 'Ẩn'; }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a,button,input,select')) go(row.dataset.href);
});

/* ====================== Modal ====================== */
export function modal({ title, sub = '', body = '', foot = '', size = '', topIcon = '' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const previousFocus = document.activeElement;
    back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><div>${topIcon}<h3 id="dialog-title">${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Đóng">${icon('x')}</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    document.body.append(back);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Tab') { const items = $('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]', back); const first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(null); const b = e.target.closest('[data-value]'); if (b) close(b.dataset.value); });
    back._close = close;
    resolve.el = back;
    setTimeout(() => $('input,select,textarea,button', back)?.focus(), 30);
    modal.current = { el: back, close };
  });
}
export function confirmBox({ title, msg, ok = 'Xác nhận', cancel = 'Quay lại', danger = false, tone = 'warn' }) {
  return modal({ title, topIcon: `<div class="ic-top ic-${tone}">${icon(tone === 'ok' ? 'check' : 'alert')}</div>`, body: `<p class="muted">${esc(msg)}</p>`,
    foot: `<button class="btn btn-secondary" data-value="">${esc(cancel)}</button><button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" data-value="ok">${esc(ok)}</button>` }).then((v) => v === 'ok');
}
export function resultBox({ title, msg, tone = 'ok', ok = 'Đóng' }) {
  return modal({ title, topIcon: tone === 'ok' ? `<div class="ic-top ic-ok">${icon('check')}</div>` : '', body: `<p class="muted">${esc(msg)}</p>`, foot: `<button class="btn btn-primary" data-value="ok">${esc(ok)}</button>` });
}
/** Modal chứa form: trả về kết quả của handler khi thành công */
export function formModal({ title, sub, body, submit = 'Lưu', size = '', handler, errTitle, onMount }) {
  return new Promise((resolve) => {
    modal({ title, sub, size, body: `<form id="mform" novalidate><div class="form-alert"></div>${body}<div class="form-actions"><button type="button" class="btn btn-secondary" data-close>Hủy</button><button type="submit" class="btn btn-primary">${esc(submit)}</button></div></form>` }).then(() => resolve(null));
    const { el, close } = modal.current;
    const form = $('#mform', el);
    onMount?.(form);
    onSubmit(form, async (data) => { const r = await handler(data, form); close(); resolve(r ?? true); }, { errTitle });
  });
}

/* Footer ghim ở đáy màn hình: ghi chiều cao thật vào --footer-h để chừa chỗ cho nội dung */
let footerRO;
function watchFooter() {
  const f = document.querySelector('#app .footer');
  footerRO?.disconnect();
  if (!f || typeof ResizeObserver === 'undefined') return;
  footerRO = new ResizeObserver(() => document.documentElement.style.setProperty('--footer-h', f.offsetHeight + 'px'));
  footerRO.observe(f);
}
/* ====================== Định tuyến ====================== */
const routes = [];
/** route('/don-thue/:id', { title, crumbs, auth: true|['NV','CH'], perm, layout:'plain', render(params) }) */
export function route(path, def) {
  const keys = [];
  const re = path === '*' ? /(?!)/ : new RegExp('^' + path.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ path, re, keys, ...def });
}
export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const link = (path) => '#' + path;

/* Mục sidebar theo đúng 4 vai trò trong Figma (Quy chuẩn giao diện · 05 Sidebar) */
function navFor(u) {
  const base = [['/', 'grid', 'Trang chủ'], ['/tra-cuu', 'search', 'Tra cứu thông tin', ['/thiet-bi']]];
  if (!u) return [...base, ['/dang-ky', 'logout', 'Đăng ký', ['/dang-nhap', '/quen-mat-khau']]];
  if (u.vai_tro === 'KH') return [...base, ['/dat-lich-cua-ban', 'calendar', 'Đặt lịch', ['/dat-lich', '/don-cua-toi']], ['#logout', 'logout', 'Đăng xuất']];
  const p = (x) => u.quyen.includes(x);
  return [...base,
    p('XU_LY_DON') && ['/don-thue', 'clipboard', 'Xử lý đơn thuê'],
    p('QL_LICH') && ['/lich-chung', 'calendar', 'Quản lý lịch'],
    p('QL_KHACH_HANG') && ['/khach-hang', 'users', 'Quản lý khách hàng'],
    u.vai_tro === 'CH' && p('QL_TAI_KHOAN') && ['/tai-khoan', 'userCog', 'Quản lý tài khoản'],
    u.vai_tro === 'CH' && p('BAO_CAO') && ['/bao-cao', 'trend', 'Xem báo cáo doanh thu'],
    u.vai_tro === 'CH' && p('QL_THIET_BI') && ['/quan-ly/thiet-bi', 'camera', 'Máy ảnh', ['/quan-ly/dong-may', '/quan-ly/them-thiet-bi', '/quan-ly/gia']],
    u.vai_tro === 'CH' && p('QL_GIA_KM') && ['/quan-ly/khuyen-mai', 'tag', 'Khuyến mãi'],
    ['#logout', 'logout', 'Đăng xuất']].filter(Boolean);
}
export const LOGO_SRC = '/assets/img/logo.png';
const LOGO = () => `<a class="logo" href="#/" aria-label="ME.E DIGITALCAM – Trang chủ"><img src="${LOGO_SRC}" alt=""><span>ME.E<br>DIGITALCAM</span></a>`;
function footer() {
  return `<footer class="footer">
    <div class="f-brand">${LOGO()}<p>Cho thuê máy ảnh tại Đà Nẵng</p></div>
    <div><h4>Chính sách</h4><span>Tiền cọc</span><span>Nhận &amp; Trả máy</span><span>Đền bù thiệt hại</span><span>Cách bảo quản</span></div>
    <div><h4>Khám phá</h4><a href="#/thiet-bi">Máy cho thuê</a><a href="#/tra-cuu/lich-trong">Lịch trống</a><a href="#/tra-cuu/gia">Tra cứu giá</a><a href="#/chinh-sach/cach-thue">Cách thuê</a></div>
    <div><h4>Liên hệ</h4><span>0917 999 277 / 0834 020 466 (Zalo)</span><span>75 Lê Thị Hồng Gấm, Hải Châu Đà Nẵng</span></div>
  </footer>`;
}
/* Mục breadcrumb dạng chữ ở giữa đường dẫn: đường dẫn đích tương ứng */
const CRUMB_LINKS = { 'Trang chủ': '/', 'Đăng nhập': '/dang-nhap', 'Đăng ký': '/dang-ky', 'Quên mật khẩu': '/quen-mat-khau', 'Chính sách': '/chinh-sach/cach-thue', 'Tra cứu thông tin': '/tra-cuu', 'Đặt lịch': '/dat-lich-cua-ban' };
/** Mọi mục breadcrumb đều là liên kết; mục cuối (trang hiện tại) in đậm và trỏ về chính trang này */
const crumbsOf = (r, params) => {
  const crumbs = ((typeof r.crumbs === 'function' ? r.crumbs(params) : r.crumbs) || [r.title]).filter((c) => c !== '');
  const here = location.hash.slice(1) || '/';
  return `<a href="#/">ME.E</a> / ${crumbs.map((c, i) => {
    const last = i === crumbs.length - 1, [label, path] = Array.isArray(c) ? c : [c, last ? here : CRUMB_LINKS[c] || here];
    return last ? `<a href="#${path}" aria-current="page"><b>${esc(label)}</b></a>` : `<a href="#${path}">${esc(label)}</a>`;
  }).join(' / ')}`;
};
const roleRight = (u) => (u ? `<a class="role-tag" href="#/ho-so" title="Tài khoản của tôi">${esc(VAI_TRO[u.vai_tro])}</a>` : `<div class="role-tag"><a href="#/dang-nhap">Đăng nhập</a> | <a href="#/dang-ky">Đăng ký</a></div>`);

/* Trang chủ khách (Figma "giao diện chính"): thanh menu ngang, không sidebar */
function homeLayout(content) {
  const u = state.user;
  const top = u ? `<a href="#/ho-so">${esc(u.ho_ten)}</a><i></i><a href="#" data-logout>Đăng xuất</a>` : `<a href="#/dang-ky">Đăng ký</a><i></i><a href="#/dang-nhap">Đăng nhập</a>`;
  const links = [['/', 'Trang chủ'], ['/tra-cuu', 'Tra cứu thông tin'], ['/khuyen-mai', 'Khuyến mãi'], ['/chinh-sach/cach-thue', 'Hướng dẫn'], ['/lien-he', 'Liên hệ']];
  if (u?.vai_tro === 'KH') links.splice(2, 0, ['/dat-lich-cua-ban', 'Đặt lịch']);
  return `<div class="home hp">
    <div class="hp-strip"><div class="hp-wrap">${top}</div></div>
    <header class="hp-nav"><div class="hp-wrap"><a class="hp-logo" href="#/" aria-label="ME.E DIGITALCAM"><img src="${LOGO_SRC}" alt="ME.E DIGITALCAM"></a>
      <nav>${links.map(([h, l]) => `<a href="#${h}" class="${h === '/' ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <form class="hp-search" id="home-search" role="search">${icon('search')}<input name="q" placeholder="Tìm kiếm máy ảnh..." aria-label="Tìm kiếm máy ảnh"></form></div></header>
    <main id="view">${content}</main>${homeFooter()}</div>`;
}
function homeFooter() {
  return footer();
}

function layout(r, content, params) {
  const u = state.user;
  const lay = typeof r.layout === 'function' ? r.layout() : r.layout;
  // Figma: trang chủ khách dùng menu ngang; đăng nhập / đăng ký / quên mật khẩu không có sidebar
  if (lay === 'home') return homeLayout(content);
  const crumbHtml = crumbsOf(r, params);
  if (lay === 'plain') return `<div class="shell shell-plain">
    <div class="main"><header class="topbar plain-top">${LOGO()}<div class="crumbs">${crumbHtml}</div></header>
      <main class="content auth-wrap" id="view">${content}</main></div>${footer()}</div>`;
  // Đăng nhập / đăng ký / quên mật khẩu (Figma "Lạc_UC_1 / UC_12"): logo góc trái, không sidebar
  const cur = '/' + (location.hash.slice(2).split('?')[0] || '');
  const isActive = (n) => (n[0] === '/' ? cur === '/' : [n[0], ...(n[3] || [])].some((x) => cur === x || cur.startsWith(x + '/')));
  const nav = navFor(u).map((n) => `<a href="${n[0].startsWith('#') ? '#' : '#' + n[0]}" class="${isActive(n) ? 'active' : ''}" ${n[0] === '#logout' ? 'data-logout' : ''}>${icon(n[1])}<span>${esc(n[2])}</span></a>`).join('');
  return `<div class="shell">
    <aside class="sidebar" id="sidebar">${LOGO()}<p class="tagline">Cho thuê máy ảnh Đà Nẵng</p><nav class="nav" aria-label="Điều hướng chính">${nav}</nav></aside>
    <div class="main"><header class="topbar"><div class="left"><button class="icon-btn menu-btn" data-menu aria-label="Mở menu">${icon('menu')}</button><div class="crumbs">${crumbHtml}</div></div>
      ${roleRight(u)}</header>
      <main class="content ${lay === 'plain' ? 'auth-wrap' : ''}" id="view">${content}</main></div>
    ${footer()}</div>`;
}

let renderSeq = 0;
export async function render() {
  const seq = ++renderSeq;
  document.body.classList.remove('nav-open');
  modal.current?.close?.(null);
  const path = '/' + (location.hash.slice(2).split('?')[0] || '');
  // Ưu tiên route tĩnh (ít tham số) – ví dụ /don-thue/tao trước /don-thue/:id
  let r = routes.filter((x) => x.re.test(path)).sort((a, b) => a.keys.length - b.keys.length)[0];
  let params = {};
  if (r) { const m = path.match(r.re); r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); }
  else r = routes.find((x) => x.path === '*');
  // Kiểm tra quyền truy cập
  if (r.auth && !state.user) { sessionStorage.setItem('after_login', location.hash); toast('Vui lòng đăng nhập để tiếp tục.', 'err'); return go('/dang-nhap'); }
  if (r.guestOnly && state.user) return go('/');
  const denied = (Array.isArray(r.auth) && !r.auth.includes(state.user?.vai_tro)) || (r.perm && !hasPerm(r.perm));
  if (denied) r = routes.find((x) => x.path === '/403');
  document.body.dataset.page = path.split('/')[1] || 'trang-chu';
  document.body.dataset.route = path;
  document.title = `${r.title || 'Trang'} · ME.E DIGITALCAM`;
  const app = $('#app');
  app.innerHTML = layout(r, loading(), params);
  window.scrollTo(0, 0);
  watchFooter();
  try {
    const html = await r.render(params);
    if (seq !== renderSeq) return;
    $('#view').innerHTML = typeof html === 'string' ? html : '';
    await r.mount?.($('#view'), params);
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error(err);
    $('#view').innerHTML = err.status === 404
      ? empty({ ic: 'search', title: 'Không tìm thấy dữ liệu', msg: err.message, action: `<a class="btn btn-secondary" href="javascript:history.back()">Quay lại</a>` })
      : empty({ ic: '', title: 'Không tải được dữ liệu', msg: err.message || 'Hệ thống đang gặp sự cố.', action: `<button class="btn btn-primary" onclick="location.reload()">${icon('refresh')}Thử lại</button>` });
  }
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'home-search') return;
  e.preventDefault(); const q = e.target.q.value.trim(); go('/thiet-bi' + (q ? '?q=' + encodeURIComponent(q) : ''));
});
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-menu]')) document.body.classList.toggle('nav-open');
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    try { await api('/auth/dang-xuat', { method: 'POST' }); state.user = null; toast('Đăng xuất thành công.'); go('/'); }
    catch { const c = document.querySelector('main.content'); if (c) { c.querySelector('.logout-alert')?.remove(); c.insertAdjacentHTML('afterbegin', `<div class="logout-alert">${alertBox('error', 'Đăng xuất không thành công')}</div>`); window.scrollTo(0, 0); } }
  }
});

export async function start() {
  try { state.user = (await api('/auth/me')).user; } catch { state.user = null; }
  window.addEventListener('hashchange', render);
  // Bấm breadcrumb / logo trỏ tới chính trang đang mở (cùng hash) vẫn tải lại trang đó và cuộn lên đầu
  document.addEventListener('click', (e) => { const a = e.target.closest?.('.crumbs a, a.logo, a.hp-logo'); if (a && a.getAttribute('href') === (location.hash || '#/')) { e.preventDefault(); render(); } });
  render();
}
