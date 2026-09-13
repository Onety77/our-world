import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// node scripts/reply-focus-check.mjs starts an isolated local app and headless Chrome.
// Pass an agent-browser CDP URL to check an already running app on port 5173.
const children = []
let base = 'http://localhost:5173',
  endpoint = process.argv[2]
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
if (!endpoint) {
  base = 'http://localhost:5186'
  children.push(
    spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5186', '--strictPort'], {
      stdio: 'ignore',
      windowsHide: true,
    }),
  )
  const profile = mkdtempSync(join(tmpdir(), 'garden-reply-focus-'))
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
  const screen = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(tmpdir(), 'reply-focus-failed.png'), Buffer.from(screen.data, 'base64'))
  throw Error('Timed out: ' + expression + '\n' + await ev('document.body.innerText.slice(-1600)'))
}

await page('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
await page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await page('Page.navigate', { url: base + '/?section=stars&mock=1&shot=1' })
await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='come in')`)
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in').click()`)
await until(`!!document.querySelector('.said[data-age="0"]')`)
await wait(900)

const swipeReply = async () => {
  const p = await ev(`(()=>{const b=document.querySelector('.said[data-age="0"]').getBoundingClientRect();return {x:Math.min(innerWidth-35,b.right-10),y:b.top+b.height/2}})()`)
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] })
  for (let i=1;i<=6;i++) {
    await wait(16)
    await page('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:p.x-i*12, y:p.y, id:1 }] })
  }
  await page('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] })
  await wait(350)
}
const focused = () => ev(`document.activeElement===document.querySelector('.saying-field')`)
const text = () => ev(`document.querySelector('.saying-field').value`)
const check = (ok, label) => { assert(ok,label); console.log('PASS '+label) }

try {
  await swipeReply()
  check(await focused(), 'first swipe focuses the Stars composer')
  await page('Input.insertText', { text:'hello' })
  check(await text()==='hello', 'typing immediately after the swipe reaches the draft')

  await ev(`document.querySelector('.saying-field').setSelectionRange(2,2)`)
  await swipeReply()
  check(await focused(), 'replying again keeps the active cursor')
  await page('Input.insertText', { text:'X' })
  check(await text()==='heXllo', 'swiping preserves the existing draft and insertion position')

  await ev(`document.querySelector('.saying-field').blur()`)
  await swipeReply()
  check(await focused(), 'swiping the same reply target restores a blurred composer')
  await page('Input.insertText', { text:'Y' })
  check(await text()==='heXYllo', 'repeated reply accepts typing without an extra tap')

  await page('Emulation.setDeviceMetricsOverride', { width:393,height:520,deviceScaleFactor:1,mobile:true })
  await wait(250)
  check(await focused(), 'cursor survives the viewport shrinking for a keyboard')
  await page('Input.insertText', { text:'Z' })
  check(await text()==='heXYZllo', 'typing still reaches the field after the viewport changes')
} finally {
  socket.close()
  children.forEach(child=>child.kill())
}
