import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// npm run clearing starts an isolated local app and headless Chrome.
// Pass an agent-browser CDP URL to check an already running app on port 5186.
const children = []
let base = 'http://localhost:5186',
  endpoint = process.argv[2]
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
if (!endpoint) {
  base = 'http://localhost:5187'
  children.push(
    spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5187', '--strictPort'], {
      stdio: 'ignore',
      windowsHide: true,
    }),
  )
  const profile = mkdtempSync(join(tmpdir(), 'garden-clearing-check-'))
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
const press = async (key, repeat = false) => {
  const codes = {
    Enter: 13,
    Escape: 27,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Tab: 9,
  }
  await page('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: key,
    windowsVirtualKeyCode: codes[key],
    autoRepeat: repeat,
  })
  await page('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: key,
    windowsVirtualKeyCode: codes[key],
  })
  await wait(160)
}
const check = (value, label) => {
  assert(value, label)
  console.log('PASS ' + label)
}
const output = join(tmpdir(), 'clearing-review')
mkdirSync(output, { recursive: true })
const capture = async (name) => {
  await wait(350)
  const shot = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(output, name + '.png'), Buffer.from(shot.data, 'base64'))
}

const errors = []
socket.addEventListener('message', (event) => {
  const m = JSON.parse(event.data)
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
})
await page('Runtime.enable')
async function clickText(text) {
  const selector = await ev(
    `(()=>{const buttons=[...document.querySelectorAll('.clearing-ui button')];const found=buttons.find(b=>b.textContent.trim().replace(/^· /,'')===${JSON.stringify(text)});if(!found)throw Error('Missing button: '+${JSON.stringify(text)});found.setAttribute('data-test-target','');return '[data-test-target]';})()`,
  )
  await click(selector)
  await ev(`document.querySelector('[data-test-target]')?.removeAttribute('data-test-target')`)
}
const fill = async (selector, value) => {
  await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`)
  await page('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  })
  await page('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  })
  await page('Input.insertText', { text: value })
}
const storage = () => ev(`JSON.parse(localStorage.getItem('garden:clearing:v1'))`)
async function waitForEntry() {
  await wait(500)
  await until(
    `(()=>{document.querySelector('.arrival button')?.click();const clearing=document.querySelector('.clearing-ui');return !!clearing && getComputedStyle(clearing).visibility==='visible'})()`,
  )
}
try {
  await page('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page('Page.navigate', { url: base + '/?section=clearing&mock=1&shot=1' })
  await until(
    `!!document.querySelector('.arrival button') || !!document.querySelector('.clearing-ui')`,
  )
  await ev(`localStorage.removeItem('garden:clearing:v1');localStorage.setItem('garden:me','warm')`)
  await page('Page.reload')
  await waitForEntry()
  await until(
    `!!document.querySelector('.arrival button') || !!document.querySelector('.clearing-ui')`,
  )
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in')?.click()`,
  )
  await until(`!!document.querySelector('.clearing-adopt-invitation button')`)
  await capture('desktop-first-visit')
  await click('.clearing-adopt-invitation button')
  await fill('#companion-name', 'Pip')
  await press('Tab')
  await press('ArrowRight')
  await press('Enter')
  check(
    await ev(
      `document.querySelector('.clearing-coats button:nth-child(2)').getAttribute('aria-pressed')==='true'`,
    ),
    'keyboard selects a coat',
  )
  await click('.clearing-adoption button[type=submit]')
  await until(`!!document.querySelector('.clearing-paths')`)
  check((await storage()).companions.warm.name === 'Pip', 'adoption saves the name')
  check(
    await ev(`document.querySelectorAll('.clearing-paths>button').length===5`),
    'five complete learning paths',
  )
  await capture('desktop-home')
  await click('.clearing-paths>button')
  await press('Enter')
  await until(`!!document.querySelector('.clearing-activity')`)
  for (const [i, meaning, words] of [
    [0, 'Hello', 'Hola'],
    [1, 'Thank you', 'Gracias'],
    [2, 'See you later', 'Hasta luego'],
  ]) {
    await clickText('Let me try remembering →')
    if (i === 0) await clickText('Thank you')
    await clickText(meaning)
    await clickText('Bring back the words →')
    await fill('#clearing-answer', words)
    await press('Enter')
    await clickText(i === 2 ? 'Keep this practice →' : 'Next phrase →')
  }
  await until(
    `document.querySelector('.clearing-finished')?.textContent.includes('You brought something back.')`,
  )
  let kept = await storage()
  check(
    kept.practices.length === 1 && kept.practices[0].recall[0].correct === false,
    'wrong retrieval stays recorded after a correct retry',
  )
  check(
    kept.companions.warm.practiceDays.length === 1 && kept.discoveries.length === 0,
    'practice grows the pet without automatically sharing answers',
  )
  await fill('#clearing-discovery', 'We can say hasta luego to each other tonight.')
  await clickText('Leave this discovery ↗')
  await until(
    `document.querySelector('.clearing-share')?.textContent.includes('Left in our discoveries')`,
  )
  check((await storage()).discoveries.length === 1, 'explicit discovery sharing persists')
  await capture('desktop-completed')
  await clickText('Back to the clearing →')
  await click('.clearing-paths>button:nth-of-type(4)')
  await click('.clearing-lessons>button')
  const box = await ev(
    `(()=>{const e=document.querySelector('.clearing-paper');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`,
  )
  await page('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: box.x + 40,
    y: box.y + 50,
    button: 'left',
    clickCount: 1,
  })
  for (let i = 1; i < 18; i++)
    await page('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x + 40 + i * 12,
      y: box.y + 50 + i * 5,
      button: 'left',
      buttons: 1,
    })
  await page('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: box.x + 244,
    y: box.y + 135,
    button: 'left',
    clickCount: 1,
  })
  await fill('#drawing-reflection', 'The line is steadier when I look at the destination.')
  await press('Escape')
  check(
    await ev(`!!document.querySelector('.clearing-pause')`),
    'Escape from a text field pauses the lesson',
  )
  await clickText('Keep going →')
  check(
    await ev(`document.querySelectorAll('.clearing-paper polyline').length===1`),
    'pausing preserves a drawing',
  )
  await capture('desktop-drawing')
  await clickText('Keep this study →')
  await until(`!!document.querySelector('.clearing-share')`)
  kept = await storage()
  check(
    kept.practices.length === 2 && kept.companions.warm.practiceDays.length === 1,
    'a second practice on the same day does not farm pet growth',
  )
  check(JSON.parse(kept.practices[1].drawing)[0].length > 4, 'real pointer strokes are saved')
  await clickText('Back to the clearing →')
  await click('.clearing-paths>button:nth-of-type(5)')
  await click('.clearing-lessons>button')
  await clickText('My turn →')
  await until(`document.querySelector('.clearing-count')?.textContent.includes('Your turn')`)
  const tappingStarted=Date.now()
  for (let i = 0; i < 8; i++) {
    await wait(Math.max(0,tappingStarted+i*750-Date.now()))
    await page('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    })
    await page('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    })
  }
  await until(`document.querySelector('.clearing-count')?.textContent.includes('taps in time')`)
  check(
    await ev(`parseInt(document.querySelector('.clearing-count').textContent)>=6`),
    'keyboard rhythm taps are scored against the beat',
  )
  await capture('desktop-rhythm')
  await clickText('Keep this practice →')
  await until(`!!document.querySelector('.clearing-share')`)
  await clickText('Back to the clearing →')
  for (const [name, width, height, mobile] of [
    ['phone', 393, 852, true],
    ['landscape', 852, 393, true],
  ]) {
    touching = mobile
    await page('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    })
    await page('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 })
    await ev(`document.querySelector('.clearing-ui').scrollTop=0`)
    await capture(name + '-home')
    check(
      await ev(`document.querySelector('.clearing-ui').scrollWidth<=innerWidth+1`),
      name + ' has no horizontal overflow',
    )
    await click('.clearing-paths>button:nth-of-type(2)')
    await click('.clearing-lessons>button')
    check(
      await ev(`document.querySelector('.clearing-phrase').textContent.includes('你好')`),
      name + ' touch opens Mandarin',
    )
    await capture(name + '-mandarin')
    await clickText('Let me try remembering →')
    await clickText('Hello')
    await clickText('Bring back the words →')
    await fill('#clearing-answer', 'ni hao')
    await press('Enter')
    check(
      await ev(`document.querySelector('.clearing-feedback').classList.contains('is-correct')`),
      name + ' accepts unmarked pinyin',
    )
    await click('.clearing-top button[data-back]')
    await clickText('Leave this practice')
    await click('.clearing-top button[data-back]')
  }
  touching = false
  await page('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page('Emulation.setTouchEmulationEnabled', { enabled: false })
  await page('Page.reload')
  await waitForEntry()
  await until(
    `!!document.querySelector('.clearing-paths') || !!document.querySelector('.arrival button')`,
  )
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in')?.click()`,
  )
  await until(`!!document.querySelector('.clearing-paths')`)
  check(
    await ev(`document.querySelector('.clearing-pet-name').textContent==='Pip'`),
    'companion survives a page reload',
  )
  // Reject only the actual practice store write, allowing the independent
  // recovery copy to persist. A reload restores the normal Storage prototype.
  await click('.clearing-paths>button:nth-of-type(4)')
  await click('.clearing-lessons>button')
  await clickText('I’m using paper')
  await fill('#drawing-reflection', 'I noticed the angle of my lines on real paper.')
  await ev(
    `window.__clearingSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='garden:clearing:v1')throw Error('Simulated storage failure');return window.__clearingSetItem.call(this,k,v)}`,
  )
  await clickText('I tried it on paper · keep this practice →')
  await until(`!!document.querySelector('.clearing-error')`)
  check(
    await ev(`!!localStorage.getItem('garden:clearing:pending:warm')`),
    'failed save keeps an independent recovery copy',
  )
  await page('Page.reload')
  await waitForEntry()
  await until(
    `!!document.querySelector('.clearing-finished') || !!document.querySelector('.arrival button')`,
  )
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in')?.click()`,
  )
  await until(`!!document.querySelector('.clearing-finished')`)
  await clickText('Try saving again →')
  await until(`!!document.querySelector('.clearing-share')`)
  check(
    await ev(`localStorage.getItem('garden:clearing:pending:warm')===null`),
    'retry after reload saves and clears the recovery copy',
  )
  await clickText('Back to the clearing →')
  await press('Escape')
  await until(`!!document.querySelector('.enter-place') && !document.querySelector('.clearing-ui')`)
  check(
    await ev(
      `document.querySelectorAll('.marks button').length===6 && document.querySelector('.marks button:nth-child(5)').getAttribute('aria-label')==='The Clearing' && document.querySelector('.marks button:nth-child(6)').getAttribute('aria-label')==='The Lantern Walk'`,
    ),
    'six garden destinations, with Clearing before Memories',
  )
  await capture('clearing-landmark')
  await press('ArrowRight')
  await until(
    `document.querySelector('.marks button:last-child').getAttribute('aria-selected')==='true'`,
  )
  await capture('memories-last')
  await press('ArrowLeft')
  await press('Enter')
  await until(`!!document.querySelector('.clearing-paths')`)
  await ev(`localStorage.setItem('garden:me','cool')`)
  await page('Page.reload')
  await waitForEntry()
  await until(
    `!!document.querySelector('.clearing-adopt-invitation') || !!document.querySelector('.arrival button')`,
  )
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in')?.click()`,
  )
  await until(`!!document.querySelector('.clearing-adopt-invitation')`)
  await click('.clearing-top button:last-child')
  check(
    await ev(
      `document.querySelector('.clearing-discoveries').textContent.includes('hasta luego to each other')`,
    ),
    'the other person can read a shared discovery',
  )
  await capture('shared-discovery')
  check(errors.length === 0, 'no uncaught browser exceptions: ' + errors.join('\n'))
  console.log('Screenshots: ' + output)
} finally {
  if (children.length) await call('Browser.close').catch(() => {})
  socket.close()
  children.forEach((child) => child.kill())
}
