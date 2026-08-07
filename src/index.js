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

async function extractChunks(ffmpeg, videoPath, tmpDir, chunkSeconds) {
  const pattern = path.join(tmpDir, 'chunk_%04d.mp3');
  // 单声道 16k mp3 64kbps：10 分钟约 4-5MB，远低于 25MB 上限
  const args = [
    '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'libmp3lame', '-b:a', '64k',
    '-f', 'segment', '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    pattern,
  ];
  log('正在抽取并切分音频（可能需要一会儿）...');
  await runFfmpeg(ffmpeg, args);
  const files = fs.readdirSync(tmpDir)
    .filter((f) => /^chunk_\d+\.mp3$/.test(f))
    .sort();
  if (!files.length) throw new Error('音频抽取失败：没有生成任何音频片段。');
  return files.map((f, i) => ({
    file: path.join(tmpDir, f),
    offset: i * chunkSeconds,
  }));
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

  const res = await fetch(`${conf.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conf.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`听写接口出错 ${res.status}: ${t.slice(0, 400)}`);
  }
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

async function translateBatch(conf, texts) {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const sys = '你是专业的影视字幕翻译。将用户给出的每一行台词（可能是日语/英语/韩语等任意语言）翻译成自然、口语化的简体中文。'
    + '严格逐行对应，保持行数与编号一致，不要合并或拆分。只输出 JSON。';
  const user = `请翻译下面每一行，返回 JSON 对象，格式为 {"lines": ["第1行译文", "第2行译文", ...]}，`
    + `数组长度必须等于 ${texts.length}。\n\n${numbered}`;

  const res = await fetch(`${conf.baseUrl}/chat/completions`, {
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
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`翻译接口出错 ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '{}';
  let arr = [];
  try {
    const obj = JSON.parse(content);
    arr = Array.isArray(obj.lines) ? obj.lines : (Array.isArray(obj) ? obj : []);
  } catch (_) {
    arr = [];
  }
  // 行数不匹配时做一次兜底对齐
  if (arr.length !== texts.length) {
    const fixed = new Array(texts.length).fill('');
    for (let i = 0; i < texts.length; i++) fixed[i] = arr[i] || '';
    return fixed;
  }
  return arr;
}

async function translateAll(conf, segments) {
  const BATCH = 40;
  let done = 0;
  for (let i = 0; i < segments.length; i += BATCH) {
    const slice = segments.slice(i, i + BATCH);
    const zh = await translateBatch(conf, slice.map((s) => s.text));
    slice.forEach((s, k) => { s.zh = zh[k] || ''; });
    done += slice.length;
    log(`翻译进度 ${done}/${segments.length}`);
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log('==============================================');
  console.log('        视频 -> 中文字幕 生成工具');
  console.log('==============================================\n');

  const videoPath = process.argv[2];
  if (!videoPath) {
    console.log('用法：把视频文件拖到本程序图标上即可。');
    console.log('（或命令行：本程序.exe "视频路径"）');
    pause(0);
  }
  if (!fs.existsSync(videoPath)) {
    console.log('找不到文件：' + videoPath);
    pause(1);
  }

  const conf = loadConfig();
  const ffmpeg = resolveFfmpeg();
  log('输入视频：' + videoPath);
  log(`字幕类型：${conf.bilingual ? '原文+中文双语' : '纯中文'}  翻译模型：${conf.translateModel}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsub-'));
  try {
    const chunks = await extractChunks(ffmpeg, videoPath, tmpDir, conf.chunkSeconds);
    log(`音频已切成 ${chunks.length} 段，开始听写...`);

    let segments = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`听写第 ${i + 1}/${chunks.length} 段...`);
      const segs = await transcribeChunk(conf, chunks[i]);
      segments = segments.concat(segs);
    }
    if (!segments.length) throw new Error('没有识别到任何语音内容。');
    log(`听写完成，共 ${segments.length} 条字幕，开始翻译...`);

    await translateAll(conf, segments);

    const srt = buildSrt(segments, conf.bilingual);
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));
    const outPath = path.join(dir, base + '.srt');
    fs.writeFileSync(outPath, '\ufeff' + srt, 'utf8');

    console.log('\n----------------------------------------------');
    log('✅ 完成！字幕已保存：');
    console.log('    ' + outPath);
    console.log('用 PotPlayer 打开视频，字幕会自动加载（同名同目录）。');
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
