// 更新文档与 package.json
import fs from 'node:fs'
const root = 'D:/Harness/dsh/workspace/lexmount-patrol'

function edit(rel, pairs) {
  const f = root + '/' + rel
  let c = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!c.includes(a)) throw new Error(`[${rel}] 找不到：${a.slice(0, 60)}`)
    c = c.replace(a, b)
  }
  fs.writeFileSync(f, c, 'utf8')
  console.log('updated', rel)
}

// --- package.json ---
{
  const f = root + '/package.json'
  const pkg = JSON.parse(fs.readFileSync(f, 'utf8'))
  pkg.version = '0.2.0'
  pkg.description = '基于 Lexmount 云浏览器的多平台巡检 / 网站管家：可增删网站、人工扫码验证、产出带来源的巡检简报（HTTP API + 本地面板 + Aurobot 桥接）'
  pkg.scripts = { ...pkg.scripts, serve: 'node src/cli.mjs serve', panel: 'node src/cli.mjs serve' }
  fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('updated package.json')
}

// --- README ---
edit('README.md', [
  [
    '## 快速开始\n',
    `## 能力一览

| 能力 | 入口 |
|---|---|
| 多平台巡检（6 站，带来源的简报） | \`node src/cli.mjs brief\` / 面板「一键巡检」 |
| 添加 / 删除网站 | \`POST /api/sites\`、\`DELETE /api/sites/:key\` / 面板「添加网站」 |
| 人工扫码登录（human-in-the-loop） | \`POST /api/sites/:key/connect\` → 二维码 → \`/verify\`；或在 QQ 里让小肥鱼发二维码 |
| 读一页 / 搜索 | \`POST /api/sites/:key/read\`、\`POST /api/tool\` |
| 对照实验 | \`node src/cli.mjs compare\` |
| 本地面板 | \`node src/cli.mjs serve\` → <http://127.0.0.1:4571/> |
| 跟 Aurobot 联动 | 安装桥接模块后，小肥鱼有 7 个 \`lx_*\` 工具 |

## 快速开始
`],
  [
    '```bash\n# 1. 准备登录 Context（每个站点一次，扫码）\nnode scripts/setup-context.mjs zhihu\nnode scripts/setup-context.mjs xiaohongshu\nnode scripts/setup-context.mjs douban\n\n# 2. 检查\nnode src/cli.mjs status\n\n# 3. 跑巡检\nnode src/cli.mjs brief\n\n# 4. 对照实验（可选）\nnode src/cli.mjs compare\n```\n',
    `\`\`\`bash
# 1. 启动本地服务（面板 + API）
node src/cli.mjs serve            # http://127.0.0.1:4571

# 2. 浏览器打开面板：添加网站 → 连接 → 手机扫码 → 验证
#    也可以命令行建 Context（等价）：
node scripts/setup-context.mjs zhihu
node src/cli.mjs status

# 3. 跑巡检
node src/cli.mjs brief

# 4. 对照实验（可选）
node src/cli.mjs compare
\`\`\`

HTTP API 见 [docs/API.md](docs/API.md)；同机部署 Aurobot 见 [docs/DEPLOY.md](docs/DEPLOY.md)。
`],
  [
    'scripts/setup-context.mjs  引导式登录（扫码 → 保存 Context）\n',
    `scripts/setup-context.mjs  引导式登录（扫码 → 保存 Context）
scripts/install-aurabot-module.mjs  把 Aurobot 桥接模块装进本机 Aurobot
src/registry.mjs           站点注册表（内置 + 自定义，增删）
src/login.mjs              登录流程（connect / verify / cancel，人机验证）
src/server.mjs             本地 HTTP 服务 + 面板
web/index.html             本地 Web 面板（无构建、原生 JS）
integrations/aurabot/      Aurobot 桥接模块（7 个 lx_* 工具）
docs/API.md                HTTP API 文档
docs/DEPLOY.md             部署手册（先 Aurobot 后本插件）
`],
  [
    '## 与 Aurobot 的关系\n\n本仓库是**独立工具**：只依赖 Lexmount 的 `browser-cli` / `webfetch-cli`，不依赖、不导入任何 Aurobot / DSH 代码，可在任意装了 Node 的机器上运行。\n',
    `## 与 Aurobot 的关系

本仓库是**独立工具**：只依赖 Lexmount 的 \`browser-cli\` / \`webfetch-cli\`，不依赖、不导入任何 Aurobot / DSH 代码，可在任意装了 Node 的机器上运行。

如果想让小肥鱼（Aurobot）能自己加网站、把二维码发给主人扫码，可以在**同一台机器**上按「先 Aurobot、后本插件」的顺序部署，并安装 \`integrations/aurabot/\` 桥接模块（见 [docs/DEPLOY.md](docs/DEPLOY.md)）。桥接模块只通过本机 HTTP API 调用，不共享代码。
`],
])

// --- SUBMISSION ---
edit('SUBMISSION.md', [
  [
    '## 使用到的 Lexmount 能力',
    `## 可交互界面（附加）

- 本地 Web 面板：\`node src/cli.mjs serve\` → <http://127.0.0.1:4571/>，可添加/删除网站、发起扫码登录、验证、读一页、一键巡检；
- HTTP API：可被脚本 / Agent / QQ 机器人调用，其中「开登录窗口 → 人扫码 → 验证」是典型 human-in-the-loop 流程（\`docs/API.md\`）；
- Aurobot 桥接：在 QQ 里让小肥鱼加网站、发二维码、等主人扫码、再验证（\`docs/DEPLOY.md\`）。

## 使用到的 Lexmount 能力`],
])
