'use strict';

/*
 * Web 服务入口：登录、分片上传（可断点续传）、任务队列 + SSE 进度、
 * 文件列表 / 删除 / 字幕下载。核心听写翻译复用 src/index.js。
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const { web, magnet } = require('./config');
const { login, logout, requireAuth } = require('./auth');
const jobsMod = require('./jobs');
const magnetMod = require('./magnet');
const { startCleanup, RETENTION_MS } = require('./cleanup');
const { parseRanges } = require('../src/index.js');

const app = express();
const PUBLIC = path.join(__dirname, 'public');

app.use(express.json({ limit: '1mb' }));

// ---- 公开路由（无需登录）----
app.get('/login.html', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.post('/api/login', login);

// ---- 以下全部需要登录 ----
app.use(requireAuth);
app.post('/api/logout', logout);

// 去掉路径分隔符与控制字符，保留原文件名（含中文）
function sanitizeName(name) {
  return String(name || 'video')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .slice(0, 200) || 'video';
}

function partPath(uploadId) {
  return path.join(web.tmpDir, sanitizeName(uploadId) + '.part');
}

// 解析上传目录里的文件：文件名格式 <fileId>__<原名>
function parseUploadFile(fileName) {
  const idx = fileName.indexOf('__');
  if (idx < 0) return null;
  return { fileId: fileName.slice(0, idx), name: fileName.slice(idx + 2), fileName };
}

function findVideoByFileId(fileId) {
  let list;
  try { list = fs.readdirSync(web.uploadsDir); } catch (_) { return null; }
  for (const f of list) {
    const info = parseUploadFile(f);
    if (info && info.fileId === fileId) {
      return { ...info, fullPath: path.join(web.uploadsDir, f) };
    }
  }
  return null;
}

// ---- 分片上传 ----
// 初始化：返回已收字节数（支持断点续传）
app.post('/api/upload/init', (req, res) => {
  const { uploadId, name, size } = req.body || {};
  if (!uploadId || !name) return res.status(400).json({ error: '缺少 uploadId 或 name' });
  const pp = partPath(uploadId);
  let received = 0;
  try { received = fs.statSync(pp).size; } catch (_) { received = 0; }
  if (received === 0) fs.writeFileSync(pp, Buffer.alloc(0));
  res.json({ uploadId, received, size: size || 0 });
});

// 上传分片：raw body 追加到临时文件（要求 offset === 当前大小，顺序追加）
app.post('/api/upload/chunk', express.raw({ type: '*/*', limit: '64mb' }), (req, res) => {
  const uploadId = req.query.uploadId;
  const offset = parseInt(req.query.offset || '0', 10);
  if (!uploadId) return res.status(400).json({ error: '缺少 uploadId' });
  const pp = partPath(uploadId);
  let cur = 0;
  try { cur = fs.statSync(pp).size; } catch (_) { return res.status(400).json({ error: '请先 init' }); }
  if (offset !== cur) return res.status(409).json({ error: '偏移不匹配', received: cur });
  try {
    fs.appendFileSync(pp, req.body);
  } catch (e) {
    return res.status(500).json({ error: '写入失败：' + e.message });
  }
  res.json({ received: fs.statSync(pp).size });
});

// 完成上传：临时文件改名落地到 uploads/<fileId>__<原名>
app.post('/api/upload/complete', (req, res) => {
  const { uploadId, name } = req.body || {};
  if (!uploadId || !name) return res.status(400).json({ error: '缺少 uploadId 或 name' });
  const pp = partPath(uploadId);
  if (!fs.existsSync(pp)) return res.status(400).json({ error: '找不到上传的临时文件' });
  const fileId = require('crypto').randomBytes(8).toString('hex');
  const safe = sanitizeName(name);
  const dest = path.join(web.uploadsDir, `${fileId}__${safe}`);
  try {
    fs.renameSync(pp, dest);
  } catch (e) {
    return res.status(500).json({ error: '保存失败：' + e.message });
  }
  res.json({ fileId, name: safe });
});

// ---- 任务 ----
app.post('/api/jobs', (req, res) => {
  const { fileId, bilingual, sourceLang, ranges } = req.body || {};
  const video = findVideoByFileId(fileId);
  if (!video) return res.status(404).json({ error: '找不到视频文件' });
  const opts = {};
  if (typeof bilingual === 'boolean') opts.bilingual = bilingual;
  if (sourceLang) opts.sourceLang = sourceLang;
  if (ranges) {
    const parsed = parseRanges(String(ranges));
    if (parsed) opts.ranges = parsed;
  }
  const base = video.name.replace(/\.[^.]+$/, '');
  const jobId = jobsMod.enqueue(fileId, video.fullPath, base, opts);
  res.json({ jobId });
});

app.get('/api/jobs/:id/events', (req, res) => {
  jobsMod.subscribe(req.params.id, res);
});

// ---- 前端配置探测：磁力导入是否可用（配了 Key 才显示入口）----
app.get('/api/config', (req, res) => {
  res.json({ magnetEnabled: magnet.enabled });
});

// ---- 磁力导入：提交后立即返回 jobId，后台下载并复用同一条 SSE/流水线 ----
app.post('/api/magnet', (req, res) => {
  if (!magnet.enabled) return res.status(400).json({ error: '磁力导入未启用' });
  const { magnet: link, bilingual, sourceLang, ranges } = req.body || {};
  if (!link || !magnetMod.isValidMagnet(String(link))) {
    return res.status(400).json({ error: '磁力链接格式不正确' });
  }
  const opts = {};
  if (typeof bilingual === 'boolean') opts.bilingual = bilingual;
  if (sourceLang) opts.sourceLang = sourceLang;
  if (ranges) {
    const parsed = parseRanges(String(ranges));
    if (parsed) opts.ranges = parsed;
  }
  const jobId = jobsMod.enqueueMagnet(String(link).trim(), opts);
  res.json({ jobId });
});

// ---- 文件列表 / 删除 / 下载 ----
app.get('/api/files', (req, res) => {
  let list;
  try { list = fs.readdirSync(web.uploadsDir); } catch (_) { list = []; }
  const files = [];
  for (const f of list) {
    const info = parseUploadFile(f);
    if (!info) continue;
    let st;
    try { st = fs.statSync(path.join(web.uploadsDir, f)); } catch (_) { continue; }
    const job = jobsMod.getJobByFile(info.fileId);
    const srtReady = fs.existsSync(path.join(web.subtitlesDir, info.fileId + '.srt'));
    files.push({
      fileId: info.fileId,
      name: info.name,
      size: st.size,
      uploadedAt: st.mtimeMs,
      expiresAt: st.mtimeMs + RETENTION_MS,
      status: job ? job.status : (srtReady ? 'done' : 'idle'),
      jobId: job ? job.id : null,
      srtReady,
    });
  }
  files.sort((a, b) => b.uploadedAt - a.uploadedAt);
  res.json({ files });
});

app.delete('/api/files/:id', (req, res) => {
  const fileId = req.params.id;
  const video = findVideoByFileId(fileId);
  if (video) { try { fs.unlinkSync(video.fullPath); } catch (_) {} }
  const srt = path.join(web.subtitlesDir, fileId + '.srt');
  if (fs.existsSync(srt)) { try { fs.unlinkSync(srt); } catch (_) {} }
  jobsMod.dropByFile(fileId);
  res.json({ ok: true });
});

app.get('/api/files/:id/subtitle', (req, res) => {
  const fileId = req.params.id;
  const srt = path.join(web.subtitlesDir, fileId + '.srt');
  if (!fs.existsSync(srt)) return res.status(404).json({ error: '字幕尚未生成' });
  const video = findVideoByFileId(fileId);
  const base = video ? video.name.replace(/\.[^.]+$/, '') : fileId;
  res.download(srt, base + '.srt');
});

// ---- 静态页面（登录后可访问）----
app.use(express.static(PUBLIC));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

startCleanup();
if (magnet.enabled) {
  magnetMod.cleanupOrphans().catch(() => {});
}
app.listen(web.port, () => {
  console.log(`\n视频字幕生成服务已启动： http://localhost:${web.port}`);
  console.log(`数据目录：${web.dataDir}（保留 ${web.retentionDays} 天）`);
  console.log(`磁力导入：${magnet.enabled ? '已启用（' + magnet.provider + '）' : '未启用'}\n`);
});
