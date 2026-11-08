# Lexmount 多平台巡检简报（lexmount-patrol）

> 一次运行，把散落在多个中文内容平台上的信息读回来，整理成一份**带来源、可核验**的巡检简报。
> 核心是 **Lexmount 云浏览器 + 持久登录 Context**：内容平台普遍有登录墙 / 反爬，普通 HTTP 抓取拿不到正文，换成云端浏览器并复用登录态才读得到。

---

## 这次真实任务做了什么

选题：**多平台热点巡检**。运营/研究者每天要看好几个平台的热点，逐个打开既慢又容易漏；而且知乎、小红书、豆瓣这类站点匿名访问会被登录墙拦住。

所以做的是：用 Lexmount 云浏览器依次读取 6 个目标（微博热搜、知乎热榜、豆瓣电影口碑榜、今日头条首页、小红书笔记、网易云热歌榜），把每个目标的结果、耗时、来源链接、正文节选整理成一份简报，同时保留原始 JSON 以便核对。

**本次运行结果（2026-11-08）：6/6 站点成功，总耗时约 40 秒。**

| 站点 | 结果 | 字数 | 耗时 | 是否需登录 |
|---|---|---|---|---|
| 微博热搜 | ✅ | 1407 | 4.8s | 否（匿名可读） |
| 知乎热榜 | ✅ | 8007 | 10.2s | 是 |
| 豆瓣电影口碑榜 | ✅ | 2814 | 4.4s | 是 |
| 今日头条首页 | ✅ | 2592 | 6.6s | 是 |
| 小红书笔记 | ✅ | 573 | 8.3s | 是 |
| 网易云音乐热歌榜 | ✅ | 8007 | 5.0s | 是 |

本次结果在 [`materials/brief-2026-11-08/`](materials/brief-2026-11-08/)（每次运行还会写到 `out/<时间戳>/`，并覆盖 `out/latest/`）：

- `brief.md` — 简报正文（Markdown）
- `brief.html` — 自包含网页版（可直接双击打开，卡片式，含节选与来源链接）
- `result.json` — 每个站点的完整结果（字数、耗时、正文）
- `sources.json` — 来源清单

**对照实验**（`node src/cli.mjs compare`，见 [`materials/compare/`](materials/compare/)）：同三个页面，匿名 WebFetch 全部被登录墙/反爬挡住，换云浏览器 + 登录 Context 后都能读到正文 —— 这就是「为什么要用云浏览器」的直接证据。

---

## 怎么工作

```
Lexmount 云平台
  ├─ browser-cli（云浏览器：Context / 会话 / 打开页面 / 取正文 / 截图）
  └─ webfetch-cli（WebFetch：公开页轻量提取，做对照）
        ▲
        │ 子进程调用
┌───────┴─────────────────────────────┐
│ lexmount-patrol（本仓库，独立运行）  │
│  src/plugin/   站点读取能力（适配层） │
│  src/host.mjs  最小宿主（工具调用）   │
│  src/brief.mjs 巡检编排 + 限流/重试   │
│  src/report.mjs 简报渲染（md/html）   │
│  src/compare.mjs 匿名 vs 登录态对照   │
└─────────────────────────────────────┘
```

- **登录态持久化**：每个站点一个 Lexmount Context。`scripts/setup-context.mjs` 开一个云端浏览器登录窗口 → 手机扫码 → 关窗即保存登录态，之后所有读取复用它。
- **限流与重试**：同一站点两次读取至少间隔 8 秒；单站失败自动重试一次；会话关闭后 Context 约 25 秒才解锁，程序会等待。
- **只读**：这个工具只读公开内容与登录态可见内容，不点赞、不评论、不发帖。

## 快速开始

前置：Node.js ≥ 22，Lexmount 账号与 `browser-cli` / `webfetch-cli`（见 [docs/SETUP.md](docs/SETUP.md)）。

```bash
# 1. 准备登录 Context（每个站点一次，扫码）
node scripts/setup-context.mjs zhihu
node scripts/setup-context.mjs xiaohongshu
node scripts/setup-context.mjs douban

# 2. 检查
node src/cli.mjs status

# 3. 跑巡检
node src/cli.mjs brief

# 4. 对照实验（可选）
node src/cli.mjs compare
```

输出在 `out/<时间戳>/`，同时覆盖 `out/latest/`。

## 目录

```
src/
  plugin/            站点读取能力（微博/知乎/小红书/豆瓣/贴吧/网易云/头条/通用网页/HN）
    lib/lexmount.mjs Lexmount CLI 封装（Context/会话/打开/取正文/截图/限流）
  host.mjs           最小宿主：加载能力、按名字调用
  targets.mjs        本次巡检的站点与读取方式
  brief.mjs          巡检编排（限流、重试、汇总）
  report.mjs         简报渲染：Markdown + 自包含 HTML
  compare.mjs        匿名抓取 vs 云浏览器 对照实验
  cli.mjs            命令行入口
scripts/setup-context.mjs  引导式登录（扫码 → 保存 Context）
out/latest/          最近一次运行的简报
materials/           提交用材料（本次运行结果 + 对照实验）
docs/SETUP.md        环境与登录态说明
```

## 已知限制

- 内容平台可能改版/限流，单站失败会如实标注，不影响其它站。
- 每个站点一个 Context；Lexmount 项目默认最多 10 个 Context，满了要删旧的。
- 单次输出默认截断到 8000 字（可在 `data/settings.json` 里调 `maxChars`）。
- 登录态会过期（如网易云两天左右），过期后重跑 `setup-context.mjs` 扫码即可；工具会明确提示「需要登录/验证」而不是编造内容。
- 只读，不涉及发布/互动。

## 与 Aurobot 的关系

本仓库是**独立工具**：只依赖 Lexmount 的 `browser-cli` / `webfetch-cli`，不依赖、不导入任何 Aurobot / DSH 代码，可在任意装了 Node 的机器上运行。

## 隐私

- 登录态只保存在本机 `data/settings.json` 与 Lexmount 云端 Context 里，不写入仓库。
- 巡检结果是公开网页内容的节选，保留来源链接便于核对。

## 致谢

能力来自 [Lexmount](https://browser.lexmount.cn/) 的云浏览器与 WebFetch CLI；选题参考 Lexmount 云平台真实任务挑战的「多站点巡检助手」方向。
