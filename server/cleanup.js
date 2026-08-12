'use strict';

/*
 * 定时清理：删除超过保留期（默认 7 天）的上传视频与生成字幕。
 * 启动时跑一次，之后每天跑一次。
 */

const fs = require('fs');
const path = require('path');
const { web } = require('./config');

const RETENTION_MS = web.retentionDays * 24 * 3600 * 1000;

function sweepDir(dir) {
  let removed = 0;
  let list;
  try { list = fs.readdirSync(dir); } catch (_) { return 0; }
  const now = Date.now();
  for (const name of list) {
    const fp = path.join(dir, name);
    try {
      const st = fs.statSync(fp);
      if (!st.isFile()) continue;
      if (now - st.mtimeMs > RETENTION_MS) {
        fs.unlinkSync(fp);
        removed++;
      }
    } catch (_) {}
  }
  return removed;
}

function sweepOnce() {
  const n = sweepDir(web.uploadsDir) + sweepDir(web.subtitlesDir) + sweepDir(web.tmpDir);
  if (n > 0) {
    console.log(`[cleanup] 已清理 ${n} 个超过 ${web.retentionDays} 天的文件`);
  }
}

function startCleanup() {
  sweepOnce();
  setInterval(sweepOnce, 24 * 3600 * 1000);
}

module.exports = { startCleanup, sweepOnce, RETENTION_MS };
