// Thành phần nghiệp vụ dùng lại: chọn ngày giờ, lịch tháng, thẻ sản phẩm, biểu đồ
import { esc, money, pad, field, icon, img, cardPhoto, state, link, todayStr, addDays } from './core.js';

export const GIO = Array.from({ length: 27 }, (_, i) => { const m = 8 * 60 + i * 30; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; });
export const gioOpts = GIO.map((g) => [g, g]);

/** Ô ngày hiển thị dạng dd/mm/yyyy, không có icon lịch: bấm vào ô vẫn mở bảng chọn ngày.
 *  Ô date gốc (giữ name, giá trị yyyy-mm-dd) được ẩn dưới ô hiển thị để form và báo lỗi không đổi. */
export function plainDates(root) {
  const fmt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');
  root.querySelectorAll('input[type=date]:not([data-plain])').forEach((d) => {
    d.dataset.plain = '1';
    const wrap = document.createElement('div'); wrap.className = 'date-plain';
    const show = document.createElement('input');
    show.type = 'text'; show.className = 'input'; show.readOnly = true; show.placeholder = 'dd/mm/yyyy'; show.value = fmt(d.value);
    show.setAttribute('aria-label', d.closest('.field')?.querySelector('label')?.textContent || 'Chọn ngày');
    d.replaceWith(wrap); wrap.append(show, d); d.tabIndex = -1;
    const open = () => { try { d.showPicker(); } catch { d.focus(); d.click(); } };
    show.addEventListener('click', open);
    show.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(); } });
    const sync = () => { show.value = fmt(d.value); };
    d.addEventListener('change', sync); d.addEventListener('input', sync);
  });
}

/** Cặp ngày + giờ nhận/trả theo đúng bố cục Figma (Ngày nhận | Giờ nhận) */
export function timeFields({ nhan = '', tra = '', suffix = '', blank = false } = {}) {
  const [nd, ng = '09:00'] = nhan ? nhan.split(' ') : [blank ? '' : addDays(todayStr(), 1), '09:00'];
  const [td, tg = '09:00'] = tra ? tra.split(' ') : [blank ? '' : addDays(todayStr(), 3), '09:00'];
  return `<div class="form-grid">
    ${field({ label: 'Ngày nhận', name: 'ngay_nhan_d', type: 'date', value: nd, required: true, attrs: '', suffix })}
    ${field({ label: 'Giờ nhận', name: 'gio_nhan', type: 'select', value: ng, options: gioOpts, suffix })}
    ${field({ label: 'Ngày trả', name: 'ngay_tra_d', type: 'date', value: td, required: true, attrs: `min="${todayStr()}"`, suffix })}
    ${field({ label: 'Giờ trả', name: 'gio_tra', type: 'select', value: tg, options: gioOpts, suffix })}
  </div>`;
}
/** Gộp ngày + giờ, đồng thời đổi tên trường lỗi từ API sang ô tương ứng */
export function readTime(d) {
  return { ngay_nhan: d.ngay_nhan_d ? `${d.ngay_nhan_d} ${d.gio_nhan}` : '', ngay_tra: d.ngay_tra_d ? `${d.ngay_tra_d} ${d.gio_tra}` : '' };
}
export function mapTimeErrors(err) {
  const f = { ...err.fields };
  if (f.ngay_nhan) f.ngay_nhan_d = f.ngay_nhan;
  if (f.ngay_tra) f.ngay_tra_d = f.ngay_tra;
  err.fields = f; return err;
}

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
/** Lịch tháng: days = [{ngay, trang_thai, so_trong, tong}] */
export function monthCalendar(thang, days, { selFrom, selTo } = {}) {
  const [y, m] = thang.split('-').map(Number);
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const t = todayStr();
  const label = { TRONG: 'Trống', DANG_THUE: 'Đang thuê', QUA: '' };
  return `<div class="cal-head"><h3>Tháng ${m}, ${y}</h3><div class="row"><button type="button" class="icon-btn" data-cal="-1" aria-label="Tháng trước">${icon('chevL')}</button><button type="button" class="icon-btn" data-cal="1" aria-label="Tháng sau">${icon('chevR')}</button></div></div>
  <div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}${'<div class="day"></div>'.repeat(first)}
  ${days.map((d) => { const sel = selFrom && d.ngay >= selFrom && d.ngay <= selTo; return `<div class="day ${d.trang_thai} ${sel ? 'sel' : ''} ${d.ngay === t ? 'today' : ''}" title="${d.so_trong}/${d.tong} máy trống"><b>${+d.ngay.slice(8)}</b><span class="st">${label[d.trang_thai]}</span></div>`; }).join('')}</div>
  <div class="legend"><span><i style="background:var(--primary)"></i>Trống</span><span><i style="background:var(--line)"></i>Đang thuê</span></div>`;
}

/** Đường dẫn đặt máy theo vai trò: khách -> đặt lịch, nhân viên -> tạo đơn thuê */
export const rentHref = (dmId, extra = '') => {
  const u = state.user;
  if (u && u.vai_tro !== 'KH') return link(`/don-thue/tao?dong_may_id=${dmId}${extra}`);
  return link(`/dat-lich?dong_may_id=${dmId}${extra}`);
};

/**
 * Thẻ sản phẩm theo Figma.
 *  mode 'home' (Sản phẩm nổi bật): ảnh vuông, nhãn "Mới", giá / ngày, nút "Thuê ngay"
 *  mode 'list' (Tra cứu máy):      hãng + "Trống", mô tả ngắn, nút "Xem chi tiết"
 */
export function productCard(dm, { mode = 'list', moi = false } = {}) {
  const trong = dm.so_trong_hien_tai > 0;
  const detail = link('/thiet-bi/' + dm.id);
  return `<article class="product">
    <a class="thumb" href="${detail}" aria-label="${esc(dm.ten)}">${img(cardPhoto(dm.anh), dm.ten)}${moi ? '<span class="new">Mới</span>' : ''}${mode === 'home' ? `<span class="fav">${icon('heart')}</span>` : ''}</a>
    <div class="body">
      <div class="meta"><span>${esc(dm.hang)}</span>${trong ? '<span class="ok">Trống</span>' : '<span class="no">Đang thuê hết</span>'}</div>
      <h3><a href="${detail}" style="color:inherit">${esc(dm.ten)}</a></h3>
      ${mode === 'list' ? `<p class="desc">${esc(dm.mo_ta || '')}</p>` : ''}
      <div class="price money">${money(dm.gia_ngay)} <small>/ ngày</small></div>
      
      <div class="acts">${mode === 'home'
    ? `<a class="btn btn-primary btn-sm" href="${rentHref(dm.id)}">Thuê ngay</a>`
    : `<a class="btn btn-secondary btn-sm" href="${detail}">Xem chi tiết ↗</a>${state.user?.vai_tro === 'KH' ? `<a class="btn btn-primary btn-sm" href="${rentHref(dm.id)}">Đặt lịch</a>` : ''}`}</div>
    </div></article>`;
}

/* ---------------- Biểu đồ SVG ---------------- */
// Màu biểu đồ lấy từ design tokens (không thêm màu ngoài bảng chuẩn)
const SERIES = ['var(--primary)', 'var(--brand)', 'var(--sand)', 'var(--muted)', 'var(--espresso)', 'var(--line)', 'var(--primary-hover)', 'var(--brand-deep)'];
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' tr' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
function axes(max, W, H, L, B, T) {
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const nice = Math.ceil((max || 1) / step) * step;
  const ticks = [0, .25, .5, .75, 1].map((k) => nice * k);
  return { nice, grid: ticks.map((v) => { const y = H - B - (v / nice) * (H - B - T); return `<line x1="${L}" x2="${W - 10}" y1="${y}" y2="${y}" style="stroke:var(--line-soft)"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${short(v)}</text>`; }).join('') };
}
export function barChart(series, { W = 760, H = 250, unit = '' } = {}) {
  const L = 52, B = 34, T = 26; const max = Math.max(...series.map((s) => s.value), 0);
  const k = unit === 'k' ? 1000 : 1;
  const um = (max / k) || 1, s0 = Math.pow(10, Math.floor(Math.log10(um / 3 || 1)));
  const stp = [1, 2, 2.5, 5, 10].map((m) => m * s0).find((x) => x * 3 >= um) || s0 * 10;
  const nice = stp * 3 * k;
  const grid = [0, 1 / 3, 2 / 3, 1].map((t) => { const v = Math.round(t * 3) * stp * k; const y = H - B - t * (H - B - T); return `<text x="${L - 14}" y="${y + 4}" text-anchor="end">${unit === 'k' ? Math.round(v / 1000).toLocaleString('vi-VN') : short(v)}</text>`; }).join('') + `<line x1="${L}" x2="${W - 6}" y1="${H - B}" y2="${H - B}" style="stroke:var(--line)"/>`;
  const bw = (W - L - 10) / series.length; const every = Math.ceil(series.length / 12);
  const top = series.reduce((m, s, i) => (s.value > series[m].value ? i : m), 0);
  return `<svg class="chart bar-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ cột doanh thu">${grid}${series.map((s, i) => {
    const h = (s.value / nice) * (H - B - T); const x = L + i * bw + bw * .06; const w = bw * .88;
    return `<g class="bar" data-i="${i}" tabindex="0" role="button" aria-label="${esc(s.label)}: ${money(s.value)}"><rect x="${x}" y="${H - B - h}" width="${w}" height="${Math.max(h, s.value ? 2 : 0)}"></rect><rect class="hit" x="${x}" y="${T}" width="${w}" height="${H - B - T}"></rect>${s.value ? `<text class="val" x="${x + w / 2}" y="${H - B - h - 8}" text-anchor="middle">${unit === 'k' ? Math.round(s.value / 1000).toLocaleString('vi-VN') : short(s.value)}</text>` : ''}</g>${i % every === 0 ? `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${esc(s.label)}</text>` : ''}`;
  }).join('')}</svg>`;
}
export function lineChart(series, { W = 760, H = 300, labels = false } = {}) {
  const L = 52, B = 34, T = labels ? 34 : 14; const max = Math.max(...series.map((s) => s.value), 0);
  const { nice, grid } = axes(max, W, H, L, B, T);
  const step = series.length > 1 ? (W - L - 30) / (series.length - 1) : 0; const every = Math.ceil(series.length / 12);
  const pts = series.map((s, i) => [L + 10 + i * step, H - B - (s.value / nice) * (H - B - T)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ đường doanh thu">${grid}
    <path d="${d} L${pts.at(-1)[0]},${H - B} L${pts[0][0]},${H - B} Z" style="fill:var(--primary-soft)" opacity=".7"/>
    <path d="${d}" style="fill:none;stroke:var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" style="fill:var(--surface);stroke:var(--primary)" stroke-width="2"><title>${esc(series[i].label)}: ${money(series[i].value)}</title></circle>${labels && series[i].value ? `<text class="pt-val" x="${p[0]}" y="${p[1] - 12}" text-anchor="middle">${money(series[i].value)}</text>` : ''}${i % every === 0 ? `<text x="${p[0]}" y="${H - 12}" text-anchor="middle">${esc(series[i].label)}</text>` : ''}`).join('')}</svg>`;
}
export function pieChart(items) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1; let a = -Math.PI / 2;
  const arcs = items.map((it, i) => {
    const ang = (it.value / total) * Math.PI * 2; const a2 = a + ang;
    const large = ang > Math.PI ? 1 : 0; const r = 110, cx = 130, cy = 130;
    const p = items.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:${SERIES[i]}"/>` :
      `<path d="M${cx},${cy} L${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)} Z" style="fill:${SERIES[i % SERIES.length]};stroke:var(--surface)" stroke-width="2"><title>${esc(it.label)}: ${money(it.value)}</title></path>`;
    a = a2; return p;
  }).join('');
  return `<div class="grid" style="grid-template-columns:260px 1fr;align-items:center"><svg class="chart" viewBox="0 0 260 260" role="img" aria-label="Biểu đồ tròn">${arcs}<circle cx="130" cy="130" r="58" style="fill:var(--surface)"/><text x="130" y="126" text-anchor="middle" style="font-size:11px">Tổng</text><text x="130" y="146" text-anchor="middle" style="font-size:15px;font-weight:700;fill:var(--espresso)">${short(total)}</text></svg>
  <div class="pie-legend">${items.map((it, i) => `<div class="row between"><span><i style="background:${SERIES[i % SERIES.length]}"></i>${esc(it.label)}</span><span class="money strong">${money(it.value)} <span class="muted small">(${Math.round((it.value / total) * 100)}%)</span></span></div>`).join('')}</div></div>`;
}

/* Mã QR minh họa (không mang dữ liệu thật) */
export function fakeQr(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const n = 25; let cells = '';
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    h = (h * 1103515245 + 12345) >>> 0;
    if (h & 0x10000) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  const f = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" style="fill:var(--surface)"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  return `<svg class="qr" viewBox="-1 -1 ${n + 2} ${n + 2}" style="fill:var(--espresso)" shape-rendering="crispEdges" aria-label="Mã QR chuyển khoản (minh họa)">${cells}${f(0, 0)}${f(n - 7, 0)}${f(0, n - 7)}</svg>`;
}

/** Bộ chọn ngày + giờ theo mẫu Figma (Tạo / Cập nhật đơn thuê): thay ô datetime-local mặc định của trình duyệt.
 *  Ô gốc vẫn giữ name/value (YYYY-MM-DDTHH:MM) để form gửi đi như cũ; chọn xong bấm "Áp dụng" mới ghi vào.
 *  o.timeList: true → cột giờ dạng danh sách (mẫu Cập nhật đơn thuê); mặc định là 2 ô Giờ : Phút. */
export function dateTimePickers(root, o = {}) {
  const TH = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const show = (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v || '') ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} · ${v.slice(11, 16)}` : '');
  const times = []; for (let m = 8 * 60; m <= 21 * 60; m += 30) times.push(pad(Math.floor(m / 60)) + ':' + pad(m % 60));
  const label12 = (t) => { const h = +t.slice(0, 2); return pad(h % 12 || 12) + ':' + t.slice(3) + ' ' + (h < 12 ? 'SA' : 'CH'); };
  root.querySelectorAll('input[type=datetime-local]:not([data-dtp])').forEach((inp) => {
    inp.dataset.dtp = '1';
    const ro = inp.readOnly || inp.disabled;
    const wrap = document.createElement('div'); wrap.className = 'dtp';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'input dtp-display'; btn.disabled = ro;
    btn.setAttribute('aria-label', inp.closest('.field')?.querySelector('label')?.textContent || 'Chọn ngày giờ');
    btn.innerHTML = `<span>${show(inp.value) || 'dd/mm/yyyy · --:--'}</span>${icon('calendar')}`;
    const panel = document.createElement('div'); panel.className = 'dtp-panel' + (o.timeList ? ' with-list' : ''); panel.hidden = true;
    inp.replaceWith(wrap); wrap.append(btn, panel, inp); inp.hidden = true; inp.tabIndex = -1;
    let sel, view;
    const now = () => new Date();
    const reset = () => {
      const v = inp.value; const d = /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : now();
      sel = { d: v ? v.slice(0, 10) : '', t: v ? v.slice(11, 16) : '09:00' }; view = new Date(d.getFullYear(), d.getMonth(), 1);
    };
    const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const draw = () => {
      const y = view.getFullYear(), m = view.getMonth(), lead = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
      const tdy = iso(now().getFullYear(), now().getMonth(), now().getDate()), prevN = new Date(y, m, 0).getDate();
      let cells = ''; for (let i = 0; i < 42; i++) { const d = i - lead + 1; if (d < 1 || d > n) { cells += `<span class="dtp-off">${d < 1 ? prevN + d : d - n}</span>`; continue; } const k = iso(y, m, d); cells += `<button type="button" data-day="${k}" class="${k === sel.d ? 'on' : ''} ${k === tdy ? 'today' : ''}">${d}</button>`; if (i >= 34 && d === n) break; }
      const ys = []; for (let k = now().getFullYear() - 1; k <= now().getFullYear() + 2; k++) ys.push(k);
      const [hh, mm] = sel.t.split(':');
      const timeUi = o.timeList
        ? `<div class="dtp-times"><b>Giờ</b><div class="dtp-ampm"><span class="${+hh < 12 ? 'on' : ''}">SA</span><span class="${+hh >= 12 ? 'on' : ''}">CH</span></div><div class="dtp-tlist">${times.map((t) => `<button type="button" data-time="${t}" class="${t === sel.t ? 'on' : ''}">${label12(t)}</button>`).join('')}</div></div>`
        : `<div class="dtp-hm"><span>Giờ</span><select data-h aria-label="Giờ">${Array.from({ length: 14 }, (_, i) => pad(i + 8)).map((h) => `<option ${h === hh ? 'selected' : ''}>${h}</option>`).join('')}</select><span>:</span><select data-m aria-label="Phút">${['00', '15', '30', '45'].map((x) => `<option ${x === mm ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
      panel.innerHTML = `<div class="dtp-main"><div class="dtp-head"><select data-y aria-label="Năm">${ys.map((k) => `<option ${k === y ? 'selected' : ''}>${k}</option>`).join('')}</select><button type="button" data-nav="-1" aria-label="Tháng trước">‹</button><select data-mo aria-label="Tháng">${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}</select><button type="button" data-nav="1" aria-label="Tháng sau">›</button><button type="button" class="dtp-today" data-today>Hôm nay</button></div>
        <div class="dtp-grid">${TH.map((t) => `<small>${t}</small>`).join('')}${cells}</div>${o.timeList ? '' : timeUi}
        <div class="dtp-foot"><button type="button" class="btn btn-secondary btn-sm" data-cancel>Hủy</button><button type="button" class="btn btn-primary btn-sm" data-apply>Áp dụng</button></div></div>${o.timeList ? timeUi : ''}`;
      panel.querySelector('.dtp-tlist .on')?.scrollIntoView({ block: 'center' });
    };
    const close = () => { panel.hidden = true; wrap.classList.remove('open'); };
    btn.addEventListener('click', () => { if (!panel.hidden) return close(); document.querySelectorAll('.dtp-panel:not([hidden])').forEach((p) => { p.hidden = true; p.parentElement.classList.remove('open'); }); reset(); draw(); panel.hidden = false; wrap.classList.add('open'); });
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.day) { sel.d = t.dataset.day; draw(); }
      else if (t.dataset.time) { sel.t = t.dataset.time; draw(); }
      else if (t.dataset.nav) { view = new Date(view.getFullYear(), view.getMonth() + +t.dataset.nav, 1); draw(); }
      else if ('today' in t.dataset) { const d = now(); sel.d = iso(d.getFullYear(), d.getMonth(), d.getDate()); view = new Date(d.getFullYear(), d.getMonth(), 1); draw(); }
      else if ('cancel' in t.dataset) close();
      else if ('apply' in t.dataset) {
        if (!sel.d) return close();
        inp.value = sel.d + 'T' + sel.t; btn.firstElementChild.textContent = show(inp.value); close();
        inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    panel.addEventListener('change', (e) => {
      const s = e.target;
      if ('y' in s.dataset) view = new Date(+s.value, view.getMonth(), 1);
      else if ('mo' in s.dataset) view = new Date(view.getFullYear(), +s.value, 1);
      else if ('h' in s.dataset) sel.t = s.value + ':' + sel.t.slice(3);
      else if ('m' in s.dataset) sel.t = sel.t.slice(0, 3) + s.value;
      e.stopPropagation(); draw();
    });
    panel.addEventListener('input', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  });
}

/* ---------- Chọn màu ốp: vòng màu HSV + độ sáng + HEX/RGB + màu gợi ý (mẫu "Chọn màu ốp") ---------- */
const CP_SUGGEST = ['#2F2118', '#7B4A2B', '#C4A882', '#F3EDE3', '#C53643', '#38727D', '#376044', '#9A5B16', '#8A8F98', '#1A1A1A'];
const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
const hex2rgbArr = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbArr2hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(+x || 0))).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbArr2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function hsv2rgbArr(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map((x) => x * 255);
}
/** Thay ô <input name> (hidden/color) trong root bằng nút mở bảng chọn màu. Giá trị lưu dạng #RRGGBB. */
export function colorPicker(root, name, { placeholder = 'Chọn màu ốp' } = {}) {
  const input = root.querySelector(`[name="${name}"]`);
  if (!input) return;
  const fieldBox = input.closest('[data-field]') || input.parentElement;
  const hidden = document.createElement('input');
  hidden.type = 'hidden'; hidden.name = name; hidden.value = hexOk(input.value) ? input.value.toUpperCase() : '';
  const wrap = document.createElement('div');
  wrap.className = 'cp';
  wrap.innerHTML = `<button type="button" class="input cp-trigger" aria-haspopup="dialog"><span class="cp-val"></span><span class="cp-caret">▾</span></button>
  <div class="cp-pop" role="dialog" aria-label="Chọn màu ốp" hidden>
   <div class="cp-head"><b>Chọn màu ốp</b><span class="tiny muted">Chọn màu sắc cho ốp của thiết bị</span></div>
   <div class="cp-body"><div class="cp-wheel"><i class="cp-dim"></i><i class="cp-mark"></i></div>
    <div class="cp-side"><div class="cp-light"><span class="small">Độ sáng</span><input type="range" min="0" max="100" class="cp-v" aria-label="Độ sáng"><b class="cp-vp small"></b></div>
     <div class="cp-row"><span class="cp-prev"></span><label class="cp-hex"><span class="tiny muted">Mã HEX</span><input class="input" maxlength="7" aria-label="Mã HEX"></label></div>
     <div class="cp-rgb">${['R', 'G', 'B'].map((c) => `<label><span class="tiny muted">${c}</span><input class="input" type="number" min="0" max="255" data-c="${c}" aria-label="${c}"></label>`).join('')}</div>
    </div></div>
   <div class="cp-sug"><span class="tiny muted">Màu gợi ý</span><div>${CP_SUGGEST.map((h) => `<button type="button" style="background:${h}" data-hex="${h}" title="${h}" aria-label="${h}"></button>`).join('')}</div></div>
   <div class="cp-actions"><button type="button" class="btn btn-secondary btn-cancel-sm cp-cancel">Hủy</button><button type="button" class="btn btn-save cp-ok">Chọn màu</button></div>
  </div>`;
  input.replaceWith(hidden);
  hidden.after(wrap);
  const $c = (s) => wrap.querySelector(s), pop = $c('.cp-pop'), wheel = $c('.cp-wheel');
  let h = 30, s = .35, v = .77;
  const cur = () => rgbArr2hex(...hsv2rgbArr(h, s, v));
  const showTrigger = () => {
    $c('.cp-val').innerHTML = hidden.value ? `<i class="cp-sw" style="background:${hidden.value}"></i><span>${hidden.value}</span><span class="cp-tick">${icon('check')}</span>` : `<span class="muted">${placeholder}</span>`;
  };
  const paint = (skip) => {
    const hex = cur(), [r, g, b] = hex2rgbArr(hex);
    const rad = s * 50, ang = (h - 90) * Math.PI / 180;
    $c('.cp-mark').style.cssText = `left:${50 + rad * Math.cos(ang)}%;top:${50 + rad * Math.sin(ang)}%;background:${hex}`;
    $c('.cp-dim').style.opacity = 1 - v;
    $c('.cp-v').value = Math.round(v * 100); $c('.cp-vp').textContent = Math.round(v * 100) + '%';
    $c('.cp-prev').style.background = hex;
    if (skip !== 'hex') $c('.cp-hex input').value = hex;
    if (skip !== 'rgb') wrap.querySelectorAll('[data-c]').forEach((x, i) => { x.value = [r, g, b][i]; });
  };
  const setHex = (hex, skip) => { [h, s, v] = rgbArr2hsv(...hex2rgbArr(hex)); paint(skip); };
  const pick = (e) => {
    const r = wheel.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360; s = Math.min(1, Math.hypot(x, y) / (r.width / 2)); paint();
  };
  wheel.onpointerdown = (e) => { wheel.setPointerCapture(e.pointerId); pick(e); wheel.onpointermove = pick; };
  wheel.onpointerup = () => { wheel.onpointermove = null; };
  $c('.cp-v').oninput = (e) => { v = e.target.value / 100; paint(); };
  $c('.cp-hex input').oninput = (e) => { let x = e.target.value.trim(); if (!x.startsWith('#')) x = '#' + x; if (hexOk(x)) setHex(x.toUpperCase(), 'hex'); };
  wrap.querySelectorAll('[data-c]').forEach((x) => { x.oninput = () => { const [r, g, b] = [...wrap.querySelectorAll('[data-c]')].map((y) => y.value); setHex(rgbArr2hex(r, g, b), 'rgb'); }; });
  wrap.querySelectorAll('[data-hex]').forEach((b) => { b.onclick = () => setHex(b.dataset.hex); });
  const close = () => { pop.hidden = true; wrap.classList.remove('open'); };
  $c('.cp-trigger').onclick = () => { if (!pop.hidden) return close(); setHex(hidden.value || '#C4A882'); pop.hidden = false; wrap.classList.add('open'); };
  $c('.cp-cancel').onclick = close;
  $c('.cp-ok').onclick = () => {
    hidden.value = cur(); showTrigger(); close();
    fieldBox.classList.remove('invalid'); fieldBox.querySelectorAll(':scope > .err').forEach((x) => x.remove());
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !wrap.contains(e.target)) close(); });
  showTrigger();
}
