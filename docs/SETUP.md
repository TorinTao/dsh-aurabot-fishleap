# 环境与登录态准备

这个工具依赖两样东西：**Lexmount 云平台账号** + 官方 **browser-cli / webfetch-cli**。

## 1. 安装 CLI

从 Lexmount 官方文档/技能包获取并安装：

- `browser-cli`（云浏览器：会话、Context、打开页面、取正文、截图）
- `webfetch-cli`（WebFetch：轻量提取公开页面）

装好后确认可用：

```bash
browser-cli doctor
browser-cli auth status
```

如果不在默认位置，用环境变量指定：

```bash
# Windows PowerShell
$env:LEXMOUNT_BROWSER_BIN = "C:\path\to\browser-cli.exe"
$env:LEXMOUNT_WEBFETCH_BIN = "C:\path\to\webfetch-cli.exe"
```

默认会自动找：`~/.dsh/skills/lexmount-browser/bin/`、`~/.lexmount/bin/`、`~/.local/bin/`，最后回退到 PATH 里的同名命令。

## 2. 创建登录 Context（每个站点一个）

内容平台（知乎/小红书/豆瓣/贴吧/网易云/头条）大多需要登录才能读正文。做法是：开一个云端浏览器登录窗口 → 手机扫码 → 关窗，登录态就保存在 Context 里，以后每次读取都复用它。

```bash
node scripts/setup-context.mjs zhihu
node scripts/setup-context.mjs xiaohongshu
node scripts/setup-context.mjs douban
```

按提示打开 `inspect_url` 扫码，回车后脚本会关窗并自动把 Context ID 写进 `data/settings.json`。

也可以直接手写 `data/settings.json`：

```json
{
  "enabled": true,
  "minGapSec": 8,
  "zhihuContextId": "<context-id>",
  "xhsContextId": "<context-id>",
  "doubanContextId": "<context-id>",
  "tiebaContextId": "<context-id>",
  "neteaseContextId": "<context-id>",
  "toutiaoContextId": "<context-id>"
}
```

## 3. 检查

```bash
node src/cli.mjs status
```

应看到「登录 Context：知乎✅ 小红书✅ …」。

> 注意：Lexmount 项目默认最多 10 个 Context（10/10 满时新建会失败）。一个站一个 Context，按需删旧。
> 单个 Context 同一时间只能被一个会话占用：上一个会话正常关闭后约 25 秒才解锁；面板/脚本异常退出可能留下锁，等自动超时或换一个 Context。
