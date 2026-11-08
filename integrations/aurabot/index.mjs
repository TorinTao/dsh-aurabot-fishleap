// Aurobot 侧桥接模块：让小肥鱼能管理 Lexmount 插件里的网站（增删/登录/读取）
// 依赖：dsh-aurabot-fishleap 本地服务在跑（默认 http://127.0.0.1:4571）
// 安装：在 dsh-aurabot-fishleap 仓库执行 node scripts/install-aurabot-module.mjs
export default {
  id: 'lexmount-site',
  name: '鱼跃·逛网管家',
  version: '1.0.0',
  api: 1,
  description: '让小肥鱼自动添加/删除网站，需要登录时把二维码发给主人扫码（human-in-the-loop），验证后就能读这个站',
  defaults: { baseUrl: 'http://127.0.0.1:4571', token: '' },
  settings: [
    { key: 'baseUrl', label: 'Lexmount 插件服务地址', type: 'text', hint: '默认 http://127.0.0.1:4571' },
    { key: 'token', label: '访问 token（可选）', type: 'text', hint: '服务开了鉴权才需要填' },
  ],

  setup(api) {
    const { hub } = api.core
    const cfg = () => api.settings() || {}
    const base = () => String(cfg().baseUrl || 'http://127.0.0.1:4571').replace(/\/+$/, '')

    async function call(path, { method = 'GET', body } = {}) {
      const headers = {}
      const token = String(cfg().token || '').trim()
      if (token) headers['x-lexmount-token'] = token
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      let r
      try {
        r = await fetch(base() + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180_000) })
      } catch (e) {
        throw new Error(`连不上 Lexmount 插件服务（${base()}）：先在小肥鱼这台机器上运行 node src/cli.mjs serve。原始错误：${String(e.message || e).slice(0, 120)}`)
      }
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `插件服务返回 HTTP ${r.status}`)
      return j
    }

    const wrap = (fn) => async (args) => {
      try { return await fn(args || {}) } catch (e) { return { ok: false, message: String(e.message || e) } }
    }

    api.tool(({ sessionId, level }) => {
      if (!hub.turnSendersAllOwner(sessionId) && level !== 'full') return []
      return [
        api.defineTool({
          name: 'lx_site_list',
          description: '看 Lexmount 插件里已接入的网站、每个站的登录状态、以及有没有正在等人扫码的登录窗口。',
          properties: {}, required: [],
          execute: wrap(async () => {
            const d = await call('/api/sites')
            const pend = d.pending || {}
            const lines = d.sites.map((s) => `- ${s.name}（${s.key}）${s.custom ? '·自定义' : '·内置'}：${s.status ? (s.status.ok ? '已登录' : (s.status.note || '未登录')) : '未检查'}${pend[s.key] ? '（登录窗口开着）' : ''}`)
            const pendLines = Object.keys(pend).length ? '\n等待扫码：' + Object.keys(pend).join('、') : ''
            return { ok: true, message: `Lexmount 插件站点（${d.sites.length} 个）：\n${lines.join('\n')}${pendLines}` }
          }),
        }),
        api.defineTool({
          name: 'lx_site_add',
          description: '给主人添加一个新网站（比如快手、微博、某个学校官网）。只填名字和首页就行，登录页默认用首页。加完还要调用 lx_login_start 开登录窗口让主人扫码。',
          properties: {
            name: { type: 'string', description: '网站名字，例如 快手' },
            home: { type: 'string', description: '首页链接，http(s)://…' },
            loginUrl: { type: 'string', description: '登录页链接，可留空（默认用首页）' },
            searchTemplate: { type: 'string', description: '站内搜索模板，可选；关键词用 {q} 占位' },
          }, required: ['name', 'home'],
          execute: wrap(async ({ name, home, loginUrl, searchTemplate }) => {
            const d = await call('/api/sites', { method: 'POST', body: { name, home, loginUrl, searchTemplate } })
            return { ok: true, message: `已添加「${d.site.name}」（key=${d.site.key}）。接着用 lx_login_start 打开登录窗口，让主人扫码。` }
          }),
        }),
        api.defineTool({
          name: 'lx_site_remove',
          description: '从 Lexmount 插件里删掉一个网站（只能删自定义站点，内置站点删不了）。主人说「删掉这个站/不需要了」时用。',
          properties: { site: { type: 'string', description: '站点 key 或名字，例如 快手' } }, required: ['site'],
          execute: wrap(async ({ site }) => {
            const d = await call('/api/sites/' + encodeURIComponent(site), { method: 'DELETE' })
            return { ok: true, message: `已删除「${d.name || site}」` }
          }),
        }),
        api.defineTool({
          name: 'lx_login_start',
          description: '给一个网站打开登录窗口，返回二维码图片和链接。把返回消息里的二维码 image 行原样放进取回复里发给主人，请主人用手机扫码；主人说扫好了之后，再调用 lx_login_verify 验证。',
          properties: { site: { type: 'string', description: '站点 key 或名字，例如 快手 / 知乎' } }, required: ['site'],
          execute: wrap(async ({ site }) => {
            const d = await call('/api/sites/' + encodeURIComponent(site) + '/connect', { method: 'POST', body: {} })
            const shotUrl = d.shotApi ? base() + d.shotApi : ''
            return {
              ok: true,
              message: `已打开「${d.name}」的登录窗口。请把下面这行原样发到聊天里（这是二维码图片）：\n![${d.name}登录二维码](${shotUrl})\n再把这个链接发给主人（打不开图片时用）：${d.inspectUrl}\n\n主人扫码并说「好了」之后，调用 lx_login_verify（site=${d.key}）保存登录态。窗口 30 分钟内有效。`,
            }
          }),
        }),
        api.defineTool({
          name: 'lx_login_verify',
          description: '检查主人是否已经扫码登录成功。成功会保存登录态并关掉登录窗口；失败就告诉主人还没好、继续扫码。',
          properties: { site: { type: 'string', description: '站点 key 或名字' } }, required: ['site'],
          execute: wrap(async ({ site }) => {
            const d = await call('/api/sites/' + encodeURIComponent(site) + '/verify', { method: 'POST', body: {} })
            return { ok: true, message: d.loggedIn ? `「${d.name}」登录成功，登录态已保存，现在可以读它了。` : (d.message || '还没登录完成，请主人再扫一下码。') }
          }),
        }),
        api.defineTool({
          name: 'lx_login_cancel',
          description: '关掉正在开着的登录窗口（主人不想登录了 / 扫不上码时用）。',
          properties: { site: { type: 'string', description: '站点 key 或名字' } }, required: ['site'],
          execute: wrap(async ({ site }) => {
            const d = await call('/api/sites/' + encodeURIComponent(site) + '/cancel', { method: 'POST', body: {} })
            return { ok: true, message: d.message || '已关闭登录窗口' }
          }),
        }),
        api.defineTool({
          name: 'lx_site_read',
          description: '在 Lexmount 插件里读一个网站：query 填链接（读这一页）或关键词（站内搜索）。只读内容，不点赞不评论。',
          properties: {
            site: { type: 'string', description: '站点 key 或名字' },
            query: { type: 'string', description: '链接或关键词' },
          }, required: ['site', 'query'],
          execute: wrap(async ({ site, query }) => {
            const d = await call('/api/sites/' + encodeURIComponent(site) + '/read', { method: 'POST', body: { query } })
            return { ok: d.ok !== false, message: d.message || '' }
          }),
        }),
      ]
    })

    api.rule(() => [
      '你能通过 Lexmount 插件管理网站：lx_site_list 看站点、lx_site_add 加站、lx_site_remove 删站、lx_login_start 开登录窗口、lx_login_verify 验证、lx_login_cancel 取消、lx_site_read 读内容。',
      '主人要加新网站时：先 lx_site_add，再 lx_login_start；把返回的二维码 ![图片](地址) 行原样放进回复发给主人（那是扫码图），再附上链接；主人说「好了」之后调用 lx_login_verify；成功后这个站就能 lx_site_read 了。',
      '不要编造验证码、不要假装扫码成功、不要替主人猜登录状态；验证失败就如实说还没好。',
    ])

    api.log.info(`Lexmount 站点管家已启动（服务地址 ${base()}）`)
    return {}
  },
}
