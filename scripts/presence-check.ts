/**
 * Everything presence sends, it can read back.
 *
 * -----------------------------------------------------------------------------
 * This exists because the same bug has now happened twice, in both directions,
 * and neither time did anything throw:
 *
 *   **`racing` was written down and never sent.** Declared on `Presence`,
 *   documented at length, validated in `database.rules.json` — and the one
 *   function that writes presence never included it. Live rounds worked
 *   perfectly against the mock and would have done nothing whatever the first
 *   time the two of them tried it for real.
 *
 *   **`typing` was sent and never read.** Same story from the other end. The
 *   writer was right, the rules were right, it was driven end to end in a
 *   browser and passed — and the reader built its object field by field and
 *   dropped it on the floor. It was found by somebody trying it on a phone and
 *   saying "nothing happens".
 *
 * Both are the same bug: **the mock and the wire are two implementations of one
 * interface, and a browser test only ever exercises the mock.** The mock merges
 * a presence patch wholesale, so it cannot have this failure mode and cannot
 * catch it either.
 *
 * So: round-trip every field, and walk the list rather than writing it out
 * again here — a list written twice is the thing that got us into this.
 *
 *   npm run presence
 * -----------------------------------------------------------------------------
 */

import {
  PRESENCE_STALE,
  TRAVELS,
  offlinePresence,
  presenceBody,
  readPresence,
} from '../src/data/presence'
import type { Presence } from '../src/data/types'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const NOW = 1_700_000_000_000

/** Somebody with every optional field set, so nothing can hide behind absence. */
const full: Presence = {
  id: 'warm',
  online: true,
  placeId: 'stars',
  position: [1.5, -2, 3.25],
  heading: 0.75,
  lastSeen: NOW - 100,
  racing: 'word-duel:2026-09-02',
  looking: 'memory-41',
  driving: 'rally-room-7',
  typing: NOW - 900,
}

console.log('\nthere and back\n')

{
  const body = presenceBody(full, {}, NOW - 100)
  const back = readPresence('warm', body, NOW)

  /*
    The check that matters, and the reason the list is exported rather than
    retyped: add a field to `Presence`, put it in `TRAVELS`, and forget either
    end of the wire, and this fails.
  */
  for (const field of TRAVELS) {
    const sent = (body as Record<string, unknown>)[field]
    const read = (back as unknown as Record<string, unknown>)[field]
    ok(
      `${field} survives the round trip`,
      JSON.stringify(sent) === JSON.stringify(read) && sent !== undefined,
      `sent ${JSON.stringify(sent)}, read back ${JSON.stringify(read)}`,
    )
  }
}

console.log('\nwhat an empty one looks like\n')

{
  const bare: Presence = { ...offlinePresence('cool'), online: true, placeId: 'clearing' }
  const body = presenceBody(bare, {}, NOW)
  /*
    Absent, not empty. RTDB rejects `undefined` outright, and a `null` would
    pass a `.validate` on a string field and read back as `""` — which every
    consumer would then have to know about.
  */
  for (const field of ['racing', 'looking', 'driving', 'typing'] as const) {
    ok(`${field} is left out entirely when there is none`, !(field in body))
  }
  const back = readPresence('cool', body, NOW)
  for (const field of ['racing', 'looking', 'driving', 'typing'] as const) {
    ok(`and reads back as absent rather than empty`, back[field] === undefined, `${field} = ${JSON.stringify(back[field])}`)
  }
}

console.log('\na patch beats what this device already believed\n')

{
  const body = presenceBody(full, { typing: 0, placeId: 'hollow' }, NOW)
  ok('a new place wins', body.placeId === 'hollow', String(body.placeId))
  /*
    Nought is how a *clear* is sent, and it has to survive `??` — which only
    falls through on null and undefined, so a zero is a real answer and means
    "stop saying I am typing". If this ever became `||`, clearing would
    silently keep whatever was there before, and the indicator would never go
    off while the tab stayed open.
  */
  ok('and clearing typing actually clears it', !('typing' in body), JSON.stringify(body.typing))
}

console.log('\nand the awkward ones\n')

{
  ok('nothing at all is somebody offline', readPresence('warm', null, NOW).online === false)
  ok('rubbish is somebody offline', readPresence('warm', 'hello', NOW).online === false)
  ok(
    'a stale write is offline however online it claims to be',
    readPresence('warm', { online: true, lastSeen: NOW - PRESENCE_STALE - 1 }, NOW).online === false,
  )
  ok(
    'a fresh one is online',
    readPresence('warm', { online: true, lastSeen: NOW - 1000 }, NOW).online === true,
  )
  const broken = readPresence('warm', { online: true, lastSeen: NOW, position: ['x', null] }, NOW)
  ok('a broken position does not become NaN', broken.position.every(Number.isFinite),
    JSON.stringify(broken.position))
  ok('a zero typing is not read as typing',
    readPresence('warm', { online: true, lastSeen: NOW, typing: 0 }, NOW).typing === undefined)
  ok('and neither is a string',
    readPresence('warm', { online: true, lastSeen: NOW, typing: 'yes' }, NOW).typing === undefined)
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
