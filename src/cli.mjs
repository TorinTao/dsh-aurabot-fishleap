#!/usr/bin/env node
// feiyu-patrol CLI：把 Lexmount 云浏览器能力当成一个独立工具用
// 用法：
//   node src/cli.mjs tools            列出插件提供的工具
//   node src/cli.mjs status           看登录 Context 与今日用量
//   node src/cli.mjs sites            本次巡检的站点清单
//   node src/cli.mjs brief            跑一次巡检，产出 out/<时间>/ 简报
//   node src/cli.mjs read <工具名> '{...参数}'   直接调一个工具
import { createApp } from './host.mjs'
import { TARGETS } from './targets.mjs'
import { runBrief } from './brief.mjs'

const [cmd, ...rest] = process.argv.slice(2)

async function main() {
  if (!cmd || cmd === 'help' || cmd === '-h') {
    console.log(`feiyu-patrol · 基于 Lexmount 云浏览器的多平台巡检

用法：
  node src/cli.mjs tools                          列出工具
  node src/cli.mjs status                         看 Context / 用量
  node src/cli.mjs sites                          巡检站点清单
  node src/cli.mjs brief                          跑一次巡检 → out/<时间>/
  node src/cli.mjs compare                        匿名抓取 vs 云浏览器 对照实验
  node src/cli.mjs serve [端口]                    启动本地 HTTP 服务（面板 + API，默认 4571）
  node src/cli.mjs read <tool> '<json 参数>'       直接调工具
  node src/cli.mjs login <站点>                    开登录窗口（扫码后运行脚本保存 Context）
`)
    return
  }
  const app = await createApp()
  if (cmd === 'tools') {
    for (const t of app.tools) console.log(`- ${t.name}: ${t.description}`)
    return
  }
  if (cmd === 'status') {
    const res = await app.call('lx_status', {})
    console.log(res.message)
    return
  }
  if (cmd === 'sites') {
    for (const t of TARGETS) console.log(`- ${t.key} | ${t.name} | ${t.requiresLogin ? '需登录' : '匿名'} | ${t.home}`)
    return
  }
  if (cmd === 'brief') {
    const outDir = rest[0] || undefined
    await runBrief(outDir ? { outDir } : {})
    return
  }
  if (cmd === 'compare') {
    const { runCompare } = await import('./compare.mjs')
    await runCompare()
    return
  }
  if (cmd === 'serve') {
    if (rest[0] && /^\d+$/.test(rest[0])) process.env.LEXMOUNT_API_PORT = String(rest[0])
    await import('./server.mjs')
    return
  }
  if (cmd === 'read') {
    const name = rest[0]
    const args = rest[1] ? JSON.parse(rest[1]) : {}
    const res = await app.call(name, args)
    console.log(res.message)
    return
  }
  if (cmd === 'login') {
    const site = rest[0] || ''
    const res = await app.call('lx_login', { site })
    console.log(res.message)
    return
  }
  console.error(`未知命令：${cmd}（用 node src/cli.mjs help）`)
  process.exit(1)
}

main().catch((e) => {
  console.error('失败：' + (e.message || e))
  process.exit(1)
})
