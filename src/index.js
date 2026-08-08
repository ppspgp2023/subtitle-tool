#!/usr/bin/env node
'use strict';

/*
 * 视频字幕生成工具
 * 流程：视频 -> ffmpeg 抽音频并切段 -> Whisper API 听写(视频原语言,带时间轴)
 *       -> gpt-4o-mini 翻译成中文 -> 输出原文+中文双语 / 纯中文 .srt
 *
 * 用法：把视频文件拖到本 exe 图标上，或命令行 `工具.exe 视频路径`
 * 配置：同目录 config.txt（首次运行会自动生成模板）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

// 程序所在目录（打包成 exe 后指向 exe 目录，开发时指向脚本目录）
function isPackagedExe() {
  if (process.pkg) return true;
  try {
    // Node 单可执行文件(SEA)运行时
    const sea = require('node:sea');
    if (sea && typeof sea.isSea === 'function' && sea.isSea()) return true;
  } catch (_) {}
  return false;
}

function appDir() {
  if (isPackagedExe()) return path.dirname(process.execPath);
  return path.join(__dirname, '..');
}

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

// 出错或结束时暂停，避免双击/拖拽运行时窗口一闪而过
function pause(code) {
  try {
    console.log('\n按回车键关闭窗口...');
    const buf = Buffer.alloc(1);
    try { fs.readSync(0, buf, 0, 1, null); } catch (_) {}
  } catch (_) {}
  process.exit(code || 0);
}

// 去除拖入/粘贴路径带的引号、空白，以及 Windows 复制路径时可能带的不可见字符
function cleanPath(s) {
  return (s || '')
    .replace(/[\uFEFF\u200E\u200F\u202A-\u202E]/g, '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1')
    .trim();
}

// 双击运行（未传参）时，让用户把视频拖进窗口或粘贴路径
function askVideoPath() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('请把视频文件拖到本窗口里（或粘贴完整路径），然后按回车：\n> ', (ans) => {
      rl.close();
      resolve(cleanPath(ans));
    });
  });
}

// 询问一行输入（通用）
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve((ans || '').trim());
    });
  });
}

// 把 "HH:MM:SS" / "MM:SS" / "纯秒数" 解析成秒；无法解析返回 null
function parseTimeToSec(s) {
  const t = (s || '').trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(':').map((x) => x.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((x) => Number(x));
  if (nums.some((n) => !isFinite(n) || n < 0)) return null;
  let sec = 0;
  if (nums.length === 3) sec = nums[0] * 3600 + nums[1] * 60 + nums[2];
  else sec = nums[0] * 60 + nums[1];
  return sec;
}

// 询问可选的时间段；直接回车=整部。返回 {startSec, durationSec} 或 null(整部)
async function askTimeRange() {
  console.log('\n可只做某一段的字幕（省时间、省费用）。格式如 00:30:00-00:45:00 或 30:00-45:00。');
  const ans = await ask('直接按回车=整部字幕；或输入时间段：\n> ');
  if (!ans) return null;
  const m = ans.split(/\s*[-~到至]\s*/).filter(Boolean);
  if (m.length !== 2) {
    console.log('时间段格式没看懂，将按【整部】处理。');
    return null;
  }
  const startSec = parseTimeToSec(m[0]);
  const endSec = parseTimeToSec(m[1]);
  if (startSec == null || endSec == null || endSec <= startSec) {
    console.log('时间段无效（结束要晚于开始），将按【整部】处理。');
    return null;
  }
  return { startSec, durationSec: endSec - startSec };
}

// 把秒数格式化为适合文件名的 HHMMSS
function secToTag(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}${p(m)}${p(ss)}`;
}

// 定位 ffmpeg：优先 exe 同目录的 ffmpeg.exe，其次 ffmpeg-static，最后 PATH
function resolveFfmpeg() {
  const local = path.join(appDir(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(local)) return local;
  try {
    const st = require('ffmpeg-static');
    if (st && fs.existsSync(st)) return st;
  } catch (_) {}
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}\n${stderr.slice(-1200)}`));
    });
  });
}

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

const CONFIG_TEMPLATE = `# ====== 视频字幕生成工具 配置文件 ======
# 修改后保存即可（用记事本打开）。等号后面填你的值。

# 【必填】OpenAI API Key（听写 + 翻译都用它）
api_key=

# 【可选】API 地址。默认官方；如果你用中转/代理，改成中转地址（到 /v1 结尾）
base_url=https://api.openai.com/v1

# 【可选】字幕类型：bilingual=原文+中文双语，chinese=纯中文
subtitle=bilingual

# 【可选】视频原语言：日语 ja / 英语 en / 韩语 ko / 法语 fr / 德语 de / 西语 es / 俄语 ru；不确定填 auto 自动识别
source_lang=auto

# 【可选】翻译用的模型（便宜够用：gpt-4o-mini）
translate_model=gpt-4o-mini

# 【可选】听写用的模型（whisper-1）
whisper_model=whisper-1

# 【可选】音频切段长度（秒），默认 600=10分钟，避免超过接口 25MB 限制
chunk_seconds=600
`;

function loadConfig() {
  const cfgPath = path.join(appDir(), 'config.txt');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, CONFIG_TEMPLATE, 'utf8');
    log('已生成配置文件：' + cfgPath);
    console.log('\n>>> 请先用记事本打开 config.txt，填入你的 API Key，再重新运行。<<<\n');
    pause(1);
  }
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const cfg = {};
  raw.split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const idx = s.indexOf('=');
    if (idx < 0) return;
    cfg[s.slice(0, idx).trim()] = s.slice(idx + 1).trim();
  });

  const conf = {
    apiKey: cfg.api_key || '',
    baseUrl: (cfg.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    bilingual: (cfg.subtitle || 'bilingual').toLowerCase() !== 'chinese',
    sourceLang: (cfg.source_lang || 'auto').trim(),
    translateModel: cfg.translate_model || 'gpt-4o-mini',
    whisperModel: cfg.whisper_model || 'whisper-1',
    chunkSeconds: Math.max(60, parseInt(cfg.chunk_seconds || '600', 10) || 600),
  };
  if (!conf.apiKey) {
    console.log('\n>>> config.txt 里的 api_key 还没填！请填好后重新运行。<<<\n');
    pause(1);
  }
  return conf;
}

// ---------------------------------------------------------------------------
// 时间轴 / SRT
// ---------------------------------------------------------------------------

function toSrtTime(sec) {
  if (sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(milli, 3)}`;
}

function buildSrt(segments, bilingual) {
  const lines = [];
  segments.forEach((seg, i) => {
    lines.push(String(i + 1));
    lines.push(`${toSrtTime(seg.start)} --> ${toSrtTime(seg.end)}`);
    const zh = (seg.zh || '').trim();
    const src = (seg.text || '').trim();
    if (bilingual) {
      if (zh) lines.push(zh);
      if (src) lines.push(src);
      if (!zh && !src) lines.push('');
    } else {
      lines.push(zh || src);
    }
    lines.push('');
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 音频抽取与切段
// ---------------------------------------------------------------------------

async function extractChunks(ffmpeg, videoPath, tmpDir, chunkSeconds, range) {
  const pattern = path.join(tmpDir, 'chunk_%04d.mp3');
  // 单声道 16k mp3 64kbps：10 分钟约 4-5MB，远低于 25MB 上限
  const startSec = range ? range.startSec : 0;
  const args = ['-y'];
  // 只抽指定时间段：-ss 在 -i 前快速定位，-t 限定时长
  if (range) args.push('-ss', String(startSec));
  args.push('-i', videoPath);
  if (range) args.push('-t', String(range.durationSec));
  args.push(
    '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'libmp3lame', '-b:a', '64k',
    '-f', 'segment', '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    pattern,
  );
  log('正在抽取并切分音频（可能需要一会儿）...');
  await runFfmpeg(ffmpeg, args);
  const files = fs.readdirSync(tmpDir)
    .filter((f) => /^chunk_\d+\.mp3$/.test(f))
    .sort();
  if (!files.length) throw new Error('音频抽取失败：没有生成任何音频片段。');
  return files.map((f, i) => ({
    file: path.join(tmpDir, f),
    // 时间轴回到电影真实位置：起点秒数 + 分段内部偏移
    offset: startSec + i * chunkSeconds,
  }));
}

// ---------------------------------------------------------------------------
// 网络请求（带自动重试）
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 上游繁忙/临时故障类错误，重试往往就能恢复
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt) {
  // 2s, 4s, 8s, 16s ... 上限 30s，加一点拖抽避免扎堆
  const base = Math.min(30000, 2000 * Math.pow(2, attempt));
  return base + Math.floor(Math.random() * 800);
}

// 带重试的 fetch：网络异常或可重试状态码会自动重试，成功返回 res
async function fetchWithRetry(url, options, label, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (attempt < maxRetries) {
        const wait = backoffMs(attempt);
        log(`${label}网络异常（${e.message}），${Math.round(wait / 1000)} 秒后重试 (${attempt + 1}/${maxRetries})...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`${label}网络连接失败：${e.message}`);
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
      const wait = backoffMs(attempt);
      log(`${label}遇到 ${res.status}（上游繁忙/故障），${Math.round(wait / 1000)} 秒后重试 (${attempt + 1}/${maxRetries})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}出错 ${res.status}: ${body.slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------
// Whisper 听写
// ---------------------------------------------------------------------------

async function transcribeChunk(conf, chunk) {
  const data = fs.readFileSync(chunk.file);
  const form = new FormData();
  form.append('file', new Blob([data]), path.basename(chunk.file));
  form.append('model', conf.whisperModel);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (conf.sourceLang && conf.sourceLang.toLowerCase() !== 'auto') {
    form.append('language', conf.sourceLang);
  }

  const res = await fetchWithRetry(`${conf.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conf.apiKey}` },
    body: form,
  }, '听写接口');
  const json = await res.json();
  const segs = Array.isArray(json.segments) ? json.segments : [];
  return segs
    .map((s) => ({
      start: (s.start || 0) + chunk.offset,
      end: (s.end || 0) + chunk.offset,
      text: (s.text || '').trim(),
    }))
    .filter((s) => s.text);
}

// ---------------------------------------------------------------------------
// GPT 翻译
// ---------------------------------------------------------------------------

// 向模型请求一批翻译，返回译文数组（不保证长度）
async function requestTranslation(conf, texts) {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const sys = '你是专业的影视字幕翻译。将用户给出的每一行台词（可能是日语/英语/韩语等任意语言）翻译成自然、口语化的简体中文。'
    + '严格逐行对应，保持行数与编号一致，不要合并或拆分，不要漏掉任何一行。只输出 JSON。';
  const user = `请翻译下面每一行，返回 JSON 对象，格式为 {"lines": ["第1行译文", "第2行译文", ...]}，`
    + `数组长度必须等于 ${texts.length}。\n\n${numbered}`;

  const res = await fetchWithRetry(`${conf.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conf.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: conf.translateModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
  }, '翻译接口');
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '{}';
  try {
    const obj = JSON.parse(content);
    return Array.isArray(obj.lines) ? obj.lines : (Array.isArray(obj) ? obj : []);
  } catch (_) {
    return [];
  }
}

// 翻译一批：行数对上直接用；对不上（模型合并/拆分/输出被截断）就拆半重译，
// 避免“整批填空”和“整批错位”（一句对不上就从那句起后面全串位）
async function translateBatch(conf, texts) {
  const arr = await requestTranslation(conf, texts);
  if (arr.length === texts.length) return arr.map((x) => (x == null ? '' : String(x)));
  if (texts.length <= 1) return [arr[0] != null ? String(arr[0]) : ''];
  const mid = Math.ceil(texts.length / 2);
  const left = await translateBatch(conf, texts.slice(0, mid));
  const right = await translateBatch(conf, texts.slice(mid));
  return left.concat(right);
}

async function translateAll(conf, segments) {
  const BATCH = 25;
  let done = 0;
  let failedBatches = 0;
  for (let i = 0; i < segments.length; i += BATCH) {
    const slice = segments.slice(i, i + BATCH);
    try {
      const zh = await translateBatch(conf, slice.map((s) => s.text));
      slice.forEach((s, k) => { s.zh = zh[k] || ''; });
    } catch (e) {
      // 这一批翻译失败：保留原文，不中断整体流程
      failedBatches++;
      slice.forEach((s) => { s.zh = ''; });
      log(`⚠️ 第 ${Math.floor(i / BATCH) + 1} 批翻译失败，已保留原文：${e.message}`);
    }
    done += slice.length;
    log(`翻译进度 ${done}/${segments.length}`);
  }
  if (failedBatches) {
    log(`注意：有 ${failedBatches} 批翻译失败，对应字幕只保留了原文，可稍后重跑补翻。`);
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log('==============================================');
  console.log('        视频 -> 中文字幕 生成工具');
  console.log('==============================================\n');

  // 先加载配置（首次运行会生成 config.txt 模板并提示填写）
  const conf = loadConfig();

  let videoPath = cleanPath(process.argv[2]);
  if (!videoPath) {
    console.log('用法：把视频文件拖到本程序图标上，即可直接开始。');
    console.log('或者按下面提示操作：\n');
    videoPath = await askVideoPath();
  }
  if (!videoPath) {
    console.log('\n没有输入视频路径。');
    pause(0);
  }
  if (!fs.existsSync(videoPath)) {
    console.log('\n找不到文件：' + videoPath);
    console.log('（路径要是完整路径，拖入文件通常会自动填对）');
    pause(1);
  }

  const ffmpeg = resolveFfmpeg();
  log('输入视频：' + videoPath);

  // 可选：只做某一时间段
  const range = process.argv[3]
    ? (function () {
        const parts = cleanPath(process.argv[3]).split(/\s*[-~到至]\s*/).filter(Boolean);
        if (parts.length === 2) {
          const a = parseTimeToSec(parts[0]);
          const b = parseTimeToSec(parts[1]);
          if (a != null && b != null && b > a) return { startSec: a, durationSec: b - a };
        }
        return null;
      })()
    : await askTimeRange();
  if (range) {
    log(`只处理时间段：${secToTag(range.startSec)} ～ ${secToTag(range.startSec + range.durationSec)}（字幕时间轴仍对应整部电影）`);
  }
  log(`字幕类型：${conf.bilingual ? '原文+中文双语' : '纯中文'}  翻译模型：${conf.translateModel}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsub-'));
  try {
    const chunks = await extractChunks(ffmpeg, videoPath, tmpDir, conf.chunkSeconds, range);
    log(`音频已切成 ${chunks.length} 段，开始听写...`);

    // 第一轮：逐段听写，失败的先记下来跳过，等全部跑完再统一重试
    const chunkSegs = new Array(chunks.length).fill(null);
    let failedIdx = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`听写第 ${i + 1}/${chunks.length} 段...`);
      try {
        chunkSegs[i] = await transcribeChunk(conf, chunks[i]);
      } catch (e) {
        failedIdx.push(i);
        log(`⚠️ 第 ${i + 1}/${chunks.length} 段听写失败，先跳过，稍后统一重试：${e.message}`);
      }
    }

    // 收尾：其余段都跑完后，再把之前失败的段统一再试一轮（中转站可能已经缓过来了）
    if (failedIdx.length) {
      log(`有 ${failedIdx.length} 段之前失败，开始最后一轮集中重试...`);
      const stillFailed = [];
      for (const i of failedIdx) {
        log(`重试第 ${i + 1}/${chunks.length} 段...`);
        try {
          chunkSegs[i] = await transcribeChunk(conf, chunks[i]);
          log(`✅ 第 ${i + 1} 段重试成功。`);
        } catch (e) {
          stillFailed.push(i);
          log(`⚠️ 第 ${i + 1} 段重试仍失败：${e.message}`);
        }
      }
      failedIdx = stillFailed;
    }

    // 按时间顺序拼接（跟不上重试的段自然留空）
    let segments = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunkSegs[i]) segments = segments.concat(chunkSegs[i]);
    }
    if (failedIdx.length) {
      log(`注意：最终仍有 ${failedIdx.length}/${chunks.length} 段听写失败被跳过（第 ${failedIdx.map((i) => i + 1).join('、')} 段），字幕会缺这几段。稍后中转站恢复后重跑即可补全。`);
    }
    if (!segments.length) throw new Error('没有识别到任何语音内容（所有分段都失败了，多半是中转站上游故障，过一会儿再试）。');
    log(`听写完成，共 ${segments.length} 条字幕，开始翻译...`);

    await translateAll(conf, segments);

    const srt = buildSrt(segments, conf.bilingual);
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));
    // 整部：同名 .srt（播放器自动加载）；只做一段：加时间段后缀，避免覆盖整部版
    const outName = range
      ? `${base}.段${secToTag(range.startSec)}-${secToTag(range.startSec + range.durationSec)}.srt`
      : `${base}.srt`;
    const outPath = path.join(dir, outName);
    fs.writeFileSync(outPath, '\ufeff' + srt, 'utf8');

    console.log('\n----------------------------------------------');
    log('✅ 完成！字幕已保存：');
    console.log('    ' + outPath);
    if (range) {
      console.log('这是只含那一段的字幕（时间轴已对应整部电影）。');
      console.log('想让 PotPlayer 自动加载：把它重命名成与视频同名的 .srt 即可。');
    } else {
      console.log('用 PotPlayer 打开视频，字幕会自动加载（同名同目录）。');
    }
    console.log('----------------------------------------------');
  } finally {
    try {
      fs.readdirSync(tmpDir).forEach((f) => fs.unlinkSync(path.join(tmpDir, f)));
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  }
  pause(0);
}

main().catch((err) => {
  console.error('\n❌ 出错了：' + (err && err.message ? err.message : err));
  pause(1);
});
