// Kiểm tra đồng bộ màu: mọi mã màu HEX / rgb() trong giao diện phải nằm trong tokens.css.
// Chạy: npm run check:colors   (trả về mã lỗi 1 nếu phát hiện màu lệch chuẩn)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'public');
const TOKENS = path.join(ROOT, 'assets', 'css', 'tokens.css');
const tokenText = fs.readFileSync(TOKENS, 'utf8');
const allowed = new Set((tokenText.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toUpperCase()));

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(css|js|html)$/.test(f.name) && p !== TOKENS) files.push(p);
  }
})(ROOT);

let loi = 0;
for (const file of files) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // bỏ qua liên kết dạng href="#..." và chuỗi định tuyến '#/...'
    const clean = line.replace(/(href|data-href)=["']#[^"']*["']/g, '').replace(/['"`]#\/?[^'"`\s]*['"`]/g, '');
    for (const m of clean.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) {
      const hex = m[0].length === 4 ? '#' + [...m[0].slice(1)].map((c) => c + c).join('') : m[0];
      if (!allowed.has(hex.toUpperCase())) { loi++; console.log(`✗ ${path.relative(ROOT, file)}:${i + 1}  màu ${m[0]} không có trong tokens.css`); }
    }
    // rgb/rgba chỉ được dùng cho bóng đổ & lớp phủ pha từ Espresso (47,33,24) hoặc Kem bề mặt (255,252,247)
    for (const m of clean.matchAll(/rgba?\(([^)]*)\)/gi)) {
      const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
      const ok = (r === 47 && g === 33 && b === 24) || (r === 255 && g === 252 && b === 247);
      if (!ok) { loi++; console.log(`✗ ${path.relative(ROOT, file)}:${i + 1}  màu ${m[0]} ngoài bảng chuẩn`); }
    }
  });
}
console.log(loi ? `\n${loi} vị trí dùng màu lệch chuẩn.` : `✓ ${files.length} tệp giao diện – toàn bộ màu đã đồng bộ theo tokens.css`);
process.exit(loi ? 1 : 0);
