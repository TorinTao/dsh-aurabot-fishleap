// 登录流程（human-in-the-loop）：
//   startLogin  → 建 Context（如需要）+ 开云端浏览器登录窗口 + 截图 → 返回 inspectUrl / 二维码截图
//   verifyLogin → 在同一个会话里打开首页，判断有没有登录成功 → 成功就关窗保存 Context
//   cancelLogin → 关窗、清掉待登录状态
// 任何调用方（本地面板 / Aurobot / 其它程序）都可以通过 HTTP API 驱动这套流程。
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './host.mjs'
import { browserJson, openUrl, evalText, sessionGet, waitContextUnlocked } from './plugin/lib/lexmount.mjs'
import { resolveSite, ctxIdOf, setCtxId, recordStatus } from './registry.mjs'
import { sharedContextId, setSharedContext, pickSharedContext } from './contexts.mjs'

const PENDING_FILE = path.join(DATA_DIR, 'pending.json')
const SHOT_DIR = path.join(DATA_DIR, 'shots')

export function readPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) } catch { return {} }
}
function writePending(p) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(PENDING_FILE, JSON.stringify(p, null, 2), 'utf8')
}
function setPending(key, value) {
  const all = readPending()
  if (value) all[key] = value
  else delete all[key]
  writePending(all)
}
export function pendingOf(key) { return readPending()[key] || null }
export function listPending() { return readPending() }

export function shotPathOf(key) { return path.join(SHOT_DIR, `${key}.png`) }
export function shotApiOf(key) { return `/api/shot/${encodeURIComponent(key)}.png` }

// 登录成功的判断：登录墙关键词 vs 账号痕迹
export function judgeLogin(key, text) {
  const t = String(text || '')
  if (!t.trim()) return false
  if (key === 'tieba') return /我的|发贴|签到|消息/.test(t) && !/登录探索更多内容/.test(t)
  const loginWord = /登录|注册|扫码登录|请先登录|登录后查看|百度安全验证/.test(t)
  const account = /退出|我的|消息|私信|发布|创作|个人中心|豆邮|通知|关注|粉丝/.test(t)
  if (account && !/登录探索更多内容/.test(t)) return true
  return !loginWord && t.length > 500
}

async function ensureContext(def) {
  const existing = ctxIdOf(def.key)
  if (existing) return existing
  // 配置了共享 Context 就直接用（Context 数量受套餐限制，共享态可以容纳多个站点的登录）
  const shared = sharedContextId()
  if (shared) {
    setCtxId(def.key, shared)
    recordStatus(def.key, false, '使用共享 Context')
    return shared
  }
  try {
    const created = await browserJson(['context', 'create', '--description', `feiyu-patrol ${def.name} 登录`])
    const ctxId = created.context_id
    setCtxId(def.key, ctxId)
    return ctxId
  } catch (e) {
    const msg = String(e.message || e)
    if (/limit|429|max\s*10|reached/i.test(msg)) {
      // 达到套餐上限：自动退回共享 Context（同一个浏览器配置文件可以同时登录多个站点）
      const fallback = await pickSharedContext()
      if (fallback) {
        setCtxId(def.key, fallback)
        setSharedContext(fallback)
        recordStatus(def.key, false, '使用共享 Context')
        console.error(`[warn] Context 已达上限（${msg.slice(0, 100)}），${def.name} 自动改用共享 Context ${fallback}`)
        return fallback
      }
      throw new Error('Lexmount Context 已达上限（10/10），且没有可复用的 Context。升级套餐（Pro+ 最多 50 个）或在控制台删除不用的 Context。')
    }
    throw new Error('创建 Context 失败：' + msg.slice(0, 160))
  }
}

/** 开始登录：返回 { ok, key, name, inspectUrl, shotApi, shotPath, pending:true } */
export async function startLogin(site) {
  const def = resolveSite(site)
  if (!def) throw new Error('没有这个站点：' + site)
  if (!def.loginUrl) throw new Error(`${def.name}没有配置登录页`)
  const key = def.key

  const prev = pendingOf(key)
  if (prev?.sessionId) {
    const alive = await sessionGet(prev.sessionId)
    if (alive) {
      return {
        ok: true, key, name: def.name, reused: true,
        inspectUrl: prev.inspectUrl || '',
        shotApi: fs.existsSync(shotPathOf(key)) ? shotApiOf(key) : '',
        shotPath: fs.existsSync(shotPathOf(key)) ? shotPathOf(key) : '',
        message: `${def.name}的登录窗口已经开着，扫码/输验证码后点「验证」即可。`,
      }
    }
    setPending(key, null)
  }

  const ctxId = await ensureContext(def)
  await waitContextUnlocked(ctxId, { timeoutMs: 25_000 })
  let sess
  try {
    sess = await browserJson(['session', 'create', '--context-id', ctxId, '--context-mode', 'read_write', '--context-description', `feiyu-patrol ${def.name} 登录`, '--timeout-seconds', '1800'])
  } catch (e) {
    throw new Error(`${def.name}的登录 Context 被占用（上一个窗口可能还没关）。先点「取消」再试。原始错误：${String(e.message || e).slice(0, 120)}`)
  }
  // 先记 pending 再截图：截图慢，期间调用「验证」不会丢状态
  setPending(key, { key, contextId: ctxId, sessionId: sess.session_id, inspectUrl: sess.inspect_url, startedAt: Date.now(), status: 'waiting' })
  recordStatus(key, false, '等待登录')
  await openUrl(sess.session_id, def.loginUrl)

  let shotPath = ''
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    shotPath = shotPathOf(key)
    await browserJson(['action', 'screenshot', '--session-id', sess.session_id, '--path', shotPath])
  } catch (e) {
    shotPath = ''
  }
  const pend = pendingOf(key) || {}
  setPending(key, { ...pend, shotPath, shotAt: Date.now() })

  return {
    ok: true, key, name: def.name,
    inspectUrl: sess.inspect_url,
    shotApi: shotPath ? shotApiOf(key) : '',
    shotPath,
    message: `已打开${def.name}登录窗口：把二维码截图发给/展示给人扫码，完成后调「验证」。窗口 30 分钟内有效。`,
  }
}

/** 验证登录：成功返回 { ok, loggedIn:true, message }；未完成返回 loggedIn:false（窗口保留） */
export async function verifyLogin(site) {
  const def = resolveSite(site)
  if (!def) throw new Error('没有这个站点：' + site)
  const key = def.key
  const pend = pendingOf(key)
  if (!pend?.sessionId) throw new Error(`${def.name}没有进行中的登录窗口：先调用 connect 开始登录`)

  const alive = await sessionGet(pend.sessionId)
  if (!alive) {
    setPending(key, null)
    throw new Error(`${def.name}的登录窗口已经失效，请重新 connect`)
  }

  const home = def.home || def.loginUrl
  await openUrl(pend.sessionId, home)
  await new Promise((r) => setTimeout(r, 4500))
  let text = ''
  try {
    text = String(await evalText(pend.sessionId, 'document.body.innerText', { timeoutMs: 20_000, predicate: (t) => t.trim().length > 150 }) || '')
  } catch { text = '' }
  const loggedIn = judgeLogin(key, text)

  if (!loggedIn) {
    recordStatus(key, false, '未登录')
    return { ok: true, loggedIn: false, message: `${def.name}还没登录完成：窗口保持开着，扫码/验证后再调用 verify。`, inspectUrl: pend.inspectUrl || '' }
  }

  await browserJson(['session', 'close', '--session-id', pend.sessionId], { timeoutMs: 90_000 }).catch(() => {})
  setPending(key, null)
  setCtxId(key, pend.contextId)
  recordStatus(key, true, '已登录')
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  return { ok: true, loggedIn: true, key, name: def.name, contextId: pend.contextId, message: `${def.name}已登录，登录态已保存（Context ${pend.contextId}）` }
}

/** 取消登录：关窗、清状态 */
export async function cancelLogin(site) {
  const def = resolveSite(site)
  if (!def) throw new Error('没有这个站点：' + site)
  const key = def.key
  const pend = pendingOf(key)
  if (pend?.sessionId) {
    for (let i = 0; i < 3; i++) {
      try { await browserJson(['session', 'close', '--session-id', pend.sessionId], { timeoutMs: 60_000 }); break }
      catch { await new Promise((r) => setTimeout(r, 1500)) }
    }
  }
  setPending(key, null)
  recordStatus(key, false, '已取消登录')
  return { ok: true, key, name: def.name, message: `已关闭${def.name}的登录窗口` }
}
