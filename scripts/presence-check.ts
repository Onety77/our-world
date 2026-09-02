/**
 * Everything that crosses a seam, sent and read back.
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
 *   npm run seams
 * -----------------------------------------------------------------------------
 */

import {
  PRESENCE_STALE,
  TRAVELS,
  offlinePresence,
  presenceBody,
  readPresence,
} from '../src/data/presence'
import { TRAVELS as MESSAGE_FIELDS, markPatch, readMessage } from '../src/data/messages'
import { HEART } from '../src/data/types'
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

console.log('')
console.log('a message, there and back')
console.log('')

{
  /*
    The fourth instance of this bug, and why this file grew a second half.
    `marks` was written to Firestore, allowed by the rules, and then dropped
    by a reader that spelled its fields out by hand — so every emoji came back
    as a heart. Nothing threw; the mock keeps whole objects and cannot have
    the fault, so nothing a browser can run would have seen it.
  */
  const raw = {
    by: 'cool',
    body: 'wat word ends in rt',
    at: 1_700_000_000_000,
    replyTo: 'said-abc',
    hearts: { warm: 1_700_000_000_100, cool: 1_700_000_000_200 },
    marks: { warm: '😂', cool: '💀' },
  }
  const back = readMessage('m1', raw)
  ok('a message reads back at all', back !== null)
  if (back) {
    for (const field of MESSAGE_FIELDS) {
      const sent = (raw as Record<string, unknown>)[field]
      const read = (back as unknown as Record<string, unknown>)[field]
      ok(
        field + ' survives the round trip',
        JSON.stringify(sent) === JSON.stringify(read),
        'sent ' + JSON.stringify(sent) + ', read back ' + JSON.stringify(read),
      )
    }
    ok('and the mark that came back is the one that was sent, not a heart',
      back.marks?.warm === '😂', JSON.stringify(back.marks))
  }

  ok('a message with no body is not a message', readMessage('m2', { by: 'warm', at: 1 }) === null)
  ok('and neither is nothing at all', readMessage('m3', null) === null)

  const bare = readMessage('m4', { by: 'warm', body: 'hi', at: 1 })
  ok('no hearts reads back as absent, not empty', bare?.hearts === undefined)
  ok('and no marks likewise', bare?.marks === undefined)
  ok('a blank mark is not a mark',
    readMessage('m5', { by: 'warm', body: 'hi', at: 1, marks: { warm: '' } })?.marks === undefined)
}

console.log('')
console.log('leaving one, and taking it back')
console.log('')

{
  const GONE = '<deleted>'
  const laugh = markPatch('warm', true, '😂', 500, GONE)
  ok('a mark writes the glyph', laugh['marks.warm'] === '😂', JSON.stringify(laugh))
  ok('and stamps the heart map, which is what "reacted" means',
    laugh['hearts.warm'] === 500, JSON.stringify(laugh))

  /*
    A heart writes no mark. That is what keeps a message reacted to before
    there was any choice of glyph the same shape on the wire as one hearted
    today, and is why `markBy` needs no special case for the old ones.
  */
  const heart = markPatch('warm', true, HEART, 500, GONE)
  ok('a heart leaves no mark behind', heart['marks.warm'] === GONE, JSON.stringify(heart))

  const undo = markPatch('warm', false, '😂', 500, GONE)
  ok('taking it back clears both', undo['hearts.warm'] === GONE && undo['marks.warm'] === GONE,
    JSON.stringify(undo))

  ok('and it only ever touches your own keys',
    Object.keys(laugh).every((k) => k.endsWith('.warm')), Object.keys(laugh).join(' '))
  /*
    These two prefixes are also what `firestore.rules` names in its
    `affectedKeys` list. They were added here and not there once already, and
    every emoji tap was refused until somebody tried it on a phone.
  */
  ok('under exactly the two maps the rules allow',
    Object.keys(laugh).every((k) => k.startsWith('hearts.') || k.startsWith('marks.')),
    Object.keys(laugh).join(' '))
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
