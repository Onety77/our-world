/**
 * Stand in every place and listen to it.
 *
 * ---------------------------------------------------------------------------
 * A soundscape is the one part of this world that cannot be checked by looking
 * at it, and the cost of not checking has already been paid twice: a level
 * built with a sound nobody had heard, which turned out to be unbearable, and
 * the Hollow, which was supposed to be a cave and was measurably a hedge.
 *
 * Reading the mix table is not listening. A value of 0.16 on a wide band of
 * noise is louder than 1.0 on something that barely moves the air, which is
 * exactly how the Hollow came to be the loudest room in the garden while every
 * number in its column looked small.
 *
 * So this drives the real app in a real browser, walks into each place, and
 * measures what comes out of the world bus — `ambience.hearing()`, which in a
 * development build carries the analysed signal as well as the mix.
 *
 * `heard` is A-weighted, and that is the number that matters. Plain RMS counts
 * a sub-bass rumble as loudly as a hiss sitting on top of the mix, and a cave
 * is mostly rumble on purpose.
 *
 *   npm run places            check them all
 *   npm run places -- hollow  just one, printed, nothing asserted
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'node:child_process'

const PORT = 5177
const CDP = 9346
const CHROME =
  process.env.CHROME ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'

/** Each place, and what it is supposed to be. */
const PLACES = ['tree', 'river', 'hollow', 'stars', 'glasshouse']

/*
  What is being asserted, and why only this much.

  Not "the Hollow is 0.0013" — that is a recording of today, and it would fail
  on the next honest change to anything. What holds is the shape: a cave is the
  quietest room and the darkest one, and nothing anywhere is shouting.
*/
const CEILING = 0.006

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function up(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json().catch(() => true)
    } catch {
      /* not yet */
    }
    await wait(1000)
  }
  throw new Error('never came up: ' + url)
}

const kids = []
/*
  `shell` is per-command on purpose. `npx` on Windows is a .cmd and spawn will
  not find it without one; the browser lives under a path with a space in it,
  which a shell would split and quoting would only half fix.
*/
function run(cmd, args, shell = false, env = {}) {
  const kid = spawn(cmd, args, { stdio: 'ignore', shell, env: { ...process.env, ...env } })
  kids.push(kid)
  return kid
}
const done = (code) => {
  for (const kid of kids) kid.kill()
  process.exit(code)
}

// --- the browser, over the wire ---------------------------------------------
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const waiting = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m), waiting.delete(m.id)
  }
  await new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
      waiting.set(msg.id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
      ws.send(JSON.stringify(msg))
    })
  return { ws, send }
}

const main = async () => {
  run('npx', ['vite', '--port', String(PORT), '--strictPort'], true)
  run(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + process.env.TEMP + '/garden-places',
    '--no-first-run',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ])

  await up(`http://localhost:${PORT}/`)
  const version = await up(`http://127.0.0.1:${CDP}/json/version`)
  const { send } = await connect(version.webSocketDebuggerUrl)

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)
  const ev = async (expr) =>
    (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S))
      .result.value

  /*
    `mock=1` on every page, not an env var.

    Against the real backend the app stops at a sign-in screen, "come in" is
    never there to press, and every reading comes back zero — which this script
    cheerfully passed the first time it ran, because five silent places are
    quieter and darker than each other. `.env.local` beats anything handed to
    the process, so asking in the URL is the only way in that does not involve
    editing the developer's own keys. See `nothingPlaying` below.
  */
  const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const list = asked.length ? asked : PLACES
  const rows = []

  for (const section of list) {
    await send('Page.navigate', { url: `http://localhost:${PORT}/?section=${section}&shot=1&mock=1` }, S)
    await wait(11000)
    // The door has to be opened before there is any audio at all.
    const door = await ev(`(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /come in/i.test(b.textContent))
      if (el) { el.click(); return 'opened' }
      return 'no door — ' + [...document.querySelectorAll('button')]
        .map((b) => b.textContent.trim()).slice(0, 4).join(' / ')
    })()`)
    if (door !== 'opened') console.log('  ' + section + ': ' + door)
    // Long enough for the crossfade between places to have finished.
    await wait(8000)
    const heard = JSON.parse(
      await ev(`new Promise((finish) => {
        const out = []
        const until = performance.now() + 8000
        const step = () => {
          const h = window.__ambience.hearing()
          out.push({ place: h.place, heard: h.heard, loud: h.loud, bright: h.bright, ...h.bands })
          if (performance.now() < until) requestAnimationFrame(step)
          else {
            const mean = (k) => out.reduce((s, r) => s + (r[k] || 0), 0) / out.length
            finish(JSON.stringify({
              place: out[out.length - 1].place,
              heard: +mean('heard').toFixed(4),
              loud: +mean('loud').toFixed(5),
              bright: Math.round(mean('bright')),
              low: +mean('low').toFixed(3),
            }))
          }
        }
        step()
      })`),
    )
    rows.push(heard)
  }

  const pad = (s, n) => String(s).padEnd(n)
  console.log('\n  place        heard    rms       brightness   low')
  for (const r of rows) {
    console.log(
      '  ' + pad(r.place, 13) + pad(r.heard, 9) + pad(r.loud, 10) + pad(r.bright + ' Hz', 13) + r.low,
    )
  }

  if (asked.length) {
    console.log('\n  (one place asked for, nothing asserted)\n')
    done(0)
  }

  const faults = []

  /*
    Silence is not a pass.

    Every assertion below is a comparison between places, and comparisons hold
    trivially when every reading is zero — which is what happens the moment the
    app cannot be reached, or the analyser is not built, or the door was never
    opened. A checker that goes green when it heard nothing at all is worse
    than no checker, because it is the one you stop looking at.
  */
  const nothingPlaying = rows.filter((r) => r.heard <= 0)
  if (nothingPlaying.length > 0) {
    console.log(
      `\n  ✗ nothing was playing in ${nothingPlaying.length} of ${rows.length} places —` +
        ` nothing has been checked.\n` +
        `    The door has to be open and the build has to be a development one.\n`,
    )
    done(1)
  }

  const loudest = [...rows].sort((a, b) => b.heard - a.heard)[0]
  if (loudest.heard > CEILING) {
    faults.push(`${loudest.place} is shouting: ${loudest.heard} A-weighted, over ${CEILING}`)
  }
  /*
    The cave, held to a shape rather than to a photo finish.

    Wind and crackles are random, so two readings of the same place differ by a
    fifth either way and "strictly the quietest" fails on a coin toss — it did,
    the first time it ran, by a ten-thousandth against the glasshouse. What is
    true is that a cave is *among* the quiet rooms and is unambiguously the
    darkest one. Brightness is both the steadier measurement and the one that
    caught the original problem: a cave that measured like a hedge.
  */
  const hollow = rows.find((r) => r.place === 'hollow')
  if (hollow) {
    const quietest = Math.min(...rows.map((r) => r.heard))
    if (hollow.heard > quietest * 1.4) {
      faults.push(
        `the Hollow is not among the quiet rooms — ${hollow.heard} against ${quietest}`,
      )
    }
    const darker = rows.filter((r) => r.bright < hollow.bright).map((r) => r.place)
    if (darker.length > 0) {
      faults.push(`the Hollow is not the darkest place — ${darker.join(', ')} sit below it`)
    }
  }

  if (faults.length > 0) {
    console.log('\n' + faults.map((f) => '  ✗ ' + f).join('\n') + '\n')
    done(1)
  }
  console.log('\n  the cave is the quiet one\n')
  done(0)
}

main().catch((error) => {
  console.error(String(error))
  done(1)
})
