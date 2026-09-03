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
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

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
const kids = []
const run = (c, a, s = false) => { const k = spawn(c, a, { stdio: 'ignore', shell: s }); kids.push(k); return k }
const done = (c) => { for (const k of kids) k.kill(); process.exit(c) }
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
  const profile = `${process.env.TEMP}/garden-screen-${Date.now().toString(36)}`
  run(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu',
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
    await wait(2500)
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
    await wait(2500)
    await ev(`(() => { window.__watching.show(); window.__watching.setTab && 0; return 1 })()`)
    await wait(1200)
    // The queue half is where a film is put on from.
    await ev(`(() => { const b=[...document.querySelectorAll('.together-tab')]
      .find(x=>/find/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
    await wait(800)
  }

  await openEmpty()
  check(await ev(`!!document.querySelector('.film-way .film-input')`),
    'the way in to our own film is on the screen', 'no picker')

  // ---- a file no browser can open, refused before it reaches her ----------
  console.log(await give('.film-way', A, 'The.Client.1996.mkv'))
  await wait(1500)
  const refused = await filmState()
  console.log('    an .mkv:', JSON.stringify(refused.trouble).slice(0, 90))
  check(refused.trouble !== '', 'an .mkv is refused with a reason', 'said nothing')
  check(/\.mp4/.test(refused.trouble), 'and the reason says what to do', refused.trouble)
  check(refused.id === null, 'and it never reaches the shared screen', String(refused.id))

  // ---- putting one on ----------------------------------------------------
  console.log(await give('.film-way', A, 'Blue_Ruin_1080p.webm'))
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

  const ranOn = await (async () => {
    const first = (await filmState()).here
    await wait(2500)
    return { first, then: (await filmState()).here }
  })()
  console.log('    it moves:', JSON.stringify(ranOn))
  check(ranOn.then > ranOn.first, 'and it is actually playing', JSON.stringify(ranOn))

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
  await wait(2500)
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
  await wait(1500)

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
    .find(x=>/find/i.test(x.textContent)); if(b)b.click(); return !!b })()`)
  await wait(900)
  console.log(await give('.film-way', A, 'Blue_Ruin_1080p.webm'))
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
  await ev(`(() => {
    const w = window.__watching.read()
    window.__local.setWatching({ videoId: w.videoId, title: w.title, playing: true,
      at: 0, queue: [], session: w.session })
    return 1
  })()`)
  await wait(2500)
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
  console.log(faults.length === 0 ? '\nthe screen holds' : `\n${faults.length} wrong`)
  done(faults.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); done(1) })
