#!/usr/bin/env node
// 把 Aurobot 桥接模块装到本机 Aurobot 的模块目录（先装 Aurobot，再装这个）
// 用法：node scripts/install-aurabot-module.mjs [--uninstall] [--aurabot-data <dir>]
// 装完 Aurobot 会在 3 秒内自动热加载（模块管理会检查文件变化）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'integrations', 'aurabot')
const args = process.argv.slice(2)
const uninstall = args.includes('--uninstall')
const dataIdx = args.indexOf('--aurabot-data')
const arauDataDir = dataIdx > 0 ? args[dataIdx + 1] : path.join(os.homedir(), '.dsh', 'plugins-data', 'aurabot')
const modulesDir = path.join(arauDataDir, 'modules')
const target = path.join(modulesDir, 'lexmount-site')

function main() {
  if (uninstall) {
    if (fs.existsSync(target)) {
      const bak = path.join(arauDataDir, 'backups', `lexmount-site-${Date.now()}`)
      fs.mkdirSync(path.dirname(bak), { recursive: true })
      fs.cpSync(target, bak, { recursive: true })
      fs.rmSync(target, { recursive: true, force: true })
      console.log(`已卸载 lexmount-site（备份在 ${bak}）`)
    } else console.log('没有装过 lexmount-site')
    return
  }
  if (!fs.existsSync(modulesDir)) {
    console.error(`找不到 Aurobot 模块目录：${modulesDir}\n先确认 Aurobot 插件已经装好并启动过。`)
    process.exit(1)
  }
  if (!fs.existsSync(SRC)) throw new Error('缺少 integrations/aurabot/index.mjs')
  if (fs.existsSync(target)) {
    const bak = path.join(arauDataDir, 'backups', `lexmount-site-${Date.now()}`)
    fs.mkdirSync(path.dirname(bak), { recursive: true })
    fs.cpSync(target, bak, { recursive: true })
    fs.rmSync(target, { recursive: true, force: true })
    console.log(`旧版本已备份到 ${bak}`)
  }
  fs.mkdirSync(target, { recursive: true })
  fs.copyFileSync(path.join(SRC, 'index.mjs'), path.join(target, 'index.mjs'))
  console.log(`已安装 Aurobot 桥接模块：${target}`)
  console.log('Aurobot 会在 3 秒内自动热加载；面板「平台 → 肥鱼逛网·站点管家」可看到设置项。')
  console.log('注意：需要先启动 feiyu-patrol 服务（node src/cli.mjs serve），否则小肥鱼调用会提示连不上。')
}

main()
