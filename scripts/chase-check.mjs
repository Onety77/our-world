/**
 * A ghost changing under a run must not restart the run.
 *
 * ---------------------------------------------------------------------------
 * The chase used to put itself back on the start line the instant it ended:
 * the lights went green and both cars set off again underneath the result
 * screen that was already up.
 *
 * The road re-opened whenever its `ghost` argument changed by identity, and a
 * ghost is her recorded lap read straight off her move. Finishing your run
 * writes your own move; the snapshot that came back rebuilt *her* move object
 * as well, so the road was handed a brand-new object describing a lap she
 * drove last week, and treated it as a new road to open.
 *
 * That half is fixed at the source — moves are immutable, so `watchRound` now
 * hands out the same object for the same move — and it cannot be exercised
 * here, because the mock never rebuilt them and so never had the bug.
 *
 * What this covers is the other half, which no amount of care about identity
 * would have prevented: **she posts a new qualifying lap while you are half
 * way down the road chasing her old one.** A road is now identified by which
 * go it is, which stage, and how it is being driven. The ghost is cargo, read
 * when the road opens.
 *
 *   npm run chase
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PORT = 5185
const CDP = 9355
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

/** A believable v4 run: 400 samples of four numbers. */
function lap(timeMs) {
  const path = []
  for (let i = 0; i < 400; i++) path.push(0, i * 4, 0, 0)
  return { v: 4, timeMs, path, strikes: 0, driftMs: 1200 }
}

const faults = []
const check = (ok, what, saw) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok ? '' : ' — ' + saw}`)
  if (!ok) faults.push(what)
}

const main = async () => {
  run('npx', ['vite', '--port', String(PORT), '--strictPort'], true)
  run(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + process.env.TEMP + '/garden-chase', '--no-first-run', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'])
  await up(`http://localhost:${PORT}/`)
  const v = await up(`http://127.0.0.1:${CDP}/json/version`)
  const send = await connect(v.webSocketDebuggerUrl)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S)
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false }, S)
  const ev = async (e) => {
    const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S)
    if (o.exceptionDetails) throw new Error(o.exceptionDetails.exception?.description ?? 'threw')
    return o.result.value
  }

  const url = `http://localhost:${PORT}/?section=hollow&shot=1&mock=1&rally=ride`
  await send('Page.navigate', { url }, S)
  await wait(9000)

  /*
    Start with an empty drawer.

    A round is named for the day, and the mock keeps them — so a run on the
    following morning would find yesterday's round first, write both laps into
    it, and then sit looking at today's empty one wondering where the chase
    went. Which is a confusing way to be told nothing is wrong.
  */
  await ev(`(() => {
    localStorage.setItem('garden:me', 'warm')
    localStorage.removeItem('garden:rounds:v1')
    return 1
  })()`)
  await send('Page.navigate', { url }, S)
  await wait(9000)

  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return 1 })()`)
  await wait(4000)

  // Into Ember Rally by its ordinary way in, which opens today's round.
  const names = await ev(`[...document.querySelectorAll('.game-card strong')].map(s=>s.textContent)`)
  const i = names.findIndex((n) => /rally/i.test(n))
  await ev(`(() => { const el=document.querySelector('.game-row'); const c=el.querySelectorAll('.game-card')[${i}];
    el.scrollLeft = c.offsetLeft + c.offsetWidth/2 - el.clientWidth/2; return 1 })()`)
  await wait(1500)
  await ev(`document.querySelectorAll('.game-card')[${i}].click(), 1`)
  await wait(1400)
  console.log('ways:', await ev(`[...document.querySelectorAll('.hollow-way-threshold button')].map(b=>b.textContent.trim())`))
  await ev(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>/set a line/i.test(x.textContent))
    if (b) b.click(); return b ? 'in' : 'no way in'
  })()`)
  await wait(4000)

  // Whichever round it actually opened — no guessing at dates or timezones.
  const id = await ev(`(() => {
    const all = JSON.parse(localStorage.getItem('garden:rounds:v1') || '{}')
    return Object.keys(all).find((k) => k.startsWith('ember-rally:')) || null
  })()`)
  console.log('round:', id)
  if (!id) { check(false, 'the round was opened', 'none in storage'); done(1) }

  // Both of you already have a lap on the Rootway, so the chase is open and
  // her line is the ghost.
  await ev(`(() => {
    const L = window.__local
    L.playMoveAs('warm', ${JSON.stringify(id)}, { kind: 'qualifying', stage: 'rootway', run: ${JSON.stringify(lap(96_000))} })
    L.playMoveAs('cool', ${JSON.stringify(id)}, { kind: 'qualifying', stage: 'rootway', run: ${JSON.stringify(lap(94_000))} })
    return 1
  })()`)
  await wait(2500)

  // Course picker, then the briefing, then the road. Click the chase each time.
  for (let step = 0; step < 3; step++) {
    if (await ev(`Boolean(document.querySelector('.rally-running'))`)) break
    const took = await ev(`(() => {
      const all = [...document.querySelectorAll('button')]
      const b = all.find((x) => /chase it|chase .* line|go again|go below|begin the chase/i.test(x.textContent))
      if (b) { b.click(); return b.textContent.trim().slice(0, 40) }
      return 'nothing matched: ' + all.map((x) => x.textContent.trim().slice(0, 24)).join(' | ').slice(0, 200)
    })()`)
    console.log(`step ${step}:`, took)
    await wait(5000)
  }
  await wait(4000)

  const onRoad = await ev(`Boolean(document.querySelector('.rally-running'))`)
  check(onRoad, 'the chase is on the road', 'never got there')
  if (!onRoad) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
    writeFileSync(`${OUT}/chase-stuck.png`, Buffer.from(data, 'base64'))
    done(1)
  }

  // Past the countdown: the start lights have gone.
  await wait(6000)
  const before = await ev(`(() => ({
    lights: Boolean(document.querySelector('.start-lights, .rally-lights')),
    rally: window.__rally ? { phase: window.__rally.phase, s: Math.round(window.__rally.s) } : null,
  }))()`)
  console.log('under way:', JSON.stringify(before))

  /*
    And now she posts a new lap, mid-run. Under the old rule this handed the
    road a different ghost and it opened again — lights back to red, both cars
    on the line, in the middle of somebody's run.
  */
  await ev(`(() => {
    window.__local.playMoveAs('cool', ${JSON.stringify(id)}, {
      kind: 'qualifying', stage: 'rootway',
      run: ${JSON.stringify(lap(91_000))},
    })
    return 1
  })()`)
  await wait(2500)

  const after = await ev(`(() => ({
    rally: window.__rally ? { phase: window.__rally.phase, s: Math.round(window.__rally.s) } : null,
    onRoad: Boolean(document.querySelector('.rally-running')),
  }))()`)
  console.log('after her new lap:', JSON.stringify(after))

  check(after.onRoad, 'still on the road', 'left it')
  if (before.rally && after.rally) {
    check(after.rally.phase === 'running' || after.rally.phase === 'finished',
      'the road did not go back to the start line', after.rally.phase)
    check(after.rally.s >= before.rally.s,
      'and the car did not get put back', `${before.rally.s} then ${after.rally.s}`)
  } else {
    check(false, 'telemetry was readable', 'window.__rally missing')
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
  writeFileSync(`${OUT}/chase.png`, Buffer.from(data, 'base64'))
  console.log('')
  done(faults.length > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); done(1) })
