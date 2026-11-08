# 部署（同一台机器：先 Aurobot，后 Lexmount 插件）

这个插件是**独立程序**，不需要 Aurobot 也能单独跑。但如果想让小肥鱼（Aurobot）能自己加网站、把二维码发给主人扫码，就按下面的顺序装：

```text
① Aurobot（DSH 插件，QQ 机器人）
② feiyu-patrol（本仓库，本机服务）
③ Aurobot 桥接模块（把两者连起来）
```

## ① 先装 Aurobot

在 DSH 里装好 `dsh-aurabot-qq` 插件，配好 QQ 网关（SnowLuma），确认小肥鱼能正常聊天。

## ② 装 Lexmount 插件

```bash
git clone <仓库地址> feiyu-patrol
cd feiyu-patrol
node --version          # 需要 >= 22
node src/cli.mjs status # 能跑起来就行（还没配 Context 会显示 ❌）
```

前置：这台机器上要能调用 Lexmount 的 CLI（`browser-cli` / `webfetch-cli`）：

```bash
browser-cli doctor
browser-cli auth status
```

不在默认位置就设环境变量：`LEXMOUNT_BROWSER_BIN`、`LEXMOUNT_WEBFETCH_BIN`（见 [SETUP.md](SETUP.md)）。

## ③ 装 Aurobot 桥接模块

```bash
node scripts/install-aurabot-module.mjs
```

会把 `integrations/aurabot/index.mjs` 复制到 Aurobot 的模块目录（`~/.dsh/plugins-data/aurabot/modules/lexmount-site/`），Aurobot 约 3 秒自动热加载。

面板里会出现「平台 → 肥鱼逛网·站点管家」，可改服务地址（默认 `http://127.0.0.1:4571`）和可选 token。

## ④ 启动服务（随时可用）

```bash
node src/cli.mjs serve          # 默认 http://127.0.0.1:4571
node src/cli.mjs serve 4600     # 换端口
```

打开 <http://127.0.0.1:4571/> 就是本地面板（添加网站 / 扫码登录 / 验证 / 读取 / 一键巡检）。

**后台启动脚本**：Windows 用 `scripts\start-service.ps1`（隐藏窗口、日志写 data/server.log），Linux/macOS 用 `scripts/start-service.sh`。

**开机自启**（Windows）：

1. 新建快捷方式，目标填 `node "C:\path\to\feiyu-patrol\src\cli.mjs" serve`；
2. `Win+R` → `shell:startup`，把快捷方式丢进去；
3. 或者用「任务计划程序」创建「登录时运行」的任务（更稳）；非管理员账号可能无法用 schtasks 命令行创建，用图形界面即可。

Linux / macOS 可以用 systemd / launchd，或者 `nohup node src/cli.mjs serve &`。

## ⑤ 第一次使用

两种方式任选：

- **面板**：打开 <http://127.0.0.1:4571/> → 「添加网站」或直接点内置站点的「连接」→ 把二维码发给手机扫 → 回面板点「验证」；
- **跟小肥鱼说**：「帮我加个快手，网址是 …」，她会：`lx_site_add` → `lx_login_start`（把二维码图片发到 QQ）→ 你扫码后说「好了」→ 她 `lx_login_verify` 保存登录态 → 之后就能 `lx_site_read` 读这个站。

验证一下：让小肥鱼执行 `lx_site_list`，能看到站点和「已登录」状态就通了。

## 常见问题

| 现象 | 处理 |
|---|---|
| 小肥鱼说「连不上 Lexmount 插件服务」 | 服务没起：`node src/cli.mjs serve`；或端口改了要同步 Aurobot 模块设置里的 `baseUrl` |
| 「创建 Context 失败（Context limit reached）」 | Lexmount 的 Context 数量按套餐限制（Free/Pro 10、Pro+ 50、Enterprise 200）。本插件会自动改用共享 Context（一个配置文件可登多个站）；要独立 Context 就升级套餐或删旧 Context |
| 「Context 被占用」 | 登录窗口还开着：点「取消」，或等 30 分钟窗口过期 |
| 扫码后验证仍说没登录 | 有些站点扫码后还要在手机上点确认；再等几秒重试验证 |
| 登录态过期 | 重新「连接」扫码即可（工具会明确提示，不会编造内容） |

## 卸载

```bash
node scripts/install-aurabot-module.mjs --uninstall
```

服务直接关掉进程即可；`data/`（登录配置与状态）可以留着，下次接着用。
