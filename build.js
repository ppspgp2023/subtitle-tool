'use strict';

/*
 * 打包脚本（Node 22 SEA 单可执行文件方案）：
 *  1) 用本机 node 生成 SEA blob（不联网）
 *  2) 复制本机 node.exe 为目标 exe
 *  3) 用 postject 把 blob 注入进 exe
 *  4) 复制 ffmpeg.exe、config.txt、使用说明.txt 到 dist
 * 全程不需要从 GitHub 下载 Node 基座。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const EXE_NAME = '视频字幕生成工具.exe';
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

async function run() {
  ensureDir(DIST);
  const blobPath = path.join(DIST, 'sea-prep.blob');
  const seaConfigPath = path.join(ROOT, 'sea-config.json');
  const outExe = path.join(DIST, EXE_NAME);

  // 1) 生成 SEA 配置与 blob
  console.log('>> [1/5] 生成 SEA blob ...');
  fs.writeFileSync(seaConfigPath, JSON.stringify({
    main: path.join(ROOT, 'src', 'index.js'),
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  }, null, 2), 'utf8');
  execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit', cwd: ROOT,
  });

  // 2) 复制 node.exe 为目标 exe
  console.log('>> [2/5] 复制 node.exe -> ' + EXE_NAME);
  fs.copyFileSync(process.execPath, outExe);

  // 3) 注入 blob
  console.log('>> [3/5] 注入 blob（postject）...');
  const { inject } = require('postject');
  const blob = fs.readFileSync(blobPath);
  await inject(outExe, 'NODE_SEA_BLOB', blob, {
    sentinelFuse: SENTINEL,
    overwrite: true,
  });
  try { fs.unlinkSync(blobPath); } catch (_) {}

  // 4) 复制 ffmpeg.exe
  console.log('>> [4/5] 复制 ffmpeg.exe ...');
  const ffsrc = require('ffmpeg-static');
  if (!ffsrc || !fs.existsSync(ffsrc)) {
    throw new Error('找不到 ffmpeg-static 二进制，请先运行 node scripts/fetch-ffmpeg.js');
  }
  fs.copyFileSync(ffsrc, path.join(DIST, 'ffmpeg.exe'));

  // 5) config.txt 模板（若不存在）与使用说明
  console.log('>> [5/5] 写入 config.txt 与使用说明 ...');
  const cfgPath = path.join(DIST, 'config.txt');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, [
      '# ====== 视频字幕生成工具 配置文件 ======',
      '# 用记事本打开修改，等号后面填你的值。',
      '',
      '# 【必填】OpenAI API Key',
      'api_key=',
      '',
      '# 【可选】API 地址（用中转就改这里，到 /v1 结尾）',
      'base_url=https://api.openai.com/v1',
      '',
      '# 【可选】字幕类型：bilingual=原文+中文双语，chinese=纯中文',
      'subtitle=bilingual',
      '',
      '# 【可选】视频原语言代码。不确定就填 auto 自动识别（Whisper 支持约 99 种语言）。',
      '# 常用：ja 日 / en 英 / ko 韩 / zh 中 / fr 法 / de 德 / es 西 / it 意 / pt 葡 / ru 俄',
      '#       ar 阿拉伯 / hi 印地 / th 泰 / vi 越南 / id 印尼 / nl 荷 / pl 波兰 / tr 土耳其',
      '# 填对应代码可提升该语种识别准确率；小语种/口音重时更建议手动指定。',
      'source_lang=auto',
      '',
      '# 【可选】翻译模型',
      'translate_model=gpt-4o-mini',
      '',
      '# 【可选】听写模型',
      'whisper_model=whisper-1',
      '',
      '# 【可选】听写专用地址/密钥：想用更准的 whisper-large-v3 可去 Groq（免费）。',
      '# 不填就沿用上面 base_url/api_key；填了则只有“听写”走这里（翻译仍走 base_url）。',
      '# 用 Groq 时：whisper_base_url=https://api.groq.com/openai/v1，whisper_model=whisper-large-v3',
      'whisper_base_url=',
      'whisper_api_key=',
      '',
      '# 【可选】代理地址：用 Groq 等被墙服务时必填（本工具不认系统代理，要显式指定）。',
      '# 填科学上网软件的本地 HTTP 端口，如 v2rayN 的 http://127.0.0.1:10810、clash 的 http://127.0.0.1:7890。',
      '# 只有“听写”走代理，翻译仍走 base_url（国内直连）。不用 Groq 就留空。',
      'proxy_url=',
      '',
      '# 【可选】音频切段秒数（默认600=10分钟）',
      'chunk_seconds=600',
      '',
    ].join('\r\n'), 'utf8');
  }

  fs.writeFileSync(path.join(DIST, '使用说明.txt'), [
    '========== 视频字幕生成工具 使用说明 ==========',
    '',
    '【第一步】填 API Key（只需一次）',
    '  用记事本打开本文件夹里的 config.txt，',
    '  在 api_key= 后面粘贴你的 OpenAI API Key，保存。',
    '',
    '【第二步】生成字幕（两种用法，任选一种）',
    '',
    '  用法 A（推荐）：在文件夹里，把视频文件拖到「' + EXE_NAME + '」的图标上松手。',
    '           注意：是拖到【exe 文件图标】上，不是先双击打开再拖进黑窗口。',
    '',
    '  用法 B：双击打开「' + EXE_NAME + '」，程序会提示你输入路径，',
    '           此时再把视频文件拖进黑窗口（或粘贴完整路径），按回车。',
    '',
    '  之后会显示进度：抽音频 -> 听写 -> 翻译。',
    '  完成后，会在【视频所在文件夹】生成同名的 .srt 字幕文件。',
    '',
    '【第三步】看片',
    '  用 PotPlayer 打开视频，字幕会自动加载（同名同目录）。',
    '  若没自动加载：右键 -> 字幕 -> 选择字幕文件，选那个 .srt。',
    '',
    '【说明】',
    '  - 本文件夹里的 ffmpeg.exe、config.txt 不要删，要和 exe 放一起。',
    '  - 想要纯中文字幕：把 config.txt 里 subtitle=bilingual 改成 subtitle=chinese。',
    '  - 费用：约 120 分钟视频 ~6 元人民币（听写占大头，翻译很便宜）。',
    '  - 视频放哪个盘都行，字幕会生成在视频旁边。',
    '',
  ].join('\r\n'), 'utf8');

  console.log('\n✅ 打包完成！产物在：' + DIST);
  console.log('   - ' + EXE_NAME + '   （拖视频到它上面）');
  console.log('   - ffmpeg.exe');
  console.log('   - config.txt   （先填 API Key）');
  console.log('   - 使用说明.txt');
}

run().catch((e) => {
  console.error('❌ 打包失败：' + (e && e.message ? e.message : e));
  process.exit(1);
});
