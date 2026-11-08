import fs from 'node:fs'
const f = 'D:/Harness/dsh/workspace/lexmount-patrol/STATUS.md'
let c = fs.readFileSync(f, 'utf8')
c = c.replace('- **作为产品**：还差面板与测试，但不必赶在今天。\n', `- **作为产品**：还差面板与测试，但不必赶在今天。

## 16:50 更新：网站增删 + 人机验证 + 接口 + 面板 + Aurobot 桥接（已完成）

| 新增能力 | 状态 |
|---|---|
| 网站增删（内置 + 自定义） | ✅ 面板 / API / 小肥鱼工具三处都能用 |
| 人工扫码验证（human-in-the-loop） | ✅ connect 出二维码 → 人扫码 → verify 保存登录态 → 自动关窗 |
| 本地 HTTP API | ✅ 12 个接口（见 docs/API.md） |
| 本地 Web 面板 | ✅ http://127.0.0.1:4571/（添加 / 连接 / 验证 / 读取 / 一键巡检） |
| Aurobot 桥接模块 | ✅ 7 个 \`lx_*\` 工具 + 安装脚本 + 规则（先 Aurobot 后本插件） |
| 部署手册 | ✅ docs/DEPLOY.md（开机自启、常见问题、卸载） |

实测链路：API 加站 → 删站 → \`connect\` 出二维码 → \`verify\` 检测已登录 → 关窗保存 → \`read\` 读到正文；Aurobot 工具 \`lx_site_list / lx_site_add / lx_site_remove / lx_login_start / lx_login_verify / lx_login_cancel\` 全部走通。

**现在的缺口只剩**：截图/录屏材料、报名与提交动作（需要你的账号），以及可选的自动化测试/CI。`)
fs.writeFileSync(f, c, 'utf8')
console.log('STATUS updated')
