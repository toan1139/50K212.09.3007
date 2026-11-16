// Dữ liệu mẫu – chỉ nạp khi CSDL còn trống. Chạy lại từ đầu: npm run reset
const { db, one, all, run, tx, sinhMa, fmt } = require('./db');
const { hashPassword, QUYEN_MAC_DINH_NV } = require('./lib/auth');
const NV = require('./services/nghiep-vu');

const MAT_KHAU = '123456';
// Màu ốp mẫu (mỗi thiết bị một màu để lịch tháng dễ phân biệt)
const MAU_OP = ['#2F2118', '#C53643', '#38727D', '#E0B23A', '#376044', '#7B4A2B', '#E58A3A', '#6C63D9', '#C4A882', '#8A8F98'];
// Tài khoản demo (mật khẩu 123456): [số cũ, số mới]
const TK_DEMO = [['0917999277', '0123456789'], ['0834020466', '0222444666'], ['0905123456', '0111333555']];

// [tên, hãng, loại, mô tả, ảnh, [6 tiếng, 1 ngày, 2 ngày, 3 ngày, từ ngày thứ 4/ngày], tiền cọc, thông số]
// Ảnh lấy từ file Figma; giá 6 tiếng / 1 / 2 / 3 ngày theo bảng giá cửa hàng (11/2026)
const DONG_MAY = [
  ['Canon EOS R50', 'Canon', 'Mirrorless', 'Cảm biến APS-C 24,2 MP, màn hình xoay lật và lấy nét tự động. Phù hợp du lịch, chân dung và chiếc vlog đầu tiên.', 'canon-r50', [180000, 220000, 430000, 640000, 180000], 3000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': '4K 30p', 'Trọng lượng': '375g', 'Ống kính kèm': 'RF-S 18-45mm' }],
  ['Fujifilm X-T30 II', 'Fujifilm', 'Mirrorless', 'Màu phim đặc trưng, tone nhẹ nhàng – chụp phố, du lịch "ra màu" ngay trên máy.', 'fujifilm-xt30', [200000, 270000, 530000, 790000, 250000], 4000000, { 'Cảm biến': 'X-Trans 26,1 MP', 'Video': '4K 30p', 'Trọng lượng': '378g', 'Ống kính kèm': 'XC 15-45mm' }],
  ['Sony A7 III', 'Sony', 'Mirrorless', 'Full-frame 24,2 MP, lấy nét mắt nhanh, chụp thiếu sáng tốt – cho cưới hỏi, sự kiện và chân dung.', 'sony-a7iii', [280000, 450000, 800000, 1150000, 350000], 8000000, { 'Cảm biến': 'Full-frame 24,2 MP', 'Video': '4K 30p', 'Trọng lượng': '650g', 'Ống kính kèm': 'FE 28-70mm' }],
  ['Canon EOS M10', 'Canon', 'Mirrorless', 'Máy nhập môn siêu nhẹ, màn hình lật selfie – phù hợp người mới bắt đầu.', 'canon-m100', [90000, 130000, 250000, 370000, 120000], 2000000, { 'Cảm biến': 'APS-C 18 MP', 'Video': 'Full HD', 'Trọng lượng': '301g', 'Ống kính kèm': 'EF-M 15-45mm' }],
  ['Fujifilm X-S20', 'Fujifilm', 'Mirrorless', 'Chống rung trong thân, pin khỏe, giả lập màu film – cân cả ảnh lẫn video.', 'fujifilm-xs20', [350000, 400000, 790000, 1180000, 350000], 6000000, { 'Cảm biến': 'X-Trans 26,1 MP', 'Video': '6,2K 30p', 'Trọng lượng': '491g', 'Ống kính kèm': 'XF 18-55mm' }],
  ['Fujifilm X-A3', 'Fujifilm', 'Mirrorless', 'Màu da tươi, màn hình lật selfie, giá mềm cho chuyến đi ngắn.', 'fujifilm-xa3', [110000, 150000, 290000, 430000, 130000], 2000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': 'Full HD', 'Trọng lượng': '339g', 'Ống kính kèm': 'XC 16-50mm' }],
  ['Fujifilm X-M5', 'Fujifilm', 'Mirrorless', 'Thân máy nhỏ gọn nhất dòng X, nút giả lập film riêng – hợp quay chụp mạng xã hội.', 'fujifilm-xm5', [250000, 300000, 590000, 880000, 300000], 5000000, { 'Cảm biến': 'X-Trans 26,1 MP', 'Video': '6,2K 30p', 'Trọng lượng': '355g', 'Ống kính kèm': 'XC 15-45mm' }],
  ['Fujifilm X100V', 'Fujifilm', 'Compact', 'Ống kính cố định 23mm f/2 – chụp phố, chân dung "chất film" rất đẹp.', 'fujifilm-x100v', [320000, 390000, 770000, 1150000, 400000], 8000000, { 'Cảm biến': 'X-Trans 26,1 MP', 'Ống kính': '23mm f/2 cố định', 'Trọng lượng': '478g', 'Kính ngắm': 'Hybrid OVF/EVF' }],
  ['Fujifilm X-T5', 'Fujifilm', 'Mirrorless', 'Cảm biến 40 MP, thân máy cổ điển với các vòng xoay vật lý – cho người mê chi tiết.', 'fujifilm-xt5', [350000, 550000, 1000000, 1450000, 450000], 10000000, { 'Cảm biến': 'X-Trans 40,2 MP', 'Video': '6,2K 30p', 'Trọng lượng': '557g', 'Ống kính kèm': 'XF 18-55mm' }],
  ['Canon EOS M50', 'Canon', 'Mirrorless', 'Kính ngắm điện tử, màn hình xoay lật, màu da Canon dễ chịu – quay vlog và chụp gia đình.', 'canon-m50', [120000, 160000, 310000, 460000, 190000], 3000000, { 'Cảm biến': 'APS-C 24,1 MP', 'Video': '4K 24p', 'Trọng lượng': '387g', 'Ống kính kèm': 'EF-M 15-45mm' }],
  ['Fujifilm X-T20', 'Fujifilm', 'Mirrorless', 'Nhỏ gọn, màu film Fujifilm, vòng xoay cổ điển – lựa chọn đáng tiền cho chuyến đi.', 'fujifilm-xt20', [180000, 220000, 430000, 640000, 190000], 3000000, { 'Cảm biến': 'X-Trans 24,3 MP', 'Video': '4K 30p', 'Trọng lượng': '383g', 'Ống kính kèm': 'XC 15-45mm' }],
  ['Fujifilm X-T100', 'Fujifilm', 'Mirrorless', 'Thiết kế retro, màn hình lật 3 chiều – dễ dùng cho người mới làm quen máy ảnh.', 'fujifilm-xt100', [150000, 190000, 370000, 550000, 150000], 2500000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': '4K 15p', 'Trọng lượng': '448g', 'Ống kính kèm': 'XC 15-45mm' }],
  ['Fujifilm X-S10', 'Fujifilm', 'Mirrorless', 'Báng cầm chắc tay, chống rung IBIS – chụp ảnh và quay video đều ổn định.', 'fujifilm-xs10', [260000, 320000, 630000, 940000, 280000], 5000000, { 'Cảm biến': 'X-Trans 26,1 MP', 'Video': '4K 30p', 'Trọng lượng': '465g', 'Ống kính kèm': 'XC 15-45mm' }],
  ['Fujifilm X-T10', 'Fujifilm', 'Mirrorless', 'Thân máy cổ điển bạc – đen, màu film nhẹ nhàng, giá thuê dễ chịu.', 'fujifilm-xt10', [140000, 180000, 350000, 520000, 150000], 2500000, { 'Cảm biến': 'X-Trans 16,3 MP', 'Video': 'Full HD', 'Trọng lượng': '381g', 'Ống kính kèm': 'XC 16-50mm' }],
];
// Phụ kiện (Figma – Tạo đơn đặt lịch: Tấm hắt sáng, Thẻ nhớ dự phòng; Tra cứu máy: Chân máy mini)
const PHU_KIEN = [['Chân máy mini', 15000, 6, 'tripod.jpg'], ['Tấm hắt sáng', 10000, 3, 'reflector.jpg'], ['Thẻ nhớ dự phòng', 5000, 12, 'sd.svg'], ['Pin dự phòng', 15000, 10, 'battery.svg']];

function seedIfEmpty() {
  if (one('SELECT COUNT(*) n FROM tai_khoan').n > 0) return;
  console.log('Đang nạp dữ liệu mẫu...');
  const ngay = (offsetDays, h = 9, m = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d; };

  tx(() => {
    const pw = hashPassword(MAT_KHAU);
    const tk = (vt, ten, sdt, email, tg) => Number(run(`INSERT INTO tai_khoan(ma, ho_ten, sdt, email, mat_khau_hash, vai_tro, ngay_tao) VALUES (?,?,?,?,?,?,?)`,
      sinhMa(vt), ten, sdt, email, pw, vt, fmt(tg)).lastInsertRowid);
    const chu = tk('CH', 'Võ Ngọc Ánh', '0123456789', 'chu@meedigitalcam.vn', ngay(-120));
    const nv1 = tk('NV', 'Trần Thu Trang', '0222444666', 'trang.nv@meedigitalcam.vn', ngay(-90));
    const nv2 = tk('NV', 'Lê Quốc Huy', '0834020467', 'huy.nv@meedigitalcam.vn', ngay(-60));
    for (const q of QUYEN_MAC_DINH_NV) { run('INSERT INTO phan_quyen VALUES (?,?)', nv1, q); run('INSERT INTO phan_quyen VALUES (?,?)', nv2, q); }
    run('INSERT INTO phan_quyen VALUES (?,?)', nv1, 'QL_THIET_BI');
    const nv3 = tk('NV', 'Phan Gia Bảo', '0834020468', 'giabao.nv@meedigitalcam.vn', ngay(-200));
    run(`UPDATE tai_khoan SET trang_thai='DONG' WHERE id=?`, nv3);

    // Khách hàng có tài khoản + khách tại quầy
    const khTk = [['Nguyễn Minh An', '0111333555', 'an.nguyen@gmail.com'], ['Phạm Hoàng Nam', '0905234567', 'nam.pham@gmail.com']];
    const khIds = [];
    for (const [ten, sdt, email] of khTk) {
      const id = tk('KH', ten, sdt, email, ngay(-40));
      khIds.push(Number(run(`INSERT INTO khach_hang(ma, ho_ten, sdt, email, tai_khoan_id, ngay_tao) VALUES (?,?,?,?,?,?)`, sinhMa('KH'), ten, sdt, email, id, fmt(ngay(-40))).lastInsertRowid));
    }
    const khQuay = [['Nguyễn Minh Anh', '0935111222', '079196001234'], ['Trần Thu Trang', '0935222333', '048199002345'], ['Lê Gia Hân', '0935333444', '049301003456'],
      ['Lê Quốc Bảo', '0935444555', '048097004567'], ['Đỗ Khánh Linh', '0935555666', null], ['Hồ Thanh Tâm', '0935666777', null]];
    for (const [ten, sdt, cccd] of khQuay)
      khIds.push(Number(run(`INSERT INTO khach_hang(ma, ho_ten, sdt, cccd, dia_chi, ngay_tao) VALUES (?,?,?,?,?,?)`, sinhMa('KH'), ten, sdt, cccd, 'Đà Nẵng', fmt(ngay(-35))).lastInsertRowid));

    // Dòng máy, thiết bị, phụ kiện
    const dmIds = [];
    DONG_MAY.forEach(([ten, hang, loai, mo_ta, anh, gia, coc, ts], i) => {
      const id = Number(run(`INSERT INTO dong_may(ma, ten, hang, loai, mo_ta, thong_so, anh, gia_buoi, gia_ngay, gia_2_ngay, gia_3_ngay, gia_ngay_them, tien_coc, ngay_tao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        sinhMa('DM'), ten, hang, loai, mo_ta, JSON.stringify(ts), `/assets/img/products/${anh}.jpg`, ...gia, coc, fmt(ngay(-150))).lastInsertRowid);
      dmIds.push(id);
      const soMay = i < 3 ? 3 : 2;
      for (let k = 1; k <= soMay; k++)
        run(`INSERT INTO thiet_bi(ma, dong_may_id, so_serial, mau, ngay_tao) VALUES (?,?,?,?,?)`, sinhMa('TB'), id, `${hang.slice(0, 2).toUpperCase()}${anh.replace(/\W/g, '').toUpperCase().slice(-4)}-${String(1000 + i * 10 + k)}`, MAU_OP[(i * 3 + k) % MAU_OP.length], fmt(ngay(-150)));
    });
    PHU_KIEN.forEach(([ten, gia, sl, anh]) => run(`INSERT INTO phu_kien(ma, ten, gia_ngay, so_luong, anh, ngay_tao) VALUES (?,?,?,?,?,?)`, sinhMa('PK'), ten, gia, sl, `/assets/img/phu-kien/${anh}`, fmt(ngay(-150))));

    const dmy = (d) => fmt(d).slice(0, 10);
    run(`INSERT INTO khuyen_mai(ma, ten, loai, gia_tri, don_toi_thieu, tu_ngay, den_ngay, ngay_tao) VALUES (?,?,?,?,?,?,?,?)`, sinhMa('KM'), 'Chào mùa lễ hội', 'PHAN_TRAM', 10, 400000, dmy(ngay(-5)), dmy(ngay(40)), fmt(ngay(-6)));
    run(`INSERT INTO khuyen_mai(ma, ten, loai, gia_tri, don_toi_thieu, tu_ngay, den_ngay, ngay_tao) VALUES (?,?,?,?,?,?,?,?)`, sinhMa('KM'), 'Khách mới giảm 10%', 'PHAN_TRAM', 10, 200000, dmy(ngay(-30)), dmy(ngay(60)), fmt(ngay(-30)));
    run(`INSERT INTO khuyen_mai(ma, ten, loai, gia_tri, don_toi_thieu, tu_ngay, den_ngay, trang_thai, ngay_tao) VALUES (?,?,?,?,?,?,?,?,?)`, sinhMa('KM'), 'Hè rực rỡ', 'PHAN_TRAM', 15, 500000, dmy(ngay(-150)), dmy(ngay(-60)), 'BAT', fmt(ngay(-150)));

    // Đơn thuê mẫu (quá khứ – hiện tại – tương lai) để có dữ liệu lịch & báo cáo
    const tbOf = (dmIdx, k = 0) => one('SELECT * FROM thiet_bi WHERE dong_may_id=? ORDER BY ma LIMIT 1 OFFSET ?', dmIds[dmIdx], k);
    const taoDon = ({ kh, nguoi, kenh = 'TAI_QUAY', nhan, tra, tb, tt, pk = [], cccd = true, taoLuc }) => {
      const soGio = (tra - nhan) / 3600e3;
      const thietBis = tb.map(([i, k]) => tbOf(i, k));
      const mayList = [...new Set(thietBis.map((t) => t.dong_may_id))].map((id) => ({ dong_may: one('SELECT * FROM dong_may WHERE id=?', id), so_luong: thietBis.filter((t) => t.dong_may_id === id).length }));
      const bg = NV.baoGia({ mayList, phuKien: pk, soGio, coDatLich: kenh === 'ONLINE' });
      const created = taoLuc || new Date(nhan.getTime() - 2 * 86400e3);
      const id = Number(run(`INSERT INTO don_thue(ma, ma_dat_lich, khach_hang_id, nguoi_tao_id, kenh, ngay_nhan, ngay_tra, trang_thai, tien_thue, tien_phu_kien, giam_gia, tien_coc_may, coc_dat_lich, ghi_chu, ngay_tao, ngay_cap_nhat)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`, sinhMa('DT', created), kenh === 'ONLINE' ? sinhMa('DL', created) : null, khIds[kh], nguoi, kenh, fmt(nhan), fmt(tra), tt, bg.tien_thue, bg.tien_phu_kien, bg.tien_coc_may, bg.coc_dat_lich,
      kenh === 'ONLINE' ? 'Đặt lịch online' : null, fmt(created), fmt(tt === 'HOAN_TAT' ? tra : created)).lastInsertRowid);
      thietBis.forEach((t) => run('INSERT INTO chi_tiet_don VALUES (?,?,?)', id, t.id, bg.may.find((m) => m.dong_may_id === t.dong_may_id).don_gia));
      bg.phu_kien.forEach((p) => run('INSERT INTO chi_tiet_phu_kien VALUES (?,?,?,?)', id, p.id, p.so_luong, p.thanh_tien));
      if (kenh === 'ONLINE' && tt !== 'CHO_COC') {
        const maTT = sinhMa('TT', created);
        run('UPDATE don_thue SET ma_tham_chieu=? WHERE id=?', maTT, id);
        run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, maTT, id, 'DAT_LICH', bg.coc_dat_lich, 'CHUYEN_KHOAN', fmt(created));
      }
      if (cccd && ['DANG_THUE', 'CHO_KIEM_TRA', 'HOAN_TAT'].includes(tt)) {
        const k = one('SELECT * FROM khach_hang WHERE id=?', khIds[kh]);
        const so = k.cccd || ('0481990' + String(10000 + id).slice(-5));
        if (!k.cccd) run('UPDATE khach_hang SET cccd=? WHERE id=?', so, k.id);
        run(`INSERT INTO ghi_nhan_cccd(don_id, so_cccd, ho_ten, noi_cap, nguoi_ghi_id, thoi_gian) VALUES (?,?,?,?,?,?)`, id, so, k.ho_ten, 'Cục CS QLHC về TTXH', nguoi || nv1, fmt(nhan));
      }
      if (tt === 'HOAN_TAT') run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, sinhMa('TT', tra), id, 'THUE', bg.tong_tien_thue - bg.coc_dat_lich, 'TIEN_MAT', fmt(tra));
      return id;
    };

    // Lịch sử 35 ngày gần nhất – đã hoàn tất
    const lichSu = [
      [2, -34, 2, [[0, 0]]], [3, -31, 1, [[1, 0]]], [4, -29, 3, [[2, 0]]], [5, -27, 2, [[4, 0]]], [6, -25, 1, [[3, 0]]],
      [7, -23, 2, [[0, 1], [5, 0]]], [0, -21, 2, [[1, 1]]], [1, -19, 4, [[6, 0]]], [2, -17, 1, [[7, 0]]], [3, -15, 2, [[0, 0]]],
      [4, -13, 3, [[2, 1]]], [5, -11, 2, [[1, 0]]], [6, -9, 1, [[4, 1]]], [7, -8, 2, [[0, 2]]], [0, -6, 3, [[1, 2]]], [3, -4, 1, [[5, 1]]],
    ];
    lichSu.forEach(([kh, off, so, tb], i) => taoDon({ kh, nguoi: i % 3 === 0 ? chu : nv1, kenh: i % 4 === 0 ? 'ONLINE' : 'TAI_QUAY', nhan: ngay(off, 9), tra: ngay(off + so, 18), tb, tt: 'HOAN_TAT', pk: i % 2 ? [{ id: 1, so_luong: 1 }] : [] }));
    // Một đơn hoàn tất có lỗi + đền bù
    const dLoi = taoDon({ kh: 4, nguoi: nv1, nhan: ngay(-3, 9), tra: ngay(-2, 18), tb: [[2, 2]], tt: 'HOAN_TAT', pk: [{ id: 2, so_luong: 1 }] });
    run(`INSERT INTO loi_ghi_nhan(ma, don_id, doi_tuong, phu_kien_id, muc_do, mo_ta, phi_den_bu, nguoi_ghi_id, thoi_gian) VALUES (?,?,?,?,?,?,?,?,?)`, sinhMa('LG'), dLoi, 'PHU_KIEN', 2, 'NHE', 'Tấm hắt sáng bị rách mép nhỏ.', 50000, nv1, fmt(ngay(-2, 18)));
    run('UPDATE don_thue SET phi_den_bu=50000 WHERE id=?', dLoi);
    run(`INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)`, sinhMa('TT', ngay(-2, 18)), dLoi, 'DEN_BU', 50000, 'TIEN_MAT', fmt(ngay(-2, 18)));

    // Đang diễn ra & sắp tới (giống màn "Danh sách đơn thuê" trong Figma)
    taoDon({ kh: 2, nguoi: nv1, nhan: ngay(-1, 9), tra: ngay(2, 9), tb: [[2, 0]], tt: 'DANG_THUE' });             // Nguyễn Minh Anh – Đang thuê
    taoDon({ kh: 3, nguoi: chu, nhan: ngay(1, 9), tra: ngay(3, 9), tb: [[1, 0]], tt: 'CHO_BAN_GIAO', taoLuc: ngay(0, 8) }); // Trần Thu Trang – Chờ bàn giao
    taoDon({ kh: 4, nguoi: chu, nhan: ngay(2, 10), tra: ngay(4, 18), tb: [[4, 0]], tt: 'CHO_BAN_GIAO', taoLuc: ngay(0, 8, 30) }); // Lê Gia Hân
    taoDon({ kh: 5, nguoi: nv1, nhan: ngay(-2, 9), tra: ngay(1, 9), tb: [[6, 0]], tt: 'DANG_THUE' });               // Lê Quốc Bảo – Đang thuê
    taoDon({ kh: 1, nguoi: null, kenh: 'ONLINE', nhan: ngay(-3, 9), tra: ngay(0, 8, 0), tb: [[3, 0]], tt: 'CHO_KIEM_TRA' }); // Phạm Hoàng Nam – Chờ kiểm tra
    taoDon({ kh: 0, nguoi: null, kenh: 'ONLINE', nhan: ngay(5, 9), tra: ngay(7, 9), tb: [[0, 0]], tt: 'CHO_BAN_GIAO', pk: [{ id: 1, so_luong: 1 }], taoLuc: ngay(-1, 20) }); // Nguyễn Minh An – đơn online
    taoDon({ kh: 0, nguoi: null, kenh: 'ONLINE', nhan: ngay(1, 15), tra: ngay(2, 9), tb: [[2, 1]], tt: 'CHO_BAN_GIAO', taoLuc: ngay(-1, 21) });
  });
  console.log('Đã nạp dữ liệu mẫu. Mật khẩu chung: ' + MAT_KHAU);
}

/** Bổ sung đầy đủ thông tin cho khách hàng mẫu (chỉ điền ô đang trống, không ghi đè dữ liệu đã sửa) */
const KHACH_MAU = [
  ['0111333555', 'an.nguyen@gmail.com', '048199010007', '12 Bạch Đằng, Hải Châu, Đà Nẵng', '1999-03-12'],
  ['0905234567', 'nam.pham@gmail.com', '048199010008', '45 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '1998-07-25'],
  ['0935111222', 'minhanh123@gmail.com', '079196001234', '88 Lê Duẩn, Hải Châu, Đà Nẵng', '1996-01-18'],
  ['0935222333', 'ttrang@gmail.com', '048199002345', '23 Hùng Vương, Hải Châu, Đà Nẵng', '1999-05-09'],
  ['0935333444', 'lgiahan456@gmail.com', '049301003456', '156 Ngô Quyền, Sơn Trà, Đà Nẵng', '2001-11-30'],
  ['0935444555', 'lquocbao@gmail.com', '048097004567', '9 Phạm Văn Đồng, Sơn Trà, Đà Nẵng', '1997-08-21'],
  ['0935555666', 'khanhlinh.do@gmail.com', '048199010005', '71 Tôn Đức Thắng, Liên Chiểu, Đà Nẵng', '2000-02-14'],
  ['0935666777', 'thanhtam.ho@gmail.com', '048199010006', '30 Trần Phú, Hải Châu, Đà Nẵng', '1995-10-03'],
];
function boSungKhachMau() {
  tx(() => {
    for (const [sdt, email, cccd, diaChi, ngaySinh] of KHACH_MAU) {
      const k = one('SELECT * FROM khach_hang WHERE sdt=?', sdt);
      if (!k) continue;
      const cccdTrong = !k.cccd && !one('SELECT 1 FROM khach_hang WHERE cccd=?', cccd);
      const emailMoi = k.email || email;
      run('UPDATE khach_hang SET email=?, cccd=?, dia_chi=?, ngay_sinh=? WHERE id=?',
        emailMoi, cccdTrong ? cccd : k.cccd, k.dia_chi && k.dia_chi !== 'Đà Nẵng' ? k.dia_chi : diaChi, k.ngay_sinh || ngaySinh, k.id);
      if (k.tai_khoan_id) run('UPDATE tai_khoan SET email=COALESCE(email, ?) WHERE id=?', emailMoi, k.tai_khoan_id);
    }
  });
}

/** Đổi 3 tài khoản demo sang số mới + mật khẩu 123456 trên CSDL đã có sẵn (chạy mỗi lần khởi động, không lặp lại khi đã đổi) */
function capNhatTaiKhoanDemo() {
  const { verifyPassword } = require('./lib/auth');
  tx(() => {
    for (const [cu, moi] of TK_DEMO) {
      const old = one('SELECT id FROM tai_khoan WHERE sdt=?', cu);
      if (old && !one('SELECT 1 FROM tai_khoan WHERE sdt=?', moi)) {
        run('UPDATE tai_khoan SET sdt=? WHERE id=?', moi, old.id);
        run('UPDATE tai_khoan SET ten_dang_nhap=? WHERE id=? AND ten_dang_nhap=? AND NOT EXISTS (SELECT 1 FROM tai_khoan WHERE ten_dang_nhap=?)', moi, old.id, cu, moi);
        run('UPDATE khach_hang SET sdt=? WHERE tai_khoan_id=?', moi, old.id);
      }
      run('UPDATE tai_khoan SET ten_dang_nhap=? WHERE sdt=? AND ten_dang_nhap=? AND NOT EXISTS (SELECT 1 FROM tai_khoan WHERE ten_dang_nhap=?)', moi, moi, cu, moi);
      const tk = one('SELECT id, mat_khau_hash, trang_thai, so_lan_dang_nhap_sai FROM tai_khoan WHERE sdt=?', moi);
      if (tk && (!verifyPassword(MAT_KHAU, tk.mat_khau_hash) || tk.trang_thai !== 'MO' || tk.so_lan_dang_nhap_sai))
        run("UPDATE tai_khoan SET mat_khau_hash=?, trang_thai='MO', so_lan_dang_nhap_sai=0 WHERE id=?", verifyPassword(MAT_KHAU, tk.mat_khau_hash) ? tk.mat_khau_hash : hashPassword(MAT_KHAU), tk.id);
    }
  });
}

/** Cập nhật dữ liệu mẫu trên CSDL đã có (an toàn khi chạy nhiều lần) */
function capNhatDuLieuMau() {
  tx(() => {
    // Bỏ dòng máy GoPro khỏi danh mục (xóa hẳn nếu chưa có đơn nào dùng)
    const gp = one("SELECT id FROM dong_may WHERE ten='GoPro Hero 13 Black'");
    if (gp) {
      const coDon = one('SELECT 1 FROM chi_tiet_don c JOIN thiet_bi t ON t.id=c.thiet_bi_id WHERE t.dong_may_id=?', gp.id);
      if (coDon) { run("UPDATE dong_may SET trang_thai='AN' WHERE id=?", gp.id); run("UPDATE thiet_bi SET tinh_trang='NGUNG' WHERE dong_may_id=?", gp.id); }
      else { run('DELETE FROM thiet_bi WHERE dong_may_id=?', gp.id); run('DELETE FROM dong_may WHERE id=?', gp.id); }
    }
    // Xóa dòng máy Canon EOS M20 và Canon EOS M500 (theo yêu cầu cửa hàng); đã có đơn thì chỉ ẩn
    for (const dm of all("SELECT id FROM dong_may WHERE ten IN ('Canon EOS M20','Canon EOS M500') COLLATE NOCASE AND trang_thai<>'AN'")) {
      const coDon = one('SELECT 1 FROM chi_tiet_don c JOIN thiet_bi t ON t.id=c.thiet_bi_id WHERE t.dong_may_id=?', dm.id);
      let xoa = !coDon;
      if (xoa) { try { run('DELETE FROM thiet_bi WHERE dong_may_id=?', dm.id); run('DELETE FROM dong_may WHERE id=?', dm.id); } catch { xoa = false; } }
      if (!xoa) { run("UPDATE dong_may SET trang_thai='AN' WHERE id=?", dm.id); run("UPDATE thiet_bi SET tinh_trang='NGUNG' WHERE dong_may_id=?", dm.id); }
    }
    // Màu ốp: đổi "Đen/Bạc" cũ sang mã màu, mỗi máy trong cùng dòng một màu khác nhau
    const cu = all("SELECT id, dong_may_id FROM thiet_bi WHERE mau IS NULL OR mau NOT LIKE '#%' ORDER BY dong_may_id, ma");
    cu.forEach((t, i) => run('UPDATE thiet_bi SET mau=? WHERE id=?', MAU_OP[(t.dong_may_id * 3 + i) % MAU_OP.length], t.id));
    // Khuyến mãi chỉ theo phần trăm
    run("UPDATE khuyen_mai SET loai='PHAN_TRAM', gia_tri=10, ten='Khách mới giảm 10%' WHERE loai='TIEN' AND ten='Khách mới giảm 50K'");
    run("UPDATE khuyen_mai SET loai='PHAN_TRAM', gia_tri=MIN(50, MAX(1, gia_tri / 10000)) WHERE loai='TIEN'");
    // Tên đăng nhập khác số điện thoại cho các tài khoản mẫu
    const TEN_DN = [['0123456789', 'ngocanh'], ['0222444666', 'thutrang'], ['0834020467', 'quochuy'], ['0834020468', 'giabao'], ['0111333555', 'minhan'], ['0905234567', 'hoangnam']];
    for (const [sdt, ten] of TEN_DN)
      run('UPDATE tai_khoan SET ten_dang_nhap=? WHERE sdt=? AND (ten_dang_nhap IS NULL OR ten_dang_nhap=sdt) AND NOT EXISTS (SELECT 1 FROM tai_khoan WHERE ten_dang_nhap=?)', ten, sdt, ten);
    run("UPDATE tai_khoan SET email='giabao.nv@meedigitalcam.vn' WHERE sdt='0834020468' AND email IS NULL");
    // Bổ sung nhân viên mẫu (mật khẩu 123456)
    const NV_MAU = [['Trần Thu Hà', '0900000011', 'thuha'], ['Nguyễn Minh Anh', '0900000012', 'minhanh'], ['Lê Gia Hân', '0900000013', 'giahan'], ['Lê Quốc Bảo', '0900000014', 'quocbao']];
    for (const [ten, sdt, dn] of NV_MAU) {
      if (one('SELECT 1 FROM tai_khoan WHERE sdt=? OR ten_dang_nhap=?', sdt, dn)) continue;
      const id = Number(run('INSERT INTO tai_khoan(ma, ho_ten, sdt, email, mat_khau_hash, vai_tro, ngay_tao, ten_dang_nhap) VALUES (?,?,?,?,?,?,?,?)',
        sinhMa('NV'), ten, sdt, dn + '@example.com', hashPassword(MAT_KHAU), 'NV', fmt(new Date()), dn).lastInsertRowid);
      for (const q of QUYEN_MAC_DINH_NV) run('INSERT INTO phan_quyen VALUES (?,?)', id, q);
    }
    run("UPDATE phu_kien SET anh='/assets/img/phu-kien/tripod.jpg' WHERE anh='/assets/img/phu-kien/tripod.svg'");
    run("UPDATE phu_kien SET anh='/assets/img/phu-kien/reflector.jpg' WHERE anh='/assets/img/phu-kien/reflector.svg'");
  });
}


/* Bổ sung máy ảnh mẫu cho các nhóm test (11/2026): 6 dòng máy mới, thiết bị đủ trạng thái và đơn thuê mẫu.
   CHỈ THÊM: dòng máy đã có (theo tên) thì bỏ qua; đơn mẫu chỉ tạo cùng lúc với dòng máy mới nên chạy lại không bị trùng. */
const MAY_MAU_TEST = [
  ['Sony ZV-E10', 'Sony', 'Mirrorless', 'Máy vlog cảm biến APS-C, nút làm mờ phông một chạm, màn hình lật bên – hợp quay TikTok, review sản phẩm.', 'sony-zv-e10', [200000, 250000, 490000, 730000, 240000], 4000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': '4K 30p', 'Trọng lượng': '343g', 'Ống kính kèm': 'E PZ 16-50mm' }],
  ['Canon PowerShot G7 X Mark III', 'Canon', 'Compact', 'Máy compact bỏ túi, cảm biến 1 inch, ống kính sáng f/1.8–2.8 – mang đi chơi gọn nhẹ, quay vlog tiện.', 'canon-g7x3', [180000, 230000, 450000, 670000, 220000], 4000000, { 'Cảm biến': '1 inch 20,1 MP', 'Ống kính': '24-100mm f/1.8-2.8', 'Video': '4K 30p', 'Trọng lượng': '304g' }],
  ['Nikon Z fc', 'Nikon', 'Mirrorless', 'Thiết kế cổ điển với các vòng xoay vật lý, màu ảnh trong trẻo – vừa đẹp để chụp vừa đẹp để cầm.', 'nikon-zfc', [220000, 280000, 550000, 820000, 260000], 5000000, { 'Cảm biến': 'APS-C 20,9 MP', 'Video': '4K 30p', 'Trọng lượng': '445g', 'Ống kính kèm': 'Z DX 16-50mm' }],
  ['Ricoh GR III', 'Ricoh', 'Compact', 'Máy chụp phố huyền thoại, ống kính 28mm f/2.8 sắc nét, nhỏ vừa túi áo – bấm máy nhanh, kín đáo.', 'ricoh-gr3', [230000, 290000, 570000, 850000, 270000], 6000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Ống kính': '18,3mm (28mm) f/2.8', 'Chống rung': '3 trục', 'Trọng lượng': '257g' }],
  ['Sony A6400', 'Sony', 'Mirrorless', 'Lấy nét theo mắt thời gian thực, màn hình lật 180° – chụp chân dung, sự kiện và quay vlog đều ổn.', 'sony-a6400', [200000, 260000, 510000, 760000, 240000], 5000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': '4K 30p', 'Trọng lượng': '403g', 'Ống kính kèm': 'E 16-50mm' }],
  ['Canon EOS R10', 'Canon', 'Mirrorless', 'Chụp liên tiếp nhanh, lấy nét bám chủ thể tốt, báng cầm chắc – hợp chụp thể thao, trẻ em, du lịch.', 'canon-r10', [220000, 280000, 550000, 820000, 260000], 5000000, { 'Cảm biến': 'APS-C 24,2 MP', 'Video': '4K 60p', 'Trọng lượng': '429g', 'Ống kính kèm': 'RF-S 18-45mm' }],
];
function boSungMayMau() {
  const ngay = (offsetDays, h = 9, m = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d; };
  const khach = (sdt) => one('SELECT id FROM khach_hang WHERE sdt=?', sdt)?.id || one('SELECT id FROM khach_hang ORDER BY id LIMIT 1')?.id;
  const nvId = one("SELECT id FROM tai_khoan WHERE sdt='0222444666'")?.id || one("SELECT id FROM tai_khoan WHERE vai_tro IN ('NV','CH') ORDER BY id LIMIT 1")?.id;
  const chuId = one("SELECT id FROM tai_khoan WHERE sdt='0123456789'")?.id || nvId;
  if (!nvId || !one('SELECT 1 FROM khach_hang')) return;
  // Đơn mẫu: [khách, kênh, lệch ngày nhận, số ngày, trạng thái, thứ tự máy trong dòng]
  const DON = [
    [['0111333555', 'ONLINE', -20, 2, 'HOAN_TAT', 0], ['0935111222', 'TAI_QUAY', -1, 3, 'DANG_THUE', 0], ['0905234567', 'ONLINE', 4, 2, 'CHO_BAN_GIAO', 1]],
    [['0935222333', 'TAI_QUAY', -15, 1, 'HOAN_TAT', 0], ['0111333555', 'ONLINE', 6, 2, 'CHO_BAN_GIAO', 0], ['0935333444', 'TAI_QUAY', 3, 1, 'DA_HUY', 1]],
    [['0905234567', 'ONLINE', -12, 3, 'HOAN_TAT', 0], ['0935444555', 'TAI_QUAY', -2, 4, 'DANG_THUE', 1], ['0935555666', 'TAI_QUAY', 9, 2, 'CHO_BAN_GIAO', 0]],
    [['0935666777', 'TAI_QUAY', -9, 2, 'HOAN_TAT', 0], ['0111333555', 'ONLINE', -4, 3, 'CHO_KIEM_TRA', 0], ['0935111222', 'TAI_QUAY', 12, 3, 'CHO_BAN_GIAO', 1]],
    [['0935333444', 'TAI_QUAY', -25, 2, 'HOAN_TAT', 0], ['0905234567', 'ONLINE', 2, 1, 'DA_HUY', 0], ['0935222333', 'TAI_QUAY', 1, 2, 'CHO_BAN_GIAO', 1]],
    [['0935444555', 'TAI_QUAY', -6, 1, 'HOAN_TAT', 0], ['0111333555', 'ONLINE', 0, 2, 'DANG_THUE', 0], ['0935666777', 'TAI_QUAY', 15, 2, 'CHO_BAN_GIAO', 1]],
  ];
  tx(() => {
    MAY_MAU_TEST.forEach(([ten, hang, loai, mo_ta, anh, gia, coc, ts], i) => {
      if (one('SELECT 1 FROM dong_may WHERE ten=? COLLATE NOCASE', ten)) return;
      const dmId = Number(run(`INSERT INTO dong_may(ma, ten, hang, loai, mo_ta, thong_so, anh, gia_buoi, gia_ngay, gia_2_ngay, gia_3_ngay, gia_ngay_them, tien_coc, ngay_tao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        sinhMa('DM'), ten, hang, loai, mo_ta, JSON.stringify(ts), `/assets/img/products/${anh}.svg`, ...gia, coc, fmt(ngay(-60))).lastInsertRowid);
      // 3–4 thiết bị mỗi dòng, màu ốp khác nhau; máy cuối của dòng chẵn đang bảo trì
      const soMay = i % 2 ? 3 : 4;
      const tbIds = [];
      for (let k = 1; k <= soMay; k++) {
        const serial = `${hang.slice(0, 2).toUpperCase()}${anh.replace(/\W/g, '').toUpperCase().slice(-4)}-${3000 + i * 10 + k}`;
        if (one('SELECT 1 FROM thiet_bi WHERE so_serial=?', serial)) continue;
        const baoTri = k === soMay && i % 2 === 0;
        tbIds.push(Number(run(`INSERT INTO thiet_bi(ma, dong_may_id, so_serial, mau, tinh_trang, ghi_chu, anh_tinh_trang, ngay_tao) VALUES (?,?,?,?,?,?,?,?)`,
          sinhMa('TB'), dmId, serial, MAU_OP[(i * 4 + k) % MAU_OP.length], baoTri ? 'BAO_TRI' : 'SAN_SANG',
          baoTri ? 'Đang vệ sinh cảm biến, dự kiến xong trong tuần' : (k === 1 ? 'Máy đẹp, đủ phụ kiện theo máy' : null),
          k === 1 || baoTri ? `/assets/img/products/${anh}.svg` : null, fmt(ngay(-60))).lastInsertRowid));
      }
      const dm = one('SELECT * FROM dong_may WHERE id=?', dmId);
      // Đơn thuê mẫu cho dòng máy mới (chỉ dùng máy Còn trống của dòng này nên không đụng lịch máy khác)
      for (const [sdt, kenh, off, soNgay, tt, k] of DON[i]) {
        const tbId = tbIds[k]; const kh = khach(sdt); if (!tbId || !kh) continue;
        const nhan = ngay(off, 9), tra = ngay(off + soNgay, 18), created = ngay(Math.min(off, 0) - 2, 10);
        const bg = NV.baoGia({ mayList: [{ dong_may: dm, so_luong: 1 }], soGio: (tra - nhan) / 3600e3, coDatLich: kenh === 'ONLINE' });
        const donId = Number(run(`INSERT INTO don_thue(ma, ma_dat_lich, khach_hang_id, nguoi_tao_id, kenh, ngay_nhan, ngay_tra, trang_thai, tien_thue, tien_phu_kien, giam_gia, tien_coc_may, coc_dat_lich, ghi_chu, ly_do_huy, ngay_tao, ngay_cap_nhat)
          VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)`, sinhMa('DT', created), kenh === 'ONLINE' ? sinhMa('DL', created) : null, kh, kenh === 'ONLINE' ? null : (i % 2 ? chuId : nvId), kenh,
          fmt(nhan), fmt(tra), tt, bg.tien_thue, bg.tien_coc_may, bg.coc_dat_lich, 'Đơn mẫu cho nhóm test', tt === 'DA_HUY' ? 'Khách đổi lịch đi chơi' : null, fmt(created), fmt(tt === 'HOAN_TAT' ? tra : created)).lastInsertRowid);
        run('INSERT INTO chi_tiet_don VALUES (?,?,?)', donId, tbId, bg.may[0].don_gia);
        if (kenh === 'ONLINE') {
          const maTT = sinhMa('TT', created);
          run('UPDATE don_thue SET ma_tham_chieu=? WHERE id=?', maTT, donId);
          run('INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)', maTT, donId, 'DAT_LICH', bg.coc_dat_lich, 'CHUYEN_KHOAN', fmt(created));
        }
        if (['DANG_THUE', 'CHO_KIEM_TRA', 'HOAN_TAT'].includes(tt)) {
          const k2 = one('SELECT * FROM khach_hang WHERE id=?', kh);
          const so = k2.cccd || ('0481990' + String(20000 + donId).slice(-5));
          if (!k2.cccd) run('UPDATE khach_hang SET cccd=? WHERE id=?', so, kh);
          run('INSERT INTO ghi_nhan_cccd(don_id, so_cccd, ho_ten, noi_cap, nguoi_ghi_id, thoi_gian) VALUES (?,?,?,?,?,?)', donId, so, k2.ho_ten, 'Cục CS QLHC về TTXH', nvId, fmt(nhan));
        }
        if (tt === 'HOAN_TAT') run('INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)', sinhMa('TT', tra), donId, 'THUE', bg.tong_tien_thue - bg.coc_dat_lich, 'TIEN_MAT', fmt(tra));
        // Đơn hoàn tất của Ricoh GR III có ghi nhận lỗi nhẹ để màn lỗi / báo cáo có dữ liệu
        if (tt === 'HOAN_TAT' && i === 3) {
          run('INSERT INTO loi_ghi_nhan(ma, don_id, doi_tuong, thiet_bi_id, muc_do, mo_ta, phi_den_bu, nguoi_ghi_id, thoi_gian) VALUES (?,?,?,?,?,?,?,?,?)', sinhMa('LG'), donId, 'MAY', tbId, 'NHE', 'Trầy nhẹ viền màn hình, không ảnh hưởng sử dụng.', 100000, nvId, fmt(tra));
          run('UPDATE don_thue SET phi_den_bu=100000 WHERE id=?', donId);
          run('INSERT INTO thanh_toan(ma, don_id, loai, so_tien, phuong_thuc, thoi_gian) VALUES (?,?,?,?,?,?)', sinhMa('TT', tra), donId, 'DEN_BU', 100000, 'TIEN_MAT', fmt(tra));
        }
      }
    });
  });
}
module.exports = { seedIfEmpty, boSungKhachMau, capNhatTaiKhoanDemo, capNhatDuLieuMau, boSungMayMau, MAT_KHAU };
if (require.main === module) { seedIfEmpty(); capNhatTaiKhoanDemo(); capNhatDuLieuMau(); boSungKhachMau(); db.close(); }
