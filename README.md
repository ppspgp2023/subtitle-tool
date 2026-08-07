<div align="center">

# 🎬 视频字幕生成工具

**把任意语言的视频原声，一键听写 + 翻译成中文字幕**

支持日 / 英 / 韩 / 法 / 德 / 西 / 俄等多语言自动识别，输出「原文 + 中文」双语或纯中文 `.srt`。

![Node](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/Windows-绿色免安装-0078D6?logo=windows&logoColor=white)
![Powered by](https://img.shields.io/badge/OpenAI-Whisper%20%2B%20GPT-412991?logo=openai&logoColor=white)

</div>

---

## 📑 目录

- [它能做什么](#-它能做什么)
- [工作流程](#-工作流程)
- [字幕效果示例](#-字幕效果示例)
- [环境要求](#-环境要求)
- [快速开始（源码运行）](#-快速开始源码运行)
- [配置说明（config.txt）](#-配置说明configtxt)
- [打包成 exe（Windows）](#-打包成-exewindows)
- [打包后如何使用](#-打包后如何使用)
- [常见问题](#-常见问题)
- [项目结构](#-项目结构)
- [技术栈](#-技术栈)

## ✨ 它能做什么

- 🎬 **拖拽即用**：把视频拖到程序图标上即可，无需命令行基础
- 🌍 **多语言原声**：日 / 英 / 韩 / 法 / 德 / 西 / 俄等，`auto` 自动识别原语言
- 📝 **两种字幕**：原文 + 中文双语 / 纯中文，配置里一键切换
- ⏱️ **长视频友好**：自动按时长切段，逐段听写并无缝拼接时间轴
- 💰 **成本低廉**：约 120 分钟视频 ≈ 6 元人民币（听写占大头，翻译很便宜）
- 📦 **绿色免安装**：可打包为单个 `.exe`（Node SEA 方案），自带 ffmpeg

## 🔄 工作流程

```
视频文件
  └─ ffmpeg 抽取音频并按时长切段（单声道 16kHz mp3，规避接口 25MB 上限）
       └─ OpenAI Whisper 听写（识别视频原语言，带时间轴）
            └─ GPT（gpt-4o-mini）逐行翻译成简体中文
                 └─ 输出与视频同名的 .srt 字幕（原文+中文 或 纯中文）
```

## 🎞️ 字幕效果示例

以日语视频为例，`subtitle=bilingual`（双语）时生成的 `.srt` 片段：

```srt
1
00:00:01,200 --> 00:00:03,450
早上好，今天天气真不错。
おはようございます、今日はいい天気ですね。

2
00:00:03,800 --> 00:00:06,100
那我们出发吧。
それでは、出発しましょう。
```

若设为 `subtitle=chinese`（纯中文），则只保留中文行。

## 📦 环境要求

| 项目 | 说明 |
| --- | --- |
| [Node.js](https://nodejs.org/) 22+ | 打包成 SEA 单可执行文件需要；仅源码运行也建议 18+ |
| OpenAI API Key | 听写（Whisper）与翻译（GPT）共用一个 Key |
| ffmpeg | 开发时由依赖 `ffmpeg-static` 自动提供；打包后随 exe 附带 `ffmpeg.exe` |

## 🚀 快速开始（源码运行）

```bash
# 1. 安装依赖
npm install

# 2. 运行（首次会在项目根目录生成 config.txt 模板）
npm start -- "视频路径.mp4"
# 或直接：node src/index.js "视频路径.mp4"
```

首次运行会生成 `config.txt`，填好 `api_key` 后**重新运行**即可。字幕会输出到**视频所在目录**，文件名与视频同名（`.srt`）。

## ⚙️ 配置说明（config.txt）

程序在其所在目录读取 `config.txt`（源码运行时为项目根目录，exe 运行时为 exe 同目录）：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `api_key` | **【必填】** OpenAI API Key | 空 |
| `base_url` | API 地址；用中转 / 代理时改为对应地址（以 `/v1` 结尾） | `https://api.openai.com/v1` |
| `subtitle` | 字幕类型：`bilingual`=原文+中文双语，`chinese`=纯中文 | `bilingual` |
| `source_lang` | 视频原语言：`ja`/`en`/`ko`/`fr`/`de`/`es`/`ru`；不确定填 `auto` 自动识别 | `auto` |
| `translate_model` | 翻译模型 | `gpt-4o-mini` |
| `whisper_model` | 听写模型 | `whisper-1` |
| `chunk_seconds` | 音频切段秒数（默认 600=10 分钟） | `600` |

> ⚠️ **安全提醒**：`config.txt` 已被 `.gitignore` 忽略，不会上传到仓库。请勿把填了真实 Key 的 `config.txt` 提交到任何公开仓库。

## 🛠️ 打包成 exe（Windows）

```bash
# 若 ffmpeg-static 未就绪，可先拉取 ffmpeg
node scripts/fetch-ffmpeg.js

# 打包（基于 Node 22 SEA 单可执行文件方案，全程不联网下载基座）
npm run build
```

产物在 `dist/` 目录：

| 文件 | 说明 |
| --- | --- |
| `视频字幕生成工具.exe` | 主程序，把视频拖到它上面即可 |
| `ffmpeg.exe` | 需与 exe 放在**同一目录** |
| `config.txt` | 先填 API Key |
| `使用说明.txt` | 面向普通用户的图文说明 |

## 🖱️ 打包后如何使用

1. 用记事本打开 `dist/config.txt`，在 `api_key=` 后粘贴你的 OpenAI API Key，保存。
2. 把视频文件拖到「视频字幕生成工具.exe」图标上松手。
3. 完成后在**视频所在文件夹**生成同名 `.srt`。
4. 用 PotPlayer 打开视频，同名同目录字幕会自动加载。

## ❓ 常见问题

<details>
<summary><b>字幕没自动加载？</b></summary>

确认 `.srt` 与视频**同名、同目录**。PotPlayer 里可右键 → 字幕 → 加载字幕，手动选择那个 `.srt`。
</details>

<details>
<summary><b>提示接口 25MB 超限 / 长视频失败？</b></summary>

程序已自动把音频切成 10 分钟一段规避该限制。若仍失败，可把 `config.txt` 里的 `chunk_seconds` 调小（如 `300`）。
</details>

<details>
<summary><b>识别语言不准？</b></summary>

把 `source_lang` 从 `auto` 改成明确的语言代码（如日语 `ja`、英语 `en`），可提升听写准确率。
</details>

<details>
<summary><b>无法访问 OpenAI / 连接超时？</b></summary>

使用中转服务时，把 `base_url` 改成中转商提供的地址（务必以 `/v1` 结尾）。
</details>

<details>
<summary><b>想要纯中文字幕？</b></summary>

把 `config.txt` 里的 `subtitle=bilingual` 改成 `subtitle=chinese`。
</details>

## 📂 项目结构

```
subtitle-tool/
├── src/index.js          # 主程序：抽音频 → 听写 → 翻译 → 生成 srt
├── build.js              # 打包脚本（Node SEA + postject 注入）
├── scripts/
│   └── fetch-ffmpeg.js   # 拉取 ffmpeg 二进制
├── sea-config.json       # SEA 配置（build 时自动生成，已被忽略）
├── package.json
└── README.md
```

## 🧰 技术栈

**Node.js** · **OpenAI Whisper / Chat Completions API** · **ffmpeg**（ffmpeg-static） · **Node SEA + postject**（单可执行文件打包）

---

<div align="center">
<sub>费用主要来自 Whisper 听写，翻译（gpt-4o-mini）成本极低 · 需能正常访问 OpenAI API</sub>
</div>
