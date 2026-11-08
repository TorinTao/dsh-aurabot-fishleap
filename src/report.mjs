// 简报渲染：Markdown + 自包含 HTML
export function excerptOf(text, n = 2400) {
  const t = String(text || '').replace(/\r/g, '')
  if (t.length <= n) return t
  return t.slice(0, n) + '\n……（截断）'
}

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fmtTime = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function renderMarkdown(data) {
  const { meta, summary, items } = data
  const lines = [
    `# 多平台热点巡检简报`,
    ``,
    `- 生成时间：${fmtTime(meta.generatedAt)}`,
    `- 方式：Lexmount 云浏览器（登录态持久 Context）`,
    `- 结果：**${summary.ok}/${summary.total} 站点成功**`,
    `- 原始数据：\`result.json\`；来源清单：\`sources.json\`；网页版：\`brief.html\``,
    ``,
    `## 巡检结果`,
    ``,
    `| 站点 | 结果 | 字数 | 耗时 | 是否需登录 |`,
    `|---|---|---|---|---|`,
    ...items.map((x) => `| ${x.name} | ${x.ok ? '✅ 成功' : '❌ 失败'} | ${x.chars} | ${(x.ms / 1000).toFixed(1)}s | ${x.requiresLogin ? '是' : '否（匿名）'} |`),
    ``,
    `## 各站点内容（节选）`,
    ``,
  ]
  for (const x of items) {
    lines.push(`### ${x.name}`, ``)
    lines.push(`- 来源：<${x.home}>`, `- 读取方式：${x.how}（工具 \`${x.tool}\`）`, `- 结果：${x.ok ? `${x.chars} 字，${(x.ms / 1000).toFixed(1)} 秒` : `失败：${x.error}`}`, ``)
    if (x.excerpt) lines.push('```text', x.excerpt, '```', '')
  }
  lines.push(`## 复现`, ``, '```bash', 'node src/cli.mjs brief', '```', '')
  return lines.join('\n')
}

export function renderHtml(data) {
  const { meta, summary, items } = data
  const cards = items.map((x) => `
    <section class="card ${x.ok ? '' : 'bad'}">
      <header>
        <h2>${esc(x.name)}</h2>
        <span class="badge ${x.ok ? 'ok' : 'fail'}">${x.ok ? `✅ ${x.chars} 字 / ${(x.ms / 1000).toFixed(1)}s` : '❌ 失败'}</span>
      </header>
      <p class="meta"><a href="${esc(x.home)}" target="_blank" rel="noreferrer">${esc(x.home)}</a> · ${esc(x.how)} · ${x.requiresLogin ? '需要登录 Context' : '匿名可读'}</p>
      ${x.ok ? `<details><summary>查看内容（${x.chars} 字）</summary><pre>${esc(x.excerpt)}</pre></details>` : `<pre class="err">${esc(x.error)}</pre>`}
    </section>`).join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>多平台热点巡检简报 · ${fmtTime(meta.generatedAt)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f7f8; --fg:#1f2328; --muted:#6b7280; --card:#fff; --line:#e5e7eb; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --fg:#e6e6e6; --muted:#9aa0a6; --card:#171a21; --line:#2a2f3a; --accent:#7aa2ff; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 20px 64px; background:var(--bg); color:var(--fg); font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 8px; }
  .summary { color: var(--muted); margin-bottom: 24px; }
  .summary b { color: var(--fg); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin: 14px 0; }
  .card header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .card h2 { font-size: 17px; margin: 0; }
  .badge { font-size: 12px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
  .badge.ok { color: #16a34a; border-color: #16a34a55; }
  .badge.fail { color: #dc2626; border-color: #dc262655; }
  .meta { color: var(--muted); font-size: 13px; margin: 8px 0 0; word-break: break-all; }
  .meta a { color: var(--accent); text-decoration: none; }
  details { margin-top: 12px; }
  summary { cursor: pointer; color: var(--accent); font-size: 14px; }
  pre { background: rgba(127,127,127,.08); border-radius: 10px; padding: 12px 14px; overflow:auto; max-height: 340px; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
  pre.err { color: #dc2626; }
  footer { color: var(--muted); font-size: 12px; margin-top: 28px; }
</style>
</head>
<body>
<main>
  <h1>多平台热点巡检简报</h1>
  <div class="summary">
    生成于 <b>${fmtTime(meta.generatedAt)}</b> · 通过 <b>Lexmount 云浏览器</b>读取 ${meta.targets} 个站点 ·
    <b>${summary.ok}/${summary.total}</b> 成功
  </div>
  ${cards}
  <footer>数据为页面正文节选，仅供核对；完整结果见 result.json / sources.json。复现：node src/cli.mjs brief</footer>
</main>
</body>
</html>`
}
