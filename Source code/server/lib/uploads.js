const fs=require('node:fs'),path=require('node:path');
const {one}=require('../db');
const {AppError}=require('./http');
const UPLOAD_DIR=process.env.UPLOAD_DIR||(process.env.VERCEL?'/tmp/uploads':path.join(__dirname,'..','..','data','uploads'));
function requireImage(value,field,{privateOnly=false}={}){
 const url=String(value||''),match=url.match(/^\/uploads\/([a-f0-9]{16,64}\.(?:png|jpg))$/);
 const row=match&&one('SELECT ten, rieng_tu, du_lieu IS NOT NULL AS co_du_lieu FROM tep_tai_len WHERE ten=?',match[1]);
 if(!match||!row||(!row.co_du_lieu&&!fs.existsSync(path.join(UPLOAD_DIR,match[1])))||(privateOnly&&!row.rieng_tu))throw new AppError(422,'ANH_KHONG_HOP_LE','Vui lòng tải đầy đủ ảnh JPG hoặc PNG.',{[field]:'Vui lòng tải ảnh hợp lệ.'});
 return url;
}
module.exports={UPLOAD_DIR,requireImage};
