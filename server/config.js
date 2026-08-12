'use strict';

/*
 * 服务端配置：从 .env 读取并校验，产出两部分：
 *  - conf：喂给核心流水线 runPipeline 的配置（复用 src/index.js 的 buildConfFromObject）
 *  - web：Web 服务自身设置（端口、账号、数据目录、保留天数等）
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { buildConfFromObject } = require('../src/index.js');

function must(name) {
  const v = (process.env[name] || '').trim();
  if (!v) {
    console.error(`\n[启动失败] 环境变量 ${name} 未设置。请参考 .env.example 配置 .env 文件。\n`);
    process.exit(1);
  }
  return v;
}

function opt(name, dflt) {
  const v = (process.env[name] || '').trim();
  return v || dflt;
}

// 核心流水线配置（下划线键 → buildConfFromObject）
const conf = buildConfFromObject({
  api_key: must('OPENAI_API_KEY'),
  base_url: opt('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  whisper_base_url: opt('WHISPER_BASE_URL', ''),
  whisper_api_key: opt('WHISPER_API_KEY', ''),
  whisper_model: opt('WHISPER_MODEL', 'whisper-1'),
  translate_model: opt('TRANSLATE_MODEL', 'gpt-4o-mini'),
  subtitle: opt('SUBTITLE', 'bilingual'),
  source_lang: opt('SOURCE_LANG', 'auto'),
  chunk_seconds: opt('CHUNK_SECONDS', '600'),
  proxy_url: opt('PROXY_URL', ''),
});

// 数据目录：默认项目根下 data/
const dataDir = path.resolve(opt('DATA_DIR', path.join(__dirname, '..', 'data')));
const uploadsDir = path.join(dataDir, 'uploads');
const subtitlesDir = path.join(dataDir, 'subtitles');
const tmpDir = path.join(dataDir, 'tmp');
for (const d of [dataDir, uploadsDir, subtitlesDir, tmpDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const web = {
  port: parseInt(opt('PORT', '3000'), 10) || 3000,
  authUser: must('AUTH_USER'),
  authPass: must('AUTH_PASS'),
  sessionSecret: must('SESSION_SECRET'),
  retentionDays: Math.max(1, parseInt(opt('RETENTION_DAYS', '7'), 10) || 7),
  dataDir,
  uploadsDir,
  subtitlesDir,
  tmpDir,
};

// 磁力导入（可选）：仅当配置了 provider 的 API Key 且未被开关关闭时启用。
// adapter 模式，以后换服务只需改 MAGNET_PROVIDER + 对应 Key。
const magnet = {
  provider: opt('MAGNET_PROVIDER', 'torbox'),
  torboxApiKey: opt('TORBOX_API_KEY', ''),
  enabled: false,
};
magnet.enabled = !!magnet.torboxApiKey && opt('MAGNET_ENABLED', 'true').toLowerCase() !== 'false';

module.exports = { conf, web, magnet };
