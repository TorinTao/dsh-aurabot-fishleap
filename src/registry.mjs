// 站点注册表：内置站点 + 自定义站点（增删）+ 登录状态
// 自定义站点与插件引擎共用 data/custom-sites.json，这样 site_open 也能读它们。
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, loadSettings, saveSettings } from './host.mjs'

const CUSTOM_FILE = path.join(DATA_DIR, 'custom-sites.json')
const STATUS_FILE = path.join(DATA_DIR, 'status.json')

export const BUILTINS = {
  zhihu: { key: 'zhihu', name: '知乎', home: 'https://www.zhihu.com/', loginUrl: 'https://www.zhihu.com/signin', ctxKey: 'zhihuContextId', custom: false },
  xhs: { key: 'xhs', name: '小红书', home: 'https://www.xiaohongshu.com/explore', loginUrl: 'https://www.xiaohongshu.com/explore', ctxKey: 'xhsContextId', custom: false },
  douban: { key: 'douban', name: '豆瓣', home: 'https://www.douban.com/', loginUrl: 'https://accounts.douban.com/passport/login', ctxKey: 'doubanContextId', custom: false, search: (kw) => `https://www.douban.com/search?q=${encodeURIComponent(kw)}` },
  tieba: { key: 'tieba', name: '贴吧', home: 'https://tieba.baidu.com/', loginUrl: 'https://tieba.baidu.com/', ctxKey: 'tiebaContextId', custom: false, search: (kw) => `https://tieba.baidu.com/f?kw=${encodeURIComponent(kw)}` },
  netease: { key: 'netease', name: '网易云', home: 'https://music.163.com/', loginUrl: 'https://music.163.com/#/login?target=/discover', ctxKey: 'neteaseContextId', custom: false, search: (kw) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(kw)}&type=1` },
  toutiao: { key: 'toutiao', name: '头条', home: 'https://www.toutiao.com/', loginUrl: 'https://www.toutiao.com/', ctxKey: 'toutiaoContextId', custom: false, search: (kw) => `https://so.toutiao.com/search?keyword=${encodeURIComponent(kw)}` },
}

const ALIAS = { '知乎': 'zhihu', '小红书': 'xhs', '豆瓣': 'douban', '贴吧': 'tieba', '网易云': 'netease', '网易云音乐': 'netease', '头条': 'toutiao', '今日头条': 'toutiao' }

export function readCustom() {
  try {
    const a = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'))
    return Array.isArray(a) ? a : []
  } catch { return [] }
}
export function writeCustom(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(list, null, 2), 'utf8')
}

export function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) } catch { return {} }
}
export function recordStatus(key, ok, note) {
  const st = readStatus()
  st[key] = { ok: !!ok, at: Date.now(), note: String(note || '') }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(STATUS_FILE, JSON.stringify(st, null, 2), 'utf8')
}

export function resolveSite(site) {
  const raw = String(site || '').trim()
  const key = ALIAS[raw] || raw.toLowerCase()
  if (BUILTINS[key]) return BUILTINS[key]
  const hit = readCustom().find((x) => x.key === key || x.name === raw)
  if (!hit) return null
  return {
    key: hit.key,
    name: hit.name || hit.key,
    home: hit.home || '',
    loginUrl: hit.loginUrl || hit.home || '',
    contextId: String(hit.contextId || ''),
    custom: true,
    searchTemplate: hit.searchTemplate || '',
    search: hit.searchTemplate ? (kw) => String(hit.searchTemplate).replace(/\{q\}/g, encodeURIComponent(kw)) : null,
  }
}

export function ctxIdOf(site) {
  const def = resolveSite(site)
  if (!def) return ''
  if (def.custom) return def.contextId || ''
  return String(loadSettings()[def.ctxKey] || '')
}

export function setCtxId(site, ctxId) {
  const def = resolveSite(site)
  if (!def) throw new Error('没有这个站点：' + site)
  if (def.custom) {
    const list = readCustom()
    const rec = list.find((x) => x.key === def.key)
    if (!rec) throw new Error('自定义站点记录不存在：' + def.key)
    rec.contextId = ctxId
    writeCustom(list)
  } else {
    saveSettings({ [def.ctxKey]: ctxId })
  }
  return ctxId
}

export function addSite({ name, home, loginUrl, searchTemplate }) {
  const n = String(name || '').trim()
  const h = String(home || '').trim()
  const l = String(loginUrl || h).trim()
  const s = String(searchTemplate || '').trim()
  if (!n) throw new Error('站点名字不能为空')
  if (!/^https?:\/\//i.test(h)) throw new Error('首页要填 http(s) 链接')
  if (!/^https?:\/\//i.test(l)) throw new Error('登录页要填 http(s) 链接')
  if (Object.values(BUILTINS).some((x) => x.name === n)) throw new Error(`内置已有「${n}」`)
  const list = readCustom()
  if (list.some((x) => x.name === n)) throw new Error(`已经有叫「${n}」的站点了`)
  const rec = { key: 'c' + Date.now().toString(36), name: n, home: h, loginUrl: l, searchTemplate: s, contextId: '', createdAt: Date.now() }
  list.push(rec)
  writeCustom(list)
  return rec
}

export function removeSite(site) {
  const def = resolveSite(site)
  if (!def) throw new Error('没有这个站点：' + site)
  if (!def.custom) throw new Error('内置站点不能删')
  writeCustom(readCustom().filter((x) => x.key !== def.key))
  const st = readStatus(); delete st[def.key]
  fs.writeFileSync(STATUS_FILE, JSON.stringify(st, null, 2), 'utf8')
  return { ok: true, key: def.key, name: def.name }
}

export function listSites() {
  const st = readStatus()
  const out = Object.values(BUILTINS).map((d) => ({
    key: d.key,
    name: d.name,
    home: d.home,
    loginUrl: d.loginUrl,
    custom: false,
    contextId: String(loadSettings()[d.ctxKey] || ''),
    status: st[d.key] || null,
  }))
  for (const rec of readCustom()) {
    out.push({
      key: rec.key,
      name: rec.name || rec.key,
      home: rec.home || '',
      loginUrl: rec.loginUrl || rec.home || '',
      custom: true,
      contextId: String(rec.contextId || ''),
      status: st[rec.key] || null,
    })
  }
  return out
}
