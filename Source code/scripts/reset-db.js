// Xóa CSDL và nạp lại dữ liệu mẫu:  npm run reset
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'data', 'meedigitalcam.db');
for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
require('../server/seed').seedIfEmpty();
console.log('Đã tạo lại CSDL:', file);
