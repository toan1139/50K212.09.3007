// Điểm vào cho Vercel: mọi yêu cầu (giao diện + API) đi qua máy chủ Node của ứng dụng.
const server = require('../server/index.js');
module.exports = (req, res) => server.emit('request', req, res);
