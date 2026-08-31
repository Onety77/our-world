/**
 * Closing a door, and it staying closed.
 *
 * ---------------------------------------------------------------------------
 * Saving used to appear to do nothing: you closed two doors, pressed save, and
 * every row went straight back to open in front of you — before you had even
 * left the panel. The write had worked. The screen had never looked.
 *
 * Two faults, and both are checked here. The control room renders *instead of*
 * the garden, so the listener mounted in `Garden` was never running on that
 * screen and what is published read as empty for ever. And the panel reset its
 * draft to that empty value the instant the write resolved.
 *
 * So this drives the whole thing: close one road for her and one game for both,
 * save, and demand the list still says so afterwards — then walk the garden as
 * each of you and check the doors are actually shut.
 *
 *   npm run locks
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PORT = 5186
const CDP = 9356
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

const main = async () => {
  run('npx', ['vite', '--port', String(PORT), '--strictPort'], true)
  run(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + process.env.TEMP + '/garden-locks', '--no-first-run', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'])
  await up(`http://localhost:${PORT}/`)
  const v = await up(`http://127.0.0.1:${CDP}/json/version`)
  const send = await connect(v.webSocketDebuggerUrl)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S)
  await send('Emulation.setDeviceMetricsOverride',
    { width: 430, height: 900, deviceScaleFactor: 2, mobile: true }, S)
  const ev = async (e) => {
    const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S)
    if (o.exceptionDetails) throw new Error(o.exceptionDetails.exception?.description ?? 'threw')
    return o.result.value
  }
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
    console.log('wrote', name)
  }

  // --- the control room ----------------------------------------------------
  /*
    Start as yourself, with nothing locked.

    The run ends by becoming her, to check her side — and the mock keeps both
    that and the locks in localStorage, so a second run would begin as the
    person who is not allowed to save anything, with last time's locks already
    in place. Which is a confusing way to be told the harness is fine.
  */
  await send('Page.navigate', { url: `http://localhost:${PORT}/dev7731?shot=1&mock=1` }, S)
  await wait(6000)
  await ev(`(() => {
    localStorage.setItem('garden:me', 'warm')
    localStorage.removeItem('garden:locks:v1')
    return 1
  })()`)
  await send('Page.navigate', { url: `http://localhost:${PORT}/dev7731?shot=1&mock=1` }, S)
  await wait(8000)
  const tabs = await ev(`[...document.querySelectorAll('.admin-tabs button')].map(b=>b.textContent.trim())`)
  console.log('tabs:', tabs)
  const opened = await ev(`(() => {
    const b=[...document.querySelectorAll('.admin-tabs button')].find(x=>/closed/i.test(x.textContent))
    if (b) { b.click(); return 'open' }
    return 'no tab'
  })()`)
  check(opened === 'open', 'there is a tab for it', opened)
  await wait(1200)

  const rows = await ev(`[...document.querySelectorAll('.lock-list li')].map(li => ({
    name: li.querySelector('.lock-what b').textContent,
    kind: li.querySelector('.lock-what small').textContent,
  }))`)
  console.log('doors:', JSON.stringify(rows))
  check(rows.length >= 5, 'every game and every road is listed', JSON.stringify(rows))
  await shot('locks-panel')

  // Shut the Moonbreak for her, and Scattergories for both.
  await ev(`(() => {
    const rows = [...document.querySelectorAll('.lock-list li')]
    const moon = rows.find(li => /moonbreak/i.test(li.textContent))
    const scat = rows.find(li => /scatter/i.test(li.textContent))
    moon.querySelectorAll('.lock-choices button')[1].click()
    scat.querySelectorAll('.lock-choices button')[2].click()
    return 1
  })()`)
  await wait(600)
  await shot('locks-drafted')
  const saveLabel = await ev(`(() => {
    const b=[...document.querySelectorAll('.admin-locks .row button')][0]
    return { text: b.textContent.trim(), disabled: b.disabled }
  })()`)
  check(saveLabel.text === 'save' && !saveLabel.disabled, 'save wakes up when something is drafted', JSON.stringify(saveLabel))
  await ev(`document.querySelectorAll('.admin-locks .row button')[0].click(), 1`)
  await wait(1500)

  /*
    The list must still show what you just saved.

    It used to clear its "you have edited this" flag the instant the write
    resolved, and an effect underneath then reset the draft to whatever was last
    *published* — which, milliseconds after saving, is still the old value. So
    every save flashed the whole list back to open. Which is indistinguishable,
    from where you are sitting, from the save not having worked at all.
  */
  const afterSave = await ev(`(() => {
    const rows = [...document.querySelectorAll('.lock-list li')]
    const lit = (li) => {
      const on = [...li.querySelectorAll('.lock-choices button')].find(b => b.classList.contains('on'))
      return on ? on.textContent.trim() : '(none)'
    }
    return {
      moon: lit(rows.find(li => /moonbreak/i.test(li.textContent))),
      scat: lit(rows.find(li => /scatter/i.test(li.textContent))),
      shutRows: rows.filter(li => li.classList.contains('is-shut')).length,
      button: document.querySelectorAll('.admin-locks .row button')[0].textContent.trim(),
    }
  })()`)
  console.log('after save:', JSON.stringify(afterSave))
  check(/her/i.test(afterSave.moon), 'the Moonbreak still reads as shut for her', afterSave.moon)
  check(/both/i.test(afterSave.scat), 'Scattergories still reads as shut for both', afterSave.scat)
  check(afterSave.shutRows === 2, 'and two rows are still marked shut', String(afterSave.shutRows))
  check(afterSave.button === 'saved', 'the button settles on saved', afterSave.button)

  const stored = await ev(`localStorage.getItem('garden:locks:v1')`)
  console.log('saved:', stored)
  check(/moonbreak.*them|them.*moonbreak/s.test(stored ?? ''), 'the Moonbreak is shut for her', String(stored))
  check(/scattergories/.test(stored ?? ''), 'Scattergories is shut for both', String(stored))

  // --- and what that does to the garden ------------------------------------
  await send('Page.navigate', { url: `http://localhost:${PORT}/?section=hollow&shot=1&mock=1` }, S)
  await wait(9000)
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return 1 })()`)
  await wait(4500)

  const cards = await ev(`[...document.querySelectorAll('.game-card strong')].map(s=>s.textContent)`)
  console.log('cards:', JSON.stringify(cards))
  check(cards.some((n) => /scatter/i.test(n)), 'a shut game is still in the row', JSON.stringify(cards))
  const locked = await ev(`(() => {
    const cards = [...document.querySelectorAll('.game-card')]
    const scat = cards.find(c => /scatter/i.test(c.textContent))
    return scat ? { marked: scat.classList.contains('is-locked'), says: scat.textContent.includes('being worked on') } : null
  })()`)
  check(locked && locked.marked, 'and it is marked as shut', JSON.stringify(locked))
  check(locked && locked.says, 'and says it is being worked on', JSON.stringify(locked))
  // And the same, looked at rather than only asserted.
  const scatAt = cards.findIndex((n) => /scatter/i.test(n))
  await ev(`(() => { const el=document.querySelector('.game-row'); const c=el.querySelectorAll('.game-card')[${scatAt}];
    el.scrollLeft = c.offsetLeft + c.offsetWidth/2 - el.clientWidth/2; return 1 })()`)
  await wait(1400)
  await shot('locks-card')
  check(cards.some((n) => /rally/i.test(n)), 'and the rally is still there', JSON.stringify(cards))

  // Into the rally, to the road picker.
  const i = cards.findIndex((n) => /rally/i.test(n))
  await ev(`(() => { const el=document.querySelector('.game-row'); const c=el.querySelectorAll('.game-card')[${i}];
    el.scrollLeft = c.offsetLeft + c.offsetWidth/2 - el.clientWidth/2; return 1 })()`)
  await wait(1500)
  await ev(`document.querySelectorAll('.game-card')[${i}].click(), 1`)
  await wait(1400)
  await ev(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>/set a line/i.test(x.textContent))
    if (b) b.click(); return 1
  })()`)
  await wait(5000)

  const roads = await ev(`(() => {
    const names = [...document.querySelectorAll('.rally-course-name')].map(s=>s.textContent)
    const kicker = (document.querySelector('.rally-kicker')||{}).textContent
    return { names, kicker }
  })()`)
  console.log('roads:', JSON.stringify(roads))
  check(roads.names.length > 0, 'the picker has roads on it', JSON.stringify(roads))
  // `warm` is the account here, so a road shut "for her" is still open to me.
  check(roads.names.some((n) => /moonbreak/i.test(n)),
    'a road shut for her is still open to you', JSON.stringify(roads.names))
  await shot('locks-roads')

  // --- and now from her side, which is the whole point ---------------------
  await ev(`localStorage.setItem('garden:me', 'cool'), 1`)
  await send('Page.navigate', { url: `http://localhost:${PORT}/?section=hollow&shot=1&mock=1` }, S)
  await wait(9000)
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/come in/i.test(x.textContent)); if(b)b.click(); return 1 })()`)
  await wait(4500)

  const herCards = await ev(`[...document.querySelectorAll('.game-card strong')].map(s=>s.textContent)`)
  console.log('her cards:', JSON.stringify(herCards))
  check(herCards.some((n) => /scatter/i.test(n)), 'she sees it too, shut', JSON.stringify(herCards))

  const j = herCards.findIndex((n) => /rally/i.test(n))
  await ev(`(() => { const el=document.querySelector('.game-row'); const c=el.querySelectorAll('.game-card')[${j}];
    el.scrollLeft = c.offsetLeft + c.offsetWidth/2 - el.clientWidth/2; return 1 })()`)
  await wait(1500)
  await ev(`document.querySelectorAll('.game-card')[${j}].click(), 1`)
  await wait(1400)
  await ev(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>/set a line/i.test(x.textContent))
    if (b) b.click(); return 1
  })()`)
  await wait(5000)

  const herRoads = await ev(`(() => ({
    names: [...document.querySelectorAll('.rally-course-name')].map(s=>s.textContent),
    kicker: (document.querySelector('.rally-kicker')||{}).textContent,
    count: (document.querySelector('.rally-course-count')||{}).textContent,
  }))()`)
  console.log('her roads:', JSON.stringify(herRoads))
  // Counted against what you can see rather than a number, so adding a road
  // to the racer does not make this fail for the wrong reason.
  check(herRoads.names.length === roads.names.length,
    'every road is still on her wall', JSON.stringify(herRoads.names))
  const herLock = await ev(`(() => {
    const cards = [...document.querySelectorAll('.rally-course')]
    const moon = cards.find(c => /moonbreak/i.test(c.textContent))
    const root = cards.find(c => /rootway/i.test(c.textContent))
    return {
      moon: moon ? moon.classList.contains('is-locked') : null,
      says: moon ? moon.textContent.includes('being worked on') : null,
      root: root ? root.classList.contains('is-locked') : null,
    }
  })()`)
  check(herLock.moon === true, 'the road shut for her wears a lock', JSON.stringify(herLock))
  check(herLock.says === true, 'and says why', JSON.stringify(herLock))
  check(herLock.root === false, 'and the open ones do not', JSON.stringify(herLock))
  // Bring the shut road to the middle, so the lock is actually looked at.
  await ev(`(() => {
    const marks = [...document.querySelectorAll('.rally-course-marks button')]
    if (marks[1]) marks[1].click()
    return 1
  })()`)
  await wait(1200)
  await shot('locks-her-roads')

  console.log('')
  done(faults.length > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); done(1) })
