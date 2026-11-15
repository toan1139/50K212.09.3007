// Các hàm kiểm tra dữ liệu dùng chung -> thông báo lỗi thống nhất
const { AppError } = require('./http');

const RE = {
  sdt: /^0\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  cccd: /^\d{12}$/,
  ten: /^[\p{L}\s'.-]{2,60}$/u,
};

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * Kiểm tra theo bộ luật. Ném AppError 422 với lỗi theo trường.
 * rules: { field: [label, 'required'|'sdt'|'email'|'cccd'|'ten'|{min,max}|fn] }
 */
function check(body, rules, { missingCode = 'E01_THIEU_THONG_TIN' } = {}) {
  const fields = {}; let missing = false;
  for (const [f, [label, ...tests]] of Object.entries(rules)) {
    const v = str(body[f]);
    for (const t of tests) {
      if (t === 'required') { if (!v) { fields[f] = `Vui lòng nhập ${label.toLowerCase()}.`; missing = true; break; } continue; }
      if (!v) continue; // trường không bắt buộc và để trống
      if (typeof t === 'string' && RE[t] && !RE[t].test(v)) {
        fields[f] = {
          sdt: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng số 0.',
          email: 'Email không đúng định dạng.',
          cccd: 'Số CCCD gồm đúng 12 chữ số.',
          ten: `${label} chỉ gồm chữ cái, từ 2–60 ký tự.`,
        }[t];
        break;
      }
      if (typeof t === 'object' && t) {
        const n = Number(v);
        if ((t.min !== undefined || t.max !== undefined || t.int) && !Number.isFinite(n)) { fields[f] = `${label} phải là số hợp lệ.`; break; }
        if (t.int && (!Number.isInteger(n))) { fields[f] = `${label} phải là số nguyên.`; break; }
        if (t.min !== undefined && n < t.min) { fields[f] = `${label} tối thiểu ${t.min.toLocaleString('vi-VN')}.`; break; }
        if (t.max !== undefined && n > t.max) { fields[f] = `${label} tối đa ${t.max.toLocaleString('vi-VN')}.`; break; }
        if (t.len && v.length > t.len) { fields[f] = `${label} tối đa ${t.len} ký tự.`; break; }
      }
      if (typeof t === 'function') { const msg = t(v, body); if (msg) { fields[f] = msg; break; } }
    }
  }
  if (Object.keys(fields).length) {
    throw new AppError(422, missing ? missingCode : 'E02_KHONG_HOP_LE',
      missing ? 'Vui lòng nhập đầy đủ các thông tin bắt buộc.' : 'Thông tin không hợp lệ, vui lòng kiểm tra lại.', fields);
  }
}

const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

function birthDate(value) {
  const raw=str(value), match=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso=match ? match[3]+'-'+match[2]+'-'+match[1] : raw;
  const {parse,today}=require('../db');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!parse(iso)||iso>today()||iso<'1900-01-01') throw new AppError(422,'NGAY_SINH_KHONG_HOP_LE','Ngày sinh không hợp lệ.',{ngay_sinh:'Nhập ngày sinh hợp lệ theo định dạng dd/mm/yyyy.'});
  return iso;
}
const fold = value => str(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
module.exports = { check, RE, str, money, birthDate, fold };
