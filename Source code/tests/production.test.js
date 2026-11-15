const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Production khởi tạo chủ riêng, không nạp tài khoản mẫu và bảo vệ cookie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mee-production-'));
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DB_FILE: path.join(dir, 'app.db'),
    UPLOAD_DIR: path.join(dir, 'uploads'),
    OWNER_NAME: 'Chủ Kiểm Thử',
    OWNER_PHONE: '0987000001',
    OWNER_EMAIL: 'owner@example.test',
    OWNER_PASSWORD: 'DeploymentTest123!',
  };
  const entry = path.join(__dirname, '..', 'server', 'index.js');
  const code = `require(${JSON.stringify(entry)});
    const {one}=require(${JSON.stringify(path.join(__dirname, '..', 'server', 'db.js'))});
    const {cookieFor}=require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'auth.js'))});
    console.log(JSON.stringify({count:one('SELECT COUNT(*) n FROM tai_khoan').n,
      owner:one("SELECT sdt FROM tai_khoan WHERE vai_tro='CH'").sdt,
      secure:cookieFor('token').includes('; Secure')}));`;
  try {
    const first = spawnSync(process.execPath, ['--no-warnings', '-e', code], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout.trim()), { count: 1, owner: env.OWNER_PHONE, secure: true });
    const second = spawnSync(process.execPath, ['--no-warnings', '-e', code], { env: { ...env, OWNER_PASSWORD: '' }, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout.trim()).count, 1, 'khởi động lại không thêm chủ');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
