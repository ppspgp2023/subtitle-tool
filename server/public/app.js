'use strict';

/*
 * 前端逻辑：分片上传（可断点续传）→ 启动任务 → SSE 实时进度 → 文件列表管理。
 * 与后端契约见 server/server.js。
 */

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB 一片

const $ = (id) => document.getElementById(id);
let currentEvtSource = null;

// ---------- 工具 ----------
function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATUS_TEXT = {
  idle: '未处理',
  queued: '排队中',
  running: '处理中',
  done: '已完成',
  error: '失败',
};

// 生成较随机的 uploadId（同一文件同一会话内可复用以支持续传）
function makeUploadId(file) {
  const key = `${file.name}_${file.size}_${file.lastModified}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) | 0; }
  return 'up_' + (h >>> 0).toString(16) + '_' + file.size;
}

// ---------- 分片上传 ----------
async function uploadFile(file, onProgress) {
  const uploadId = makeUploadId(file);
  // init：拿到已收字节数（断点续传）
  const initRes = await fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, name: file.name, size: file.size }),
  });
  if (!initRes.ok) throw new Error('初始化上传失败');
  let { received } = await initRes.json();

  while (received < file.size) {
    const end = Math.min(received + CHUNK_SIZE, file.size);
    const blob = file.slice(received, end);
    const res = await fetch(`/api/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&offset=${received}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (res.status === 409) {
      // 偏移不匹配：以服务端已收字节为准续传
      const data = await res.json().catch(() => ({}));
      if (typeof data.received === 'number') { received = data.received; continue; }
      throw new Error('上传偏移错误');
    }
    if (!res.ok) throw new Error('分片上传失败');
    const data = await res.json();
    received = data.received;
    if (onProgress) onProgress(received, file.size);
  }

  const compRes = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, name: file.name }),
  });
  if (!compRes.ok) throw new Error('完成上传失败');
  return compRes.json(); // { fileId, name }
}

// ---------- SSE 进度 ----------
function watchJob(jobId) {
  if (currentEvtSource) { currentEvtSource.close(); currentEvtSource = null; }
  const panel = $('jobPanel');
  const logbox = $('logbox');
  const badge = $('jobBadge');
  panel.hidden = false;
  logbox.textContent = '';
  setBadge(badge, 'queued');

  const es = new EventSource(`/api/jobs/${jobId}/events`);
  currentEvtSource = es;

  es.addEventListener('progress', (e) => {
    const { line } = JSON.parse(e.data);
    logbox.textContent += line + '\n';
    logbox.scrollTop = logbox.scrollHeight;
  });
  es.addEventListener('status', (e) => {
    const { status } = JSON.parse(e.data);
    setBadge(badge, status);
  });
  es.addEventListener('done', () => {
    setBadge(badge, 'done');
    es.close();
    currentEvtSource = null;
    loadFiles();
  });
  es.addEventListener('error', (e) => {
    // 区分业务 error 事件与连接错误
    if (e.data) {
      try { const d = JSON.parse(e.data); if (d.status === 'error') { setBadge(badge, 'error'); } } catch (_) {}
      es.close();
      currentEvtSource = null;
      loadFiles();
    }
  });
}

function setBadge(el, status) {
  el.textContent = STATUS_TEXT[status] || status;
  el.className = 'badge badge-' + status;
}

// ---------- 主流程：上传 → 建任务 ----------
async function handleUpload() {
  const input = $('fileInput');
  const file = input.files && input.files[0];
  const hint = $('uploadHint');
  const btn = $('uploadBtn');
  if (!file) { hint.textContent = '请先选择一个视频文件'; return; }

  btn.disabled = true;
  hint.textContent = '';
  const wrap = $('uploadProgressWrap');
  const fill = $('uploadFill');
  const pct = $('uploadPct');
  wrap.hidden = false;
  fill.style.width = '0%';
  pct.textContent = '0%';

  try {
    const { fileId } = await uploadFile(file, (received, size) => {
      const p = Math.floor((received / size) * 100);
      fill.style.width = p + '%';
      pct.textContent = p + '%';
    });

    hint.textContent = '上传完成，正在创建任务…';
    const bilingual = $('subtitleType').value === 'bilingual';
    const sourceLang = $('sourceLang').value;
    const ranges = $('ranges').value.trim();

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, bilingual, sourceLang, ranges: ranges || undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || '创建任务失败');
    }
    const { jobId } = await res.json();
    hint.textContent = '任务已开始，见下方进度。';
    input.value = '';
    watchJob(jobId);
    loadFiles();
  } catch (e) {
    hint.textContent = '出错：' + (e.message || e);
  } finally {
    btn.disabled = false;
    wrap.hidden = true;
  }
}

// ---------- 文件列表 ----------
async function loadFiles() {
  const body = $('fileBody');
  try {
    const res = await fetch('/api/files');
    if (res.status === 401) { location.href = '/login.html'; return; }
    const { files } = await res.json();
    if (!files.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">暂无文件</td></tr>';
      return;
    }
    body.innerHTML = '';
    for (const f of files) {
      const tr = document.createElement('tr');
      tr.appendChild(td(f.name));
      tr.appendChild(td(fmtSize(f.size)));
      tr.appendChild(td(fmtTime(f.uploadedAt)));
      tr.appendChild(td(fmtTime(f.expiresAt)));
      const statusTd = document.createElement('td');
      const b = document.createElement('span');
      setBadge(b, f.status);
      statusTd.appendChild(b);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd(f));
      body.appendChild(tr);
    }
  } catch (_) {
    body.innerHTML = '<tr><td colspan="6" class="empty">加载失败</td></tr>';
  }
}

function td(text) {
  const el = document.createElement('td');
  el.textContent = text;
  return el;
}

function actionsTd(f) {
  const cell = document.createElement('td');
  cell.className = 'actions';

  if (f.srtReady) {
    const dl = document.createElement('a');
    dl.href = `/api/files/${f.fileId}/subtitle`;
    dl.textContent = '下载字幕';
    dl.className = 'link';
    cell.appendChild(dl);
  }
  if ((f.status === 'running' || f.status === 'queued') && f.jobId) {
    const view = document.createElement('button');
    view.textContent = '查看进度';
    view.className = 'link';
    view.onclick = () => watchJob(f.jobId);
    cell.appendChild(view);
  }
  const del = document.createElement('button');
  del.textContent = '删除';
  del.className = 'link danger';
  del.onclick = () => deleteFile(f);
  cell.appendChild(del);

  return cell;
}

async function deleteFile(f) {
  if (!confirm(`确定删除「${f.name}」及其字幕吗？`)) return;
  try {
    const res = await fetch(`/api/files/${f.fileId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    loadFiles();
  } catch (_) {
    alert('删除失败');
  }
}

// ---------- 事件绑定 ----------
$('uploadBtn').addEventListener('click', handleUpload);
$('refreshBtn').addEventListener('click', loadFiles);
$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
});

loadFiles();
