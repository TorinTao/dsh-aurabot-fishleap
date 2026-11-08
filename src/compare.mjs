// 对比实验：同一批页面，匿名 WebFetch vs Lexmount 云浏览器（登录 Context）
// 目的：说明「为什么需要云浏览器 + 持久登录态」，而不是普通 HTTP 抓取。
import fs from 'node:fs'
import path from 'node:path'
import { createApp, ROOT_DIR } from './host.mjs'
import { webfetchExtract, parseExtract, looksLikeLoginGate } from './plugin/lib/lexmount.mjs'

const ITEMS = [
  {
    name: '知乎热榜',
    url: 'https://www.zhihu.com/hot',
    browserTool: 'zhihu_read',
    browserArgs: { url: 'https://www.zhihu.com/hot' },
  },
  {
    name: '豆瓣搜索「三体」',
    url: 'https://www.douban.com/search?q=%E4%B8%89%E4%BD%93',
    browserTool: 'site_open',
    browserArgs: { site: 'douban', query: '三体' },
  },
  {
    name: '小红书笔记',
    url: 'https://www.xiaohongshu.com/explore/6ae5c407000000001b01e036?xsec_token=AB-FiEzaIGg3jje4gZd14HMFdoDII1KK8if2Be0wHiglg=&xsec_source=',
    browserTool: 'xhs_read',
    browserArgs: { url: 'https://www.xiaohongshu.com/explore/6ae5c407000000001b01e036?xsec_token=AB-FiEzaIGg3jje4gZd14HMFdoDII1KK8if2Be0wHiglg=&xsec_source=' },
  },
]

async function anonymousFetch(url) {
  const t0 = Date.now()
  try {
    const md = await webfetchExtract(url, { timeoutMs: 60_000 })
    const p = parseExtract(md)
    const gate = looksLikeLoginGate(md)
    const text = String(p.main || '').trim()
    return {
      ok: !gate && text.length > 150,
      chars: text.length,
      ms: Date.now() - t0,
      note: gate ? '登录墙 / 安全验证' : text.length > 150 ? '读到正文' : '只拿到空壳页面',
      sample: text.replace(/\s+/g, ' ').slice(0, 120),
    }
  } catch (e) {
    return { ok: false, chars: 0, ms: Date.now() - t0, note: '抓取失败', error: String(e.message || e).slice(0, 160) }
  }
}

export async function runCompare({ outDir = ROOT_DIR + '/materials/compare' } = {}) {
  const app = await createApp()
  const rows = []
  for (const it of ITEMS) {
    console.log(`- ${it.name}：匿名抓取 …`)
    const anon = await anonymousFetch(it.url)
    console.log(`  匿名：${anon.ok ? 'OK' : '无法读取'}（${anon.chars} 字，${anon.note}）`)
    await new Promise((r) => setTimeout(r, 9000))
    console.log(`- ${it.name}：云浏览器 + 登录 Context …`)
    const t0 = Date.now()
    let browser
    try {
      const res = await app.call(it.browserTool, it.browserArgs)
      const text = String(res?.message || '')
      browser = { ok: res?.ok !== false && text.length > 150, chars: text.length, ms: Date.now() - t0, note: text.length > 150 ? '读到正文' : text.slice(0, 80), sample: text.replace(/\s+/g, ' ').slice(0, 120) }
    } catch (e) {
      browser = { ok: false, chars: 0, ms: Date.now() - t0, note: '失败', error: String(e.message || e).slice(0, 160) }
    }
    console.log(`  云浏览器：${browser.ok ? 'OK' : '失败'}（${browser.chars} 字，${(browser.ms / 1000).toFixed(1)}s）`)
    rows.push({ name: it.name, url: it.url, anonymous: anon, browser })
    await new Promise((r) => setTimeout(r, 9000))
  }
  const out = { generatedAt: new Date().toISOString(), items: rows }
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'compare.json'), JSON.stringify(out, null, 2), 'utf8')
  fs.writeFileSync(path.join(outDir, 'compare.md'), renderCompareMd(out), 'utf8')
  return out
}

export function renderCompareMd(out) {
  const rows = out.items
  const lines = [
    '# 对照实验：匿名抓取 vs Lexmount 云浏览器（登录态）',
    '',
    `生成时间：${out.generatedAt}`,
    '',
    '| 页面 | 匿名 WebFetch | 云浏览器 + 登录 Context |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.anonymous.ok ? '✅ 能读' : '❌ 读不到'}：${r.anonymous.chars} 字（${r.anonymous.note}） | ${r.browser.ok ? '✅ 能读' : '❌ 失败'}：${r.browser.chars} 字，${(r.browser.ms / 1000).toFixed(1)}s |`),
    '',
    '## 说明',
    '',
    '- 匿名抓取：只用 Lexmount WebFetch 提取静态内容，不建浏览器会话、不带登录态。',
    '- 云浏览器：创建浏览器会话并挂上持久化登录 Context（知乎/豆瓣/小红书均为已登录账号），再读取同一页面。',
    '- 结论：这类内容平台普遍有登录墙 / 反爬，普通抓取拿不到正文；云浏览器 + 持久登录态是能拿到内容的关键。',
    '',
  ]
  return lines.join('\n')
}
