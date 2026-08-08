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
- [支持的语言](#-支持的语言)
- [只生成某一时间段的字幕](#-只生成某一时间段的字幕)
- [环境要求](#-环境要求)
- [快速开始（源码运行）](#-快速开始源码运行)
- [配置说明（config.txt）](#-配置说明configtxt)
- [用更准的听写模型（whisper-large-v3）](#-用更准的听写模型whisper-large-v3)
- [打包成 exe（Windows）](#-打包成-exewindows)
- [打包后如何使用](#-打包后如何使用)
- [常见问题](#-常见问题)
- [项目结构](#-项目结构)
- [技术栈](#-技术栈)

## ✨ 它能做什么

- 🎬 **拖拽即用**：把视频拖到程序图标上即可，无需命令行基础
- 🌍 **多语言原声**：日 / 英 / 韩 / 法 / 德 / 西 / 俄等，`auto` 自动识别原语言
- 📝 **两种字幕**：原文 + 中文双语 / 纯中文，配置里一键切换
- ✂️ **指定时间段**：可只对某一段或多段（如 `00:30:00-00:45:00; 01:10:00-01:20:00`）生成字幕，省时省钱
- ⏱️ **长视频友好**：自动按时长切段，逐段听写并无缝拼接时间轴
- 🛡️ **稳定容错**：接口临时故障自动重试，单段失败先跳过、收尾再统一补跑，不会整部白干
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

## 🌐 支持的语言

听写由 **Whisper** 完成，支持**约 99 种语言**；翻译由 **GPT** 完成，能把任意语言的台词转成中文。因此**只要 Whisper 能听懂的语言，基本都能转成中文字幕**，不限于下表列出的几种。

`config.txt` 里的 `source_lang` 填语种代码可**提升该语种识别准确率**；不确定就填 `auto` 自动识别。常用代码：

| 语言 | 代码 | 语言 | 代码 | 语言 | 代码 |
| --- | --- | --- | --- | --- | --- |
| 自动识别 | `auto` | 日语 | `ja` | 英语 | `en` |
| 韩语 | `ko` | 中文 | `zh` | 法语 | `fr` |
| 德语 | `de` | 西班牙语 | `es` | 意大利语 | `it` |
| 葡萄牙语 | `pt` | 俄语 | `ru` | 阿拉伯语 | `ar` |
| 印地语 | `hi` | 泰语 | `th` | 越南语 | `vi` |
| 印尼语 | `id` | 荷兰语 | `nl` | 土耳其语 | `tr` |

> 💡 主流语言（英日法德西等）识别最准；越冷门的小语种或口音较重的音频，听写错误率会高一些，建议手动指定 `source_lang`。

## ✂️ 只生成某一时间段的字幕

如果只想给电影的某一段做字幕（例如测试翻译质量、或只需要其中一节），可以指定时间段——**只有那一段会被听写和翻译，速度更快、费用更省**。也支持一次选多段。

运行时程序会多问一句，直接回车＝整部；或输入时间段（多段用分号 `;` 隔开）：

```
可只做某一段或某几段的字幕（省时间、省费用）。
单段如 00:30:00-00:45:00；多段用分号隔开，如 00:05:00-00:10:00; 01:10:00-01:20:00。
直接按回车=整部字幕；或输入时间段：
> 00:05:00-00:10:00; 01:10:00-01:20:00
```

命令行也可直接带上时间段参数（多段同样用分号，记得加引号）：

```bash
node src/index.js "视频路径.mp4" "00:30:00-00:45:00"
node src/index.js "视频路径.mp4" "00:05:00-00:10:00; 01:10:00-01:20:00"
```

**支持的写法**：

- 时间格式：`HH:MM:SS`（如 `00:30:00`）、`MM:SS`（如 `30:00`）、或纯秒数（如 `1800`）
- 单段内分隔符：`-`、`~`、`到`、`至` 均可（如 `30:00到45:00`）
- 多段之间用分号 `;`（中文分号 `；` 也行）；多段会自动按时间排序

**要点**：

- 生成的字幕**时间轴仍对应整部电影**——在完整视频里播放时，只有所选时段会显示字幕，其余时间为空。也就是「文件覆盖整部时长，但只有所选段有内容」。
- 为避免覆盖整部版本，只做部分时段时输出文件名会带后缀，如 `电影名.段003000-004500.srt`（多段会标注“兼N段”）。想让播放器自动加载，把它重命名成与视频**同名**的 `.srt` 即可。

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
| `source_lang` | 视频原语言代码（见[支持的语言](#-支持的语言)）；不确定填 `auto` 自动识别 | `auto` |
| `translate_model` | 翻译模型 | `gpt-4o-mini` |
| `whisper_model` | 听写模型 | `whisper-1` |
| `whisper_base_url` | 【可选】听写专用地址（见[用更准的听写模型](#-用更准的听写模型whisper-large-v3)）；不填则沿用 `base_url` | 空 |
| `whisper_api_key` | 【可选】听写专用密钥；不填则沿用 `api_key` | 空 |
| `proxy_url` | 【可选】代理地址；用 Groq 等被墙服务时必填（本工具不认系统代理），如 `http://127.0.0.1:10810`。只有听写走代理 | 空 |
| `chunk_seconds` | 音频切段秒数（默认 600=10 分钟） | `600` |

> ⚠️ **安全提醒**：`config.txt` 已被 `.gitignore` 忽略，不会上传到仓库。请勿把填了真实 Key 的 `config.txt` 提交到任何公开仓库。

## 🎙️ 用更准的听写模型（whisper-large-v3）

默认的 `whisper-1`（=large-v2）听写准确率一般。想要更准、又保留正确时间轴的话，推荐用 **[Groq](https://console.groq.com)** 免费跑 **`whisper-large-v3`**。

❗ **为什么不用 `gpt-4o-transcribe`**：它不支持 `verbose_json`，**不返回时间戳**，无法定位字幕时间（官方明确）。`whisper-large-v3` 是 Whisper 家族，**天然带时间轴**。

**配置方法**（听写走 Groq、翻译仍走你原来的中转站）：

```
# 翻译保持不变（走你的中转站 gpt 模型）
base_url=https://你的中转站/v1
api_key=你的中转站 key
translate_model=gpt-4o-mini

# 听写单独指向 Groq
whisper_base_url=https://api.groq.com/openai/v1
whisper_api_key=你的 Groq key
whisper_model=whisper-large-v3

# 国内访问 Groq 需走代理（填你科学上网软件的本地 HTTP 端口）
proxy_url=http://127.0.0.1:10810
```

- `whisper_base_url` / `whisper_api_key` **不填时行为与以前完全一致**（听写、翻译都走 `base_url`）。
- 去 [console.groq.com](https://console.groq.com) 免费注册即可拿 key。
- **Groq 免费额度**：听写 2000 次/天、音频 7200 秒/小时（≈每小时能处理一部 2 小时电影）、单文件 25MB；个人使用足够。
- 想更快可换 `whisper_model=whisper-large-v3-turbo`。

> ⚠️ **国内访问 Groq 必须配 `proxy_url`**：Groq 在国内被墙，而本工具用的 Node `fetch` **不认系统代理**，即使你开了 v2ray/clash 也不会自动走。所以要在 `proxy_url` 里显式填代理的**本地 HTTP 端口**：v2rayN 一般是 `http://127.0.0.1:10810`（HTTP 端口 = SOCKS 端口 10809 + 1），clash 一般是 `http://127.0.0.1:7890`。只有**听写**走代理，翻译仍直连 `base_url`。不填会报 `403 Forbidden`。

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
<summary><b>用 Groq 听写报 403 Forbidden？</b></summary>

Groq 在国内被墙，而本工具不认系统代理（即使开了 v2ray/clash 也不会自动走）。在 `config.txt` 里填上 `proxy_url`，值为你科学上网软件的本地 HTTP 端口（v2rayN 一般 `http://127.0.0.1:10810`，clash 一般 `http://127.0.0.1:7890`），并确保代理软件已开启。详见 [用更准的听写模型](#-用更准的听写模型whisper-large-v3)。
</details>

<details>
<summary><b>无法访问 OpenAI / 连接超时？</b></summary>

使用中转服务时，把 `base_url` 改成中转商提供的地址（务必以 `/v1` 结尾）。
</details>

<details>
<summary><b>想要纯中文字幕？</b></summary>

把 `config.txt` 里的 `subtitle=bilingual` 改成 `subtitle=chinese`。
</details>

<details>
<summary><b>只想给电影某一段做字幕？</b></summary>

运行时按提示输入时间段（如 `00:30:00-00:45:00`），或命令行 `node src/index.js "视频.mp4" "00:30:00-00:45:00"`。只有那一段会被听写翻译，字幕时间轴仍对应整部电影。详见 [只生成某一时间段的字幕](#-只生成某一时间段的字幕)。
</details>

<details>
<summary><b>翻译到后面出现漏译 / 质量下降？</b></summary>

程序已对每批翻译做「行数对不上就自动拆半重译」处理，能避免整批漏译和错位。若觉得译文措辞一般，可把 `translate_model` 换成更强的模型（如 `gpt-4o`，需中转商支持），质量更好但费用略升。
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
