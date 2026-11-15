// Bộ định tuyến HTTP tối giản (không phụ thuộc thư viện ngoài)
class AppError extends Error {
  /**
   * @param {number} status  Mã HTTP
   * @param {string} code    Mã lỗi nghiệp vụ (ví dụ E01_THIEU_THONG_TIN)
   * @param {string} message Thông báo hiển thị cho người dùng
   * @param {object} [fields] Lỗi theo từng trường { ten_truong: 'thông báo' }
   */
  constructor(status, code, message, fields) {
    super(message);
    this.status = status; this.code = code; this.fields = fields;
  }
}

const routes = [];
function route(method, pattern, ...handlers) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handlers });
}

function match(method, pathname) {
  // Ưu tiên route tĩnh (không tham số) trước, ví dụ /api/don-thue/bao-gia trước /api/don-thue/:id
  const ordered = [...routes].sort((a, b) => a.keys.length - b.keys.length);
  for (const r of ordered) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handlers: r.handlers, params };
    }
  }
  return null;
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AppError(413, 'QUA_LON', 'Dữ liệu gửi lên quá lớn.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new AppError(400, 'JSON_LOI', 'Dữ liệu gửi lên không đúng định dạng.')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

module.exports = { AppError, route, match, readBody, parseCookies, send };
