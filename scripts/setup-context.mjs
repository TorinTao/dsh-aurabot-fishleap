#!/usr/bin/env node
// 引导式创建「登录 Context」：开一个云端浏览器登录窗口 → 扫码 → 关窗即保存登录态
// 用法：node scripts/setup-context.mjs <zhihu|xiaohongshu|douban|tieba|netease|toutiao> [--context-id 已有ID]
// 完成后会把 Context ID 写进 data/settings.json
import readline from 'node:readline'
import { browserJson, openUrl, defaultBrowserBin } from '../src/plugin/lib/lexmount.mjs'
import { saveSettings, loadSettings } from '../src/host.mjs'

const SITES = {
  zhihu: { name: '知乎', ctxKey: 'zhihuContextId', loginUrl: 'https://www.zhihu.com/signin' },
  xiaohongshu: { name: '小红书', ctxKey: 'xhsContextId', loginUrl: 'https://www.xiaohongshu.com/explore' },
  douban: { name: '豆瓣', ctxKey: 'doubanContextId', loginUrl: 'https://accounts.douban.com/passport/login' },
  tieba: { name: '贴吧', ctxKey: 'tiebaContextId', loginUrl: 'https://tieba.baidu.com/' },
  netease: { name: '网易云音乐', ctxKey: 'neteaseContextId', loginUrl: 'https://music.163.com/#/login?target=/discover' },
  toutiao: { name: '今日头条', ctxKey: 'toutiaoContextId', loginUrl: 'https://www.toutiao.com/' },
}

const siteKey = process.argv[2]
const ctxArgIdx = process.argv.indexOf('--context-id')
const givenCtx = ctxArgIdx > 0 ? process.argv[ctxArgIdx + 1] : ''

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a) }))
}

async function main() {
  if (!SITES[siteKey]) {
    console.error('用法：node scripts/setup-context.mjs <zhihu|xiaohongshu|douban|tieba|netease|toutiao> [--context-id ID]')
    process.exit(1)
  }
  const site = SITES[siteKey]
  const bin = defaultBrowserBin()
  console.log(`将浏览器定位为：${bin}`)

  let ctxId = givenCtx || String(loadSettings()[site.ctxKey] || '')
  if (!ctxId) {
    const created = await browserJson(['context', 'create', '--description', `lexmount-patrol ${site.name} 登录`], { bin })
    ctxId = created.context_id
    console.log(`新建 Context：${ctxId}`)
  } else {
    console.log(`复用 Context：${ctxId}`)
  }

  const sess = await browserJson(['session', 'create', '--context-id', ctxId, '--context-mode', 'read_write', '--description', 'lexmount-patrol 登录窗口', '--timeout-seconds', '1800'], { bin })
  console.log(`会话：${sess.session_id}`)
  await openUrl(sess.session_id, site.loginUrl, { bin })
  console.log(`\n请打开下面的链接，用手机扫码/完成登录（窗口 30 分钟内有效）：\n${sess.inspect_url}\n`)
  await ask('登录完成后按回车，我会关闭窗口并保存登录态…')

  // 关窗即持久化 Context
  await browserJson(['session', 'close', '--session-id', sess.session_id], { bin, timeoutMs: 120_000 })
  saveSettings({ [site.ctxKey]: ctxId })
  console.log(`已保存 ${site.name} 的 Context → data/settings.json（${site.ctxKey} = ${ctxId}）`)
  console.log('用 node src/cli.mjs status 检查，再跑 node src/cli.mjs brief 验证。')
}

main().catch((e) => { console.error('失败：' + (e.message || e)); process.exit(1) })
