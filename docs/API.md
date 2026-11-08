# HTTP API（给其它程序 / Aurobot / Agent 用）

服务默认监听 `http://127.0.0.1:4571`，只在回环地址上，不对外网开放。

如果启动时设置了 `LEXMOUNT_API_TOKEN=xxx`，所有 `/api/*` 请求要带：

- 请求头 `x-lexmount-token: xxx`，或
- 查询参数 `?token=xxx`

返回值统一是 JSON，成功 `{ "ok": true, ... }`，失败 `{ "ok": false, "error": "..." }`。

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务状态、版本、是否开鉴权 |
| GET | `/api/usage` | 各站点今日用量 / 登录 Context 摘要 |
| GET | `/api/sites` | 站点列表（内置 + 自定义 + 登录状态 + 待登录会话） |
| POST | `/api/sites` | 添加自定义网站 |
| DELETE | `/api/sites/:key` | 删除自定义网站 |
| POST | `/api/sites/:key/connect` | **开始人工验证**：建 Context、开登录窗口、截图二维码 |
| POST | `/api/sites/:key/verify` | **验证是否登录成功**：成功则关窗并保存 Context |
| POST | `/api/sites/:key/cancel` | 关闭登录窗口、放弃本次登录 |
| POST | `/api/sites/:key/read` | 读这个站：`{ "query": "链接或关键词" }` |
| GET | `/api/shot/:key.png` | 登录窗口截图（二维码）；可直接当图片发给别人 |
| POST | `/api/tool` | 直接调用插件工具：`{ "name": "weibo_hot", "args": {} }` |
| POST | `/api/brief` | 后台跑一次多平台巡检，返回 `{ jobId }` |
| GET | `/api/brief/:jobId` | 查询巡检任务状态（running / done / error） |
| GET | `/report` | 最近一次巡检的网页版简报 |
| GET | `/` | 本地面板 |

## 人机验证（human-in-the-loop）时序

```text
调用方（Aurobot / 脚本 / Agent）              人（主人）
        │
        │  POST /api/sites/:key/connect
        │◄── { inspectUrl, shotApi: "/api/shot/:key.png" }
        │
        │ 把二维码图片发给主人 ─────────────────────► 手机扫码 / 输验证码
        │
        │  POST /api/sites/:key/verify
        │◄── { loggedIn: true }（成功，登录态已保存）
        │   或 { loggedIn: false }（还没好，继续等）
```

要点：

- `connect` 会复用已开着的登录窗口，不会重复抢 Context；
- 二维码截图在 `GET /api/shot/:key.png`，可以被 QQ / 网页 / 任何能发图的地方直接引用；
- 验证成功会自动**关掉登录窗口**并把 Context 存进配置，之后 `read` 直接可用；
- 失败（没扫、扫错、超时）都返回结构化结果，不会假装成功。

## 示例

```bash
# 1) 看站点
curl http://127.0.0.1:4571/api/sites

# 2) 添加网站
curl -X POST http://127.0.0.1:4571/api/sites \
  -H "Content-Type: application/json" \
  -d '{"name":"快手","home":"https://www.kuaishou.com/","loginUrl":"https://www.kuaishou.com/"}'

# 3) 开登录窗口（返回二维码截图地址与 inspectUrl）
curl -X POST http://127.0.0.1:4571/api/sites/kuaishou/connect

# 4) 人扫码后验证
curl -X POST http://127.0.0.1:4571/api/sites/kuaishou/verify

# 5) 读一页
curl -X POST http://127.0.0.1:4571/api/sites/kuaishou/read \
  -H "Content-Type: application/json" -d '{"query":"https://www.kuaishou.com/"}'

# 直接调插件工具
curl -X POST http://127.0.0.1:4571/api/tool \
  -H "Content-Type: application/json" -d '{"name":"weibo_hot","args":{}}'
```

PowerShell 里可以用 `Invoke-RestMethod`，或者先用 `node` 起个测试脚本（中文参数建议走 UTF-8 字节）。

## Aurobot 桥接模块

`integrations/aurabot/` 是给小肥鱼用的模块：它把上面的 API 包装成 7 个工具（`lx_site_list` / `lx_site_add` / `lx_site_remove` / `lx_login_start` / `lx_login_verify` / `lx_login_cancel` / `lx_site_read`），并在规则里教它：

- 主人要加网站 → 先加站、再开登录窗口；
- 把 `![二维码](http://127.0.0.1:4571/api/shot/xxx.png)` 原样发到 QQ；
- 主人说「好了」→ 再验证；
- 永远不编造验证码或登录状态。

安装见 [DEPLOY.md](DEPLOY.md)。
