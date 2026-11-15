// Kết nối CSDL SQLite (module node:sqlite tích hợp sẵn trong Node.js >= 22.5)
const fs = require('node:fs');
const path = require('node:path');
// Có TURSO_DATABASE_URL: dùng libSQL (bản sao nhúng đồng bộ với CSDL online Turso, cùng API đồng bộ).
// Không có: dùng node:sqlite cục bộ như trước.

const DATA_DIR = path.join(__dirname, '..', 'data');
// Trên Vercel chỉ /tmp ghi được; khi có Turso, file này chỉ là bản sao nhúng của CSDL online.
const DB_FILE = process.env.DB_FILE || (process.env.VERCEL ? '/tmp/meedigitalcam.db' : path.join(DATA_DIR, 'meedigitalcam.db'));
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const REMOTE = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || process.env.LIBSQL_URL;
let db;
const KHOI_DONG = { bat_dau: Date.now() };
if (REMOTE || process.env.USE_LIBSQL) {
  const Database = require('libsql');
  db = REMOTE ? new Database(DB_FILE, { syncUrl: REMOTE, authToken: process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN }) : new Database(DB_FILE);
  if (REMOTE) { const t = Date.now(); db.sync(); KHOI_DONG.sync_ms = Date.now() - t; }
  db.exec('PRAGMA foreign_keys = ON;');
} else {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
}
// Khởi tạo cấu trúc CSDL. Với CSDL online, mọi lệnh ghi phải đi qua mạng nên chỉ chạy khi
// schema/migrations thay đổi (đánh dấu bằng mã băm trong bảng cap_nhat_du_lieu) – giúp khởi động nhanh.
const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const SCHEMA_KEY = 'schema-' + require('node:crypto').createHash('sha1')
  .update(SCHEMA_SQL).update(fs.readFileSync(path.join(__dirname, 'migrations.js'))).digest('hex').slice(0, 16);
const daCapNhat = (() => {
  try { return !!db.prepare('SELECT 1 FROM cap_nhat_du_lieu WHERE ma=?').get(SCHEMA_KEY); } catch { return false; }
})();
KHOI_DONG.schema_bo_qua = daCapNhat;
if (!daCapNhat) {
  db.exec(SCHEMA_SQL);
  require('./migrations')(db);
  db.prepare("INSERT OR IGNORE INTO cap_nhat_du_lieu(ma, thoi_gian) VALUES (?, datetime('now', 'localtime'))").run(SCHEMA_KEY);
}

/* ---------------- Thời gian (giờ Việt Nam) ---------------- */
const pad = (n, l = 2) => String(n).padStart(l, '0');
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const now = () => fmt(new Date());
const today = () => now().slice(0, 10);
function parse(s) {
  // 'YYYY-MM-DD HH:MM' hoặc 'YYYY-MM-DDTHH:MM' -> Date (giờ địa phương)
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || d.getHours() !== +(m[4] || 0) || d.getMinutes() !== +(m[5] || 0)) return null; // ngày không tồn tại, ví dụ 31/02
  return d;
}
const norm = (s) => { const d = parse(s); return d ? fmt(d) : null; };

/* ---------------- Transaction ---------------- */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---------------- Sinh mã tự động ----------------
 * Dùng bảng ma_tu_dong + UPSERT ... RETURNING nên an toàn khi nhiều yêu cầu
 * cùng lúc (chạy bên trong transaction). */
const seqStmt = db.prepare(
  `INSERT INTO ma_tu_dong(khoa, gia_tri) VALUES (?, 1)
   ON CONFLICT(khoa) DO UPDATE SET gia_tri = gia_tri + 1
   RETURNING gia_tri`
);
const FORMATS = {
  KH: { pad: 4 }, NV: { pad: 3 }, CH: { pad: 3 }, DM: { pad: 3 }, TB: { pad: 4 },
  PK: { pad: 3 }, KM: { pad: 3 }, LG: { pad: 4 },
};
const THEO_NGAY = ['DT', 'DL', 'TT']; // đơn thuê, đơn đặt lịch, thanh toán
function sinhMa(prefix, date = new Date()) {
  if (THEO_NGAY.includes(prefix)) {
    // PREFIX-YYMMDD-NNN, ví dụ DT-261103-012 / DL-261103-001 / TT-261103-001 (theo bản thiết kế)
    const ymd = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const key = `${prefix}-${ymd}`;
    const { gia_tri } = seqStmt.get(key);
    return `${key}-${pad(gia_tri, 3)}`;
  }
  const f = FORMATS[prefix];
  if (!f) throw new Error('Tiền tố mã không hợp lệ: ' + prefix);
  const { gia_tri } = seqStmt.get(prefix);
  return prefix + pad(gia_tri, f.pad);
}

/** Kéo thay đổi mới nhất từ CSDL online (Turso) – gọi đầu mỗi yêu cầu API, tối đa 1 lần/giây cho mỗi máy chủ. */
let lastSync = Date.now();
function syncRemote() {
  if (!REMOTE || Date.now() - lastSync < 1000) return;
  lastSync = Date.now();
  try { db.sync(); } catch (e) { console.error('Đồng bộ CSDL online lỗi:', e.message); }
}

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

KHOI_DONG.tong_ms = Date.now() - KHOI_DONG.bat_dau;
module.exports = { KHOI_DONG, db, tx, sinhMa, one, all, run, now, today, fmt, parse, norm, pad, DB_FILE, syncRemote, REMOTE };
