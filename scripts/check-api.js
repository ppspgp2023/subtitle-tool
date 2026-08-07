'use strict';

/*
 * 中转站/API 可用性自检脚本
 * 用法：node scripts/check-api.js
 * 作用：读取 config.txt，检查 base_url 与 api_key 是否可用，
 *       并确认听写模型(whisper)与翻译模型是否在可用模型列表中。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadConfig() {
  const cfgPath = path.join(ROOT, 'config.txt');
  if (!fs.existsSync(cfgPath)) {
    console.log('❌ 找不到 config.txt：' + cfgPath);
    console.log('   请先运行一次 `node src/index.js` 生成模板，再填入 api_key。');
    process.exit(1);
  }
  const cfg = {};
  fs.readFileSync(cfgPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const idx = s.indexOf('=');
    if (idx < 0) return;
    cfg[s.slice(0, idx).trim()] = s.slice(idx + 1).trim();
  });
  return {
    apiKey: cfg.api_key || '',
    baseUrl: (cfg.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    translateModel: cfg.translate_model || 'gpt-4o-mini',
    whisperModel: cfg.whisper_model || 'whisper-1',
  };
}

async function main() {
  const conf = loadConfig();
  console.log('====== API 自检 ======');
  console.log('base_url        : ' + conf.baseUrl);
  console.log('api_key         : ' + (conf.apiKey ? conf.apiKey.slice(0, 8) + '****（已填写）' : '（空！）'));
  console.log('translate_model : ' + conf.translateModel);
  console.log('whisper_model   : ' + conf.whisperModel);
  console.log('');

  if (!conf.apiKey) {
    console.log('❌ config.txt 里 api_key 还没填。');
    process.exit(1);
  }

  // 1) 拉取模型列表
  console.log('>> [1/2] 读取可用模型列表 ...');
  let ids = [];
  try {
    const res = await fetch(`${conf.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${conf.apiKey}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.log(`❌ 请求失败 ${res.status}：${t.slice(0, 300)}`);
      if (res.status === 401) console.log('   → api_key 不正确，或未在该中转站生效。');
      if (res.status === 404) console.log('   → base_url 可能填错（注意要以 /v1 结尾）。');
      process.exit(1);
    }
    const json = await res.json();
    ids = (json.data || []).map((m) => m.id);
    console.log(`✅ 连接成功，共 ${ids.length} 个可用模型。`);
  } catch (e) {
    console.log('❌ 连不上：' + (e && e.message ? e.message : e));
    console.log('   → 检查 base_url 域名是否正确、网络是否可达。');
    process.exit(1);
  }

  // 2) 检查关键模型
  console.log('\n>> [2/2] 检查本工具需要的模型 ...');
  const has = (name) => ids.includes(name);

  if (has(conf.whisperModel)) {
    console.log(`✅ 听写模型 ${conf.whisperModel} 可用。`);
  } else {
    const audioLike = ids.filter((id) => /whisper|audio|transcri|speech|stt/i.test(id));
    console.log(`❌ 列表中没有听写模型 ${conf.whisperModel}。`);
    if (audioLike.length) {
      console.log('   发现这些语音相关模型，可试着填入 whisper_model：');
      audioLike.forEach((id) => console.log('     - ' + id));
    } else {
      console.log('   ⚠️ 未发现任何语音/听写类模型：该中转站可能不支持语音转文字接口，');
      console.log('      则本工具的听写环节无法使用（需换支持 Whisper 的服务）。');
    }
  }

  if (has(conf.translateModel)) {
    console.log(`✅ 翻译模型 ${conf.translateModel} 可用。`);
  } else {
    console.log(`❌ 列表中没有翻译模型 ${conf.translateModel}。`);
    const chatLike = ids.filter((id) => /^gpt-4o-mini|^gpt-4o|^gpt-4\.1|^gpt-3\.5/i.test(id)).slice(0, 15);
    if (chatLike.length) {
      console.log('   可考虑改用这些（优先选标准 API 模型，避免按次计费的 -all / gizmo 逆向模型）：');
      chatLike.forEach((id) => console.log('     - ' + id));
    }
  }

  console.log('\n提示：完整模型名可在中转站后台「模型广场」搜索确认。');
}

main().catch((e) => {
  console.error('❌ 自检出错：' + (e && e.message ? e.message : e));
  process.exit(1);
});
