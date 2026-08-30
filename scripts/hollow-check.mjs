/**
 * The Hollow, driven the way a thumb drives it.
 *
 * ---------------------------------------------------------------------------
 * Three things here can only be checked by operating them, and all three have
 * already been wrong in a way that reading the source did not show.
 *
 * **The row.** It is a real scroll container with `scroll-snap-type` on it, so
 * a swipe is handled by the browser and lands the next card dead centre —
 * and for a long time nothing told React that had happened. The card filling
 * the screen was still drawn as a neighbour: dimmed, and labelled "bring to
 * the fire". One tap selected it, a second opened it, and the first appeared
 * to do nothing at all. Nothing in the component says this; the snapping is in
 * a stylesheet and the consequence is in a scroll position.
 *
 * **One way in.** A game played only together must offer exactly one door, not
 * three with two of them dark. That is a count of rendered buttons.
 *
 * **What is waiting.** The list must not go on announcing a round you have
 * finished. That needs a finished round to exist, which is why this stages one
 * in the mock's own storage rather than trying to play one.
 *
 *   npm run hollow
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'node:child_process'

const PORT = 5178
const CDP = 9347
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
    await wait(1000)
  }
  throw new Error('never came up: ' + url)
}

const kids = []
function run(cmd, args, shell = false) {
  const kid = spawn(cmd, args, { stdio: 'ignore', shell })
  kids.push(kid)
  return kid
}
const done = (code) => {
  for (const kid of kids) kid.kill()
  process.exit(code)
}

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
  return send
}

const faults = []
const check = (ok, name, saw) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + saw}`)
  if (!ok) faults.push(name)
}

/*
  A duel from earlier today, played out to the end.

  Six guesses of mine and her word, which is exactly the state the list used to
  describe as "Onety has been" — true, and the least useful of the true things
  it could have said.
*/
function finishedDuel(today) {
  const at = Date.now() - 3_600_000
  const guesses = ['crane', 'slate', 'plant', 'briny', 'ghost', 'aloud']
  return {
    id: `word-duel:${today}`,
    gameId: 'word-duel',
    setup: { seed: 7 },
    startedAt: at,
    moves: [
      { by: 'warm', seq: 0, at, data: { kind: 'word', word: 'tiger' } },
      { by: 'cool', seq: 0, at: at + 10, data: { kind: 'word', word: 'sword' } },
      ...guesses.map((guess, i) => ({
        by: 'warm',
        seq: i + 1,
        at: at + 100 + i,
        data: i === 0 ? { kind: 'guess', guess, target: 'sword' } : { kind: 'guess', guess },
      })),
    ],
  }
}

const main = async () => {
  run('npx', ['vite', '--port', String(PORT), '--strictPort'], true)
  run(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP}`,
    '--user-data-dir=' + process.env.TEMP + '/garden-hollow',
    '--no-first-run',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ])

  await up(`http://localhost:${PORT}/`)
  const version = await up(`http://127.0.0.1:${CDP}/json/version`)
  const send = await connect(version.webSocketDebuggerUrl)

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)
  // A phone, because that is where the row is operated with a thumb and where
  // the two-tap was being felt.
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    S,
  )
  const ev = async (expr) => {
    const out = await send(
      'Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true },
      S,
    )
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? 'threw')
    return out.result.value
  }

  const url = `http://localhost:${PORT}/?section=hollow&shot=1&mock=1`
  const openDoor = async () =>
    ev(`(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /come in/i.test(b.textContent))
      if (el) { el.click(); return 'opened' }
      return 'already in'
    })()`)

  // First load only exists to give us the origin, so the round can be staged
  // in the same localStorage the mock reads on its way up.
  await send('Page.navigate', { url }, S)
  await wait(9000)
  const today = await ev(`new Date().toLocaleDateString('en-CA')`)
  await ev(
    `localStorage.setItem('garden:rounds:v1', JSON.stringify({` +
      `'word-duel:${today}': ${JSON.stringify(finishedDuel(today))}` +
      `})), 'set'`,
  )

  await send('Page.navigate', { url }, S)
  await wait(9000)
  await openDoor()
  await wait(4000)

  // --- the row ------------------------------------------------------------
  const row = await ev(`(() => {
    const el = document.querySelector('.game-row')
    if (!el) return null
    const cards = [...el.querySelectorAll('.game-card')]
    return {
      cards: cards.length,
      names: cards.map((c) => (c.querySelector('strong') || {}).textContent || ''),
      selected: cards.findIndex((c) => c.classList.contains('is-selected')),
    }
  })()`)
  check(row !== null && row.cards > 1, 'the row is there, with cards in it', JSON.stringify(row))
  if (!row) done(1)

  /*
    Land the row on the next card, the way a released swipe does.

    Setting the scroll position is the honest half of the gesture: what broke
    was never the scrolling — the browser always did that — but that nothing
    read the position back afterwards. So this puts the row exactly where a
    snap leaves it and then asks the interface what it thinks is selected.
  */
  const target = Math.min(1, row.cards - 1)
  await ev(`(() => {
    const el = document.querySelector('.game-row')
    const card = el.querySelectorAll('.game-card')[${target}]
    el.scrollLeft = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2
    return 'scrolled'
  })()`)
  await wait(1400)

  const after = await ev(`(() => {
    const cards = [...document.querySelectorAll('.game-card')]
    const at = cards.findIndex((c) => c.classList.contains('is-selected'))
    return {
      selected: at,
      command: at < 0 ? '' : (cards[at].querySelector('.game-card-command') || {}).textContent || '',
    }
  })()`)
  check(
    after.selected === target,
    'the card you swiped to is the selected one',
    `swiped to ${target}, selected ${after.selected}`,
  )
  check(
    /enter to choose/i.test(after.command),
    'and it offers to be entered, not to be brought over',
    JSON.stringify(after.command),
  )

  // One tap. If the row had not been read back this would only have selected.
  await ev(`document.querySelectorAll('.game-card')[${target}].click(), 'tapped'`)
  await wait(900)
  const entered = await ev(`(() => {
    const heading = document.querySelector('.hollow-way-heading h2')
    return heading ? heading.textContent : null
  })()`)
  check(entered !== null, 'one tap on it opens the game', 'still on the row')

  // --- one way in ---------------------------------------------------------
  const scatterAt = row.names.findIndex((n) => /scatter/i.test(n))
  check(scatterAt >= 0, 'Scattergories is in the row', JSON.stringify(row.names))
  if (scatterAt >= 0) {
    await ev(`(() => {
      const back = document.querySelector('.hollow-way-back')
      if (back) back.click()
      return 'back'
    })()`)
    await wait(900)
    // Land on it the same way a swipe does, then the single tap that is now
    // all it should take.
    await ev(`(() => {
      const el = document.querySelector('.game-row')
      const card = el.querySelectorAll('.game-card')[${scatterAt}]
      el.scrollLeft = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2
      return 'scrolled'
    })()`)
    await wait(1400)
    await ev(`document.querySelectorAll('.game-card')[${scatterAt}].click(), 'tapped'`)
    await wait(1200)

    const ways = await ev(`(() => {
      const stage = document.querySelector('.hollow-way-threshold')
      if (!stage) return null
      const label = stage.querySelector('.game-way-label')
      return {
        name: (stage.querySelector('.hollow-way-heading h2') || {}).textContent || '',
        label: label ? label.textContent : '',
        buttons: [...stage.querySelectorAll('.game-ways-one button, .game-ways button')]
          .map((b) => b.textContent.trim()),
        alone: /on your own/i.test(stage.textContent),
        roll: /roll for/i.test(stage.textContent),
      }
    })()`)
    check(ways !== null && /scatter/i.test(ways.name), 'the Scattergories ways screen opens', JSON.stringify(ways))
    if (ways) {
      check(ways.buttons.length === 1, 'it offers exactly one way in', JSON.stringify(ways.buttons))
      check(!ways.alone, 'there is no "on your own"', 'still offered')
      check(!ways.roll, 'there is no "roll for her"', 'still offered')
    }
  }

  // --- what is waiting ----------------------------------------------------
  await ev(`(() => {
    const back = document.querySelector('.hollow-way-back')
    if (back) back.click()
    return 'back'
  })()`)
  await wait(700)
  await ev(`(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /what is waiting/i.test(b.textContent))
    if (el) el.click()
    return el ? 'opened' : 'no way in'
  })()`)
  await wait(1200)

  const list = await ev(`(() => {
    const rows = [...document.querySelectorAll('.standing')]
    return {
      rows: rows.map((r) => ({
        game: (r.querySelector('.standing-game') || {}).textContent || '',
        state: (r.querySelector('.standing-state') || {}).textContent || '',
        done: r.classList.contains('is-done'),
      })),
    }
  })()`)
  const duel = list.rows.find((r) => /word duel/i.test(r.game))
  check(duel !== undefined, 'the duel is listed', JSON.stringify(list.rows))
  if (duel) {
    check(duel.done, 'a round you played out reads as done', JSON.stringify(duel))
    check(
      /^done/i.test(duel.state),
      'and says so before anything else',
      JSON.stringify(duel.state),
    )
  }
  check(
    !list.rows.some((r) => /scatter/i.test(r.game)),
    'a game with no asynchronous round is not listed as waiting',
    JSON.stringify(list.rows.map((r) => r.game)),
  )

  console.log('')
  if (faults.length > 0) {
    console.log(`  ${faults.length} of them wrong.\n`)
    done(1)
  }
  console.log('  the Hollow behaves.\n')
  done(0)
}

main().catch((e) => {
  console.error(e)
  done(1)
})
