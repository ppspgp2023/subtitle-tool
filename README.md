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
- [网页版部署（VPS）](#-网页版部署vps)
  - [宝塔面板部署（实测流程）](#宝塔面板部署实测流程)
  - [磁力链接导入（可选，TorBox）](#磁力链接导入可选torbox)
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

## 🌐 网页版部署（VPS）

除了本地 exe，本项目还内置一套 **网页版服务**：部署到 VPS（推荐境外，直连 OpenAI/Groq 无需代理）后，用浏览器打开网址即可上传视频、实时看进度、下载字幕。适合多台设备共用、或给不方便装软件的人使用。

**特性**：单一共享账号登录 · 大文件分片上传（断点续传，支持几个 G 的视频）· SSE 实时进度 · 到期自动清理（默认 7 天）· 顺序队列（一次处理一个，避免打爆 CPU/额度）· **可选磁力导入**（贴磁力链接，由 TorBox 云端下载，见下）。

### 1. 安装依赖

```bash
git clone https://github.com/ppspgp2023/subtitle-tool.git
cd subtitle-tool
npm install
```

> Linux 上的 ffmpeg 由依赖 `ffmpeg-static` 自动提供，无需单独安装。

### 2. 配置 .env

```bash
cp .env.example .env
# 用编辑器改好：AUTH_USER / AUTH_PASS / SESSION_SECRET / OPENAI_API_KEY 等
```

各项含义见 [.env.example](.env.example) 中的中文注释。**至少要填** `AUTH_USER`、`AUTH_PASS`、`SESSION_SECRET`、`OPENAI_API_KEY`。境外 VPS 直连时 `PROXY_URL` 留空即可。

### 3. 启动

```bash
npm run serve
# 启动后访问 http://<服务器IP>:3000
```

上传的视频、生成的字幕、临时文件都存在 `DATA_DIR`（默认项目下 `data/`），超过 `RETENTION_DAYS` 天自动删除。

### 4. 配 HTTPS 反代（强烈建议）

公网明文传输密码不安全，**务必**在前面加一层带 HTTPS 的反向代理。以 Caddy 为例（自动申请证书），`Caddyfile`：

```
sub.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Nginx 也可（记得放大 `client_max_body_size` 以支持大文件，并关闭对 `/api/jobs/*/events` 的缓冲以保证 SSE 实时）：

```nginx
server {
    server_name sub.example.com;
    client_max_body_size 0;            # 不限制上传体积
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;           # SSE 实时进度
    }
}
```

### 5. Oracle 防火墙放行端口

Oracle Cloud 需两处放行：**① 控制台**该实例所在子网的「安全列表」加一条入站规则（放行 443/80，或直连时放行 `PORT`）；**② 系统防火墙**（Oracle 镜像默认开 iptables），如 `sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT` 并持久化。用反代时对外只需放行 80/443。

### 6. 常驻运行（可选）

用 pm2 或 systemd 让服务开机自启、崩溃重拉：

```bash
npm i -g pm2
pm2 start server/server.js --name subtitle
pm2 save && pm2 startup
```

> ⚠️ 任务状态存在内存，进程重启后「进行中」的任务会丢失（已生成的字幕文件仍在）。个人使用可接受。

### 宝塔面板部署（实测流程）

如果 VPS 装了宝塔面板，不用命令行手敲，按下面流程更直观（以 Oracle 境外 VPS + Cloudflare 域名为例，已实测跑通）。

**1. 准备 Node 环境**
宝塔 → 软件商店 → 装「PM2 管理器」（自带 Node，选 18/20/22 均可）。若已有其它 Node 项目在跑，**无需重装**，`node -v` 确认 ≥ 18 即可复用。

**2. 拉代码 + 装依赖 + 配 .env**
```bash
cd /www/wwwroot
git clone https://github.com/ppspgp2023/subtitle-tool.git
cd subtitle-tool
npm install
cp .env.example .env      # 然后编辑 .env
```
在 `.env` 里填好 `AUTH_USER / AUTH_PASS / SESSION_SECRET / OPENAI_API_KEY`。

> ⚠️ **端口避让**：若 3000 已被其它项目占用（`netstat -tlnp | grep node` 可查），在 `.env` 里把 `PORT` 改成空闲端口，如 `PORT=3100`。

**3. PM2 管理器 → 添加 Node 项目**
- 项目目录：`/www/wwwroot/subtitle-tool`
- 启动选项：选 **`serve:node server/server.js`**（切勿选 `start`，那是命令行版入口）
- Node 版本：选你装的；若已在终端 `npm install` 过，可勾选「不安装 node_module」
- 项目端口（更多配置里）：填与 `.env` 一致的端口（如 3100）；「放行端口」**不勾**（只走反代更安全）
- 启动后看日志出现 `视频字幕生成服务已启动` 即成功

**4. 反向代理 + 大文件/SSE 调优**
若在添加项目时填了「绑定域名」，宝塔会自动建一个反代站点指向该端口。进入该站点 → 配置文件，在 `location / { ... }` 里补上：
```nginx
client_max_body_size 0;      # 不限制大文件上传
proxy_buffering off;         # 关缓冲，SSE 进度才实时
```
> 宝塔默认已有一行 `proxy_read_timeout 86400s;`，**不要再重复添加** `proxy_read_timeout`，否则 Nginx 会报 `duplicate directive` 重载失败。

**5. HTTPS（Cloudflare 场景）**
Cloudflare 代理（橙云）开启时，宝塔申请 Let's Encrypt 会因 CF 拦截验证而失败。最省事的做法：宝塔站点保持 HTTP，到 Cloudflare → SSL/TLS 把加密模式选 **Flexible（灵活）** + 开启 Always Use HTTPS，访客即可全程 HTTPS。（想源站也加密：临时把域名改灰云 → 宝塔申请 Let's Encrypt → 改回橙云 + CF 选 Full。）

> Cloudflare 免费版单请求上限 100MB，但本项目分片上传每片 8MB，可穿透 CF 传几个 G 的大视频；SSE 靠 15 秒心跳 + 客户端自动重连保活。

**6. Oracle 防火墙**
Oracle 需两层放行：控制台子网「安全列表」+ 系统 iptables，用反代时对外只需放行 80/443（业务端口如 3100 不对外开）。详见上面「5. Oracle 防火墙放行端口」。

### 磁力链接导入（可选，TorBox）

除了上传本地视频，网页版还可以**贴磁力链接**，把下载重活派给 [TorBox](https://torbox.app) 云端，不占用你 VPS 的带宽和磁盘。流程：

```
粘贴磁力链接
  └─ 提交给 TorBox，由它在云端从 BT 网络下载
       └─ 下完后服务器拉回成品视频（落地为与上传一致的文件）
            └─ 立即自动删除 TorBox 上那份（“中转即焚”，释放下载槽/空间）
                 └─ 后续听写 / 翻译 / 生成字幕与上传视频完全一致
```

**启用方法**：

1. 去 [torbox.app](https://torbox.app) 注册账号（有永久免费档），Settings → API 区域复制 **API Key**。
2. 在 `.env` 里填入（只有配了 Key，网页上才会出现“磁力导入”入口）：
   ```bash
   MAGNET_PROVIDER=torbox
   TORBOX_API_KEY=你的 TorBox API Key
   MAGNET_ENABLED=true
   # 云端下载并发上限：免费档只有 1 个下载槽，填 1；Pro/付费档可填 3
   MAGNET_MAX_CONCURRENT=1
   ```
3. 重启服务（`pm2 restart` 或宝塔重启），启动日志出现 `磁力导入：已启用（torbox）` 即生效。

**并发模型**：磁力的“云端下载”阶段并行（发生在 TorBox 云端 + 服务器网络 IO，不占 CPU，多个磁力可同时下，受 `MAGNET_MAX_CONCURRENT` 限制）；下载完成后再进入“一次一个”的听写/翻译流水线。前端状态：`云端下载中 → 排队中 → 处理中 → 已完成`。

> ⚠️ **TorBox 免费档限制**：同时 1 个下载槽、每月约 10 个、单文件约 10GB。所以免费档保持 `MAGNET_MAX_CONCURRENT=1`；设大了多出来的会在 TorBox 侧排队，可能触发轮询超时。又因“中转即焚”下完即删，单月 10 个一般够个人用。

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

<details>
<summary><b>翻译日志频繁出现 429（上游繁忙/故障）？</b></summary>

这是中转站背后某个模型的上游线路拥堵，与本工具无关——程序已带指数退避自动重试，通常能扛过去，只是变慢。想缓解可把 `translate_model` 换成**不同厂商/家族**的模型（换同系列往往共用同一挤爆的上游，无效）。**关键约束**：新模型必须支持 `response_format=json_object` 结构化输出，否则整段翻译会变空/保留原文，务必先实测确认。
</details>

## 📂 项目结构

```
subtitle-tool/
├── src/index.js          # 主程序（CLI 与网页版共用）：抽音频 → 听写 → 翻译 → 生成 srt
├── server/               # 网页版服务（不进 exe）
│   ├── server.js         # Express 入口：登录 / 上传 / 任务 / SSE / 下载
│   ├── config.js         # 读取校验 .env
│   ├── auth.js           # HMAC 签名 Cookie 登录
│   ├── jobs.js           # 内存任务队列 + SSE 广播 + 磁力下载调度
│   ├── cleanup.js        # 到期文件自动清理
│   ├── magnet.js         # 磁力导入编排：TorBox 云端下载 → 拉回本地 → 中转即焚
│   ├── providers/        # 下载服务适配器
│   │   └── torbox.js     # TorBox REST 封装
│   └── public/           # 前端页面（登录页 / 主页 / app.js / 样式）
├── build.js              # 打包脚本（Node SEA + postject 注入）
├── scripts/
│   └── fetch-ffmpeg.js   # 拉取 ffmpeg 二进制
├── sea-config.json       # SEA 配置（build 时自动生成，已被忽略）
├── .env.example          # 网页版环境变量示例
├── package.json
└── README.md
```

## 🧰 技术栈

**Node.js** · **OpenAI Whisper / Chat Completions API** · **ffmpeg**（ffmpeg-static） · **Node SEA + postject**（单可执行文件打包）

---

<div align="center">
<sub>费用主要来自 Whisper 听写，翻译（gpt-4o-mini）成本极低 · 需能正常访问 OpenAI API</sub>
</div>
