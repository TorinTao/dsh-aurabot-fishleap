// 巡检任务：按 targets 依次调用插件工具，汇总成简报
import fs from 'node:fs'
import path from 'node:path'
import { createApp, OUT_DIR, ROOT_DIR } from './host.mjs'
import { TARGETS } from './targets.mjs'
import { renderMarkdown, renderHtml, excerptOf } from './report.mjs'

const EXCERPT_CHARS = 2400

function nowTag() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

async function runTarget(app, t) {
  let last = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await attemptTarget(app, t)
    if (r.ok) return r
    last = r
    if (attempt === 0) {
      console.log(`   失败（${String(r.error).slice(0, 60)}），15 秒后重试一次 …`)
      await new Promise((res) => setTimeout(res, 15000))
      console.log(`- ${t.name} 重试 …`)
    }
  }
  return last
}

async function attemptTarget(app, t) {
  const t0 = Date.now()
  try {
    const res = await app.call(t.tool, t.args)
    const text = String(res?.message || '')
    return {
      key: t.key,
      name: t.name,
      home: t.home,
      requiresLogin: t.requiresLogin,
      how: t.how,
      tool: t.tool,
      ok: res?.ok !== false && text.length > 0,
      ms: Date.now() - t0,
      chars: text.length,
      excerpt: excerptOf(text, EXCERPT_CHARS),
      error: res?.ok === false ? text : '',
    }
  } catch (e) {
    return { key: t.key, name: t.name, home: t.home, requiresLogin: t.requiresLogin, how: t.how, tool: t.tool, ok: false, ms: Date.now() - t0, chars: 0, excerpt: '', error: String(e.message || e) }
  }
}

export async function runBrief({ outDir = OUT_DIR, targets = TARGETS } = {}) {
  const app = await createApp()
  const tag = nowTag()
  const dir = path.join(outDir, tag)
  fs.mkdirSync(dir, { recursive: true })

  const meta = {
    task: '多平台热点巡检简报',
    generatedAt: new Date().toISOString(),
    tool: 'dsh-aurabot-fishleap 0.1.0',
    runtime: `node ${process.version}`,
    root: ROOT_DIR,
    targets: targets.length,
  }
  console.log(`巡检开始：${targets.length} 个目标 → ${dir}`)

  const items = []
  for (const t of targets) {
    process.stdout.write(`- ${t.name} ... `)
    const r = await runTarget(app, t)
    items.push(r)
    console.log(`${r.ok ? 'OK' : 'FAIL'} ${r.chars} 字 ${(r.ms / 1000).toFixed(1)}s`)
    // 同一站点限流保护：简单等 9 秒
    await new Promise((res) => setTimeout(res, 9000))
  }

  const summary = {
    ok: items.filter((x) => x.ok).length,
    fail: items.filter((x) => !x.ok).length,
    total: items.length,
  }
  const data = { meta, summary, items }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(data, null, 2), 'utf8')
  fs.writeFileSync(path.join(dir, 'brief.md'), renderMarkdown(data), 'utf8')
  fs.writeFileSync(path.join(dir, 'brief.html'), renderHtml(data), 'utf8')
  fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(items.map((x) => ({ name: x.name, url: x.home, ok: x.ok })), null, 2), 'utf8')

  // 最新一份的软链接（Windows 用目录复制代替）
  const latest = path.join(outDir, 'latest')
  fs.rmSync(latest, { recursive: true, force: true })
  fs.cpSync(dir, latest, { recursive: true })
  console.log(`完成：${summary.ok}/${summary.total} 成功 → ${dir}`)
  return data
}
