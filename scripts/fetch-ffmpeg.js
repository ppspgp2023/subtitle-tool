'use strict';

/*
 * 从 npmmirror 二进制镜像下载 ffmpeg（win32-x64），解压后放到
 * node_modules/ffmpeg-static/ffmpeg.exe，替代被墙的 GitHub postinstall。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RELEASE = 'b6.1.1';
const FILE = 'ffmpeg-win32-x64.gz';
// 可用镜像候选，依次尝试
const MIRRORS = [
  `https://registry.npmmirror.com/-/binary/ffmpeg-static/${RELEASE}/${FILE}`,
  `https://cdn.npmmirror.com/binaries/ffmpeg-static/${RELEASE}/${FILE}`,
  `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/${FILE}`,
];
const OUT = path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

async function tryDownload(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  try {
    console.log('尝试下载: ' + url);
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('  下载完成，大小: ' + (buf.length / 1048576).toFixed(1) + ' MB，解压中...');
    const bin = zlib.gunzipSync(buf);
    fs.writeFileSync(OUT, bin);
    console.log('  ✅ 已写入: ' + OUT + '  (' + (bin.length / 1048576).toFixed(1) + ' MB)');
    return true;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  if (fs.existsSync(OUT) && fs.statSync(OUT).size > 1000000) {
    console.log('ffmpeg.exe 已存在，跳过下载。');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  for (const url of MIRRORS) {
    try {
      if (await tryDownload(url)) return;
    } catch (e) {
      console.log('  失败: ' + (e && e.message ? e.message : e));
    }
  }
  console.error('❌ 所有镜像都失败了。');
  process.exit(1);
})();
