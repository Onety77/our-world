import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// npm run hollow starts an isolated local app and headless Chrome.
// Pass an agent-browser CDP URL to check an already running app on port 5173.
const children = []
let base = 'http://localhost:5173',
  endpoint = process.argv[2]
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
if (!endpoint) {
  base = 'http://localhost:5178'
  children.push(
    spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5178', '--strictPort'], {
      stdio: 'ignore',
      windowsHide: true,
    }),
  )
  const profile = mkdtempSync(join(tmpdir(), 'garden-hollow-check-'))
  const chrome = process.env.CHROME ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  children.push(
    spawn(
      chrome,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        '--user-data-dir=' + profile,
        '--no-first-run',
        '--no-default-browser-check',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true },
    ),
  )
  process.on('exit', () => children.forEach((child) => child.kill()))
  for (let i = 0; i < 100; i++) {
    const portFile = join(profile, 'DevToolsActivePort')
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/)
      try {
        if ((await fetch(base)).ok) {
          endpoint = 'ws://127.0.0.1:' + port + path
          break
        }
      } catch {}
    }
    await delay(100)
  }
  if (!endpoint)
    throw Error('The test server or Chrome did not start. Set CHROME to your browser executable.')
}
const socket = new WebSocket(endpoint)
await new Promise((r) => socket.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
socket.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error ? p.reject(m.error) : p.resolve(m.result)
  }
})
const call = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    socket.send(JSON.stringify({ id: n, method, params, sessionId }))
  })
const { targetInfos } = await call('Target.getTargets')
const target =
  targetInfos.find((t) => t.type === 'page' && t.url.startsWith(base)) ??
  targetInfos.find((t) => t.type === 'page')
const { sessionId } = await call('Target.attachToTarget', {
  targetId: target.targetId,
  flatten: true,
})
const page = (method, params) => call(method, params, sessionId)
const ev = async (expression) => {
  const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description)
  return r.result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (expression) => {
  for (let i = 0; i < 120; i++) {
    if (await ev(expression)) return
    await wait(100)
  }
  throw Error('Timed out: ' + expression)
}
let touching = false
const click = async (selector) => {
  if (touching) {
    const point = await ev(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`,
    )
    await page('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, id: 1 }],
    })
    await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else await ev(`document.querySelector(${JSON.stringify(selector)}).click()`)
  await wait(220)
}
const check = (value, label) => {
  assert(value, label)
  console.log('PASS ' + label)
}
const output = join(tmpdir(), 'hollow-review')
mkdirSync(output, { recursive: true })
const capture = async (name) => {
  await wait(350)
  const shot = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(output, name + '.png'), Buffer.from(shot.data, 'base64'))
}
for (const [name, width, height, mobile] of [
  ['desktop', 1440, 900, false],
  ['phone', 393, 852, true],
  ['landscape', 852, 393, true],
]) {
  touching = mobile
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await page('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 })
  await page('Page.navigate', { url: base + '/?section=hollow&mock=1&shot=1' })
  await wait(1000)
  await until(
    `!!document.querySelector('.arrival button') || !!document.querySelector('.hollow-hub') || [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='come in')`,
  )
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in')?.click()`,
  )
  await until(`!!document.querySelector('.hollow-library')`)
  check(
    await ev(
      `document.querySelectorAll('.hollow-game-tile').length===3 && document.querySelector('.hollow-hub').scrollWidth<=innerWidth+1`,
    ),
    name + ' library shows three games without horizontal overflow',
  )
  await capture(name + '-library')
  await click('.hollow-game-tile.ember-rally')
  await until(`!!document.querySelector('.race-setup')`)
  check(
    await ev(
      `document.querySelectorAll('.race-track-tabs button').length===4 && document.querySelectorAll('.race-mode-list button').length===3`,
    ),
    name + ' one click opens all tracks and race modes',
  )
  await click('.race-track-tabs button:nth-child(2)')
  check(
    await ev(
      `document.querySelector('.race-track-caption h2').textContent==='The Moonbreak' && !!document.querySelector('.race-route svg path').getAttribute('d')`,
    ),
    name + ' track selection updates artwork and actual route',
  )
  await capture(name + '-race-setup')
  check(
    await ev(`document.querySelector('.race-setup').scrollWidth<=innerWidth+1`),
    name + ' race setup has no horizontal overflow',
  )
  if (mobile)
    check(
      await ev(
        `document.querySelector('.race-launch').getBoundingClientRect().bottom<=innerHeight && document.querySelector('.race-launch').getBoundingClientRect().top>0`,
      ),
      name + ' start action stays visible',
    )
  await click('.race-mode-list button:nth-child(2)')
  check(
    await ev(`import('/scripts/hollow-browser.js').then(m=>!m.inspectRace().solo)`),
    name + ' challenge uses the shared round',
  )
  await click('.race-mode-list button:first-child')
  check(
    await ev(`import('/scripts/hollow-browser.js').then(m=>m.inspectRace().solo)`),
    name + ' solo uses a separate round',
  )
  await click('.race-launch')
  await until(`!!document.querySelector('.rally-running')`)
  check(
    await ev(
      `import('/scripts/hollow-browser.js').then(m=>{const s=m.inspectRace();return s.stage==='moonbreak'&&s.solo&&s.ghost&&!s.wheel})`,
    ),
    name + ' starts the selected road with its spirit',
  )
  if (mobile && height > width) {
    await page('Emulation.setDeviceMetricsOverride', {
      width: height,
      height: width,
      deviceScaleFactor: 1,
      mobile,
    })
    await wait(400)
  }
  await click('.rally-leave')
  await until(`!!document.querySelector('.rally-paused')`)
  await click('.rally-paused .rally-actions button:last-child')
  await until(`!!document.querySelector('.race-setup')`)
  check(
    await ev(`document.querySelector('.race-track-caption h2').textContent==='The Moonbreak'`),
    name + ' leaving the road keeps the selected track',
  )
  if (mobile && height > width)
    await page('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    })
  await click('.race-setup-top button:first-child')
  await until(`!!document.querySelector('.hollow-library')`)
  await click('.hollow-game-tile.scattergories')
  check(
    await ev(`document.querySelectorAll('.hollow-modes > button').length===1`),
    name + ' Scattergories offers only live play',
  )
  await click('.hollow-top button')
  await click('.hollow-game-tile.word-duel')
  check(
    await ev(`document.querySelectorAll('.hollow-modes > button').length===3`),
    name + ' Word Duel offers daily, practice, and live modes',
  )
  await capture(name + '-word-modes')
  await click('.hollow-top button')
  await click('.hollow-game-tile.ember-rally')
  await until(`!!document.querySelector('.race-setup')`)
  await ev('history.back()')
  await until(`!!document.querySelector('.hollow-library')`)
  check(await ev(`location.href.startsWith(${JSON.stringify(base)})`), name + ' browser Back returns to the Hollow without leaving the site')
}
// Presence and locks are staged only through the mock provider.
await click('.hollow-game-tile.ember-rally')
await until(`!!document.querySelector('.race-setup')`)
await ev(`window.__local.setPresenceFor('cool',{online:false,racing:''})`)
await wait(200)
await click('.race-mode-list button:last-child')
check(
  await ev(
    `document.querySelector('.race-launch').disabled && document.querySelector('.race-session-note').textContent.includes('online')`,
  ),
  'offline live mode explains availability and cannot start',
)
await ev(
  `window.__local.setPresenceFor('cool',{online:true,racing:'1788890000000.harmattan@1788890000100'})`,
)
await wait(300)
check(
  await ev(
    `document.querySelector('.race-track-caption h2').textContent==='The Harmattan' && [...document.querySelectorAll('.race-track-tabs button')].filter(b=>b.disabled).length===3`,
  ),
  'joining preserves the invited track and prevents a different selection',
)
await click('.race-launch')
await until(`!!document.querySelector('.wheel')`)
check(
  await ev(
    `import('/scripts/hollow-browser.js').then(m=>m.inspectRace().room==='1788890000000.harmattan')`,
  ),
  'joining strips readiness metadata and keeps the existing room',
)
await capture('live-room')
await click('.wheel .rally-actions button:first-child')
await until(`!!document.querySelector('.rally-running')`)
check(
  await ev(
    `import('/scripts/hollow-browser.js').then(m=>{const s=m.inspectRace();return s.wheel&&s.stage==='harmattan'})`,
  ),
  'both ready starts the invited live track',
)
await ev(`import('/scripts/hollow-browser.js').then(m=>m.leaveGame())`)
await wait(250)
await ev(
  `window.__local.setPresenceFor('cool',{online:true,racing:''});window.__local.setLocks({'road:rootway':'both'})`,
)
await wait(150)
await click('.hollow-game-tile.ember-rally')
await until(`!!document.querySelector('.race-setup')`)
check(
  await ev(`document.querySelector('.race-launch').disabled`),
  'a locked road remains visible and cannot start',
)
await ev(`window.__local.setLocks({})`)
await ev(`import('/scripts/hollow-browser.js').then(m=>m.leaveGame())`)
console.log('Captures: ' + output)
if (children.length) await call('Browser.close').catch(() => {})
socket.close()
children.forEach((child) => child.kill())
