import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Run with node scripts/memory-interaction-check.mjs for an isolated app and Chrome.
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
      try {
        // Chrome briefly holds this file open while publishing its port on Windows.
        const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/)
        if (port && path && (await fetch(base)).ok) {
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
// Gesture regressions use real browser input against the mock garden.
const output = join(tmpdir(), 'memory-interaction-review')
mkdirSync(output, { recursive: true })
const check = (value, label) => {
  assert(value, label)
  console.log('PASS ' + label)
}
for (const [name, width, height, mobile] of [
  ['desktop', 1440, 900, false],
  ['phone', 393, 852, true],
  ['landscape', 852, 393, true],
]) {
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await page('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 })
  await page('Page.navigate', { url: base + '/?section=lanterns&mock=1&shot=1' })
  await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='come in')`)
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in').click()`,
  )
  await ev(`import('/scripts/memories-browser.js').then(m=>m.seedMemories())`)
  await until(`window.__walk?.pictures > 0 && window.__walk.seen.length > 0`)
  await wait(1800)
  const point = await ev(
    `window.__walk.seen.filter(p=>p.x>30&&p.x<innerWidth-30&&p.y>60&&p.y<innerHeight-100&&window.__walk.pick(p.x,p.y)===p.i).sort((a,b)=>b.i-a.i)[0]`,
  )
  check(!!point, name + ' has a visible selectable photograph')
  const down = async (p) =>
    mobile
      ? page('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: p.x, y: p.y, id: 1 }],
        })
      : page('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: p.x,
          y: p.y,
          button: 'left',
          clickCount: 1,
        })
  const up = async (p) =>
    mobile
      ? page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      : page('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: p.x,
          y: p.y,
          button: 'left',
          clickCount: 1,
        })
  const tap = async (p) => {
    await down(p)
    await wait(70)
    await up(p)
    await wait(120)
  }
  await tap(point)
  await until(`window.__walk.focused===${point.i} && window.__walk.focus>.99`)
  await wait(900)
  check(
    await ev(`!document.querySelector('.memory-viewer') && !window.__walk.open`),
    name + ' a tap approaches the pole without opening the full photograph',
  )
  const close = await ev(`window.__walk.seen.find(p=>p.i===${point.i})`)
  check(
    close.halfW > point.halfW * 1.2 && Math.abs(close.x - width / 2) < width * 0.12,
    name + ' the photograph is larger and centred',
  )
  let shot = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(output, name + '-close.png'), Buffer.from(shot.data, 'base64'))
  await tap(close)
  check(
    await ev(`!document.querySelector('.memory-viewer') && window.__walk.focused===${point.i}`),
    name + ' repeated taps keep the lantern environment',
  )
  await down(close)
  if (mobile)
    await page('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: close.x + 25, y: close.y + 25, id: 1 }],
    })
  else
    await page('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: close.x + 25,
      y: close.y + 25,
      button: 'left',
      buttons: 1,
    })
  await wait(550)
  await up({ x: close.x + 25, y: close.y + 25 })
  check(
    await ev(`!document.querySelector('.memory-viewer') && window.__walk.focused===${point.i}`),
    name + ' dragging cancels a hold without exiting the close-up',
  )
  await down(close)
  await wait(600)
  await until(`!!document.querySelector('.memory-original')`)
  await up(close)
  check(
    await ev(`window.__walk.focused===${point.i} && !!document.querySelector('.memory-viewer')`),
    name + ' holding opens the full image and release preserves the close-up',
  )
  shot = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(output, name + '-held.png'), Buffer.from(shot.data, 'base64'))
  await ev(`document.querySelector('.memory-close').click()`)
  await wait(400)
  check(
    await ev(
      `!document.querySelector('.memory-viewer') && window.__walk.focused===${point.i} && window.__walk.focus>.99`,
    ),
    name + ' closing the full image returns to the same framed photograph',
  )
  const away = await ev(
    `(()=>{for(let y=innerHeight*.3;y<innerHeight*.7;y+=35)for(let x=innerWidth*.15;x<innerWidth*.85;x+=35){if(window.__walk.pick(x,y)===null&&document.elementFromPoint(x,y)?.classList.contains('surface'))return{x,y}}})()`,
  )
  check(!!away, name + ' has empty scenery to step back into')
  await tap(away)
  const intermediate = await ev(`({focused:window.__walk.focused,amount:window.__walk.focus})`)
  check(
    intermediate.focused === null && intermediate.amount > 0 && intermediate.amount < 1,
    name + ' tapping away starts a smooth return ' + JSON.stringify(intermediate),
  )
  await until(`window.__walk.focus<.001`)
  check(
    await ev(`!document.querySelector('.memory-viewer')`),
    name + ' the wider view stays in the lantern environment',
  )
}
console.log('Captures: ' + output)
if (children.length) await call('Browser.close').catch(() => {})
socket.close()
children.forEach((child) => child.kill())
