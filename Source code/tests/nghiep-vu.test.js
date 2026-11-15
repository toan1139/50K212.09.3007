// Kiểm thử end-to-end qua API trên một CSDL tạm: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 3999;
const BASE = `http://localhost:${PORT}/api`;
const DB = path.join(os.tmpdir(), `mee-test-${process.pid}.db`);
let srv;

const pad = (n) => String(n).padStart(2, '0');
const ngay = (d, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(h)}:00`; };

async function client(sdt) {
  let cookie = '';
  const call = async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  if (sdt) { const r = await call('/auth/dang-nhap', { method: 'POST', body: { sdt, mat_khau: '123456' } }); assert.equal(r.status, 200, 'đăng nhập ' + sdt); }
  return call;
}

before(async () => {
  srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, DB_FILE: DB }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/hang'); return; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  throw new Error('Server không khởi động được');
});
after(async () => {
  if (srv.exitCode === null) {
    srv.kill();
    await Promise.race([new Promise((resolve) => srv.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  for (const f of [DB, DB + '-wal', DB + '-shm']) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try { fs.rmSync(f, { force: true }); break; }
      catch (e) {
        if (e.code !== 'EBUSY' || attempt === 9) throw e;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
});

test('Tra cứu giá theo gói đúng bảng giá cửa hàng (Canon EOS R50)', async () => {
  const api = await client();
  const gia = async (h) => (await api('/tra-cuu/gia', { method: 'POST', body: { dong_may_id: 1, ngay_nhan: ngay(3), ngay_tra: (() => { const d = new Date(ngay(3).replace(' ', 'T')); d.setHours(d.getHours() + h); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`; })() } })).data.tong_tien_thue;
  assert.equal(await gia(6), 180000);
  assert.equal(await gia(24), 220000);
  assert.equal(await gia(48), 430000);
  assert.equal(await gia(72), 640000);
  assert.equal(await gia(96), 820000); // 3 ngày + 1 ngày thêm 180.000đ
});

test('Kiểm tra lỗi tra cứu: thiếu thông tin, ngày quá khứ, trả trước nhận, quá 60 ngày', async () => {
  const api = await client();
  assert.equal((await api('/tra-cuu/lich-trong', { method: 'POST', body: {} })).data.error.code, 'E01_THIEU_THONG_TIN');
  assert.equal((await api('/tra-cuu/lich-trong', { method: 'POST', body: { dong_may_id: 1, ngay_nhan: ngay(-2), ngay_tra: ngay(1) } })).data.error.code, 'E02_NGAY_NHAN_QUA_KHU');
  assert.equal((await api('/tra-cuu/lich-trong', { method: 'POST', body: { dong_may_id: 1, ngay_nhan: ngay(3), ngay_tra: ngay(2) } })).data.error.code, 'E03_NGAY_TRA_KHONG_HOP_LE');
  assert.equal((await api('/tra-cuu/lich-trong', { method: 'POST', body: { dong_may_id: 1, ngay_nhan: ngay(1), ngay_tra: ngay(70) } })).data.error.code, 'E04_QUA_60_NGAY');
});

test('Khách đặt lịch online: sinh mã DT/DL/TT, đặt cọc, hủy không hoàn cọc', async () => {
  const kh = await client('0111333555');
  const r = await kh('/dat-lich', { method: 'POST', body: { may: [{ dong_may_id: 2, so_luong: 1 }], ngay_nhan: ngay(10), ngay_tra: ngay(12), dong_y: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.ma, /^DT-\d{6}-\d{3}$/);
  assert.match(r.data.ma_dat_lich, /^DL-\d{6}-\d{3}$/);
  assert.match(r.data.ma_tham_chieu, /^TT-\d{6}-\d{3}$/);
  assert.equal(r.data.trang_thai, 'CHO_COC');
  const coc = await kh(`/dat-lich/${r.data.id}/dat-coc`, { method: 'POST', body: { phuong_thuc: 'CHUYEN_KHOAN' } });
  assert.equal(coc.data.trang_thai, 'CHO_BAN_GIAO');
  assert.equal(coc.data.thanh_toan[0].ma, r.data.ma_tham_chieu, 'thanh toán dùng đúng mã tham chiếu đã hiển thị');
  const huy = await kh(`/don-cua-toi/${r.data.id}/huy`, { method: 'POST', body: { ly_do: 'Thay đổi lịch trình' } });
  assert.equal(huy.data.trang_thai, 'DA_HUY');
  // Figma UC_3.1 S01: cọc đặt lịch không hoàn lại khi khách tự hủy
  assert.ok(!huy.data.thanh_toan.some((t) => t.loai === 'HOAN_DAT_LICH'));
  // E05: chưa chọn thiết bị, E03: đặt trước quá 60 ngày
  assert.equal((await kh('/dat-lich', { method: 'POST', body: { may: [], ngay_nhan: ngay(3), ngay_tra: ngay(4), dong_y: true } })).data.error.code, 'E05_CHUA_CHON_THIET_BI');
  assert.equal((await kh('/dat-lich', { method: 'POST', body: { may: [{ dong_may_id: 2, so_luong: 1 }], ngay_nhan: ngay(65), ngay_tra: ngay(66), dong_y: true } })).data.error.code, 'E03_DAT_TRUOC_QUA_60_NGAY');
});

test('Mã tự động tăng liên tiếp, không trùng (khách hàng KHxxxx)', async () => {
  const nv = await client('0222444666');
  const a = await nv('/khach-hang', { method: 'POST', body: { ho_ten: 'Khách Thử Một', sdt: '0977000001', email: 'thu1@example.com', cccd: '048199000001', dia_chi: 'Đà Nẵng', ngay_sinh: '01/01/2000' } });
  const b = await nv('/khach-hang', { method: 'POST', body: { ho_ten: 'Khách Thử Hai', sdt: '0977000002', email: 'thu2@example.com', cccd: '048199000002', dia_chi: 'Đà Nẵng', ngay_sinh: '02/02/2000' } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.match(a.data.ma, /^KH\d{4}$/);
  assert.equal(Number(b.data.ma.slice(2)), Number(a.data.ma.slice(2)) + 1);
  // Quản lý khách hàng: thiếu thông tin thì báo lỗi từng ô
  const thieu = await nv('/khach-hang', { method: 'POST', body: { ho_ten: 'Khách Thiếu', sdt: '0977000003' } });
  assert.equal(thieu.status, 422);
  for (const k of ['email', 'cccd', 'dia_chi', 'ngay_sinh']) assert.ok(thieu.data.error.fields[k], k);
});

test('Nhân viên: tạo đơn tại quầy → CCCD → bàn giao → trả máy → tất toán; doanh thu ghi nhận', async () => {
  const nv = await client('0222444666');
  const tb = (await nv(`/don-thue/thiet-bi-trong?ngay_nhan=${encodeURIComponent(ngay(1, 10))}&ngay_tra=${encodeURIComponent(ngay(2, 10))}`)).data;
  assert.ok(tb.length > 0);
  const d = await nv('/don-thue', { method: 'POST', body: { khach_moi: { ho_ten: 'Lê Văn Thử', sdt: '0977000099' }, thiet_bi_ids: [tb[0].id], ngay_nhan: ngay(1, 10), ngay_tra: ngay(2, 10) } });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(d.data.ma_dat_lich, null);
  // chưa ghi nhận CCCD thì không được bàn giao
  assert.equal((await nv(`/don-thue/${d.data.id}/trang-thai`, { method: 'POST', body: { trang_thai: 'DANG_THUE' } })).data.error.code, 'CHUA_GHI_NHAN_CCCD');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const truoc = await nv('/upload', { method: 'POST', body: { data_url: png, rieng_tu: true } });
  const sau = await nv('/upload', { method: 'POST', body: { data_url: png, rieng_tu: true } });
  const cccd = await nv(`/don-thue/${d.data.id}/cccd`, { method: 'POST', body: { anh_truoc: truoc.data.url, anh_sau: sau.data.url } });
  assert.equal(cccd.status, 200, JSON.stringify(cccd.data));
  for (const tt of ['DANG_THUE', 'CHO_KIEM_TRA', 'HOAN_TAT']) {
    const r = await nv(`/don-thue/${d.data.id}/trang-thai`, { method: 'POST', body: { trang_thai: tt } });
    assert.equal(r.data.trang_thai, tt, JSON.stringify(r.data));
  }
  const ch = await client('0123456789');
  const today = ngay(0).slice(0, 10);
  const bc = await ch(`/bao-cao/doanh-thu?tu=${today}&den=${today}`);
  assert.ok(bc.data.tong_doanh_thu >= d.data.tong_tien);
});

test('Phân quyền: khách và nhân viên không vào được chức năng của chủ cửa hàng', async () => {
  const kh = await client('0111333555');
  assert.equal((await kh('/don-thue')).status, 403);
  const nv = await client('0222444666');
  assert.equal((await nv('/bao-cao/doanh-thu?tu=2026-01-01&den=2026-01-02')).status, 403);
  assert.equal((await nv('/tai-khoan')).status, 403);
  const guest = await client();
  assert.equal((await guest('/don-cua-toi')).status, 401);
});

test('Phụ kiện trống tính theo đỉnh số lượng đặt trùng giờ', async () => {
  const kh = await client('0111333555');
  for (const [start, end, model] of [[20, 21, 10], [22, 23, 11]]) {
    const r = await kh('/dat-lich', { method: 'POST', body: {
      may: [{ dong_may_id: model, so_luong: 1 }],
      phu_kien: [{ id: 1, so_luong: 4 }],
      ngay_nhan: ngay(start), ngay_tra: ngay(end), dong_y: true,
    } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const r = await kh('/dat-lich/tim-may', { method: 'POST', body: {
    dong_may_id: 1, ngay_nhan: ngay(20), ngay_tra: ngay(23),
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.phu_kien.find((p) => p.id === 1).kha_dung, 2);
});
