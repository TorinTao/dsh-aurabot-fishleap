// 独立运行器：把 Lexmount 插件挂到一个最小宿主上（不依赖 Aurobot / DSH）
// 提供：工具列表、工具调用、设置读写、数据目录
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT_DIR = ROOT
export const DATA_DIR = path.join(ROOT, 'data')
export const OUT_DIR = path.join(ROOT, 'out')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

export function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) } catch { return {} }
}
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function createApp() {
  const state = { tools: [], rules: [], commands: [], routes: new Map() }
  const api = {
    id: 'feiyu-patrol',
    source: 'standalone',
    version: '0.1.0',
    apiVersion: 1,
    name: '肥鱼巡网',
    description: '基于 Lexmount 云浏览器的多平台只读巡检',
    log: {
      info: (...a) => console.error('[info]', ...a),
      warn: (...a) => console.error('[warn]', ...a),
      error: (...a) => console.error('[err]', ...a),
    },
    config: () => ({}),
    settings: () => loadSettings(),
    saveSettings: async (patch) => saveSettings(patch),
    core: {
      http: {
        body: async (req) => (req && req.body) || {},
        query: (req) => (req && req.query) || {},
        send: () => {},
      },
      hub: { turnSendersAllOwner: () => true },
    },
    tool: (fn) => state.tools.push(fn),
    defineTool: (def) => def,
    rule: (fn) => state.rules.push(fn),
    command: (cmd) => state.commands.push(cmd),
    route: (p, handler) => state.routes.set(p, handler),
    on: () => () => {},
    dataDir: (...p) => [DATA_DIR, ...p].join('/'),
    dir: '.',
    lazy: () => ({}),
  }
  const mod = (await import('./plugin/index.mjs')).default
  mod.setup(api)
  const build = state.tools[0]
  const tools = build ? build({ chat: { kind: 'private', chatId: 'owner' }, sessionId: 'standalone', level: 'full' }) : []
  const byName = new Map(tools.map((t) => [t.name, t]))
  return {
    tools,
    commands: state.commands,
    rules: state.rules,
    routes: state.routes,
    settings: loadSettings,
    async call(name, args = {}) {
      const tool = byName.get(name)
      if (!tool) throw new Error(`没有工具：${name}`)
      return await tool.execute(args)
    },
  }
}
