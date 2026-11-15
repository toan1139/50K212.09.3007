// Trang chung: trang chủ, đăng nhập (UC_12), đăng ký OTP (UC_11), hồ sơ, chính sách, lỗi
import { route, api, state, esc, money, dt, icon, pageHead, field, stepper, alertBox, onSubmit, go, toast, link, empty, badge, confirmBox, $, $$, isStaff, hasPerm, img, kv, showErrors, ApiError, VAI_TRO, todayStr } from '../core.js';
import { productCard, rentHref } from '../widgets.js';

/* ---------------- Trang chủ (Figma "giao diện chính") ---------------- */
route('/', {
  title: 'Trang chủ', crumbs: ['Trang chủ'],
  layout: () => (isStaff() ? 'side' : 'home'),
  async render() {

    const [ds, km] = await Promise.all([api('/dong-may', { query: { kich_thuoc: 12, sap_xep: 'noi_bat' } }), api('/khuyen-mai/hien-hanh')]);
    const quick = [['M10', 'aperture'], ['M15', 'aperture'], ['R50', 'camera'], ['A3', 'camera'], ['T50', 'camera'], ['XT100', 'send']];
    const RATE = [[4.9, 98], [4.9, 120], [5.0, 76], [4.8, 110]];
    const card = (d, i) => {
      const [r, n] = RATE[i % 4];
      return `<article class="hp-card">
        <a class="hp-thumb" href="${link('/thiet-bi/' + d.id)}">${img(d.anh, d.ten)}${i % 5 === 0 ? '<span class="hp-new">Mới</span>' : ''}<span class="hp-fav">${icon('heart')}</span></a>
        <div class="hp-body"><div class="hp-brand">${esc(d.hang)}</div><h3><a href="${link('/thiet-bi/' + d.id)}">${esc(d.ten)}</a></h3>
          <div class="hp-price"><b>${money(d.gia_ngay)}</b><span>/ ngày</span></div>
          <div class="hp-rate">${icon('star')}${r.toFixed(1)} (${n} đánh giá)</div>
          <a class="hp-btn" href="${rentHref(d.id)}">Thuê ngay</a></div></article>`;
    };
    const promos = (km.length ? km : []).slice(0, 2);
    const left = (d) => { const ms = Math.max(0, new Date(d + 'T23:59:59') - Date.now()); const days = Math.floor(ms / 864e5); const h = new Date(ms % 864e5); return `Còn ${days} ngày · ${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}:${String(h.getUTCSeconds()).padStart(2, '0')}`; };
    return `
      <section class="hp-hero"><div class="hp-wrap">
        <div class="hp-copy">
          <h1>Thuê máy ảnh dễ dàng<br>Lưu giữ mọi khoảnh khắc</h1>
          <ul class="hp-feats"><li>${icon('badgeCheck')}Thủ tục nhanh gọn</li><li>${icon('star')}Máy ảnh chất lượng</li><li>${icon('tag')}Giá tốt nhất</li></ul>
          <a class="hp-cta" href="#/thiet-bi">Thuê ngay</a>
        </div>
        <div class="hp-pic"><img class="main" src="/assets/img/hero.jpg" alt="Máy ảnh Sony đặt trên bàn gỗ"><img class="small" src="/assets/img/products/canon-r50.jpg" alt="Canon EOS R50"></div>
      </div></section>
      <section class="hp-quick"><div class="hp-wrap">${quick.map(([d, ic]) => `<a href="#/thiet-bi?q=${d}"><span class="ic">${icon(ic)}</span><span>Feedback ${d}</span></a>`).join('')}</div></section>
      <section class="hp-products"><div class="hp-wrap">
        <div class="hp-head"><h2>Sản phẩm nổi bật</h2><a href="#/thiet-bi">Xem tất cả <span>›</span></a></div>
        <div class="hp-grid">${ds.du_lieu.map(card).join('')}</div>
      </div></section>
      <section class="hp-promos"><div class="hp-wrap">${promos.map((k) => `<div class="hp-promo">
        <div class="lbl">${icon('gift')}Ưu đãi đặc biệt</div><div class="sub">Giảm ngay</div>
        <div class="row2"><div class="big">${k.loai === 'PHAN_TRAM' ? `${k.gia_tri}<small>%</small>` : `${Math.round(k.gia_tri / 1000)}<small>K</small>`}</div>
          <div class="txt"><p>${esc(k.ten)}</p><a class="hp-btn" href="#/thiet-bi" title="Mã ${esc(k.ma)}">Nhận ưu đãi ${icon('arrowR')}</a></div></div>
        <div class="cd" data-end="${esc(k.den_ngay)}">${icon('clock')}<span>${left(k.den_ngay)}</span></div></div>`).join('')}</div></section>`;
  },
  mount(el) {
    const tick = () => { if (!document.body.contains(el)) return clearInterval(t); el.querySelectorAll('.cd').forEach((c) => { const ms = Math.max(0, new Date(c.dataset.end + 'T23:59:59') - Date.now()); const h = new Date(ms % 864e5); c.querySelector('span').textContent = `Còn ${Math.floor(ms / 864e5)} ngày · ${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}:${String(h.getUTCSeconds()).padStart(2, '0')}`; }); };
    const t = setInterval(tick, 1000);
  },
});

/* ---------------- Hồ sơ cá nhân ---------------- */
route('/ho-so', {
  title: 'Tài khoản của tôi', crumbs: ['Tài khoản của tôi'], auth: true,
  render: () => {
    const u = state.user;
    return `${pageHead('Tài khoản của tôi', 'Cập nhật thông tin cá nhân và đổi mật khẩu.')}
    <div class="layout-aside"><form class="card" id="f" novalidate><div class="form-alert"></div>
      <div class="card-head"><h3>Thông tin cá nhân</h3></div>
      <div class="form-grid">
        ${field({ label: 'Mã tài khoản', name: 'ma', value: u.ma, attrs: 'readonly' })}
        ${field({ label: 'Vai trò', name: 'vt', value: VAI_TRO[u.vai_tro], attrs: 'readonly' })}
        ${field({ label: 'Họ và tên', name: 'ho_ten', value: u.ho_ten, required: true })}
        ${field({ label: 'Số điện thoại', name: 'sdt', value: u.sdt, attrs: 'readonly', hint: 'Liên hệ cửa hàng để đổi số điện thoại.' })}
        ${field({ label: 'Email', name: 'email', type: 'email', value: u.email, cls: 'full' })}
      </div><hr class="divider"><div class="card-head"><h3>Đổi mật khẩu <span class="sub">Bỏ trống nếu không đổi</span></h3></div>
      <div class="form-grid">${field({ label: 'Mật khẩu hiện tại', name: 'mat_khau_cu', type: 'password' })}${field({ label: 'Mật khẩu mới', name: 'mat_khau_moi', type: 'password', autocomplete: 'new-password', hint: 'Tối thiểu 8 ký tự, gồm chữ và số.' })}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Lưu thay đổi</button></div></form>
      <aside class="card"><h3 style="font-size:var(--fs-lg)">Quyền của bạn</h3><p class="muted small mb-16">${VAI_TRO[u.vai_tro]}</p>
      ${u.vai_tro === 'KH' ? '<p class="small">Đặt lịch, theo dõi và hủy đơn đặt lịch của bạn.</p>' : `<ul class="timeline">${u.quyen.map((q) => `<li class="done">${esc(q.replaceAll('_', ' '))}</li>`).join('')}</ul>`}</aside></div>`;
  },
  mount(v) { onSubmit($('#f', v), async (d) => { const r = await api('/auth/ho-so', { method: 'PUT', body: d }); state.user = r.user; toast('Cập nhật thông tin thành công.'); go('/ho-so'); }, { errTitle: 'Cập nhật không thành công' }); },
});

/* ---------------- Chính sách ---------------- */
const CS = {
  'tien-coc': ['Quy định tiền cọc', ['Khách để lại CCCD gắn chip bản gốc khi nhận máy (nhân viên ghi nhận trên hệ thống).', 'Tiền cọc theo từng dòng máy (từ 2.000.000đ – 8.000.000đ), hoàn trả ngay khi trả máy không phát sinh lỗi.', 'Đặt lịch online cần cọc giữ lịch 50.000đ/máy, được trừ vào tiền thuê.', 'Cọc giữ lịch không được hoàn lại khi khách hủy đơn.']],
  'gia-may': ['Cách tính giá thuê', ['Gói 6 tiếng, gói 1 ngày (24 giờ), gói 2 ngày (48 giờ) và gói 3 ngày (72 giờ).', 'Từ ngày thứ 4: cộng thêm 180.000đ mỗi ngày.', 'Phần lẻ không quá 6 tiếng tính thêm 1 buổi lẻ; quá 6 tiếng tính thêm 1 ngày.', 'Phụ kiện thuê thêm tính theo ngày (làm tròn lên).']],
  'den-bu': ['Đền bù thiệt hại', ['Nhân viên kiểm tra máy cùng khách khi trả máy và ghi nhận lỗi (nếu có) vào hệ thống.', 'Lỗi nhẹ (trầy xước, mất nắp): tính theo chi phí thay thế thực tế.', 'Lỗi trung bình / nặng: tính theo báo giá sửa chữa của trung tâm bảo hành.', 'Phí đền bù được trừ vào tiền cọc, phần chênh lệch thanh toán thêm.']],
  'nhan-tra': ['Nhận & trả máy', ['Giờ nhận và trả máy: 08:00 – 21:00 hằng ngày.', 'CCCD được xác minh tại cửa hàng khi nhận máy.', 'Thanh toán phần còn lại khi nhận máy.', 'Trả trễ: 30.000đ/giờ.']],
  'bao-quan': ['Cách bảo quản máy', ['Không để máy tiếp xúc nước, cát, bụi hoặc nhiệt độ cao.', 'Luôn đậy nắp ống kính và cất máy vào túi khi di chuyển.', 'Không tự tháo lắp ống kính ở nơi nhiều gió bụi.', 'Báo ngay cho cửa hàng nếu máy có dấu hiệu bất thường.']],
  'cach-thue': ['Cách thuê máy', ['1. Tra cứu lịch trống và giá thuê.', '2. Đăng ký tài khoản và đặt lịch online, cọc giữ lịch 50.000đ/máy.', '3. Đến cửa hàng đúng giờ hẹn, xuất trình CCCD để nhận máy.', '4. Trả máy, kiểm tra cùng nhân viên và thanh toán phần còn lại.']],
};
route('/chinh-sach/:slug', {
  title: 'Chính sách', crumbs: (p) => ['Chính sách', CS[p.slug]?.[0] || ''],
  render: ({ slug }) => {
    const c = CS[slug]; if (!c) return empty({ title: 'Không tìm thấy chính sách' });
    return `${pageHead(c[0], 'ME.E DIGITALCAM – minh bạch trong từng lần thuê máy.', '', 'Chính sách')}<div class="layout-aside"><div class="card"><ul class="timeline">${c[1].map((x) => `<li class="done">${esc(x)}</li>`).join('')}</ul></div>
      <aside class="card"><h3 style="font-size:var(--fs-base)">Chính sách khác</h3><div class="stack mt-16">${Object.entries(CS).filter(([k]) => k !== slug).map(([k, v]) => `<div><a href="#/chinh-sach/${k}">${esc(v[0])}</a></div>`).join('')}</div></aside></div>`;
  },
});

/* ---------------- Khuyến mãi & Liên hệ (menu trang chủ) ---------------- */
route('/khuyen-mai', {
  title: 'Khuyến mãi', crumbs: ['Khuyến mãi'],
  async render() {
    const km = await api('/khuyen-mai/hien-hanh');
    return `${pageHead('Khuyến mãi đang áp dụng', 'Nhập mã khi đặt lịch online hoặc báo nhân viên khi thuê tại cửa hàng.')}
      ${km.length ? `<div class="grid grid-3">${km.map((k) => `<div class="promo"><div class="lbl">${icon('tag')}${esc(k.ten)}</div><div class="big">${k.loai === 'PHAN_TRAM' ? k.gia_tri + '%' : money(k.gia_tri)}</div>
        <div class="small muted">Cho đơn từ ${money(k.don_toi_thieu)} · hiệu lực đến ${dt(k.den_ngay, { time: false })}</div><div class="row between mt-8"><span class="code">${esc(k.ma)}</span><a class="btn btn-primary btn-sm" href="#/thiet-bi">Thuê ngay</a></div></div>`).join('')}</div>`
    : `<div class="card">${empty({ ic: 'tag', title: 'Hiện chưa có khuyến mãi', msg: 'Theo dõi fanpage ME.E DIGITALCAM để nhận ưu đãi sớm nhất.' })}</div>`}`;
  },
});
route('/lien-he', {
  title: 'Liên hệ', crumbs: ['Liên hệ'],
  render: () => `${pageHead('Liên hệ ME.E DIGITALCAM', 'Cho thuê máy ảnh tại Đà Nẵng – mở cửa 08:00 đến 21:00 mỗi ngày.')}
    <div class="grid grid-3">${[['phone', 'Điện thoại / Zalo', '0917 999 277 / 0834 020 466', 'tel:0917999277'], ['pin', 'Địa chỉ', '75 Lê Thị Hồng Gấm, Hải Châu, Đà Nẵng', 'https://maps.google.com/?q=75+L%C3%AA+Th%E1%BB%8B+H%E1%BB%93ng+G%E1%BA%A5m+%C4%90%C3%A0+N%E1%BA%B5ng'], ['clock', 'Giờ nhận & trả máy', '08:00 – 21:00 hằng ngày', '#/chinh-sach/nhan-tra']]
    .map(([ic, t, d, h]) => `<a class="card policy" href="${h}" style="color:inherit;text-decoration:none"><span class="ic">${icon(ic)}</span><div><h4>${t}</h4><p>${d}</p></div></a>`).join('')}</div>`,
});

/* ---------------- Lỗi ---------------- */
route('/403', { title: 'Không có quyền', crumbs: ['Không có quyền'], render: () => `<div class="err-page"><div class="code">403</div><h2>Bạn không có quyền truy cập chức năng này</h2><p class="muted mt-8">Vui lòng liên hệ chủ cửa hàng để được cấp quyền.</p><a class="btn btn-primary mt-24" href="#/">Về trang chủ</a></div>` });
route('*', { title: 'Không tìm thấy trang', crumbs: ['Không tìm thấy'], render: () => `<div class="err-page"><div class="code">404</div><h2>Không tìm thấy trang</h2><p class="muted mt-8">Đường dẫn không tồn tại hoặc đã bị thay đổi.</p><a class="btn btn-primary mt-24" href="#/">Về trang chủ</a></div>` });
