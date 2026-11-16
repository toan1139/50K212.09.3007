// ME.E DIGITALCAM – máy chủ web (API + giao diện)
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { match, readBody, parseCookies, send, AppError } = require('./lib/http');
const { loadUser } = require('./lib/auth');
const { one, run, sinhMa, now } = require('./db');
const { hashPassword, verifyPassword } = require('./lib/auth');
const { UPLOAD_DIR } = require('./lib/uploads');
const { PROD } = require('./lib/env');
const { syncRemote } = require('./db');

if (PROD) {
  const sampleOwner = one('SELECT mat_khau_hash FROM tai_khoan WHERE sdt=?', '0123456789') || one('SELECT mat_khau_hash FROM tai_khoan WHERE sdt=?', '0917999277');
  if (sampleOwner && (verifyPassword('123456', sampleOwner.mat_khau_hash) || verifyPassword('Mee@2026', sampleOwner.mat_khau_hash))) {
    throw new Error('CSDL còn tài khoản mẫu. Hãy dùng CSDL riêng trước khi chạy production.');
  }
  if (!one("SELECT 1 FROM tai_khoan WHERE vai_tro='CH'")) {
    const name = process.env.OWNER_NAME?.trim();
    const phone = process.env.OWNER_PHONE?.trim();
    const email = process.env.OWNER_EMAIL?.trim();
    const password = process.env.OWNER_PASSWORD;
    if (!name || !/^0\d{9}$/.test(phone || '') || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 12) {
      throw new Error('CSDL mới cần OWNER_NAME, OWNER_PHONE, OWNER_EMAIL và OWNER_PASSWORD (ít nhất 12 ký tự).');
    }
    run('INSERT INTO tai_khoan(ma, ho_ten, sdt, email, mat_khau_hash, vai_tro, ngay_tao) VALUES (?,?,?,?,?,?,?)',
      sinhMa('CH'), name, phone, email, hashPassword(password), 'CH', now());
  }
} else {
  const seed = require('./seed');
  seed.seedIfEmpty();
  // Các bước chỉnh dữ liệu mẫu ghi rất nhiều dòng (với CSDL online mỗi lệnh ghi là một vòng mạng),
  // nên chỉ chạy lại khi seed.js thay đổi – không chạy ở mỗi lần khởi động máy chủ.
  const SEED_KEY = 'seed-' + require('node:crypto').createHash('sha1').update(fs.readFileSync(path.join(__dirname, 'seed.js'))).digest('hex').slice(0, 16);
  const { KHOI_DONG } = require('./db');
  // Sau mỗi lần deploy có thể có nhiều máy chủ khởi động cùng lúc và cùng chạy bước này. Máy chủ đến sau có thể
  // vấp lỗi trùng / khóa CSDL: chỉ ghi log rồi phục vụ bình thường (máy chủ kia đã cập nhật xong) – không để sập.
  try {
    if (!one('SELECT 1 FROM cap_nhat_du_lieu WHERE ma=?', SEED_KEY)) {
      seed.capNhatTaiKhoanDemo();
      seed.capNhatDuLieuMau();
      seed.boSungKhachMau();
      seed.goMayMauTest();
      run("INSERT OR IGNORE INTO cap_nhat_du_lieu(ma, thoi_gian) VALUES (?, datetime('now', 'localtime'))", SEED_KEY);
      KHOI_DONG.du_lieu_mau = 'da_cap_nhat';
    } else KHOI_DONG.du_lieu_mau = 'bo_qua';
  } catch (e) {
    KHOI_DONG.du_lieu_mau = 'loi';
    KHOI_DONG.du_lieu_mau_loi = String(e && e.message || e).slice(0, 200);
    console.error('[KHOI_DONG] Bỏ qua bước cập nhật dữ liệu mẫu:', e);
  }
}
['auth', 'tra-cuu', 'dat-lich', 'khach-hang', 'don-thue', 'quan-ly', 'bao-cao', 'tai-khoan'].forEach((f) => require('./routes/' + f));

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

// ETag theo nội dung tệp (tính một lần mỗi máy chủ) để trình duyệt nhận 304 khi tệp không đổi, và luôn nhận bản mới sau deploy.
const ETAGS = new Map();
const CACHE_LAU = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2']);
function serveFile(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    let etag = ETAGS.get(file);
    if (!etag) { try { etag = '"' + require('node:crypto').createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 20) + '"'; ETAGS.set(file, etag); } catch { etag = null; } }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': CACHE_LAU.has(ext) ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache' };
    if (etag) headers.ETag = etag;
    if (etag && req && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const batDau = Date.now();
  const reqId = String(req.headers['x-vercel-id'] || '').split('::').pop().slice(0, 24) || require('node:crypto').randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', reqId);
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/health') {
    let healthy = false, csdl_loi = null;
    try { healthy = one('SELECT 1 AS ok')?.ok === 1; } catch (e) { csdl_loi = String(e && e.message || e).slice(0, 120); }
    const { KHOI_DONG, DB_FILE } = require('./db');
    let db_bytes = null; try { db_bytes = fs.statSync(DB_FILE).size; } catch {}
    const env = process.env;
    const phien_ban = { deploy: env.VERCEL_DEPLOYMENT_ID || null, commit: (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, url: env.VERCEL_URL || null, vung: env.VERCEL_REGION || null, node: process.version };
    return send(res, healthy ? 200 : 503, { ok: healthy, csdl: healthy ? 'ok' : 'loi', csdl_loi, thoi_gian: now(), phan_hoi_ms: Date.now() - batDau, phien_ban, khoi_dong: KHOI_DONG, db_bytes }, { 'Cache-Control': 'no-store' });
  }
  if (pathname.startsWith('/api/')) {
    syncRemote();
    const ctx = { req, res, query: Object.fromEntries(url.searchParams), headers: {} };
    try {
      const m = match(req.method, pathname);
      if (!m) throw new AppError(404, 'KHONG_TIM_THAY', 'Không tìm thấy chức năng yêu cầu.');
      ctx.params = m.params;
      ctx.body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      ctx.token = parseCookies(req.headers.cookie).sid;
      ctx.user = loadUser(ctx.token);
      let out;
      for (const h of m.handlers) out = await h(ctx);
      send(res, 200, out ?? { ok: true }, ctx.headers);
    } catch (e) {
      if (e instanceof AppError) return send(res, e.status, { error: { code: e.code, message: e.message, fields: e.fields || {} } }, ctx.headers);
      if (/UNIQUE constraint/.test(e.message)) return send(res, 409, { error: { code: 'TRUNG_THONG_TIN', message: 'Dữ liệu bị trùng, vui lòng kiểm tra lại.', fields: {} } });
      const ma_su_co = reqId;
      console.error(`[E_LOI_HE_THONG] ${new Date().toISOString()} id=${reqId} ${req.method} ${pathname} status=500 ms=${Date.now() - batDau}\n${e && e.stack || e}`);
      send(res, 500, { error: { code: 'E_LOI_HE_THONG', message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.', ma_su_co, fields: {} } });
    }
    return;
  }
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    const row = require('./db').one('SELECT rieng_tu FROM tep_tai_len WHERE ten=?', name);
    if (pathname !== `/uploads/${name}` || !row) { res.writeHead(404); return res.end('Not found'); }
    // Ảnh riêng tư (CCCD) chỉ nhân viên / chủ cửa hàng xem được
    if (row?.rieng_tu) { const u = loadUser(parseCookies(req.headers.cookie).sid); if (!u || !['NV', 'CH'].includes(u.vai_tro)) { res.writeHead(403); return res.end('Forbidden'); } }
    // Ảnh lưu trong CSDL (bản online) – nếu không có thì đọc tệp trên đĩa như trước
    const blob = require('./db').one('SELECT du_lieu FROM tep_tai_len WHERE ten=?', name)?.du_lieu;
    if (blob) { res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' }); return res.end(Buffer.from(blob)); }
    return serveFile(res, path.join(UPLOAD_DIR, name));
  }
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (pathname !== '/' && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file, req);
  serveFile(res, path.join(PUBLIC, 'index.html'), req); // SPA
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n  ME.E DIGITALCAM đang chạy tại  http://localhost:${PORT}\n`);
    if (!PROD) {
      console.log('  Tài khoản mẫu (mật khẩu: 123456):');
      console.log('    Chủ cửa hàng : 0123456789');
      console.log('    Nhân viên    : 0222444666');
      console.log('    Khách hàng   : 0111333555\n');
    }
  });
}
module.exports = server;
