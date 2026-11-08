// Lexmount Context 管理：列表 / 共享 Context（Context 数量受套餐限制，用共享态兜底）
import { browserJson } from './plugin/lib/lexmount.mjs'
import { loadSettings, saveSettings } from './host.mjs'
import { listSites } from './registry.mjs'

export async function listContexts() {
  try {
    const d = await browserJson(['context', 'list'], { timeoutMs: 30_000 })
    return Array.isArray(d?.contexts) ? d.contexts : []
  } catch { return [] }
}

export function sharedContextId() {
  return String(loadSettings().sharedContextId || '').trim()
}

export function setSharedContext(contextId) {
  saveSettings({ sharedContextId: String(contextId || '').trim() })
  return sharedContextId()
}

const descOf = (c) => String(c.display_name || c.description || '')
const isLocked = (c) => String(c.locked || '') === 'locked'

/** 选一个共享 Context：
 *  1) 配置里指定的；
 *  2) 名字带「共享」的；
 *  3) 本插件已在用的站点 Context（优先不用别的任务的 Context）；
 *  4) 任意可用 Context（最后的兜底）。
 */
export async function pickSharedContext() {
  const configured = sharedContextId()
  if (configured) return configured
  const list = await listContexts()
  if (!list.length) return ''
  const named = list.find((c) => /共享|shared/i.test(descOf(c)))
  if (named) return named.context_id
  const ours = new Set()
  try { for (const s of listSites()) if (s.contextId) ours.add(s.contextId) } catch {}
  const mine = list.find((c) => ours.has(c.context_id) && !isLocked(c))
  if (mine) return mine.context_id
  const free = list.find((c) => !isLocked(c)) || list[0]
  return free ? free.context_id : ''
}
