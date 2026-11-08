// Lexmount 能力封装（微博/知乎/小红书共用；一个模块一份 lib）
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'

// 可移植的 CLI 定位：环境变量 > Lexmount Skill 默认安装位置 > PATH
function pickBin(envKey, skillName, exe) {
  if (process.env[envKey]) return process.env[envKey]
  const candidates = [
    path.join(HOME, '.dsh', 'skills', skillName, 'bin', exe),
    path.join(HOME, '.lexmount', 'bin', exe),
    path.join(HOME, '.local', 'bin', exe),
  ]
  for (const p of candidates) { try { if (fs.existsSync(p)) return p } catch {} }
  return exe
}
export function defaultBrowserBin() {
  return pickBin('LEXMOUNT_BROWSER_BIN', 'lexmount-browser', process.platform === 'win32' ? 'browser-cli.exe' : 'browser-cli')
}
export function defaultWebfetchBin() {
  return pickBin('LEXMOUNT_WEBFETCH_BIN', 'lexmount-webfetch', process.platform === 'win32' ? 'webfetch-cli.exe' : 'webfetch-cli')
}

export function runCli(bin, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024, env: { ...process.env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || ''), error })
      })
  })
}

// ---------- WebFetch（公开页） ----------
export async function webfetchExtract(url, { bin = defaultWebfetchBin(), timeoutMs = 90_000 } = {}) {
  const r = await runCli(bin, ['extract', '--url', url], { timeoutMs })
  if (r.code !== 0) throw new Error(`抓取失败（退出码 ${r.code}）：${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout
}

export function parseExtract(md) {
  const text = String(md || '')
  const title = (text.match(/^- \*\*Title:\*\*\s*(.+)$/m) || [])[1]?.trim() || ''
  const finalUrl = (text.match(/^- \*\*Final URL:\*\*\s*(.+)$/m) || [])[1]?.trim() || ''
  const status = (text.match(/^- \*\*Status:\*\*\s*(.+)$/m) || [])[1]?.trim() || ''
  const i = text.indexOf('## Main Text')
  let main = i >= 0 ? text.slice(i + '## Main Text'.length) : text
  main = main.replace(/^#{1,6}\s.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  return { title, finalUrl, status, main }
}

export function looksLikeLoginGate(md) {
  const t = String(md || '').toLowerCase()
  return /visitor system|login gate|passport|请先登录|登录后查看|登录知乎|访问过于频繁|安全验证|验证码|verify/.test(t)
}

// ---------- Browser（匿名 / 登录态） ----------
export async function browserJson(args, { bin = defaultBrowserBin(), timeoutMs = 120_000 } = {}) {
  const r = await runCli(bin, args, { timeoutMs })
  let j = null
  try { j = JSON.parse(r.stdout.trim()) } catch {}
  if (!j) {
    if (r.code === null) throw new Error('browser-cli 超时（进程被强制结束）：' + String((r.stderr || r.stdout || '').trim()).slice(0, 160))
    throw new Error(`browser-cli 输出不是 JSON（退出码 ${r.code}）：${(r.stderr || r.stdout).trim().slice(0, 200)}`)
  }
  if (j.ok === false || (j.error && j.ok !== true)) {
    const e = j.error || {}
    throw new Error(`browser-cli 失败：${e.code || 'error'} ${e.message || ''}`.trim())
  }
  return j.data
}

export async function withTempSession(fn, { bin = defaultBrowserBin(), timeoutSeconds = 180 } = {}) {
  let data = null
  for (let i = 0; i < 6; i++) {
    try { data = await browserJson(['session', 'create', '--timeout-seconds', String(timeoutSeconds)], { bin }); break }
    catch (e) { if (i === 5) throw e; await new Promise((r) => setTimeout(r, 3000)) }
  }
  const sid = data.session_id
  try { return await fn(sid, data) }
  finally {
    for (let i = 0; i < 3; i++) {
      try { await browserJson(['session', 'close', '--session-id', sid], { bin, timeoutMs: 60_000 }); noteClosed(sid); break }
      catch { await new Promise((r) => setTimeout(r, 1500)) }
    }
  }
}

function looksLockedError(msg) {
  return /not found|conflict|locked|timeout|api_error|500|400/i.test(String(msg || ''))
}

// 刚关掉的会话：服务端 session get / list 会滞后几秒还显示 active，先记下来别误判
const recentlyClosed = new Map()
export function noteClosed(sid) { if (sid) recentlyClosed.set(String(sid), Date.now()) }
function isRecentlyClosed(sid) {
  const t = recentlyClosed.get(String(sid))
  if (!t) return false
  if (Date.now() - t > 90_000) { recentlyClosed.delete(String(sid)); return false }
  return true
}

export async function activeSessions({ bin = defaultBrowserBin() } = {}) {
  try {
    const d = await browserJson(['session', 'list', '--status', 'active'], { bin, timeoutMs: 30_000 })
    return Array.isArray(d?.sessions) ? d.sessions : []
  } catch { return [] }
}

export async function sessionGet(sid, { bin = defaultBrowserBin() } = {}) {
  try { return await browserJson(['session', 'get', '--session-id', sid], { bin, timeoutMs: 30_000 }) } catch { return null }
}

// 会话列表有延迟：关掉的会话可能还显示 active。逐个 get 确认，只有真活着的才算。
export async function liveSessionsFor(contextId, { bin = defaultBrowserBin() } = {}) {
  const list = (await activeSessions({ bin })).filter((x) => x.context_id === contextId && !isRecentlyClosed(x.session_id))
  const out = []
  for (const s of list) {
    const got = await sessionGet(s.session_id, { bin })
    if (got && String(got.status || '') !== 'closed') out.push(s)
  }
  return out
}

// 服务器关会话后 Context 不会立刻解锁（实测要 25s 左右），要等。
export async function waitContextUnlocked(contextId, { bin = defaultBrowserBin(), timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ctx = await browserJson(['context', 'get', '--context-id', contextId], { bin, timeoutMs: 20_000 }).catch(() => null)
    if (ctx && String(ctx.locked || '') !== 'locked') return true
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

// Context 被登录窗口占用时自救：
// 1) 关掉我们面板留下的旧登录窗口（staleSessionIds 里、且超过 minAgeMs 的；用户正在扫码的窗口不动）；
// 2) 等它解锁；确认没有任何活会话却还锁着 → 强制释放（死锁）。
// 返回 { closed, live, unlocked }：live=true 表示有别的活会话占着，工具应先报错别硬等。
export async function healContextLock(contextId, { bin = defaultBrowserBin(), minAgeMs = 5 * 60_000, staleSessionIds = [] } = {}) {
  try {
    let closed = 0
    const closedIds = new Set()
    const stale = new Set(Array.isArray(staleSessionIds) ? staleSessionIds : [])
    const sessions = (await activeSessions({ bin })).filter((x) => x.context_id === contextId)
    for (const s of sessions) {
      const desc = String(s.context_description || s.description || '')
      const age = Date.now() - Number(s.created_at || 0)
      const isOurs = stale.has(s.session_id) || /(面板登录|验证登录|重新登录|登录窗口)/.test(desc)
      if (!isOurs || age <= minAgeMs) continue
      for (let i = 0; i < 3; i++) {
        try { await browserJson(['session', 'close', '--session-id', s.session_id], { bin, timeoutMs: 60_000 }); closed++; closedIds.add(s.session_id); noteClosed(s.session_id); break }
        catch { await new Promise((r) => setTimeout(r, 1500)) }
      }
    }
    // 会话列表有延迟：刚关掉的会话可能还显示为 active，逐个确认只剩真活着的才算占用
    const remaining = (await liveSessionsFor(contextId, { bin })).filter((x) => !closedIds.has(x.session_id))
    if (remaining.length) return { closed, live: true, unlocked: false }
    if (await waitContextUnlocked(contextId, { bin, timeoutMs: 10_000 })) return { closed, live: false, unlocked: true }
    await browserJson(['context', 'force-release', '--context-id', contextId, '--yes'], { bin, timeoutMs: 60_000 }).catch(() => {})
    const unlocked = await waitContextUnlocked(contextId, { bin, timeoutMs: 15_000 })
    return { closed, live: false, unlocked }
  } catch { return { closed: 0, live: false, unlocked: false } }
}

export async function withContextSession(contextId, fn, { bin = defaultBrowserBin(), timeoutSeconds = 180, staleSessionIds = [] } = {}) {
  const deadline = Date.now() + 120_000
  let data = null
  let lastErr = null
  let healed = false
  // 一开始就锁着 → 先自救/判断，别白等
  const ctx0 = await browserJson(['context', 'get', '--context-id', contextId], { bin, timeoutMs: 20_000 }).catch(() => null)
  if (ctx0 && String(ctx0.locked || '') === 'locked') {
    const h = await healContextLock(contextId, { bin, staleSessionIds })
    healed = h.unlocked === true
    if (h.live) {
      // 会话列表有延迟，隔一会儿再逐个确认，别把「刚关掉的会话」误判成登录窗口
      await new Promise((r) => setTimeout(r, 2500))
      const act = await liveSessionsFor(contextId, { bin })
      if (act.length) throw new Error('这个站点的登录窗口还开着（Context 被占用），暂时读不了。去面板点「取消」关掉旧窗口，或点「验证」保存后会自动关。')
    }
  }
  for (let i = 0; !data && i < 12 && Date.now() < deadline; i++) {
    try {
      data = await browserJson(['session', 'create', '--context-id', contextId, '--context-mode', 'read_write', '--timeout-seconds', String(timeoutSeconds)], { bin })
      lastErr = null
    } catch (e) {
      lastErr = e
      const msg = String(e.message || e)
      if (!looksLockedError(msg)) throw e
      if (!healed && i >= 1) {
        const h = await healContextLock(contextId, { bin, staleSessionIds })
        healed = true
        // 有别的活会话（比如用户正开着的登录窗口）→ 别硬等，直接给明确提示
        if (h.live) throw new Error('这个站点的登录窗口还开着（Context 被占用），暂时读不了。去面板点「取消」关掉旧窗口，或点「验证」保存后会自动关。')
      } else {
        await waitContextUnlocked(contextId, { bin, timeoutMs: 10_000 })
      }
    }
  }
  if (!data) {
    const msg = String(lastErr?.message || '')
    if (looksLockedError(msg)) throw new Error('这个站点的 Context 一直被占用，暂时读不了。去面板点「取消」关掉登录窗口再试。')
    throw lastErr || new Error('开浏览器会话失败')
  }
  const sid = data.session_id
  try { return await fn(sid, data) }
  finally {
    for (let i = 0; i < 3; i++) {
      try { await browserJson(['session', 'close', '--session-id', sid], { bin, timeoutMs: 60_000 }); noteClosed(sid); break }
      catch { await new Promise((r) => setTimeout(r, 1500)) }
    }
  }
}

export async function openUrl(sid, url, { bin = defaultBrowserBin() } = {}) {
  return browserJson(['action', 'open-url', '--session-id', sid, '--url', url], { bin, timeoutMs: 90_000 })
}

export async function evalText(sid, expression = 'document.body.innerText', { bin = defaultBrowserBin(), timeoutMs = 30_000, predicate } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const data = await browserJson(['action', 'eval', '--session-id', sid, '--expression', expression], { bin, timeoutMs: 30_000 })
      last = typeof data === 'string' ? data : JSON.stringify(data)
    } catch (e) {
      // 页面还没加载完时 body 可能为 null，CDP 会报错；等一下重试
      last = 'ERR:' + String(e.message || e).slice(0, 100)
      await new Promise((r) => setTimeout(r, 800))
      continue
    }
    const ok = predicate ? predicate(last) : (last.trim().length > 120 && !/^加载中\.\.\.?$/.test(last.trim()))
    if (ok) return last
    await new Promise((r) => setTimeout(r, 600))
  }
  return last
}

// ---------- 每个站点独立计数（同一个 state.json） ----------
export function makeLimiter(api) {
  const file = () => path.join(api.dataDir(), 'state.json')
  const today = () => new Date().toISOString().slice(0, 10)
  const load = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return {} } }
  const save = (s) => { try { fs.mkdirSync(api.dataDir(), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(s)) } catch {} }
  const ensure = (s) => { if (s.day !== today()) { s.day = today(); s.counts = {}; s.lastAt = {} } ; s.counts = s.counts || {}; s.lastAt = s.lastAt || {}; return s }
  return {
    check(site, dailyLimit, minGapSec) {
      const s = ensure(load())
      const used = Number(s.counts[site] || 0)
      if (used >= dailyLimit) return { ok: false, message: `${site} 今天已经查了 ${used} 次（上限 ${dailyLimit}），明天再来` }
      const gap = Date.now() - Number(s.lastAt[site] || 0)
      if (gap < minGapSec * 1000) return { ok: false, message: `${site} 刚查过，等 ${Math.ceil((minGapSec * 1000 - gap) / 1000)} 秒再试` }
      return { ok: true, used }
    },
    bump(site) {
      const s = ensure(load())
      s.counts[site] = Number(s.counts[site] || 0) + 1
      s.lastAt[site] = Date.now()
      save(s)
    },
    snapshot() { const s = ensure(load()); return { day: s.day, counts: { ...s.counts } } },
  }
}

export function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripPageNoise(t) {
  return String(t || '').replace(/\n?沪ICP备[\s\S]*$/, '').replace(/\n{3,}/g, '\n\n').trim()
}
