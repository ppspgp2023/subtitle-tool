'use strict';

/*
 * 任务队列：内存存储，顺序处理（一次一个视频，避免打爆 CPU/API 额度）。
 * 进度通过 SSE 实时广播；核心处理复用 src/index.js 的 runPipeline。
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { runPipeline } = require('../src/index.js');
const { conf, web } = require('./config');

const jobs = new Map();          // jobId -> job
const jobByFile = new Map();     // fileId -> jobId（最新一次）
const subscribers = new Map();   // jobId -> Set<res>
const queue = [];
let running = false;

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function broadcast(jobId, event, data) {
  const subs = subscribers.get(jobId);
  if (!subs) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch (_) {}
  }
}

// 创建任务并入队。options: { bilingual, sourceLang, ranges }
function enqueue(fileId, videoPath, baseName, options = {}) {
  const id = newId();
  const job = {
    id,
    fileId,
    videoPath,
    baseName,
    options,
    status: 'queued',
    log: [],
    error: null,
    srtPath: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  jobByFile.set(fileId, id);
  queue.push(id);
  process.nextTick(processNext);
  return id;
}

async function processNext() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job) return processNext();
  running = true;
  job.status = 'running';
  broadcast(id, 'status', { status: 'running' });

  const onProgress = (msg) => {
    job.log.push(msg);
    if (job.log.length > 2000) job.log.shift();
    broadcast(id, 'progress', { line: msg });
  };

  try {
    // 每个任务基于全局 conf 派生，允许覆盖 双语/原语言
    const jobConf = Object.assign({}, conf);
    if (typeof job.options.bilingual === 'boolean') jobConf.bilingual = job.options.bilingual;
    if (job.options.sourceLang) jobConf.sourceLang = String(job.options.sourceLang).trim();

    const { srt } = await runPipeline(jobConf, job.videoPath, {
      ranges: job.options.ranges || null,
      onProgress,
    });

    const srtPath = path.join(web.subtitlesDir, job.fileId + '.srt');
    fs.writeFileSync(srtPath, '\ufeff' + srt, 'utf8');
    job.srtPath = srtPath;
    job.status = 'done';
    broadcast(id, 'done', { status: 'done' });
  } catch (e) {
    job.status = 'error';
    job.error = e && e.message ? e.message : String(e);
    onProgress('❌ 处理失败：' + job.error);
    broadcast(id, 'error', { status: 'error', error: job.error });
  } finally {
    running = false;
    process.nextTick(processNext);
  }
}

function getJob(id) {
  return jobs.get(id) || null;
}

function getJobByFile(fileId) {
  const id = jobByFile.get(fileId);
  return id ? jobs.get(id) : null;
}

// SSE 订阅：先补发已有进度，再实时推送
function subscribe(jobId, res) {
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  // 补发历史日志
  for (const line of job.log) {
    res.write(`event: progress\ndata: ${JSON.stringify({ line })}\n\n`);
  }
  res.write(`event: status\ndata: ${JSON.stringify({ status: job.status, error: job.error })}\n\n`);

  if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
  subscribers.get(jobId).add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeat);
    const subs = subscribers.get(jobId);
    if (subs) subs.delete(res);
  });
}

// 删除文件时清理其关联任务记录
function dropByFile(fileId) {
  const id = jobByFile.get(fileId);
  if (id) {
    jobs.delete(id);
    jobByFile.delete(fileId);
    subscribers.delete(id);
  }
}

module.exports = { enqueue, getJob, getJobByFile, subscribe, dropByFile };
