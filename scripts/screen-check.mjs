/**
 * The night screen, pressed by a real mouse and a real finger.
 *
 * ---------------------------------------------------------------------------
 * **Everything checked here was broken on exactly one of the two pointer
 * types**, which is why none of it was caught by looking.
 *
 * The miniature could be dragged around a desktop perfectly and nothing on it
 * could be pressed — not the way in, not anything — while the same code worked
 * on a phone. The cause is that `setPointerCapture` retargets the
 * *compatibility mouse events* along with the pointer, so the `click` a
 * browser synthesises from a mouse lands on the pane rather than on whatever
 * is under the cursor. A touch never goes through that path.
 *
 * So this drives **`Input.dispatchMouseEvent` and `Input.dispatchTouchEvent`**
 * rather than calling `.click()` from a script. A synthetic click skips the
 * whole pointer pipeline — capture, retargeting, the lot — which means it
 * would have passed against the broken build and proved nothing at all. The
 * events here are the ones the browser itself would have made.
 *
 *   npm run screen
 * ---------------------------------------------------------------------------
 */
import { execSync, spawn } from 'node:child_process'
import { readdirSync, rmSync, writeFileSync } from 'node:fs'

const PORT = 5188
const CDP = 9358
const OUT = process.argv[2] ?? process.env.TEMP
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function up(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json().catch(() => true) } catch {}
    await wait(1000)
  }
  throw new Error('no ' + url)
}
/* Named out here so the teardown can delete it however the run ends. */
const profileDir = `${process.env.TEMP}/garden-screen-${Date.now().toString(36)}`
/*
  Anything an earlier run left behind, cleared before this one starts.

  Each run gets a profile directory of its own so a lingering browser cannot
  be inherited, and the cost of that is a directory per run. They cannot be
  removed on the way out — Windows still holds the folder for a moment after
  the process dies — so they are removed on the way *in*, when the run that
  made them finished long ago. A directory that is still locked belongs to a
  run happening right now and is skipped.
*/
function sweep() {
  try {
    for (const name of readdirSync(process.env.TEMP)) {
      if (!name.startsWith("garden-screen-")) continue
      try {
        rmSync(`${process.env.TEMP}/${name}`, { recursive: true, force: true })
      } catch {
        /* in use by another run; leave it alone */
      }
    }
  } catch {
    /* no temp directory to read is not this file's problem */
  }
}

const kids = []
const run = (c, a, s = false) => { const k = spawn(c, a, { stdio: 'ignore', shell: s }); kids.push(k); return k }
/*
  ---------------------------------------------------------------------------
  **The whole tree, not just the process that was spawned.**

  `k.kill()` kills the Chrome that was launched and none of its children, and
  Chrome is a dozen processes: a renderer per tab, a GPU process, a network
  service, a storage service. So every run of this file left about a dozen
  processes and a profile directory behind, and after enough runs the machine
  could no longer fork at all — which showed up as an unrelated tool failing
  with "fork: Permission denied", a good half hour from anything to do with it.

  `taskkill /T` takes the tree. The profile goes with it, since a fresh one is
  made per run and a kept one is a few megabytes of nothing.
  ---------------------------------------------------------------------------
*/
let cleaning = false
const done = (c) => {
  if (!cleaning) {
    cleaning = true
    for (const k of kids) {
      try {
        if (k.pid) execSync(`taskkill /pid ${k.pid} /T /F`, { stdio: 'ignore' })
      } catch {
        /* already gone, which is the point */
      }
      try { k.kill() } catch { /* likewise */ }
    }
    /*
      The profile is *not* deleted here, deliberately.

      Windows does not release a directory the moment the process holding it
      dies, so a delete this close to the kill fails silently and leaves the
      folder anyway — which is what it did, three runs running. Sweeping at
      startup instead works every time, because by then the previous run's
      handles are long gone. See `sweep` below.
    */
  }
  process.exit(c)
}
/* Whatever happens — a thrown check, a Ctrl-C — the tree still goes. */
process.on('SIGINT', () => done(130))
process.on('SIGTERM', () => done(143))
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const w = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) w.get(m.id)(m), w.delete(m.id) }
  await new Promise((r) => (ws.onopen = r))
  return (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
    w.set(msg.id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
    ws.send(JSON.stringify(msg))
  })
}

const faults = []
const check = (ok, what, saw) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok ? '' : ' — ' + saw}`)
  if (!ok) faults.push(what)
}

/* A real film, so the iframe is a real iframe and swallows pointers like one. */
const FILM = { videoId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' }

/*
  A title written by somebody with no idea this garden exists. Deliberately
  longer than any column here, and with no space anywhere near the cut, so the
  word-boundary branch in `shortTitle` is the one that has to give way.
*/
const LONG =
  "How It's Made: Noodles, Pasta, Mac & Cheese | Season 12 Episode 4 | Full Episode"

const main = async () => {
  run('npx', ['vite', '--port', String(PORT), '--strictPort'], true)
  /*
    `--touch-events=disabled`, and it is the difference between this file
    working and not.

    Headless Chrome on this machine reports ten touch points whatever the
    device metrics say, and Chrome derives `(pointer: coarse)` from touch
    support — so every "desktop" step was running on something the page could
    only read as a phone. The garden asks `matchMedia('(pointer: fine)')`
    before requesting fullscreen, correctly declined, and the whole filling
    half of this check failed in a way that read as an app bug.

    Neither `setDeviceMetricsOverride({mobile: false})` nor
    `setTouchEmulationEnabled({enabled: false})` moves it, and neither does
    `setEmulatedMedia`'s pointer feature. The launch flag does. The phone steps
    turn touch back on through `setTouchEmulationEnabled`, which works in that
    direction.
  */
  /*
    A profile directory of its own, every run.

    Chrome does not start a second browser on a profile another one is already
    holding — it hands the arguments to the browser that has it and exits. So a
    run that was interrupted (a timeout, a Ctrl-C) leaves a browser alive, and
    every run after it silently attaches to *that* one: old flags, old tabs,
    old emulation. This is where the launch flag above appeared not to work,
    and it is a fair part of why the click checks were intermittent.

    A fresh directory per run cannot be inherited, and the stale browser dies
    with `done()` below or is simply left holding a profile nobody wants.
  */
  sweep()
  run(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + profileDir, '--no-first-run', '--disable-gpu',
    '--touch-events=disabled',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'])
  await up(`http://localhost:${PORT}/`)
  const v = await up(`http://127.0.0.1:${CDP}/json/version`)
  const send = await connect(v.webSocketDebuggerUrl)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)

  const ev = async (e, gesture = false) => {
    const o = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true, userGesture: gesture }, S)
    if (o.exceptionDetails) throw new Error(o.exceptionDetails.exception?.description ?? 'threw')
    return o.result.value
  }
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
    console.log('    wrote ' + name)
  }

  /** A mouse press and release that goes through the real pointer pipeline. */
  const mouse = async (type, x, y) => {
    await send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, pointerType: 'mouse',
    }, S)
  }
  const mouseClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, S)
    await mouse('mousePressed', x, y)
    await wait(40)
    await mouse('mouseReleased', x, y)
  }
  const touchTap = async (x, y) => {
    await send('Input.dispatchTouchEvent',
      { type: 'touchStart', touchPoints: [{ x, y }] }, S)
    await wait(40)
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S)
  }
  /** The middle of whatever that selector finds, in viewport coordinates. */
  const middleOf = (sel) => ev(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  })()`)

  /*
    ---------------------------------------------------------------------------
    **Which device this run is pretending to be, and why it is said rather than
    emulated.**

    The metrics and the touch switch below are real and do their job — the
    viewport is genuinely 1280 wide or genuinely 390, and touch events are
    genuinely dispatched or not. What they cannot do is move
    `matchMedia('(pointer: fine)')`, which is the one thing the garden asks
    before handing the film the browser's whole screen.

    Headless Chrome on this machine reports ten touch points and therefore
    `(pointer: coarse)` no matter what it is told: not by
    `setDeviceMetricsOverride({mobile: false})`, not by
    `setTouchEmulationEnabled({enabled: false})`, not by the
    `--touch-events=disabled` launch flag, and not by `setEmulatedMedia`'s
    pointer feature. All four were tried. The same machine with a window on it
    answers `fine`, which is why this only ever failed here.

    So the assumption goes in the URL — `?mouse=1`, honoured only in a
    development build, the same bargain as `?mock=1` for the backend. The
    checker states what it is pretending instead of trying to trick the browser
    into it, and every other line of the feature under test is the real one.
    ---------------------------------------------------------------------------
  */
  let pretending = 'desktop'
  const desktop = async () => {
    pretending = 'desktop'
    await send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, S)
    await send('Emulation.setTouchEmulationEnabled', { enabled: false }, S)
  }
  const phone = async () => {
    pretending = 'phone'
    await send('Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S)
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
  }

  /*
    `mouse=` states, per step, which kind of device this run is pretending to
    be — see the long note on `hasMouse` in `ui/Together` for why the browser
    cannot simply be asked. Everything else about the page is real.
  */
  /** Wait until the page can answer yes to something, then carry on. */
  const ready = async (expression, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      if (await ev(`!!(${expression})`)) return true
      await wait(250)
    }
    throw new Error('the page never had: ' + expression)
  }

  const url = () =>
    `http://localhost:${PORT}/?shot=1&mock=1&mouse=${pretending === 'desktop' ? 1 : 0}`

  /** In through the door, with a film on and the pane folded into the corner. */
  const openWithAFilm = async (title = FILM.title) => {
    await send('Page.navigate', { url: url() }, S)
    await wait(2500)
    /*
      An empty drawer, and it is not tidiness.

      Where the miniature was last put down and how much backing the words
      were last given are both kept in `localStorage`, deliberately — they are
      facts about your screen. So a checker that does not clear them measures
      the *previous run* instead of the app: the drag step began in the corner
      the drag step before it had left the pane in, found no room to move, and
      failed. Same shape as `garden:rounds:v1` in the chase check.
    */
    await ev(`(() => {
      localStorage.removeItem("garden:watching-spot:v1")
      localStorage.removeItem("garden:night-screen:scrim")
      return 1
    })()`)
    await send('Page.navigate', { url: url() }, S)
    await wait(4500)
    await ev(`(() => { const b=[...document.querySelectorAll('button')]
      .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
    /*
      Waited for by name, not by clock.

      `window.__local` is the mock's own handle and appears when the data
      layer mounts — which is after the door is opened, and how long after
      depends on how much else the browser is doing. A fixed sleep worked for
      most of this file and then threw `Cannot read properties of undefined`
      in the last section, once the run had grown long enough to be slow.
    */
    await ready('window.__local && window.__watching')
    await ev(`(() => {
      window.__local.setWatching({
        videoId: ${JSON.stringify(FILM.videoId)},
        title: ${JSON.stringify(title)},
        playing: false, at: 0, queue: [], session: 'check',
      })
      return 1
    })()`)
    // Long enough for YouTube's script, the iframe, and the poster behind it.
    await wait(6000)
  }

  // =========================================================================
  console.log('\nthe miniature, under a mouse\n')
  await desktop()
  await openWithAFilm()

  check(await ev(`!!document.querySelector('.together.tucked')`),
    'the film is folded into the corner', 'no tucked pane')
  /*
    ---------------------------------------------------------------------------
    **Whether YouTube turned up, which is not this app's to guarantee.**

    Half of this file needs a real iframe playing a real video: the sheet over
    it only matters because an iframe swallows pointers, and click-to-pause can
    only be checked against something that plays. All of that depends on
    `youtube.com` being reachable from this machine right now.

    When it is not, those assertions fail with messages that read as
    regressions — "no iframe", "stuck at playing", "the controls stayed
    hidden" — and one run did exactly that while everything about the app was
    fine. So it is asked once, said out loud, and the checks that genuinely
    need it are skipped rather than failed.

    Skipped loudly, and never silently passed: a run that could not reach
    YouTube says so on its own line and says how many it left out. The film
    half needs nobody's network and always runs.
    ---------------------------------------------------------------------------
  */
  const youtubeUp = await (async () => {
    for (let i = 0; i < 20; i++) {
      if (await ev(`!!document.querySelector('.together-stage iframe')`)) return true
      await wait(500)
    }
    return false
  })()
  let skipped = 0
  const needsYouTube = (ok, what, saw) => {
    if (!youtubeUp) {
      skipped++
      console.log(`  ~ ${what} — skipped, youtube did not load`)
      return
    }
    check(ok, what, saw)
  }
  if (!youtubeUp) {
    console.log('\n  ! youtube.com did not load. Everything that needs a real')
    console.log('    video playing is skipped below; the film half is unaffected.\n')
  } else {
    check(true, 'and it really is an iframe under the sheet', '')
  }

  const pane = await middleOf('.together.tucked')
  if (!pane) { check(false, 'the pane has a box', 'none'); done(1) }

  await mouseClick(pane.x, pane.y)
  await wait(600)
  check(await ev(`!!document.querySelector('.together.mini-awake')`),
    'a click on it wakes its controls', 'nothing happened — the press never landed')
  await shot('screen-mini-desktop')

  const wayIn = await ev(`(() => {
    const b = [...document.querySelectorAll('.together-mini-actions button')]
      .find(x => /open/i.test(x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  check(wayIn !== null, 'the way in is on it', 'no open button')
  if (wayIn) {
    await mouseClick(wayIn.x, wayIn.y)
    await wait(900)
    check(await ev(`!!document.querySelector('.together.full')`),
      'and pressing it opens the night screen', 'still folded away')
  }

  // =========================================================================
  console.log('\nand the same pane under a finger\n')
  await phone()
  await openWithAFilm()
  const phonePane = await middleOf('.together.tucked')
  if (phonePane) {
    await touchTap(phonePane.x, phonePane.y)
    await wait(600)
    check(await ev(`!!document.querySelector('.together.mini-awake')`),
      'a tap wakes them too, as it always did', 'the touch path regressed')
  } else {
    check(false, 'the pane has a box on a phone', 'none')
  }

  // =========================================================================
  console.log('\na drag is not a tap\n')
  await desktop()
  await openWithAFilm()
  const from = await middleOf('.together.tucked')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, buttons: 0 }, S)
  await mouse('mousePressed', from.x, from.y)
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: from.x - i * 14, y: from.y - i * 9, buttons: 1, pointerType: 'mouse' }, S)
    await wait(24)
  }
  await mouse('mouseReleased', from.x - 112, from.y - 72)
  await wait(600)
  const moved = await middleOf('.together.tucked')
  check(moved.x < from.x - 40 && moved.y < from.y - 20,
    'dragging it moves it', `${from.x},${from.y} → ${moved.x},${moved.y}`)
  check(!(await ev(`!!document.querySelector('.together.mini-awake')`)),
    'and does not also press it', 'the drag opened the controls')

  // =========================================================================
  console.log('\nthe line in the corner\n')
  await phone()
  await openWithAFilm(LONG)
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /open the music|nothing/i.test(x.textContent))
    if (b) b.click(); return 1
  })()`)
  await wait(900)
  const line = await ev(`(() => {
    const el = document.querySelector('.player-watch-title')
    if (!el) return null
    const box = el.getBoundingClientRect()
    return { text: el.textContent, wide: Math.round(box.width),
             room: Math.round(document.querySelector('.player').getBoundingClientRect().width) }
  })()`)
  console.log('    says:', JSON.stringify(line))
  check(line !== null, 'the corner offers the screen', 'no line')
  if (line) {
    check(line.text.length <= 34,
      'and never says more than the line was built for', `${line.text.length} characters`)
    check(line.text.endsWith('…'), 'a cut name says it was cut', line.text)
    check(line.wide <= line.room,
      'so the column is never pushed wider than it is', `${line.wide}px of ${line.room}px`)
  }
  await shot('screen-corner-phone')

  // =========================================================================
  console.log('\nfilling the screen\n')
  await desktop()
  await openWithAFilm()
  await ev(`(() => { const b=[...document.querySelectorAll('.together-mini-actions button')]
    .find(x=>/open/i.test(x.textContent)); if(b)b.click(); return 1 })()`)
  // The controls are only there once it is open; the miniature has no immerse.
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/show miniature|open/i.test(x.textContent)); return 1 })()`)
  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(1200)

  const enabled = await ev(`document.fullscreenEnabled === true`)
  console.log('    fullscreen available to this browser:', enabled)

  await ev(`(() => {
    const b = document.querySelector('.together-immerse-enter')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1600)

  check(await ev(`!!document.querySelector('.together.immersive')`),
    'the way in reaches immersion', 'not immersed')

  if (enabled) {
    const filling = await ev(`document.fullscreenElement === document.querySelector('.together')`)
    check(filling, 'and the browser hands over the whole screen', 'nothing went fullscreen')
    check(await ev(`!!document.querySelector('.together.filling')`),
      'which the layout is told about', 'no .filling class')
  } else {
    console.log('    (headless refused fullscreen; the layout below is checked directly)')
    await ev(`document.querySelector('.together').classList.add('filling'), 1`)
  }

  const laid = await ev(`(() => {
    const root = document.querySelector('.together')
    const film = document.querySelector('.together-screen').getBoundingClientRect()
    return {
      gutter: getComputedStyle(root).getPropertyValue('--immersive-chat').trim(),
      film: { w: Math.round(film.width), h: Math.round(film.height),
              x: Math.round(film.left), y: Math.round(film.top) },
      page: { w: window.innerWidth, h: window.innerHeight },
      room: !!document.querySelector('.together-room'),
      chat: !!document.querySelector('.screen-chat'),
    }
  })()`)
  console.log('    laid out:', JSON.stringify(laid))
  check(laid.film.w === laid.page.w && laid.film.h === laid.page.h,
    'the film is the whole screen', `${laid.film.w}×${laid.film.h} of ${laid.page.w}×${laid.page.h}`)
  check(!laid.room, 'nothing is standing beside it', 'the side column is still there')
  check(laid.chat, 'and the conversation is lying on it', 'no overlay')

  // Typing anywhere, with nothing focused, opens the field with what was typed.
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  for (const key of ['h', 'e', 'y']) {
    await send('Input.dispatchKeyEvent',
      { type: 'keyDown', text: key, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) }, S)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key }, S)
    await wait(120)
  }
  await wait(500)
  const wrote = await ev(`(() => {
    const f = document.querySelector('.screen-chat-field')
    return f ? { value: f.value, focused: document.activeElement === f } : null
  })()`)
  console.log('    the field:', JSON.stringify(wrote))
  check(wrote !== null, 'typing opens a field', 'none appeared')
  if (wrote) {
    check(wrote.value === 'hey', 'with everything that was typed already in it', wrote.value)
    check(wrote.focused, 'and the keyboard already in it', 'not focused')
  }
  await shot('screen-filling')


  // =========================================================================
  console.log('\nwhat it does when nobody is saying anything\n')

  /* Two lines already said, so the resting overlay has something in it. */
  await ev(`(() => {
    const L = window.__local
    L.beginScreenTalk('check')
    L.sayOnScreen('check', { id: 'a', by: 'cool', body: 'wait go back, what was that', at: Date.now() - 9000 })
    L.sayOnScreen('check', { id: 'b', by: 'warm', body: 'the rabbit? he is about to do something', at: Date.now() - 4000 })
    return 1
  })()`)
  await wait(1200)

  /* Out of the composer and out of the transport's way, so the picture is the
     picture and the words are the only thing on it. */
  /* Empty the field first: a draft in progress deliberately holds the overlay
     up, so leaving "hey" in it would be looking at the wrong state. */
  await ev(`(() => {
    const f = document.querySelector('.screen-chat-field')
    if (!f) return 0
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    set.call(f, '')
    f.dispatchEvent(new Event('input', { bubbles: true }))
    f.blur()
    return 1
  })()`)
  await wait(4000)
  await shot('screen-filling-resting')

  const lines = await ev(`[...document.querySelectorAll('.screen-chat-line')]
    .map(p => p.className.replace('screen-chat-line ', '') + ': ' + p.textContent)`)
  console.log('    on the picture:', JSON.stringify(lines))
  check(lines.length === 2, 'both lines are on the picture', `${lines.length} of 2`)
  check(lines.some((l) => l.startsWith('hers')) && lines.some((l) => l.startsWith('mine')),
    'and it is clear which of you said which', JSON.stringify(lines))

  /*
    The fifteen seconds, waited out in full.

    There is no way to hurry this that would still be checking the thing: the
    whole promise is that a film you are watching ends up with nothing on it,
    and a shortened timer would prove a shortened timer works. The three
    seconds on top are for a headless browser running a video in software,
    where a render can arrive a good deal later than it was asked for.
  */
  console.log('    (waiting out the fifteen seconds)')
  await wait(18_000)
  check(!(await ev(`!!document.querySelector('.screen-chat.awake')`)),
    'and with nothing happening for fifteen seconds, they go', 'still on the picture')
  await shot('screen-filling-rested')

  /* And she says something. */
  await ev(`(() => {
    window.__local.sayOnScreen('check', { id: 'c', by: 'cool', body: 'told you', at: Date.now() })
    return 1
  })()`)
  /*
    Polled rather than sampled once.

    A single sleep is a guess about how fast a render is, and the guess was
    wrong often enough to fail on one run and pass on the next — which is
    worse than no check at all, because a flaky red teaches people to re-run
    it. The delay is printed so a *slow* wake is still visible as a number
    even when it passes.
  */
  const woke = await (async () => {
    const began = Date.now()
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('.screen-chat.awake')`)) return Date.now() - began
      await wait(150)
    }
    return null
  })()
  console.log("    back on the picture after:", woke === null ? "never" : woke + "ms")
  check(woke !== null,
    "a line arriving brings them back on its own", "it stayed hidden — a message would be missed")
  check(await ev(`[...document.querySelectorAll('.screen-chat-line')].some(p => /told you/.test(p.textContent))`),
    'and it is the line she sent', 'not shown')

  /*
    And *this* is the resting shape: her line on the picture, no composer, no
    box. The earlier screenshot could not show it — the typing test leaves a
    composer open, correctly, because an open composer is somebody mid-sentence.
  */
  await wait(700)
  await shot('screen-filling-woken')
  const paint = await ev(`(() => {
    const line = document.querySelector('.screen-chat-line')
    const root = document.querySelector('.screen-chat')
    return {
      scrim: getComputedStyle(root).getPropertyValue('--screen-chat-scrim').trim(),
      behind: getComputedStyle(line).backgroundColor,
      composer: !!document.querySelector('.screen-chat-compose'),
      hint: !!document.querySelector('.screen-chat-hint'),
    }
  })()`)
  console.log('    painted:', JSON.stringify(paint))
  check(paint.scrim === "0.4" && paint.behind.endsWith('0.4)'),
    'the words have the backing they were given', paint.behind)
  check(!paint.composer && paint.hint,
    'and at rest there is no field on the film, only the way to open one', JSON.stringify(paint))


  // =========================================================================

  // =========================================================================
  console.log('\nthe keys, with the field never touched\n')

  /*
    Nothing here clicks the field, and that is the whole point.

    Enter and backspace used to be handled only inside the textarea, so they
    worked if and only if the browser had happened to put the caret there —
    "type and it works, backspace and it does not" was the report. A check that
    focuses the field first would pass against that build and prove nothing.

    So focus is deliberately parked on the film's own sheet before every one of
    these, which is where it really is after you have clicked to pause.
    Anything below that still works is genuinely independent of it.
  */
  const press = async (key, code, vk) => {
    await send('Input.dispatchKeyEvent',
      { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key.length === 1 ? key : undefined }, S)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }, S)
    await wait(140)
  }
  const parkFocus = () => ev(`(() => {
    const sheet = document.querySelector('.together-immersive-wake')
    if (sheet) sheet.focus()
    return document.activeElement ? document.activeElement.className : null
  })()`)
  const draftNow = () => ev(`(() => {
    const f = document.querySelector('.screen-chat-field')
    return f ? f.value : null
  })()`)

  console.log('    focus parked on:', await parkFocus())
  for (const c of ['g', 'o', 'o', 'd']) await press(c, 'Key' + c.toUpperCase(), c.toUpperCase().charCodeAt(0))
  check((await draftNow()) === 'good', 'typing still lands', String(await draftNow()))

  /* Backspace, with focus put back on the film first — the reported case. */
  await parkFocus()
  await press('Backspace', 'Backspace', 8)
  await press('Backspace', 'Backspace', 8)
  const rubbed = await draftNow()
  check(rubbed === 'go', 'backspace erases without the field being touched', String(rubbed))

  /* And enter sends it, again from the sheet rather than the field. */
  await parkFocus()
  await press('Enter', 'Enter', 13)
  await wait(1200)
  const sent = await ev(`[...document.querySelectorAll('.screen-chat-line')]
    .map(p => p.textContent).join(' | ')`)
  console.log('    on the picture:', sent)
  check(/go/.test(sent.split('|').pop() ?? ''), 'enter sends from anywhere', sent)
  check((await draftNow()) === '', 'and empties the line it sent', String(await draftNow()))

  /* Enter on an empty line sends nothing at all. */
  const before = await ev(`document.querySelectorAll('.screen-chat-line').length`)
  await parkFocus()
  await press('Enter', 'Enter', 13)
  await wait(900)
  const after = await ev(`document.querySelectorAll('.screen-chat-line').length`)
  check(before === after, 'and an empty line sends nothing', `${before} → ${after}`)

  // =========================================================================
  console.log('\nand the film answers a click again\n')

  /*
    YouTube's own button is under our sheet and always will be — an iframe
    swallows the pointer, and the sheet is what lets a mouse reach the film at
    all. What changed is what the sheet does with the click.
  */
  const playing = () => ev(`window.__watching.read().playing`)
  const filmMiddle = await middleOf('.together-immersive-wake')
  /*
    What is actually under the cursor, printed alongside the state.

    The first version of this check reported "stuck at true" and two separate
    theories about why were both wrong. Whatever is genuinely on top at that
    point is a fact rather than a theory, and it costs one line.
  */
  const atPoint = () => ev(`(() => {
    const el = document.elementFromPoint(${filmMiddle.x}, ${filmMiddle.y})
    const w = window.__watching.read()
    return {
      hit: el ? (el.className || el.tagName) : null,
      playing: w.playing,
      at: Math.round(w.at),
      join: !!document.querySelector('.together-join'),
    }
  })()`)
  /*
    ---------------------------------------------------------------------------
    **Let the film finish its first buffer before asking it to do anything.**

    This is not padding. A video that has only just been handed to YouTube is
    still settling, and in a headless browser with software rendering that
    takes seconds rather than the fraction of a second it takes on a machine
    with a screen. Toggling during it produced a genuine, repeatable "stuck at
    playing" — and it cost two wrong diagnoses before the transport button,
    which goes through exactly the same `playPause`, turned out to be just as
    stuck at the same moment and just as reliable afterwards.

    So the transport is exercised first: it is worth checking on its own, and
    it doubles as the settling this needs. Anything after it is measuring the
    control rather than the buffer.
    ---------------------------------------------------------------------------
  */
  for (let i = 0; i < 4; i++) {
    const before = await playing()
    await ev(`(() => { const b = document.querySelector('.together-immersive-moves .together-go')
      if (b) b.click(); return 1 })()`)
    await wait(1400)
    const after = await playing()
    if (i >= 2) {
      needsYouTube(after !== before, `the transport still toggles, press ${i + 1}`, `stuck at ${before}`)
    }
  }

  const was = await playing()
  console.log('    settled at:', JSON.stringify(await atPoint()))

  /*
    Polled, and the whole trace is kept.

    "It ended up in the wrong state" cannot tell a click that never registered
    from one that registered and was then undone by something else, and those
    two have completely different fixes. The sequence can: a run of `false`
    turning back to `true` is the anchor being argued with.
  */
  const traceTo = async (want) => {
    const seen = []
    let steady = 0
    for (let i = 0; i < 30; i++) {
      const now = await playing()
      if (seen[seen.length - 1] !== now) seen.push(now)
      // Three samples in a row, so a value that is about to be argued with
      // does not read as settled — the trace exists to catch exactly that.
      steady = now === want ? steady + 1 : 0
      if (steady >= 3) return { settled: true, seen }
      await wait(200)
    }
    return { settled: (await playing()) === want, seen }
  }

  await mouseClick(filmMiddle.x, filmMiddle.y)
  const one = await traceTo(!was)
  console.log('    after one:', JSON.stringify(one), JSON.stringify(await atPoint()))
  needsYouTube(one.settled, 'clicking the film plays and pauses it', `saw ${JSON.stringify(one.seen)}`)
  await mouseClick(filmMiddle.x, filmMiddle.y)
  const two = await traceTo(was)
  console.log('    after two:', JSON.stringify(two), JSON.stringify(await atPoint()))
  needsYouTube(two.settled, 'and clicking it again puts it back', `saw ${JSON.stringify(two.seen)}`)
  needsYouTube(await ev(`!!document.querySelector('.together.immersive-awake')`),
    'and the controls come up with it, which is when you want them', 'controls stayed hidden')

  // ---- the arrows --------------------------------------------------------
  /*
    Seeking is shared and the sound is not, and that split is the whole design
    of these four keys. Moving the film is moving *the film*, which is the one
    thing the two of you are doing together; turning it down is a fact about
    the room you are sitting in.
  */
  const arrow = async (key, extra = {}) => {
    await send('Input.dispatchKeyEvent',
      { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode:
          key === 'ArrowRight' ? 39 : key === 'ArrowLeft' ? 37 : key === 'ArrowUp' ? 38 : 40,
        ...extra }, S)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, ...extra }, S)
  }
  const anchorAt = () => ev(`Math.round(window.__watching.read().at)`)
  const settledNear = async (want, slack = 4) => {
    for (let i = 0; i < 30; i++) {
      const now = await anchorAt()
      if (Math.abs(now - want) <= slack) return now
      await wait(250)
    }
    return await anchorAt()
  }

  /*
    Paused through the transport first.

    Writing `playing: false` from a script while the picture is still running
    reads to this app as the other person pressing play, and it correctly
    writes it back — so the position set below would be overtaken a moment
    later. Its own button does not have that argument with it.
  */
  for (let i = 0; i < 6; i++) {
    if (!(await ev(`window.__watching.read().playing`))) break
    await ev(`(() => {
      const b = document.querySelector('.together-moves .together-go')
        || document.querySelector('.together-immersive-moves .together-go')
      if (b) b.click()
      return !!b
    })()`)
    await wait(900)
  }

  await ev(`(() => {
    const w = window.__watching.read()
    window.__local.setWatching({ videoId: w.videoId, title: w.title, playing: false,
      at: 30, queue: [], session: w.session })
    return 1
  })()`)
  await settledNear(30)
  await ev(`document.activeElement && document.activeElement.blur(), 1`)

  await arrow('ArrowRight')
  const forward = await settledNear(45)
  console.log('    right:', forward)
  check(Math.abs(forward - 45) <= 4, 'right moves the film fifteen seconds on', String(forward))

  await arrow('ArrowLeft')
  const rewound = await settledNear(30)
  console.log('    left:', rewound)
  check(Math.abs(rewound - 30) <= 4, 'and left brings it back', String(rewound))

  /* Control turns the step into a stride. */
  await arrow('ArrowRight', { modifiers: 2 })
  const strode = await settledNear(90, 6)
  console.log('    ctrl-right:', strode)
  check(Math.abs(strode - 90) <= 6, 'and control makes it a minute', String(strode))

  check(await ev(`!!document.querySelector('.together-osd')`),
    'a key that moves the film says so on the picture', 'nothing was said')

  /* The sound is this device's alone and must never reach the anchor. */
  const soundBefore = await ev(`window.__watching.read().at`)
  /*
    An unwritten setting is not a missing one.

    Nothing has touched the faders on a fresh profile, so there is no key in
    storage at all — and reading that as `null` made the first assertion
    compare a number against nothing and fail against behaviour that was
    correct. The garden's default is full; that is the baseline.
  */
  const loudness = () => ev(`(() => {
    const v = JSON.parse(localStorage.getItem('garden:volume:v1') || 'null')
    return v && typeof v.music === 'number' ? v.music : 1
  })()`)
  const wasLoud = await loudness()
  await arrow('ArrowDown')
  await wait(700)
  const quieter = {
    music: await loudness(),
    said: await ev(`(document.querySelector('.together-osd') || {}).textContent || ''`),
  }
  console.log('    down:', JSON.stringify({ from: wasLoud, to: quieter.music, said: quieter.said }))
  check(quieter.music !== null && wasLoud !== null && quieter.music < wasLoud,
    'down turns this screen down', `${wasLoud} → ${quieter.music}`)
  check(/sound/i.test(quieter.said), 'and says how far', quieter.said)
  check((await ev(`window.__watching.read().at`)) === soundBefore,
    'and never touches the film, which is hers as much as yours',
    'the volume moved the shared anchor')

  await arrow('ArrowUp')
  await wait(700)
  const louder = await loudness()
  check(louder !== null && louder > quieter.music, 'and up turns it back up',
    `${quieter.music} → ${louder}`)

  /*
    And none of them fire while somebody is writing.

    Out of fullscreen first: the panel beside the film — and with it every
    field — does not exist while the picture has the whole screen, so the
    focus below would land on nothing and the arrows would fire exactly as
    they are supposed to when nobody is typing. Same shape as the section
    further down; see the note there.
  */
  await ev(`(() => {
    const b = document.querySelector('.together-immersion-exit')
    if (b) b.click()
    return !!b
  })()`, true)
  for (let i = 0; i < 40; i++) {
    if (await ev(`!!document.querySelector('.together-room')`)) break
    await wait(250)
  }
  await ev(`(() => {
    const b=[...document.querySelectorAll('.together-tab')].find(x=>/talk/i.test(x.textContent))
    if (b) b.click()
    return !!b
  })()`)
  await wait(900)
  check(await ev(`!!document.querySelector('.together-talk .together-field')`),
    'there is a field to write in', 'no composer')
  await ev(`(() => {
    const f = document.querySelector('.together-talk .together-field')
    if (f) f.focus()
    return !!f
  })()`)
  const heldFilm = await anchorAt()
  await arrow('ArrowRight')
  await arrow('ArrowUp')
  await wait(900)
  const untouched = await anchorAt()
  console.log('    while writing:', JSON.stringify({ before: heldFilm, after: untouched }))
  check(untouched === heldFilm,
    'and an arrow inside a field is an arrow inside a field',
    `${heldFilm} → ${untouched}`)


  console.log('\nand the way back out\n')

  /*
    Every exit has to close the fullscreen as well as the layout.

    A page that stops being immersive while the browser is still handing it the
    whole display is the worst state on offer: a letterboxed film with nothing
    around it and no visible way back. The exit control and Escape both go
    through `leaveImmersion` for exactly this reason, so both are checked.
  */
  await ev(`(() => {
    const b = document.querySelector('.together-immersion-exit')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1200)
  check(await ev(`document.fullscreenElement === null`),
    'the exit gives the screen back to the browser', 'still fullscreen')
  check(!(await ev(`!!document.querySelector('.together.immersive')`)),
    'and leaves immersion with it', 'still immersed')
  check(await ev(`!!document.querySelector('.together-room')`),
    'so the room beside the screen is there again', 'no room')

  /* Back in, and out again by the key the browser itself listens for. */
  await ev(`(() => {
    const b = document.querySelector('.together-immerse-enter')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1400)
  check(await ev(`!!document.querySelector('.together.filling')`),
    'it goes back in', 'did not fill the screen a second time')

  await send('Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S)
  await send('Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S)
  await wait(1400)
  check(await ev(`document.fullscreenElement === null`),
    'and escape closes both halves too', 'still fullscreen after escape')
  check(!(await ev(`!!document.querySelector('.together.immersive')`)),
    'leaving nothing laid out for a screen it no longer has', 'still immersed')


  // =========================================================================
  console.log('\nimmersion on a phone, which is a different thing on purpose\n')

  /*
    The panel beside the screen is rendered on `open && !filling`, and a phone
    is never `filling` — it is never asked for fullscreen, because portrait
    cinema is a film across the top with the conversation under it rather than
    a letterboxed strip in the middle of a black screen.

    That is one boolean away from having quietly deleted the phone's whole
    immersive layout while fixing the desktop's, which is exactly the shape of
    thing this file exists for.
  */
  await phone()
  await openWithAFilm()
  await ev(`(() => {
    const b = [...document.querySelectorAll('.together-mini-actions button')]
      .find(x => /open/i.test(x.textContent))
    if (b) b.click()
    window.__watching.show()
    return 1
  })()`)
  await wait(1500)
  await ev(`(() => {
    const b = document.querySelector('.together-immerse-enter')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1500)

  const onPhone = await ev(`(() => {
    const film = document.querySelector('.together-screen')
    const room = document.querySelector('.together-room')
    if (!film || !room) return { film: !!film, room: !!room }
    const f = film.getBoundingClientRect()
    const r = room.getBoundingClientRect()
    return {
      film: true, room: true,
      filling: !!document.querySelector('.together.filling'),
      chat: !!document.querySelector('.screen-chat'),
      filmBottom: Math.round(f.bottom), roomTop: Math.round(r.top),
      wide: Math.round(f.width), page: window.innerWidth,
    }
  })()`)
  console.log('    on a phone:', JSON.stringify(onPhone))
  check(await ev(`!!document.querySelector('.together.immersive')`),
    'a phone still immerses', 'not immersed')
  check(onPhone.filling === false && onPhone.chat === false,
    "without asking the browser for its fullscreen", JSON.stringify(onPhone))
  check(onPhone.room === true && onPhone.roomTop >= onPhone.filmBottom - 2,
    'and the conversation is under the film, not on it',
    `film ends ${onPhone.filmBottom}, room starts ${onPhone.roomTop}`)
  check(onPhone.wide === onPhone.page,
    'which spans the whole width', `${onPhone.wide} of ${onPhone.page}`)
  await shot('screen-phone-immersive')


  // =========================================================================
  console.log('\nour own film\n')

  /*
    ---------------------------------------------------------------------------
    **A real video file, made on the spot, and never leaving the browser.**

    Everything below needs a file that genuinely decodes — a fingerprint over
    invented bytes proves the arithmetic and proves nothing about whether a
    film plays. There is no ffmpeg on this machine and committing a sample
    video to the repository to test a feature whose entire point is that files
    stay off the wire would be a poor joke, so the page records one: a canvas,
    a `captureStream`, and a `MediaRecorder`.

    Two clips, kept as bytes on this side, so the *same* file can be handed to
    the page again after a reload. That is the only way to check the thing that
    matters most — that his copy and her copy are recognised as the same copy —
    because two recordings of the same canvas are never byte-identical.
    ---------------------------------------------------------------------------
  */
  const record = async (hue, seconds) => ev(`(async () => {
    if (typeof MediaRecorder === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(10)
    const bits = []
    let rec
    try {
      rec = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 90000 })
    } catch (e) { return null }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) bits.push(e.data) }
    const stopped = new Promise((done) => { rec.onstop = done })
    rec.start()
    const began = performance.now()
    while (performance.now() - began < ${seconds} * 1000) {
      const t = performance.now() - began
      ctx.fillStyle = 'hsl(' + ((${hue} + t / 12) % 360) + ' 70% 45%)'
      ctx.fillRect(0, 0, 160, 90)
      ctx.fillStyle = '#fff'
      ctx.fillRect((t / 20) % 150, 40, 10, 10)
      await new Promise((r) => setTimeout(r, 40))
    }
    rec.stop()
    await stopped
    const bytes = new Uint8Array(await new Blob(bits, { type: 'video/webm' }).arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
  })()`)

  /*
    Hand the page a file through the real input, the way a person would.

    `DataTransfer` is how a file is put into an `<input type="file">` from
    script, and it matters that this is the same input a person clicks: the
    check drives the actual door rather than a seam cut into the app for it.
    Nothing in `src/` knows this file exists.
  */
  const give = async (where, b64, name) => ev(`(() => {
    const bin = atob(${JSON.stringify(b64)})
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], ${JSON.stringify(name)}, { type: 'video/webm' })
    const input = document.querySelector(${JSON.stringify(where + ' .film-input')})
    if (!input) return 'no input at ' + ${JSON.stringify(where)}
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return 'given'
  })()`)

  /*
    ---------------------------------------------------------------------------
    **Put the film back at the start and wait until it is genuinely running.**

    The clips this file records are seconds long and the run is minutes long,
    so by the time any given assertion is reached the film has usually finished
    and is sitting on its own last frame. Two checks failed that way on
    different runs — "it is actually playing" saw 8.5 then 0, and the tuck saw
    0 then 0 — and both were true statements about a finished film rather than
    anything about the thing being tested.

    Lengthening the clips only moves the cliff. What removes it is saying, at
    each point that needs one, *there should be a film running here* — and then
    waiting until there demonstrably is, rather than assuming the writing of it
    was enough. It is not: an ended video told to play from zero has to seek,
    load and start, and how long that takes is the browser's business.
    ---------------------------------------------------------------------------
  */
  const running = async () => {
    await ev(`(() => {
      const w = window.__watching.read()
      window.__local.setWatching({ videoId: w.videoId, title: w.title, playing: true,
        at: 0, queue: [], session: w.session })
      return 1
    })()`)
    let was = null
    let last = null
    for (let i = 0; i < 80; i++) {
      /*
        Halfway through, ask the app rather than the anchor.

        Writing `playing: true` is a request that the correction loop carries
        out on its next tick, and a film sitting on its own last frame has to
        be sought back before it can start — which is two round trips through
        a browser rendering video in software. When that has plainly not been
        enough, the transport's own button is pressed, which is what a person
        would do and goes through `playPause` directly.
      */
      if (i === 40) {
        await ev(`(() => {
          const b = document.querySelector('.together-moves .together-go')
            || document.querySelector('.together-immersive-moves .together-go')
          if (b) b.click()
          return !!b
        })()`)
      }
      last = await ev(`(() => {
        const v = document.querySelector('.together-stage video')
        if (!v) return { none: true }
        return {
          at: Math.round(v.currentTime * 100) / 100,
          paused: v.paused, ended: v.ended, ready: v.readyState,
          wants: window.__watching.read().playing,
        }
      })()`)
      const now = last && !last.none && !last.paused && !last.ended ? last.at : null
      // Two readings, both playing, the second later than the first.
      if (now !== null && was !== null && now > was) return now
      was = now
      await wait(250)
    }
    console.log('    would not start:', JSON.stringify(last))
    return null
  }

  const filmState = () => ev(`(() => {
    const w = window.__watching.read()
    const v = document.querySelector('.together-stage video')
    const copy = document.querySelector('.film-copy')
    return {
      id: w.videoId,
      title: w.title,
      playing: w.playing,
      at: Math.round(w.at * 10) / 10,
      video: !!v,
      src: v ? (v.src || '').slice(0, 5) : null,
      span: v && isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : 0,
      here: v ? Math.round(v.currentTime * 10) / 10 : null,
      ask: !!document.querySelector('.film-ask'),
      copy: copy ? copy.className : null,
      nudge: !!document.querySelector('.film-nudge'),
      trouble: (document.querySelector('.film-trouble') || {}).textContent || '',
    }
  })()`)

  await desktop()
  console.log('    recording two clips…')
  /*
    Long enough to still be playing at the end of this section.

    The first pass used three and four seconds and both ran out mid-check —
    which produced a failure that read as a bug and was in fact the film
    finishing, correctly, while the checker was still asking questions about
    it. It also found a real one on the way: see the note on ENDED in
    `ui/Together` about whose end is the end.
  */
  const A = await record(20, 9)
  const B = await record(200, 11)
  if (A === null || B === null) {
    check(false, 'the browser can record a clip to test with', 'no MediaRecorder')
    done(1)
  }
  console.log(`    clip A ${Math.round((A.length * 3) / 4 / 1024)} KB, clip B ${Math.round((B.length * 3) / 4 / 1024)} KB`)
  check(A !== B, 'the two clips really are different files', 'identical')

  /** In, with the night screen open and nothing on it. */
  const openEmpty = async () => {
    await send('Page.navigate', { url: url() }, S)
    await wait(2500)
    await ev(`(() => {
      localStorage.removeItem('garden:watching:v1')
      localStorage.removeItem('garden:film-offset:v1')
      return 1
    })()`)
    await send('Page.navigate', { url: url() }, S)
    await wait(4500)
    await ev(`(() => { const b=[...document.querySelectorAll('button')]
      .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
    await ready("window.__watching && window.__local")
    await ev(`(() => { window.__watching.show(); window.__watching.setTab && 0; return 1 })()`)
    await wait(1200)
    // The queue half is where a film is put on from.
    await ev(`(() => { const b=[...document.querySelectorAll('.together-tab')]
      .find(x=>/our film/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
    await wait(800)
  }

  await openEmpty()
  check(await ev(`!!document.querySelector('.film-tab .film-input')`),
    'the film has a tab of its own, with the way in on it', 'no picker')

  // ---- a file no browser can open, refused before it reaches her ----------
  console.log(await give('.film-tab', A, 'The.Client.1996.mkv'))
  await wait(1500)
  const refused = await filmState()
  console.log('    an .mkv:', JSON.stringify(refused.trouble).slice(0, 90))
  check(refused.trouble !== '', 'an .mkv is refused with a reason', 'said nothing')
  check(/\.mp4/.test(refused.trouble), 'and the reason says what to do', refused.trouble)
  check(refused.id === null, 'and it never reaches the shared screen', String(refused.id))

  // ---- putting one on ----------------------------------------------------
  console.log(await give('.film-tab', A, 'Blue_Ruin_1080p.webm'))
  await wait(3500)
  const on = await filmState()
  console.log('    on:', JSON.stringify(on))
  check(String(on.id).startsWith('film:'), 'a film goes on as a film', String(on.id))
  check(on.title === 'Blue Ruin 1080p', 'named from the file, tidied up', String(on.title))
  check(on.video, 'and it is a video element, not an iframe', 'no video')
  check(on.src === 'blob:', 'playing from the disk, not from anywhere', String(on.src))
  /* Polled: metadata for a freshly attached source arrives on its own schedule,
     and in a software-rendering headless browser that schedule is generous. */
  const opened = await (async () => {
    for (let i = 0; i < 30; i++) {
      const span = (await filmState()).span
      if (span > 1) return span
      await wait(300)
    }
    return 0
  })()
  check(opened > 1, 'the browser opened it and knows how long it is', String(opened))

  /*
    That it fills the stage, which is not the same as that it is there.

    The first version rendered the film at its own natural size in the corner
    of a black rectangle — 160 pixels of picture in a 790-pixel screen — and it
    looked exactly like a broken file. `.together-stage > *` sizes whatever is
    in the stage and YouTube's iframe *replaces* the div it is handed, so it is
    a direct child and gets the rule; a `<video>` is appended into that div and
    is a grandchild, which the rule does not reach. It built, it typechecked,
    and it read correctly in the source.
  */
  const fills = await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    const stage = document.querySelector('.together-stage')
    if (!v || !stage) return null
    const a = v.getBoundingClientRect()
    const b = stage.getBoundingClientRect()
    return {
      video: [Math.round(a.width), Math.round(a.height)],
      stage: [Math.round(b.width), Math.round(b.height)],
      fit: getComputedStyle(v).objectFit,
    }
  })()`)
  console.log('    it fills:', JSON.stringify(fills))
  check(fills !== null && fills.video[0] === fills.stage[0] && fills.video[1] === fills.stage[1],
    'the picture fills the screen it is on', JSON.stringify(fills))
  check(fills !== null && fills.fit === 'contain',
    'and a film that is not sixteen by nine is not stretched to fit',
    String(fills && fills.fit))
  check(on.copy !== null && !on.copy.includes('other'),
    'and this copy is the copy that is on', String(on.copy))
  check(!on.nudge, 'so there is nothing to line up', 'the nudge appeared')
  await shot('film-playing')

  /*
    `running` is the whole assertion, and comparing two positions across a
    wait was worse than it.

    That version read 3.78 and then 3.2 and called the film stopped, when what
    had happened is the correction loop pulling it back towards the shared
    clock in between — which is the loop working. Two readings a quarter of a
    second apart, both playing and the second later, cannot be confused by it.
  */
  const ranOn = await running()
  console.log('    it moves:', JSON.stringify(ranOn))
  check(ranOn !== null, 'and it is actually playing', 'it never advanced')

  // ---- her device: the film is on, and she has no copy of it -------------
  /*
    A reload is the honest way to be the other person here. The mock keeps the
    anchor in `localStorage`, so what comes back is a screen that knows exactly
    which film is on and has nothing on this machine to play it with — which is
    her situation precisely, and not one that can be faked by hiding something.
  */
  await send('Page.navigate', { url: url() }, S)
  await wait(4500)
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await ready("window.__watching && window.__local")
  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(1500)
  const asked = await filmState()
  console.log('    her side:', JSON.stringify(asked))
  check(asked.ask, 'the other screen asks for her copy', 'no invitation')
  check(String(asked.id).startsWith('film:'), 'and still knows which film', String(asked.id))
  check(await ev(`/Blue Ruin/.test(document.querySelector('.film-ask').textContent)`),
    'by name', 'the name is missing')
  check(!(await ev(`!!document.querySelector('.together-join')`)),
    'and does not tell her to press play, which could not help', 'the join button is there')
  await shot('film-asking')

  // ---- she picks a different rip -----------------------------------------
  console.log(await give('.film-ask', B, 'blue ruin 720p.webm'))
  await wait(3500)
  const other = await filmState()
  console.log('    a different copy:', JSON.stringify(other))
  check(!other.ask, 'a different copy is accepted, not refused', 'still asking')
  check(other.video && other.src === 'blob:', 'and it plays', String(other.src))
  check(String(other.copy).includes('other'), 'and it says it is a different copy', String(other.copy))
  check(other.nudge, 'and offers the only control that can help', 'no nudge')
  check(String(other.id).startsWith('film:'),
    'while the shared anchor still carries his fingerprint, not hers', String(other.id))
  await shot('film-other-copy')

  /*
    And the nudge is reachable over a filled film, which is where it is needed.

    Two rips are discovered to be out of step while you are watching them, and
    that is with the film taking the whole screen. A control that lives only in
    the panel behind fullscreen is one you use once and then put up with being
    four seconds apart for two hours.
  */
  await ev(`(() => {
    const b = document.querySelector('.together-immerse-enter')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1800)
  const overFilm = await ev(`(() => ({
    filling: !!document.querySelector('.together.filling'),
    nudge: !!document.querySelector('.together-immersive-moves .film-nudge'),
    cc: !!document.querySelector('.together-immersive-moves .together-caption'),
  }))()`)
  console.log('    over a filled film:', JSON.stringify(overFilm))
  check(overFilm.nudge, 'the nudge is reachable without leaving the film',
    JSON.stringify(overFilm))
  check(!overFilm.cc, 'and cc is not offered for a film, which has no track to show',
    'cc is there and would do nothing')
  await ev(`(() => {
    const b = document.querySelector('.together-immersion-exit')
    if (b) b.click()
    return !!b
  })()`, true)
  /*
    And it is *asserted*, not assumed. A fullscreen that failed to exit here
    left the document holding an element, which made the way in later stand
    down and produced "did not go fullscreen" three sections away from the
    thing that caused it.
  */
  const letGo = await (async () => {
    for (let i = 0; i < 30; i++) {
      if (await ev(`document.fullscreenElement === null`)) return true
      await wait(250)
    }
    return false
  })()
  check(letGo, 'and leaving it gives the screen back', 'still fullscreen afterwards')

  // ---- the nudge moves this screen and nobody else's ---------------------
  /*
    Held still first, and near the start, so there is somewhere to move to.

    A paused film one second in has the whole thing ahead of it; one sitting on
    its own last frame has nowhere to go, and a nudge that cannot move is
    indistinguishable from a nudge that does not work.
  */
  /*
    ---------------------------------------------------------------------------
    **Measured as a lead over the shared clock, not as a position.**

    The first version of this wound the anchor back and *paused* it, then
    compared two positions. It passed, and it passed for the wrong reason: the
    pause never stuck. Writing `playing: false` from a script while the video
    is still running is, to this app, indistinguishable from the other person
    pressing play — which is a rule it holds on purpose — so it wrote `true`
    straight back, the film ran on to its end, and the position duly went up.
    The diagnostics said `anchorAt: [10.1, 10.1], playing: [true, true]`, which
    is the shape of a green that proves nothing.

    What a nudge actually claims is narrower and testable while the film runs:
    *this picture leads the shared clock by the offset.* So the film is left
    playing — no fight — and what is compared is `here` minus where the anchor
    says everybody should be. That goes from nothing to a second, and the
    anchor is untouched throughout.
    ---------------------------------------------------------------------------
  */
  /*
    The parts, not just the answer.

    A bare null here meant one of four different things — no video, no dev
    handle, a nonsense anchor, or arithmetic that came out NaN — and picking
    between them by guessing cost two runs. Every piece is returned, so a
    failure says which.
  */
  const leadOnce = () => ev(`(() => {
    const v = document.querySelector('.together-stage video')
    const w = window.__watching.read()
    const shared = window.__watching.positionOf
      ? window.__watching.positionOf(w, Date.now())
      : null
    const gap = v && shared !== null ? v.currentTime - shared : null
    return {
      lead: gap !== null && Number.isFinite(gap) ? Math.round(gap * 10) / 10 : null,
      video: !!v,
      here: v ? Math.round(v.currentTime * 10) / 10 : null,
      shared: shared === null || !Number.isFinite(shared) ? null : Math.round(shared * 10) / 10,
      at: w.at,
      since: w.since,
      playing: w.playing,
    }
  })()`)
  /* Polled, because the first read after a write lands before the anchor has
     a server time on it and the arithmetic is briefly NaN. */
  let lastLead = null
  const lead = async () => {
    for (let i = 0; i < 20; i++) {
      lastLead = await leadOnce()
      if (lastLead.lead !== null) return lastLead.lead
      await wait(200)
    }
    return null
  }
  await ev(`(() => {
    const w = window.__watching.read()
    window.__local.setWatching({ videoId: w.videoId, title: w.title, playing: true,
      at: 0, queue: [], session: w.session })
    return 1
  })()`)
  /*
    Waited for, not slept through. Setting the anchor is a request; the picture
    arrives there when the correction loop next runs and the seek completes,
    and a fixed sleep guessed wrong often enough to fail one run in two with
    `10.1 → 10.1` — which is a film sitting on its own last frame, not a nudge
    that does not work.
  */
  const settledAt = async (under) => {
    for (let i = 0; i < 40; i++) {
      const here = (await filmState()).here
      if (here !== null && here < under) return here
      await wait(250)
    }
    return null
  }
  const wound = await settledAt(4)
  check(wound !== null, 'the film runs from near the start again', 'never got there')
  const beforeNudge = await filmState()
  const leadBefore = await lead()
  console.log('    lead parts:', JSON.stringify(lastLead))
  await ev(`(() => {
    const b = [...document.querySelectorAll('.film-nudge button')].find(x => x.textContent.trim() === '+1')
    if (b) b.click()
    return !!b
  })()`)
  /* A seek lands when it lands, and the loop settles it a moment later. */
  let leadAfter = leadBefore
  for (let i = 0; i < 25; i++) {
    leadAfter = await lead()
    if (leadAfter !== null && leadAfter >= leadBefore + 0.6) break
    await wait(200)
  }
  const nudged = await filmState()
  console.log('    nudged:', JSON.stringify({
    lead: [leadBefore, leadAfter],
    anchorAt: [beforeNudge.at, nudged.at],
    id: nudged.id,
  }))
  check(nudged.id === beforeNudge.id, 'a nudge does not change what is on', String(nudged.id))
  check(leadBefore !== null && Math.abs(leadBefore) < 0.6,
    'a matching-clock copy starts level with the shared clock', String(leadBefore))
  check(leadAfter !== null && leadAfter >= leadBefore + 0.6,
    'and a nudge puts this picture a second ahead of it',
    `${leadBefore} → ${leadAfter}`)
  check(await ev(`document.querySelector('.film-nudge-read').textContent.indexOf('1s') >= 0`),
    'and it says how far it moved', await ev(`document.querySelector('.film-nudge-read').textContent`))
  check(await ev(`!!JSON.parse(localStorage.getItem('garden:film-offset:v1') || '{}')[window.__watching.read().videoId.slice(5)]`),
    'and it is remembered for this film on this device', 'nothing stored')

  // ---- and the matching copy is recognised as matching -------------------
  await ev(`(() => {
    const b = [...document.querySelectorAll('.film-nudge button')].find(x => /s$/.test(x.textContent))
    if (b) b.click()
    return 1
  })()`)
  await wait(600)
  /* The queue half has to be open for its picker to exist — she arrived on the
     talk half, which is where the invitation put her. */
  await ev(`(() => { const b=[...document.querySelectorAll('.together-tab')]
    .find(x=>/our film/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await wait(900)
  console.log(await give('.film-tab', A, 'Blue_Ruin_1080p.webm'))
  /*
    Polled, for the third time in this file and for the same reason each time:
    opening a file means the browser reading metadata off it, and how long that
    takes is not this checker's to decide. A fixed sleep failed here twice, and
    both times it read as the app failing to recognise a file it had simply not
    finished opening.
  */
  const back = await (async () => {
    let last = null
    for (let i = 0; i < 40; i++) {
      last = await ev(`(() => {
        const w = window.__watching.read()
        const copy = document.querySelector('.film-copy')
        return { id: w.videoId, copy: copy ? copy.className : null,
                 nudge: !!document.querySelector('.film-nudge'),
                 trouble: (document.querySelector('.film-trouble') || {}).textContent || '' }
      })()`)
      if (last.copy !== null && !last.copy.includes('other')) return last
      await wait(300)
    }
    return last
  })()
  console.log('    the same file again:', JSON.stringify(back))
  check(back.copy !== null && !back.copy.includes('other'),
    'the same bytes are recognised as the same copy', String(back.copy))
  check(!back.nudge, 'and nothing needs lining up', 'the nudge is still there')



  // ---- the words along the bottom ----------------------------------------
  /*
    Driven paused, and positioned through the shared anchor.

    A subtitle is a claim about *which words are on screen at which second*,
    and the only way to check that is to put the film at a known second and
    look. Pausing first is what makes the anchor writes below stick: a scripted
    write while the picture is still running reads to this app as the other
    person pressing play, and it correctly writes back — which is how an
    earlier version of this file fooled itself. See the note on the nudge.
  */
  const SRT = [
    '1',
    '00:00:01,000 --> 00:00:03,000',
    'the first thing said',
    '',
    '2',
    '00:00:05,000 --> 00:00:07,000',
    '<i>a song, in italics</i>',
    'on two lines',
    '',
  ].join('\n')

  const giveText = async (where, text, name) => ev(`(() => {
    const file = new File([${JSON.stringify(text)}], ${JSON.stringify(name)},
      { type: 'text/plain' })
    const input = document.querySelector(${JSON.stringify(where + ' .film-input')})
    if (!input) return 'no input at ' + ${JSON.stringify(where)}
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return 'given'
  })()`)

  const linesNow = () => ev(`(() => {
    const box = document.querySelector('.film-lines')
    const p = box ? box.querySelector('p') : null
    const v = document.querySelector('.together-stage video')
    return {
      there: !!box,
      words: p ? p.textContent : null,
      italic: p ? !!p.querySelector('em') : false,
      here: v ? Math.round(v.currentTime * 10) / 10 : null,
    }
  })()`)

  /** Put the film, paused, at a second we choose, and wait for it to arrive. */
  const parkAt = async (second) => {
    await ev(`(() => {
      const w = window.__watching.read()
      window.__local.setWatching({ videoId: w.videoId, title: w.title, playing: false,
        at: ${second}, queue: [], session: w.session })
      return 1
    })()`)
    for (let i = 0; i < 40; i++) {
      const at = (await linesNow()).here
      if (at !== null && Math.abs(at - second) < 1) {
        /*
          A beat before reading the words.

          On a paused film the subtitle is redrawn by the one-shot `seeked`
          handler, and `currentTime` is new a moment before that fires — so
          sampling the instant the time looks right reads the new second
          against the previous second's words. It showed as a consistent
          one-cue lag and was entirely this loop being too quick.
        */
        await wait(700)
        return at
      }
      await wait(250)
    }
    return null
  }

  check(!(await ev(`!!document.querySelector('.together-moves .together-caption')`)),
    'a film with no subtitles offers no cc, which would do nothing', 'cc is there')

  console.log(await giveText('.film-tab-subs', SRT, 'Blue Ruin.srt'))
  /*
    Polled, like everything else that waits on the browser reading a file.

    A sleep of a second and a half was enough until it was not: the label was
    still saying "reading the file…" when the sample was taken, and four
    assertions failed describing a subtitle that had not arrived yet rather
    than one that was wrong.
  */
  const took = await (async () => {
    let seen = null
    for (let i = 0; i < 50; i++) {
      seen = await ev(`(() => {
        const p = document.querySelector('.film-tab-subs')
        return {
          says: p ? p.textContent : null,
          cc: !!document.querySelector('.together-moves .together-caption'),
          ccOn: !!document.querySelector('.together-moves .together-caption.on'),
        }
      })()`)
      if (seen.says !== null && !/reading the file/.test(seen.says)) return seen
      await wait(250)
    }
    return seen
  })()
  console.log('    subtitles:', JSON.stringify(took))
  check(/Blue Ruin\.srt/.test(String(took.says)), 'a subtitle file is taken', String(took.says))
  check(/2 lines/.test(String(took.says)), 'and it says how much it read', String(took.says))
  check(took.cc, 'cc appears once there is something to show', 'no cc')
  check(took.ccOn, 'and it is already on, because nobody adds them to leave them off', 'cc is off')

  /* Pause through the app's own control, so nothing is being fought. */
  await ev(`(() => {
    const b = document.querySelector('.together-moves .together-go')
    if (b) b.click()
    return !!b
  })()`)
  await wait(1500)

  const parked = await parkAt(2)
  check(parked !== null, 'the film can be put at a chosen second', String(parked))
  const first = await linesNow()
  console.log('    at 2s:', JSON.stringify(first))
  check(first.words === 'the first thing said',
    'the line for that second is on the picture', String(first.words))

  await parkAt(4)
  const gap = await linesNow()
  console.log('    at 4s:', JSON.stringify(gap))
  check(gap.words === null, 'and nothing at all between the lines', String(gap.words))

  await parkAt(6)
  const second = await linesNow()
  console.log('    at 6s:', JSON.stringify(second))
  check(String(second.words).includes('a song, in italics'),
    'the next line arrives on time', String(second.words))
  check(String(second.words).includes('\n'),
    'a two-line cue stays two lines', JSON.stringify(second.words))
  check(second.italic, 'and italics are italics, not angle brackets', 'no em')
  await shot('film-subtitles')

  /* cc turns them off without taking the file away. */
  await ev(`(() => {
    const b = document.querySelector('.together-moves .together-caption')
    if (b) b.click()
    return !!b
  })()`)
  await wait(1200)
  const off = await linesNow()
  const stillThere = await ev(`/Blue Ruin\\.srt/.test(document.querySelector('.film-tab-subs').textContent)`)
  console.log('    cc off:', JSON.stringify(off))
  check(off.words === null, 'cc takes the words off the picture', String(off.words))
  check(stillThere, 'and leaves the file loaded, ready to come back', 'the file was dropped')

  await ev(`(() => {
    const b = document.querySelector('.together-moves .together-caption')
    if (b) b.click()
    return !!b
  })()`)
  await wait(1200)
  check((await linesNow()).words !== null, 'and cc puts them back', 'they did not return')

  /* And taking them out is a different thing from turning them off. */
  await ev(`(() => {
    const b = [...document.querySelectorAll('.film-tab-subs .film-quiet')]
      .find(x => /take out/i.test(x.textContent))
    if (b) b.click()
    return !!b
  })()`)
  await wait(1200)
  const gone = await ev(`(() => ({
    words: !!document.querySelector('.film-lines p'),
    says: document.querySelector('.film-tab-subs').textContent,
    cc: !!document.querySelector('.together-moves .together-caption'),
  }))()`)
  console.log('    taken out:', JSON.stringify(gone))
  check(!gone.words, 'taking them out clears the picture', 'still showing')
  check(/add subtitles/i.test(String(gone.says)),
    'and offers to add some again', String(gone.says))
  check(!gone.cc, 'and cc goes with them', 'cc outlived its subtitles')

  /* A file that is not subtitles is refused in words. */
  console.log(await giveText('.film-tab-subs', 'this is not a subtitle file at all', 'notes.srt'))
  await wait(1200)
  const refusedSubs = await ev(`(() => {
    const t = document.querySelector('.film-tab-subs .film-trouble')
    return t ? t.textContent : ''
  })()`)
  console.log('    not subtitles:', JSON.stringify(refusedSubs))
  check(refusedSubs !== '', 'a file with no cues in it says so', 'said nothing')

  /* Put them back for the screenshots below. */
  console.log(await giveText('.film-tab-subs', SRT, 'Blue Ruin.srt'))
  await wait(1500)

  // ---- folded into the corner, and still the same element ----------------
  /*
    The one hard rule at the top of `ui/Together` is that the stage is never
    unmounted, because a re-parented iframe stops playing and forgets where it
    was. A `<video>` behaves the same way — a new element is a new download of
    nothing and a jump back to zero — so a film has to survive tucking exactly
    as a video does, and this is the check that says so.

    Marked rather than compared: two `<video>` elements look identical from
    here, so the one that is playing is stamped and the stamp is looked for
    afterwards. An element that came back without it is a different element.
  */
  /*
    Wound back and set running first, because the test clips are ten seconds
    long and this is five minutes into the run.

    One pass failed here with `0 → 0`, which was the film sitting correctly on
    its own last frame having finished some time earlier — a true statement
    about a finished film and no statement at all about whether tucking one
    keeps it playing. Lengthening the clips would only move the cliff; saying
    where it should be is what makes the question answerable.
  */
  check((await running()) !== null,
    'the film can be set running again for this', 'it would not start')
  await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    if (v) v.dataset.mark = 'the-one'
    return !!v
  })()`)
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/fold away/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await wait(2500)
  const folded = await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    return {
      tucked: !!document.querySelector('.together.tucked'),
      same: !!v && v.dataset.mark === 'the-one',
      at: v ? Math.round(v.currentTime * 10) / 10 : null,
      src: v ? (v.src || '').slice(0, 5) : null,
    }
  })()`)
  await wait(2000)
  const stillGoing = await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    return v ? Math.round(v.currentTime * 10) / 10 : null
  })()`)
  console.log('    folded away:', JSON.stringify(folded), '→', stillGoing)
  check(folded.tucked, 'a film folds into the corner', 'not tucked')
  check(folded.same, 'and it is the very same element, not a new one',
    'the picture was rebuilt — it would have restarted')
  check(folded.src === 'blob:', 'still playing off the disk', String(folded.src))
  check(stillGoing > folded.at, 'and it kept going while it was away',
    `${folded.at} → ${stillGoing}`)
  await shot('film-tucked')

  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(1500)
  check(await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    return !!v && v.dataset.mark === 'the-one'
  })()`), 'and it is still the same element when it comes back', 'rebuilt on the way back')

  // ---- a film with the whole screen --------------------------------------
  await ev(`(() => {
    const b = document.querySelector('.together-immerse-enter')
    if (b) b.click()
    return !!b
  })()`, true)
  await wait(1800)
  const filled = await ev(`(() => {
    const v = document.querySelector('.together-stage video')
    const box = v ? v.getBoundingClientRect() : null
    return {
      filling: !!document.querySelector('.together.filling'),
      chat: !!document.querySelector('.screen-chat'),
      same: !!v && v.dataset.mark === 'the-one',
      picture: box ? [Math.round(box.width), Math.round(box.height)] : null,
      page: [window.innerWidth, window.innerHeight],
      nudge: !!document.querySelector('.together-immersive-moves .film-nudge'),
    }
  })()`)
  if (!filled.filling) {
    console.log('    why not:', JSON.stringify(await ev(`({
      enabled: document.fullscreenEnabled,
      already: !!document.fullscreenElement,
      fine: matchMedia('(pointer: fine)').matches,
      search: location.search,
      immersed: !!document.querySelector('.together.immersive'),
    })`)))
  }
  console.log('    filling:', JSON.stringify(filled))
  check(filled.filling, 'a film fills the screen too', 'did not go fullscreen')
  check(filled.same, 'without rebuilding the picture', 'the film restarted on the way in')
  check(filled.picture !== null && filled.picture[0] === filled.page[0]
    && filled.picture[1] === filled.page[1],
    'edge to edge', JSON.stringify(filled))
  check(filled.chat, 'with the conversation lying on it', 'no overlay')
  /*
    Absent, and that is the assertion.

    The copies match by this point, so there is nothing to line up and the
    control that lines them up should not be sitting over the film taking up
    room. Its presence when they *do* differ is checked back where they
    differ — it cannot be checked in both places at once, because the two
    states are mutually exclusive by construction.
  */
  check(!filled.nudge, 'and no nudge over a film that needs none', 'the nudge is in the way')
  await shot('film-filling')

  if (skipped > 0) console.log(`
  ! ${skipped} checks skipped because youtube.com did not load`)

  // =========================================================================

  // =========================================================================
  console.log('\nthe things that were only reasoned about\n')

  /*
    Out of fullscreen first, and it is worth saying why.

    The section before this leaves the film filling the screen, and in that
    state the panel beside it does not exist — no transport, no tabs, no talk
    field, no fold-away. Four checks here failed in four different-looking ways
    on the first run, and every one of them was this: they were looking for
    controls that were correctly absent.
  */
  await ev(`(() => {
    const b = document.querySelector('.together-immersion-exit')
    if (b) b.click()
    return !!b
  })()`, true)
  const backInTheRoom = await (async () => {
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('.together-room') && !document.fullscreenElement`)) {
        return true
      }
      await wait(250)
    }
    return false
  })()
  check(backInTheRoom, 'the room beside the screen is back', 'still filling the screen')


  /*
    ---------------------------------------------------------------------------
    **A film with no sound, which these clips are.**

    This was written up as verified by construction rather than by observation,
    and that was a failure of imagination: a canvas recording has **no audio
    track at all**, so `webkitAudioDecodedByteCount` stays at zero for it and
    the detection fires exactly as it would on an AC3 film. The whole path —
    the four-second wait, the poll on the sync loop, the state, the notice —
    is exercised by the clips already in this file.

    Finding that also fixed the wording. The same zero is produced by a track
    the browser cannot play *and* by a file with no sound on it, so the notice
    now says what is known first and what is likely second.
    ---------------------------------------------------------------------------
  */
  const said = await running()
  check(said !== null, 'a film is running to be listened to', 'it would not start')
  const heard = await (async () => {
    // The detection deliberately waits a few seconds before it will answer.
    for (let i = 0; i < 40; i++) {
      const now = await ev(`(() => {
        const notice = document.querySelector('.together-transport .film-trouble')
        return {
          says: notice ? notice.textContent : '',
          hush: !!document.querySelector('.film-hush'),
        }
      })()`)
      if (/no sound/i.test(now.says)) return now
      await wait(400)
    }
    return await ev(`(() => ({
      says: (document.querySelector('.together-transport .film-trouble') || {}).textContent || '',
      hush: !!document.querySelector('.film-hush'),
    }))()`)
  })()
  console.log('    listening:', JSON.stringify(heard))
  check(/no sound/i.test(heard.says),
    'a film with nothing to hear says so rather than leaving you hunting', heard.says)
  check(/no audio track/i.test(heard.says),
    'and does not claim to know which of the two reasons it is', heard.says)

  // ---- space, which is one key with two jobs -----------------------------
  /*
    The two jobs never overlap, because they are never wanted at the same
    moment. What separates them is only where the keyboard is pointing, so
    that is what this presses on: nothing, and then a field.
  */
  const pressSpace = async () => {
    await send('Input.dispatchKeyEvent',
      { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }, S)
    await send('Input.dispatchKeyEvent',
      { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, S)
  }
  const settledPlaying = async (want) => {
    for (let i = 0; i < 30; i++) {
      if ((await ev(`window.__watching.read().playing`)) === want) return true
      await wait(200)
    }
    return false
  }

  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  const wasPlaying = await ev(`window.__watching.read().playing`)
  await pressSpace()
  check(await settledPlaying(!wasPlaying), 'space plays and pauses', `still ${wasPlaying}`)
  await pressSpace()
  check(await settledPlaying(wasPlaying), 'and again puts it back', `stuck at ${!wasPlaying}`)

  /* And it is a space again the moment there is somewhere to type it. */
  await ev(`(() => {
    const b=[...document.querySelectorAll('.together-tab')].find(x=>/talk/i.test(x.textContent))
    if (b) b.click()
    return !!b
  })()`)
  await wait(900)
  await ev(`(() => {
    const f = document.querySelector('.together-field')
    if (f) f.focus()
    return !!f
  })()`)
  const heldAt = await ev(`window.__watching.read().playing`)
  for (const key of ['h', 'i', ' ']) {
    await send('Input.dispatchKeyEvent',
      { type: 'keyDown', key, code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(),
        windowsVirtualKeyCode: key === ' ' ? 32 : key.toUpperCase().charCodeAt(0), text: key }, S)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key }, S)
    await wait(150)
  }
  await wait(900)
  const typed = await ev(`(() => {
    const f = document.querySelector('.together-field')
    return { value: f ? f.value : null, playing: window.__watching.read().playing }
  })()`)
  console.log('    while writing:', JSON.stringify(typed))
  check(String(typed.value).includes(' '), 'a space while writing is a space', String(typed.value))
  check(typed.playing === heldAt,
    'and does not touch the film', `${heldAt} → ${typed.playing}`)

  // ---- a film handed over through the queue ------------------------------
  /*
    Queueing a film and letting it come up is the one path into the invitation
    that nobody had walked. It is the same code as putting one on directly, and
    "the same code" is exactly the thing that is worth pressing once rather
    than reasoning about twice.
  */
  await ev(`(() => {
    const w = window.__watching.read()
    window.__local.setWatching({
      videoId: w.videoId, title: w.title, playing: false, at: 0, session: w.session,
      queue: [{ id: 'q1', videoId: 'film:not-a-print-anybody-has', title: 'Something Else', by: 'cool' }],
    })
    return 1
  })()`)
  await wait(1500)
  await ev(`(() => {
    const b = document.querySelector('.together-moves .together-next')
    if (b) b.click()
    return !!b
  })()`)
  const handed = await (async () => {
    for (let i = 0; i < 40; i++) {
      const now = await ev(`(() => {
        const ask = document.querySelector('.film-ask')
        return {
          id: window.__watching.read().videoId,
          title: window.__watching.read().title,
          asking: !!ask,
          says: ask ? ask.textContent : '',
        }
      })()`)
      if (now.asking && /Something Else/.test(now.says)) return now
      await wait(300)
    }
    return await ev(`(() => ({
      id: window.__watching.read().videoId,
      title: window.__watching.read().title,
      asking: !!document.querySelector('.film-ask'),
      says: (document.querySelector('.film-ask') || {}).textContent || '',
    }))()`)
  })()
  console.log('    off the queue:', JSON.stringify(handed).slice(0, 160))
  check(String(handed.id).startsWith('film:'), 'a queued film comes up as a film', String(handed.id))
  check(handed.asking,
    'and a film nobody here has a copy of asks for one, rather than going black',
    'no invitation')
  check(/Something Else/.test(handed.says), 'by the name it was queued under', handed.says)

  // ---- and the same invitation on the miniature --------------------------
  /*
    The miniature's own way in was fixed by reasoning from the identical
    pointer-capture bug on its controls, and that button has never been
    pressed. It is small, it is over an iframe, and it is the one place where
    a press has to survive a gesture that also drags the pane.
  */
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/fold away/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await wait(2000)
  const onPane = await ev(`(() => {
    const ask = document.querySelector('.together.tucked .film-ask')
    const b = ask ? ask.querySelector('button') : null
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             says: b.textContent.trim() }
  })()`)
  console.log('    on the miniature:', JSON.stringify(onPane))
  check(onPane !== null, 'the miniature asks for a copy too', 'nothing to press')
  if (onPane) {
    await mouseClick(onPane.x, onPane.y)
    await wait(1200)
    check(await ev(`!!document.querySelector('.film-input')`),
      'and its button reaches the file dialog rather than being swallowed',
      'the press went nowhere')
  }

  console.log('\nthe shelf, and the second night\n')

  /*
    ---------------------------------------------------------------------------
    **A real handle, and only the dialog is pretended.**

    Remembering a film rests on a `FileSystemFileHandle` — a bookmark to a file
    that survives the tab closing and can be stored in IndexedDB. The one part
    of that which cannot be automated is the native file dialog, so that is the
    one part replaced: `showOpenFilePicker` is stubbed to hand back a handle
    the page made for itself out of the origin's own storage.

    Everything after it is the app: `shelve` writing to IndexedDB, `recent`
    reading it back, the row rendering, `fileFrom` asking for permission and
    calling `getFile`. And the handle is a genuine one rather than an object
    with methods on it, which matters more than it sounds — a fake would not
    survive being stored, because IndexedDB clones what it is given and a plain
    object with functions cannot be cloned. Stubbing the *shape* would have
    passed a test that the real thing fails.
    ---------------------------------------------------------------------------
  */
  const stubPicker = async (b64, name) => {
    const source = `(() => {
      const bin = atob(${JSON.stringify(b64)})
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      window.__stubbedFilm = { bytes, name: ${JSON.stringify(name)} }
      window.showOpenFilePicker = async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle(${JSON.stringify(name)}, { create: true })
        const write = await handle.createWritable()
        await write.write(window.__stubbedFilm.bytes)
        await write.close()
        return [handle]
      }
    })()`
    await send('Page.addScriptToEvaluateOnNewDocument', { source }, S)
  }

  /*
    Wait for the offer, then press it.

    The row comes from IndexedDB, so it appears a moment after the invitation
    does. Both places that press it got this wrong in the same way — one
    reported a missing feature, the other reported silence from a failure that
    had not been triggered — so there is one of these rather than two sleeps.
  */
  const pressAgain = async () => {
    for (let i = 0; i < 50; i++) {
      const pressed = await ev(`(() => {
        const ask = document.querySelector('.film-ask')
        if (!ask) return false
        const b = [...ask.querySelectorAll('button')].find((x) => /open .*again/i.test(x.textContent))
        if (!b) return false
        b.click()
        return true
      })()`, true)
      if (pressed) return true
      await wait(250)
    }
    return false
  }

  await desktop()
  await stubPicker(A, 'Blue Ruin 1080p.webm')
  await openEmpty()

  /* A clean shelf, so what is on it afterwards was put there by this run. */
  await ev(`(() => {
    indexedDB.deleteDatabase('garden-shelf')
    return 1
  })()`)
  await wait(1200)
  await send('Page.navigate', { url: url() }, S)
  await wait(4500)
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await ready('window.__watching && window.__local')
  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(1200)
  await ev(`(() => { const b=[...document.querySelectorAll('.together-tab')]
    .find(x=>/our film/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await wait(900)

  check(await ev(`typeof window.showOpenFilePicker === 'function'`),
    'this browser can be asked to remember a film', 'no file picker api')
  check(!(await ev(`!!document.querySelector('.film-shelf')`)),
    'and an empty shelf is absent, not an empty heading', 'a heading over nothing')

  /* The real button, which on this browser opens the door that keeps a handle. */
  await ev(`(() => {
    const b = [...document.querySelectorAll('.film-tab .film-choose')][0]
    if (b) b.click()
    return !!b
  })()`, true)
  const onShelf = await (async () => {
    for (let i = 0; i < 60; i++) {
      const seen = await ev(`(() => {
        const rows = [...document.querySelectorAll('.film-shelf-title')].map(x => x.textContent)
        return { rows, id: window.__watching.read().videoId }
      })()`)
      if (seen.rows.length > 0 && String(seen.id).startsWith('film:')) return seen
      await wait(300)
    }
    return null
  })()
  console.log('    after choosing:', JSON.stringify(onShelf))
  check(onShelf !== null, 'choosing a film puts it on and remembers it',
    'it never reached the shelf')
  if (onShelf) {
    check(onShelf.rows.some((r) => /Blue Ruin/.test(String(r))),
      'the shelf knows it by name', JSON.stringify(onShelf.rows))
  }

  // ---- the second night --------------------------------------------------
  /*
    A reload with the anchor still set is the other person, or the same person
    tomorrow: the film is on, this device has no copy loaded, and the shelf is
    the difference between one press and a walk through a folder.
  */
  await send('Page.navigate', { url: url() }, S)
  await wait(4500)
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await ready('window.__watching && window.__local')
  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(2000)

  /*
    Polled, because looking on the shelf is a database read.

    The invitation renders as soon as the screen knows a film is on, and the
    "open it again" it may be able to offer arrives a moment later when
    IndexedDB answers. Sampling once found the invitation without it and
    reported a missing feature that was on its way.
  */
  const invited = await (async () => {
    let seen = null
    for (let i = 0; i < 50; i++) {
      seen = await ev(`(() => {
        const ask = document.querySelector('.film-ask')
        const back = ask
          ? [...ask.querySelectorAll('button')].find((b) => /again/i.test(b.textContent))
          : null
        return {
          asking: !!ask,
          again: back ? back.textContent : null,
          loaded: !!document.querySelector('.together-stage video[src^="blob:"]'),
        }
      })()`)
      if (seen.again !== null) return seen
      await wait(250)
    }
    return seen
  })()
  console.log('    the next night:', JSON.stringify(invited))
  check(invited.asking, 'the film is on and this device has no copy yet', 'no invitation')
  check(invited.again !== null && /open .*again/i.test(invited.again),
    'and the shelf offers it back in one press', String(invited.again))
  await shot('film-shelf-again')

  check(await pressAgain(), 'the offer can be pressed', 'it never appeared')
  const reopened = await (async () => {
    for (let i = 0; i < 60; i++) {
      const seen = await ev(`(() => {
        const v = document.querySelector('.together-stage video')
        const copy = document.querySelector('.film-copy')
        return {
          ask: !!document.querySelector('.film-ask'),
          src: v ? (v.src || '').slice(0, 5) : null,
          copy: copy ? copy.className : null,
          trouble: (document.querySelector('.film-trouble') || {}).textContent || '',
        }
      })()`)
      if (!seen.ask && seen.src === 'blob:') return seen
      await wait(300)
    }
    return await ev(`(() => ({
      ask: !!document.querySelector('.film-ask'),
      trouble: (document.querySelector('.film-trouble') || {}).textContent || '',
    }))()`)
  })()
  console.log('    one press later:', JSON.stringify(reopened))
  check(reopened.src === 'blob:', 'one press opens it again, with no dialog',
    JSON.stringify(reopened))
  check(reopened.copy !== null && !reopened.copy.includes('other'),
    'and it is recognised as the very same copy', String(reopened.copy))

  // ---- a film that is not there any more ---------------------------------
  /*
    The shelf must not keep offering a film that cannot be opened. A handle to
    a file that has been moved, renamed or deleted throws on `getFile`, and the
    row goes rather than sitting there failing every night.
  */
  await ev(`(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('Blue Ruin 1080p.webm')
    return 1
  })()`)
  await send('Page.navigate', { url: url() }, S)
  await wait(4500)
  await ev(`(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await ready('window.__watching && window.__local')
  await ev(`(() => { window.__watching.show(); return 1 })()`)
  await wait(2000)
  check(await pressAgain(), 'the shelf still offers it, not yet knowing it is gone',
    'the offer was already withdrawn')
  const missing = await (async () => {
    for (let i = 0; i < 40; i++) {
      const t = await ev(`(document.querySelector('.film-trouble') || {}).textContent || ''`)
      if (t !== '') return t
      await wait(300)
    }
    return ''
  })()
  console.log('    gone from the disk:', JSON.stringify(missing))
  check(missing !== '', 'a film that has been moved says so rather than failing quietly', 'silence')
  check(/moved|renamed/i.test(missing), 'and says what probably happened', missing)
  /*
    Asked of the buttons rather than of the words on screen. The message that
    says what happened ends with "choose it again below", so a test for the
    word "again" anywhere in the invitation matches the apology as well as the
    offer, and can never fail.
  */
  const stillOffered = await ev(`(() => {
    const ask = document.querySelector('.film-ask')
    if (!ask) return null
    return [...ask.querySelectorAll('button')].map((b) => b.textContent.trim())
  })()`)
  console.log('    now offering:', JSON.stringify(stillOffered))
  check(Array.isArray(stillOffered) && !stillOffered.some((t) => /open .*again/i.test(t)),
    'and stops offering it', JSON.stringify(stillOffered))

  console.log(faults.length === 0 ? '\nthe screen holds' : `\n${faults.length} wrong`)
  done(faults.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); done(1) })
