// 项目定名：肥鱼巡网（feiyu-patrol）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = process.platform === 'win32' ? root.replace(/^\//, '') : root

const REPLACEMENTS = [
  ['feiyu-patrol', 'feiyu-patrol'],
  ['肥鱼巡网 · 多平台巡检简报（feiyu-patrol）', '肥鱼巡网（feiyu-patrol）'],
  ['肥鱼巡网 · 多平台巡检简报', '肥鱼巡网 · 多平台巡检简报'],
  ['肥鱼巡网 · 多平台巡检', '肥鱼巡网 · 多平台巡检'],
  ['# 肥鱼巡网 · 项目进度', '# 肥鱼巡网 · 项目进度'],
  ['肥鱼巡网', '肥鱼巡网'],
  ['肥鱼逛网·站点管家', '肥鱼逛网·站点管家'],
]

const SKIP = /(^|[\\/])(\.git|data|out|node_modules)([\\/]|$)/
const TEXT = /\.(md|mjs|js|json|html|ps1|bat|sh|txt|yml|yaml)$/i

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (SKIP.test(p)) continue
    if (ent.isDirectory()) walk(p, out)
    else if (TEXT.test(ent.name)) out.push(p)
  }
  return out
}

let changed = 0
for (const file of walk(ROOT)) {
  let c = fs.readFileSync(file, 'utf8')
  const before = c
  for (const [a, b] of REPLACEMENTS) c = c.split(a).join(b)
  if (c !== before) {
    fs.writeFileSync(file, c, 'utf8')
    changed++
    console.log('updated', path.relative(ROOT, file))
  }
}
console.log(`done, ${changed} files changed, root=${ROOT}`)
