# 视频字幕生成工具

把视频里的原声自动听写、翻译成中文，生成 `.srt` 字幕文件。支持日 / 英 / 韩 / 法 / 德 / 西 / 俄等多种语言（可自动识别原语言），可输出**原文 + 中文双语**或**纯中文**字幕。

## 工作流程

```
视频文件
  └─ ffmpeg 抽取音频并按时长切段（单声道 16k mp3，规避接口 25MB 上限）
       └─ OpenAI Whisper 听写（识别视频原语言，带时间轴）
            └─ GPT（gpt-4o-mini）逐行翻译成简体中文
                 └─ 输出与视频同名的 .srt 字幕（原文+中文 或 纯中文）
```

## 功能特性

- 🎬 拖拽即用：把视频拖到程序图标上即可，无需命令行基础
- 🌍 多语言原声：日 / 英 / 韩 / 法 / 德 / 西 / 俄等，`auto` 可自动识别
- 📝 两种字幕：原文+中文双语 / 纯中文，可在配置里切换
- ⏱️ 长视频友好：自动按时长切段，逐段听写并拼接时间轴
- 💰 成本低：约 120 分钟视频 ≈ 6 元人民币（听写占大头，翻译很便宜）
- 📦 可打包为单个 exe（Node SEA 方案），自带 ffmpeg，绿色免安装

## 环境要求

- [Node.js](https://nodejs.org/) 22+（打包成 SEA 单可执行文件需要）
- OpenAI API Key（听写与翻译共用）
- ffmpeg：开发时由依赖 `ffmpeg-static` 自动提供；打包后随 exe 附带 `ffmpeg.exe`

## 快速开始（源码运行）

```bash
# 1. 安装依赖
npm install

# 2. 运行（首次会在项目根目录生成 config.txt 模板）
npm start -- "视频路径.mp4"
# 或直接：node src/index.js "视频路径.mp4"
```

首次运行会生成 `config.txt`，填好 `api_key` 后重新运行即可。字幕会输出到**视频所在目录**，文件名与视频同名（`.srt`）。

## 配置说明（config.txt）

程序会在其所在目录（源码运行时为项目根目录，exe 运行时为 exe 同目录）读取 `config.txt`：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `api_key` | **【必填】** OpenAI API Key | 空 |
| `base_url` | API 地址；用中转/代理时改为对应地址（以 `/v1` 结尾） | `https://api.openai.com/v1` |
| `subtitle` | 字幕类型：`bilingual`=原文+中文双语，`chinese`=纯中文 | `bilingual` |
| `source_lang` | 视频原语言：`ja`/`en`/`ko`/`fr`/`de`/`es`/`ru`；不确定填 `auto` 自动识别 | `auto` |
| `translate_model` | 翻译模型 | `gpt-4o-mini` |
| `whisper_model` | 听写模型 | `whisper-1` |
| `chunk_seconds` | 音频切段秒数（默认 600=10 分钟） | `600` |

> ⚠️ **安全提醒**：`config.txt` 已被 `.gitignore` 忽略，不会上传到仓库。请勿把填了真实 Key 的 `config.txt` 提交到公开仓库。

## 打包成 exe（Windows）

```bash
# 若 ffmpeg-static 未就绪，可先拉取 ffmpeg
node scripts/fetch-ffmpeg.js

# 打包（基于 Node 22 SEA 单可执行文件方案，全程不联网下载基座）
npm run build
```

产物在 `dist/` 目录：

- `视频字幕生成工具.exe` —— 把视频拖到它上面即可
- `ffmpeg.exe` —— 需与 exe 放在一起
- `config.txt` —— 先填 API Key
- `使用说明.txt`

## 使用（打包后）

1. 用记事本打开 `dist/config.txt`，在 `api_key=` 后粘贴你的 OpenAI API Key，保存。
2. 把视频文件拖到「视频字幕生成工具.exe」图标上松手。
3. 完成后在**视频所在文件夹**生成同名 `.srt`。
4. 用 PotPlayer 打开视频，同名同目录字幕会自动加载。

## 项目结构

```
subtitle-tool/
├── src/index.js          # 主程序：抽音频 -> 听写 -> 翻译 -> 生成 srt
├── build.js              # 打包脚本（Node SEA + postject 注入）
├── scripts/fetch-ffmpeg.js
├── sea-config.json       # SEA 配置（build 时自动生成，已被忽略）
├── package.json
└── README.md
```

## 技术栈

Node.js · OpenAI Whisper / Chat Completions API · ffmpeg（ffmpeg-static）· Node SEA + postject（单可执行文件打包）

## 说明

- 费用主要来自 Whisper 听写，翻译（gpt-4o-mini）成本很低。
- 需要能正常访问 OpenAI API；如使用中转服务，请在 `base_url` 中配置。
