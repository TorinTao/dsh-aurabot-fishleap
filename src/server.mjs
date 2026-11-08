// 本地 HTTP 服务：把 Lexmount 插件能力开放给其它程序（本地面板 / Aurobot / 脚本 / Agent）
// 默认只监听 127.0.0.1，可用 LEXMOUNT_API_TOKEN 开启简单鉴权（请求头 x-lexmount-token 或 ?token=）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, ROOT_DIR, OUT_DIR } from './host.mjs'
import { listSites, addSite, removeSite, resolveSite, recordStatus } from './registry.mjs'
import { startLogin, verifyLogin, cancelLogin, listPending, shotPathOf, judgeLogin } from './login.mjs'
import { runBrief } from './brief.mjs'
import { listContexts, sharedContextId, setSharedContext } from './contexts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argPort = [process.argv[2], process.argv[3]].find((x) => /^\d+$/.test(String(x || '')))
const PORT = Number(process.env.LEXMOUNT_API_PORT || argPort || 4571)
const TOKEN = String(process.env.LEXMOUNT_API_TOKEN || '').trim()
const STARTED = Date.now()
const JOBS = new Map()

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' }

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(buf)
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8') }

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function authed(req, url) {
  if (!TOKEN) return true
  const h = req.headers['x-lexmount-token'] || url.searchParams.get('token')
  return String(h || '') === TOKEN
}

async function main() {
  const app = await createApp()

  async function callTool(name, args) {
    const res = await app.call(name, args || {})
    return { ok: res?.ok !== false, message: String(res?.message || '') }
  }

  // 读一页：按站点选择合适的能力（知乎/小红书有专用工具，其它走 site_open）
  async function readSite(key, query) {
    const q = String(query || '').trim()
    if (!q) throw new Error('要填链接或关键词')
    const site = resolveSite(key)
    if (!site) throw new Error('没有这个站点：' + key)
    const isUrl = /^https?:\/\//i.test(q)
    if (key === 'zhihu') return isUrl ? callTool('zhihu_read', { url: q }) : callTool('zhihu_search', { keyword: q })
    if (key === 'xhs') {
      if (!isUrl) throw new Error('小红书只能贴笔记链接（带 xsec_token）')
      return callTool('xhs_read', { url: q })
    }
    if (key === 'weibo') return isUrl ? callTool('weibo_read', { url: q }) : callTool('weibo_search', { keyword: q })
    return callTool('site_open', { site: key, query: q })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const p = url.pathname

    try {
      if (!authed(req, url)) return json(res, 401, { ok: false, error: '需要 token（x-lexmount-token 或 ?token=）' })

      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        const file = path.join(ROOT, 'web', 'index.html')
        return send(res, 200, fs.readFileSync(file), MIME['.html'])
      }
      if (req.method === 'GET' && p === '/report') {
        const f = path.join(OUT_DIR, 'latest', 'brief.html')
        if (!fs.existsSync(f)) return send(res, 404, '还没有巡检结果，先点「一键巡检」', 'text/plain; charset=utf-8')
        return send(res, 200, fs.readFileSync(f), MIME['.html'])
      }
      if (req.method === 'GET' && p.startsWith('/api/shot/')) {
        const key = decodeURIComponent(p.slice('/api/shot/'.length)).replace(/\.png$/i, '')
        const f = shotPathOf(key)
        if (!fs.existsSync(f)) return json(res, 404, { ok: false, error: '没有截图' })
        return send(res, 200, fs.readFileSync(f), MIME['.png'])
      }

      if (req.method === 'GET' && p === '/api/health') {
        return json(res, 200, { ok: true, name: 'lexmount-patrol', version: '0.2.0', uptimeSec: Math.round((Date.now() - STARTED) / 1000), authRequired: Boolean(TOKEN) })
      }
      if (req.method === 'GET' && p === '/api/usage') {
        const r = await callTool('lx_status', {})
        return json(res, 200, { ok: true, message: r.message })
      }
      if (req.method === 'GET' && p === '/api/contexts') {
        const contexts = await listContexts()
        return json(res, 200, {
          ok: true,
          shared: sharedContextId(),
          count: contexts.length,
          contexts: contexts.map((c) => ({ id: c.context_id, locked: c.locked, description: c.display_name || c.description || '' })),
        })
      }
      if (req.method === 'POST' && p === '/api/settings/shared') {
        const b = await readBody(req)
        return json(res, 200, { ok: true, shared: setSharedContext(b.contextId) })
      }
      if (req.method === 'GET' && p === '/api/sites') {
        return json(res, 200, { ok: true, sites: listSites(), pending: listPending() })
      }
      if (req.method === 'POST' && p === '/api/sites') {
        const b = await readBody(req)
        try {
          const rec = addSite(b)
          return json(res, 200, { ok: true, site: rec })
        } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }) }
      }
      if (req.method === 'DELETE' && p.startsWith('/api/sites/')) {
        const key = decodeURIComponent(p.slice('/api/sites/'.length))
        try {
          const r = removeSite(key)
          return json(res, 200, { ok: true, ...r })
        } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }) }
      }

      const m = p.match(/^\/api\/sites\/([^/]+)\/(connect|verify|cancel|read)$/)
      if (m) {
        const key = decodeURIComponent(m[1])
        const action = m[2]
        const b = req.method === 'POST' || req.method === 'GET' ? await readBody(req).catch(() => ({})) : {}
        try {
          if (action === 'connect') {
            const r = await startLogin(key)
            return json(res, 200, { ok: true, ...r })
          }
          if (action === 'verify') {
            const r = await verifyLogin(key)
            return json(res, 200, { ok: true, ...r })
          }
          if (action === 'cancel') {
            const r = await cancelLogin(key)
            return json(res, 200, { ok: true, ...r })
          }
          if (action === 'read') {
            const q = b.query ?? url.searchParams.get('query')
            const r = await readSite(key, q)
            return json(res, 200, { ok: r.ok, message: r.message })
          }
        } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }) }
      }

      if (req.method === 'POST' && p === '/api/tool') {
        const b = await readBody(req)
        try { return json(res, 200, { ok: true, ...(await callTool(String(b.name || ''), b.args || {})) }) }
        catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }) }
      }

      if (req.method === 'POST' && p === '/api/brief') {
        const id = 'job' + Date.now().toString(36)
        JOBS.set(id, { id, status: 'running', startedAt: Date.now() })
        runBrief().then((data) => JOBS.set(id, { id, status: 'done', finishedAt: Date.now(), summary: data.summary, dir: path.join(OUT_DIR, 'latest') }))
          .catch((e) => JOBS.set(id, { id, status: 'error', finishedAt: Date.now(), error: String(e.message || e) }))
        return json(res, 202, { ok: true, jobId: id })
      }
      if (req.method === 'GET' && p.startsWith('/api/brief/')) {
        const id = p.slice('/api/brief/'.length)
        const job = JOBS.get(id)
        if (!job) return json(res, 404, { ok: false, error: '没有这个任务' })
        return json(res, 200, { ok: true, job })
      }

      return json(res, 404, { ok: false, error: 'not found: ' + p })
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e.message || e) })
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`lexmount-patrol 服务已启动：http://127.0.0.1:${PORT}`)
    console.log(`  面板: http://127.0.0.1:${PORT}/   报告: /report`)
    if (TOKEN) console.log('  已启用 token 鉴权（x-lexmount-token / ?token=）')
  })
}

main().catch((e) => { console.error('启动失败：' + (e.message || e)); process.exit(1) })
