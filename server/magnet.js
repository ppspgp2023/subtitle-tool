'use strict';

/*
 * 磁力任务编排：提交磁力 → 轮询 TorBox 云端下载 → 拿直链拉回本地 →
 * 立即删除 TorBox 上的文件（中转即焚，释放下载槽/空间）。
 * 文件落地成与上传一致的 uploads/<fileId>__<原名>，之后复用现有听写/翻译流程。
 */

const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const { web, magnet: magnetCfg } = require('./config');
const torbox = require('./providers/torbox');

const VIDEO_EXT = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.ts', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg'];
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 45 * 60 * 1000;   // 云端下载最长等待 45 分钟

function isValidMagnet(s) {
  return /^magnet:\?xt=urn:btih:[a-z0-9]{32,40}/i.test(String(s || '').trim());
}

function sanitizeName(name) {
  return String(name || 'video')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .slice(0, 200) || 'video';
}

// 从 torrent 的 files 中挑出目标视频：优先视频扩展名里体积最大的，否则体积最大的文件
function pickVideoFile(files) {
  if (!Array.isArray(files) || !files.length) return null;
  const withName = files.map((f) => {
    const raw = f.short_name || f.name || '';
    const base = raw.split('/').pop();
    return { id: f.id, name: base, size: f.size || 0, ext: (base.match(/\.[^.]+$/) || [''])[0].toLowerCase() };
  });
  const videos = withName.filter((f) => VIDEO_EXT.includes(f.ext));
  const pool = videos.length ? videos : withName;
  pool.sort((a, b) => b.size - a.size);
  return pool[0];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 解析进度为百分比整数（TorBox progress 一般是 0~1 的小数）
function toPercent(p) {
  if (typeof p !== 'number' || isNaN(p)) return 0;
  const v = p <= 1 ? p * 100 : p;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/*
 * 下载磁力对应视频到本地。
 * @param magnet 磁力链接
 * @param fileId 预先生成的文件 id（用于落地命名，与上传一致）
 * @param onProgress 进度回调（文本行）
 * @returns { videoPath, name }
 */
async function downloadMagnet(magnet, { fileId, onProgress }) {
  const log = (msg) => { if (onProgress) onProgress(msg); };
  let torrentId = null;

  try {
    log('📡 正在提交磁力到 TorBox…');
    const created = await torbox.createTorrent(magnet);
    torrentId = created.torrentId;

    // 若创建接口没直接返回 id，用 hash 到列表里匹配
    if (torrentId == null && created.hash) {
      const list = await torbox.listTorrents();
      const hit = list.find((t) => (t.hash || '').toLowerCase() === created.hash.toLowerCase());
      if (hit) torrentId = hit.id;
    }
    if (torrentId == null) throw new Error('无法确定 TorBox 任务 ID');

    // 轮询云端下载进度
    log('☁️ TorBox 云端下载中…');
    const started = Date.now();
    let info = null;
    let lastPct = -1;
    for (;;) {
      info = await torbox.getTorrent(torrentId);
      if (!info) throw new Error('TorBox 任务已消失');
      if (info.download_finished || info.download_present) break;
      const st = String(info.download_state || '').toLowerCase();
      if (st.includes('error') || st.includes('stall') || st.includes('dead')) {
        throw new Error('TorBox 云端下载失败（无有效做种/资源）：' + info.download_state);
      }
      const pct = toPercent(info.progress);
      if (pct !== lastPct) { log(`☁️ TorBox 云端下载中 ${pct}%`); lastPct = pct; }
      if (Date.now() - started > MAX_WAIT_MS) throw new Error('TorBox 云端下载超时（可能资源冷门、做种少）');
      await sleep(POLL_INTERVAL_MS);
    }

    const picked = pickVideoFile(info.files);
    if (!picked) throw new Error('该磁力里没有可用文件');
    const name = sanitizeName(picked.name);
    log(`🔗 云端下载完成，获取直链：${name}`);
    const link = await torbox.requestDownloadLink(torrentId, picked.id);

    // 流式拉回本地 tmp，再落地到 uploads（与上传一致）
    const partPath = path.join(web.tmpDir, fileId + '.part');
    const total = picked.size || 0;
    let done = 0;
    let lastReport = 0;
    const res = await fetch(link);
    if (!res.ok || !res.body) throw new Error('拉取直链失败：HTTP ' + res.status);
    const src = Readable.fromWeb(res.body);
    src.on('data', (c) => {
      done += c.length;
      const now = Date.now();
      if (now - lastReport > 1000) {
        lastReport = now;
        if (total) log(`⬇️ 从 TorBox 拉取到本地 ${toPercent(done / total)}%`);
        else log(`⬇️ 从 TorBox 拉取到本地 ${(done / 1048576).toFixed(1)} MB`);
      }
    });
    await pipeline(src, fs.createWriteStream(partPath));

    const dest = path.join(web.uploadsDir, `${fileId}__${name}`);
    fs.renameSync(partPath, dest);
    log('✅ 已拉取到本地');

    // 中转即焚：删除 TorBox 上的文件，释放下载槽
    try {
      await torbox.deleteTorrent(torrentId);
      log('🧹 已清理 TorBox 云端文件（释放下载槽）');
    } catch (e) {
      log('⚠️ 清理 TorBox 文件失败（不影响本地处理）：' + e.message);
    }

    return { videoPath: dest, name };
  } catch (e) {
    // 失败也尝试清理，避免占用下载槽
    if (torrentId != null) {
      try { await torbox.deleteTorrent(torrentId); } catch (_) {}
    }
    // 清理可能的半成品
    try { fs.unlinkSync(path.join(web.tmpDir, fileId + '.part')); } catch (_) {}
    throw e;
  }
}

// 兜底清理：服务启动时清掉 TorBox 上的残留任务（本服务账号专用，用完即焚）
async function cleanupOrphans() {
  if (!magnetCfg.enabled) return;
  let list;
  try { list = await torbox.listTorrents(); } catch (_) { return; }
  for (const t of list) {
    if (t && t.id != null) {
      try { await torbox.deleteTorrent(t.id); } catch (_) {}
    }
  }
  if (list.length) console.log(`[magnet] 启动清理：已删除 ${list.length} 个 TorBox 残留任务`);
}

module.exports = { isValidMagnet, downloadMagnet, cleanupOrphans, pickVideoFile };
