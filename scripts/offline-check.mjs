/**
 * Close the door on the server and see whether the garden is still there.
 *
 * ---------------------------------------------------------------------------
 * A cache cannot be checked by reading it. `sw/worker.js` can be entirely
 * correct in source and still serve nothing, because everything it does
 * happens in another thread, on a second visit, against a browser's own idea
 * of freshness — and every one of its failures is silent. The two that matter
 * are *it never cached anything* and *it cached the wrong things*, and both of
 * them look exactly like a working garden for as long as there is a network.
 *
 * So this does the only honest version of the test: it builds the real thing,
 * serves it, opens it in a real browser, waits for the worker to take over,
 * and then **kills the server** and asks for the world again. Nothing is
 * emulated. If the second visit renders, it rendered from the disk, because by
 * then there is nowhere else it could have come from.
 *
 * What is asserted, and why only this much:
 *
 * - **The shell is in the cache.** Every file the build put in `SHELL`, by
 *   name. Not a count — a count passes when the list is empty.
 * - **The music is not.** Rule 2 in the worker: media is never cached, because
 *   a ranged request answered from a whole body is a stall with no error on
 *   it. Twelve of the twenty megabytes in `dist` hang on this line.
 * - **The world opens with the server dead**, and opens as the garden rather
 *   than as a browser error page that happens to return markup.
 *
 * Not asserted: how fast, and how much. Those are worth knowing and are
 * printed, but a threshold on either would fail on the next honest change to
 * anything and teach whoever hit it to stop running this.
 *
 *   npm run offline
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PORT = 5179
const CDP = 9348
const CHROME =
  process.env.CHROME ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function up(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json().catch(() => true)
    } catch {
      /* not yet */
    }
    await wait(500)
  }
  throw new Error('never came up: ' + url)
}

const kids = []
function run(cmd, args, shell = false) {
  const kid = spawn(cmd, args, { stdio: 'ignore', shell })
  kids.push(kid)
  return kid
}

/*
  Killing `vite preview` means killing what it spawned, not the shell that
  spawned it. On Windows a `.cmd` launched through a shell is a tree, and
  `kid.kill()` reaches only the root of it — which leaves the port bound, the
  server answering, and this whole script quietly proving nothing at all.
*/
function killTree(kid) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      kid.kill('SIGKILL')
      resolve()
      return
    }
    spawn('taskkill', ['/pid', String(kid.pid), '/T', '/F'], { stdio: 'ignore' }).on('close', () =>
      resolve(),
    )
  })
}

const done = (code) => {
  for (const kid of kids) {
    try {
      kid.kill()
    } catch {
      /* already gone */
    }
  }
  process.exit(code)
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const waiting = new Map()
  const listeners = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m)
      waiting.delete(m.id)
      return
    }
    if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params)
  }
  await new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
      waiting.set(msg.id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
      ws.send(JSON.stringify(msg))
    })
  const on = (method, cb) => listeners.set(method, cb)
  return { send, on }
}

const main = async () => {
  // The build, not whatever is lying in `dist`. PLAN.md is explicit that the
  // folder may be stale, and a check that trusts it is checking last week.
  console.log('building…')
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], { stdio: 'ignore', shell: true })
    build.on('close', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))))
  })

  const sw = readFileSync('dist/sw.js', 'utf8')
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\n\])/)[1])
  const version = sw.match(/const VERSION = '([^']+)'/)[1]
  console.log(`shell · ${version} · ${shell.length} files`)

  const server = run('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], true)
  run(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP}`,
    // A fresh profile every run, or the previous run's worker is still
    // installed and the first visit is not a first visit.
    '--user-data-dir=' + (process.env.TEMP ?? '/tmp') + '/garden-offline-' + Date.now(),
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ])

  await up(`http://localhost:${PORT}/`)
  const info = await up(`http://127.0.0.1:${CDP}/json/version`)
  const { send, on } = await connect(info.webSocketDebuggerUrl)

  /*
    Everything the page says, kept from the start.

    The failure this check is most likely to meet is a module that did not
    load, which arrives as one console line and an empty `#root` — and an empty
    root on its own is indistinguishable from a world that is merely slow.
  */
  const said = []
  on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'warning') return
    said.push(p.args.map((a) => a.description ?? a.value ?? a.type).join(' '))
  })
  on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails
    said.push(d.exception?.description ?? d.text)
  })
  on('Network.loadingFailed', (p) => {
    said.push(`could not load (${p.type}): ${p.errorText}`)
  })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)
  await send('Network.enable', {}, S)
  const ev = async (expr) =>
    (
      await send(
        'Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true },
        S,
      )
    ).result.value

  const problems = []

  // --- the first visit ------------------------------------------------------
  await send('Page.navigate', { url: `http://localhost:${PORT}/` }, S)
  await send('Page.bringToFront', {}, S)

  const controlling = await ev(`(async () => {
    if (!('serviceWorker' in navigator)) return 'this browser has no service workers'
    const reg = await navigator.serviceWorker.ready
    for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 250))
    }
    return navigator.serviceWorker.controller ? 'controlled' : 'never took control'
  })()`)
  if (controlling !== 'controlled') problems.push('the worker ' + controlling)
  console.log('first visit  · ' + controlling)

  // Wait for the shell cache to actually fill; `ready` resolves on activation,
  // which on a first install is after `addAll`, but not on every browser.
  const held = await ev(`(async () => {
    for (let i = 0; i < 60; i++) {
      const names = await caches.keys()
      const shellName = names.find((n) => n.startsWith('garden:shell:'))
      if (shellName) {
        const cache = await caches.open(shellName)
        const keys = await cache.keys()
        if (keys.length) return keys.map((r) => new URL(r.url).pathname)
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    return []
  })()`)

  const missing = shell.filter((path) => !held.includes(path))
  if (missing.length) {
    problems.push(`${missing.length} shell file(s) never cached, first: ${missing[0]}`)
  }
  console.log(`shell cached · ${held.length}/${shell.length}`)

  /*
    The music, checked across every cache rather than only the shell's.

    The shell list is generated and could not contain an mp3 without the build
    plugin changing, so testing only that would be testing the wrong half. The
    way media gets in is the *runtime* path — a race plays a bed, the worker
    sees the request and keeps it — and that is the one `notOurs` exists to
    prevent.
  */
  const media = await ev(`(async () => {
    const found = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        if (/\\.(mp3|m4a|aac|mp4|webm|ogg|wav|flac)$/i.test(new URL(request.url).pathname)) {
          found.push(new URL(request.url).pathname)
        }
      }
    }
    return found
  })()`)
  if (media.length) problems.push('media was cached: ' + media.join(', '))
  console.log('media cached · ' + (media.length ? media.join(', ') : 'none, correctly'))

  /*
    How the world is looked at, twice.

    The first visit is a page that loaded *before* any worker existed and was
    claimed afterwards. That is a genuine state and worth having, but it is not
    the state being tested here — so every reading below is taken from a
    navigation that was controlled from its first byte.
  */
  const look = async () =>
    ev(`(async () => {
      /*
        Looked up inside the loop, and that is not a detail.

        Holding a reference from before the wait is how this check spent a run
        reporting a blank garden while the door was plainly on the screen: the
        evaluation can land before the parser has reached <div id="root">, and
        a null captured once stays null for the whole twenty seconds no matter
        what the page goes on to do.
      */
      const painted = () => {
        const root = document.getElementById('root')
        return Boolean(root && root.children.length)
      }
      // A three.js application booting, not a page of text. Give it a real
      // chance to mount before calling it blank.
      for (let i = 0; i < 80 && !painted(); i++) {
        await new Promise((r) => setTimeout(r, 250))
      }
      return {
        title: document.title,
        painted: painted(),
        canvas: Boolean(document.querySelector('canvas')),
        controlled: Boolean(navigator.serviceWorker.controller),
        // The loading line. Still on it means nothing behind the door ever
        // answered — see the note where this is asserted.
        waiting: Boolean(document.querySelector('.door-waiting')),
        text: (document.body.innerText || '').slice(0, 100).replace(/\\s+/g, ' ').trim(),
      }
    })()`)

  // --- once more with the network, so the worker is in front of everything --
  /*
    This one is not ceremony. A caching worker's other way of being wrong is to
    break the *ordinary* case, and that failure would never show up in a test
    that only ever looks at the offline one. It also settles the page into a
    controlled navigation, which is what makes the offline reading below mean
    what it says.
  */
  said.length = 0
  await send('Page.navigate', { url: `http://localhost:${PORT}/` }, S)
  const online = await look()
  if (!online.controlled) problems.push('the second visit was not controlled by the worker')
  if (!online.painted) problems.push('the garden stopped rendering *with* a network')
  /*
    **And that it got past the loading line**, which is the assertion this
    check was missing on the day it mattered.

    It printed *opening…* for a whole afternoon and passed, because `painted`
    was true — the shell had rendered, and the shell rendering is all `painted`
    ever meant. Meanwhile the thing behind it had failed to load and the door
    was waiting on a promise that would never settle, which is precisely the
    state a person then found in another country.

    `door-waiting` is the loading line. With a network in front of it there is
    no honest reason to still be on it by now.
  */
  if (online.waiting) {
    problems.push('the garden is still on its loading line with a network in front of it')
  }
  console.log(
    `online open  · painted ${online.painted} · canvas ${online.canvas}` +
      ` · past the loading line ${!online.waiting}`,
  )
  for (const line of said) console.log('  page · ' + line)

  // --- and now there is nowhere to fetch from -------------------------------
  /*
    Both ways at once, because they fail differently and only one of them is
    the phone. `emulateNetworkConditions` is what a device with no signal
    actually does; killing the server is what makes the result impossible to
    argue with, since after this line the bytes exist in exactly one place.
  */
  await send(
    'Network.emulateNetworkConditions',
    { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    S,
  )
  await killTree(server)
  // Prove it, rather than assuming the kill worked. A check whose premise
  // quietly failed is worse than no check.
  let alive = true
  for (let i = 0; i < 20 && alive; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`)
      await wait(250)
    } catch {
      alive = false
    }
  }
  if (alive) {
    console.error('\nthe preview server would not die — this run proves nothing.')
    done(1)
  }
  console.log('server       · gone, and the browser told there is no network')

  said.length = 0
  await send('Page.navigate', { url: `http://localhost:${PORT}/` }, S)
  const opened = await look()
  for (const line of said) console.log('  page · ' + line)

  if (opened.title !== 'the garden') problems.push('offline document is not the garden')
  if (!opened.painted) problems.push('the garden did not render offline')
  console.log(
    `offline open · title "${opened.title}" · painted ${opened.painted} · canvas ${opened.canvas}`,
  )
  if (opened.text) console.log(`             · "${opened.text}"`)

  console.log('')
  if (problems.length) {
    for (const problem of problems) console.error('  ✗ ' + problem)
    done(1)
  }
  console.log('  ✓ the garden opens with the server dead.')
  done(0)
}

main().catch((error) => {
  console.error(error)
  done(1)
})
