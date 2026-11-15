// Chế độ chạy: production thật chỉ khi NODE_ENV=production và không bật APP_MODE=demo.
// Bản demo (vd trên Vercel cho buổi trình bày) giữ dữ liệu mẫu và hiển thị mã OTP trên màn hình.
const PROD = process.env.NODE_ENV === 'production' && process.env.APP_MODE !== 'demo';
module.exports = { PROD };
