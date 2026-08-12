'use strict';

/*
 * TorBox 适配器（Real-Debrid 平替）。封装磁力→云端下载→拿直链→删除的 REST 调用。
 * 官方流程：createtorrent → mylist(轮询) → requestdl → controltorrent(delete)。
 * 只依赖 Node 内置的 global fetch / FormData（Node 18+），不引入第三方依赖。
 */

const { magnet: magnetCfg } = require('../config');

const API_BASE = 'https://api.torbox.app/v1/api';

function apiKey() {
  const k = magnetCfg.torboxApiKey;
  if (!k) throw new Error('未配置 TORBOX_API_KEY');
  return k;
}

// 统一请求：默认带 Bearer 鉴权与超时。返回解析后的 JSON。
async function request(method, endpoint, { query, form, json, timeoutMs = 30000 } = {}) {
  let url = API_BASE + endpoint;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = { Authorization: `Bearer ${apiKey()}` };
  let body;
  if (form) {
    body = form; // FormData：fetch 自动设置 multipart 边界
  } else if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('TorBox 接口请求超时');
    throw new Error('TorBox 接口连接失败：' + e.message);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok || (data && data.success === false)) {
    const detail = (data && (data.detail || data.error)) || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data || {};
}

// 提交磁力，返回 { torrentId, hash }
async function createTorrent(magnet) {
  const form = new FormData();
  form.append('magnet', magnet);
  form.append('seed', '3');      // 3 = 不做种，配合“中转即焚”
  form.append('allow_zip', 'false');
  const data = await request('POST', '/torrents/createtorrent', { form });
  const d = data.data || {};
  const torrentId = d.torrent_id != null ? d.torrent_id : (d.id != null ? d.id : null);
  const hash = d.hash || null;
  if (torrentId == null && !hash) throw new Error('TorBox 未返回任务标识');
  return { torrentId, hash };
}

// 获取单个 torrent 详情（按 id）
async function getTorrent(torrentId) {
  const data = await request('GET', '/torrents/mylist', {
    query: { id: String(torrentId), bypass_cache: 'true' },
  });
  return data.data || null;
}

// 列出全部 torrent（用于按 hash 匹配 / 兜底清理）
async function listTorrents() {
  const data = await request('GET', '/torrents/mylist', { query: { bypass_cache: 'true' } });
  const arr = data.data;
  return Array.isArray(arr) ? arr : (arr ? [arr] : []);
}

// 请求某个文件的下载直链
async function requestDownloadLink(torrentId, fileId) {
  const data = await request('GET', '/torrents/requestdl', {
    query: { token: apiKey(), torrent_id: String(torrentId), file_id: String(fileId), redirect: 'false' },
  });
  const link = typeof data.data === 'string' ? data.data : (data.data && data.data.url);
  if (!link) throw new Error('TorBox 未返回下载直链');
  return link;
}

// 删除 torrent（释放下载槽与空间）
async function deleteTorrent(torrentId) {
  await request('POST', '/torrents/controltorrent', {
    json: { torrent_id: Number(torrentId), operation: 'delete' },
  });
}

module.exports = {
  createTorrent,
  getTorrent,
  listTorrents,
  requestDownloadLink,
  deleteTorrent,
};
