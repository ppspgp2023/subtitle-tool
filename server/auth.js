'use strict';

/*
 * 认证：单一共享账号。用内置 crypto 做 HMAC 签名 Cookie（无状态，重启不掉线）。
 * 登录成功后下发 HttpOnly Cookie；requireAuth 中间件校验。
 */

const crypto = require('crypto');
const { web } = require('./config');

const COOKIE_NAME = 'sid';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 登录有效期 7 天

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(data) {
  return b64url(crypto.createHmac('sha256', web.sessionSecret).update(data).digest());
}

// 生成 token：payload base64url + 签名
function makeToken(user) {
  const payload = b64url(JSON.stringify({ u: user, exp: Date.now() + MAX_AGE_MS }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const expect = sign(payload);
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!obj || obj.exp < Date.now()) return null;
    return obj;
  } catch (_) {
    return null;
  }
}

// 从 Cookie 头解析指定名字的值
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// 常量时间比对字符串，避免时序侧信道
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// POST /api/login
function login(req, res) {
  const { username, password } = req.body || {};
  const ok = safeEqual(username || '', web.authUser) && safeEqual(password || '', web.authPass);
  if (!ok) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = makeToken(web.authUser);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    // 若通过 HTTPS 反代访问，可在反代层保证安全；这里不强制 secure 以便直连测试
  });
  res.json({ ok: true });
}

// POST /api/logout
function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

function isAuthed(req) {
  return !!verifyToken(readCookie(req, COOKIE_NAME));
}

// 中间件：API 未登录返回 401；页面请求重定向到登录页
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: '未登录' });
  return res.redirect('/login.html');
}

module.exports = { login, logout, requireAuth, isAuthed };
