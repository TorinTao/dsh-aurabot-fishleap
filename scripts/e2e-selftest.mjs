// 端到端能力测试：让小肥鱼自己 添加 → 使用 → 删除 网站（走 Aurobot 真实工具通道）
const TOOL = 'http://127.0.0.1:60575/aurabot/api/modules/tool'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(name, args = {}) {
  const r = await fetch(TOOL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ as: 'owner', kind: 'private', name, args }),
    signal: AbortSignal.timeout(240000),
  })
  const j = await r.json()
  return j.result || { ok: false, message: JSON.stringify(j).slice(0, 200) }
}
function show(title, res) {
  const msg = String(res.message || '')
  console.log(`\n### ${title}\n${res.ok ? '✅' : '❌'}  ${msg.slice(0, 600)}`)
  return res
}

// 0) 先看基线
const base = await call('lx_site_list')
show('基线：站点列表', base)

// 1) 添加网站
const add = await call('lx_site_add', { name: '少数派', home: 'https://sspai.com/', loginUrl: 'https://sspai.com/' })
show('添加网站「少数派」', add)

// 2) 打开登录窗口（拿二维码）
const start = await call('lx_login_start', { site: '少数派' })
show('打开登录窗口（返回二维码）', start)

// 3) 取消（这个站不需要登录，先关掉窗口释放 Context）
await sleep(2000)
const cancel = await call('lx_login_cancel', { site: '少数派' })
show('取消登录窗口', cancel)

// 4) 使用：读这个站
await sleep(9000)
const read = await call('lx_site_read', { site: '少数派', query: 'https://sspai.com/' })
show('读取自定义站「少数派」', read)

// 5) 读一个已有站点（知乎），验证「消费」能力
await sleep(9000)
const readZhihu = await call('lx_site_read', { site: 'zhihu', query: 'https://www.zhihu.com/question/19550225' })
show('读取已有站「知乎」', readZhihu)

// 6) 防呆：重复添加同名
const dup = await call('lx_site_add', { name: '少数派', home: 'https://sspai.com/' })
show('防呆：重复添加同名站点（应失败）', dup)

// 7) 防呆：删内置站
const delBuiltin = await call('lx_site_remove', { site: 'zhihu' })
show('防呆：删除内置站「知乎」（应失败）', delBuiltin)

// 8) 删除自定义站
const del = await call('lx_site_remove', { site: '少数派' })
show('删除自定义站「少数派」', del)

// 9) 确认删除
const after = await call('lx_site_list')
show('删除后的站点列表', after)
