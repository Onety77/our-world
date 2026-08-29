/**
 * Wheel to wheel: do both phones drop the flag at the same instant?
 *
 * `npm run lobby`
 *
 * ---------------------------------------------------------------------------
 * This is the one thing in the live round that cannot be checked by looking at
 * it. Everything else — is she here, is she ready, does the number count down
 * — is visible on one screen. Whether the *other* screen agrees is not, and it
 * is the entire promise: the flag drops once, for both of you.
 *
 * There is no server deciding it. Each device works the moment out from two
 * timestamps carried on the presence channel, so the correctness argument is a
 * symmetry: `agreedStart(key, a, b)` must equal `agreedStart(key, b, a)`, for
 * every pair, always. If that ever fails, one car leaves before the other and
 * nothing on either screen would tell you why.
 *
 * A two-device test would be better and is not available here: the local
 * backend keeps presence per browser profile with no live channel between
 * tabs, so two tabs cannot see each other. This checks the arithmetic the two
 * devices would each be doing.
 * ---------------------------------------------------------------------------
 */

import {
  LOBBY_COUNTDOWN_MS,
  agreedStart,
  raceKey,
  readSitting,
  stageOfKey,
  writeSitting,
} from '../src/systems/lobby'

let failures = 0
function check(what: string, got: unknown, want: unknown): void {
  const pass = JSON.stringify(got) === JSON.stringify(want)
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${what}${pass ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`)
}

// ---------------------------------------------------------------------------
console.log('\nThe key carries the road\n')

const key = raceKey(1_730_000_000_000, 'moonbreak')
check('a key is a moment and a road', key, '1730000000000.moonbreak')
check('the road comes back out', stageOfKey(key, 'rootway'), 'moonbreak')
check('a key with no road falls back', stageOfKey('1730000000000', 'rootway'), 'rootway')
check('so does an empty one', stageOfKey('1730000000000.', 'rootway'), 'rootway')
check('the key fits the presence field', key.length + 1 + 13 <= 64, true)

// ---------------------------------------------------------------------------
console.log('\nSitting in a room\n')

check('nobody', readSitting(''), null)
check('nobody, undefined', readSitting(undefined), null)
check('here, not ready', readSitting(key), { key, readyAt: null })
check(
  'here and ready',
  readSitting(writeSitting(key, 1_730_000_005_000)),
  { key, readyAt: 1_730_000_005_000 },
)
/*
  A device running the previous build writes a bare key. It must read as
  somebody who is in the room and has not pressed the button — not as an error,
  and not as ready.
*/
check('yesterday\'s build is simply not ready', readSitting('1730000000000'), {
  key: '1730000000000',
  readyAt: null,
})
check('rubbish after the marker is not a time', readSitting(`${key}@nonsense`), {
  key,
  readyAt: null,
})

// ---------------------------------------------------------------------------
console.log('\nBoth phones must reach the same instant\n')

const her = readSitting(writeSitting(key, 1_730_000_004_000))
const mine = readSitting(writeSitting(key, 1_730_000_006_500))

const fromMyPhone = agreedStart(key, mine, her)
const fromHerPhone = agreedStart(key, her, mine)
check('my phone and hers agree', fromMyPhone, fromHerPhone)
check('and it hangs off the later press', fromMyPhone, 1_730_000_006_500 + LOBBY_COUNTDOWN_MS)

check('one of us not ready is no start', agreedStart(key, mine, readSitting(key)), null)
check('neither ready is no start', agreedStart(key, readSitting(key), readSitting(key)), null)
check('she is not in the room at all', agreedStart(key, mine, null), null)
check(
  'she is ready in a different room',
  agreedStart(key, mine, readSitting(writeSitting('1730000009999.rootway', 1_730_000_004_000))),
  null,
)

/*
  Exhaustive rather than illustrative.

  The symmetry is the whole argument, so it is worth asserting over a spread of
  orders and gaps rather than the one pair somebody thought of.
*/
let asymmetric = 0
for (let a = 0; a < 40; a++) {
  for (let b = 0; b < 40; b++) {
    const left = readSitting(writeSitting(key, 1_730_000_000_000 + a * 137))
    const right = readSitting(writeSitting(key, 1_730_000_000_000 + b * 311))
    if (agreedStart(key, left, right) !== agreedStart(key, right, left)) asymmetric++
  }
}
check('1600 pairs, both orders, same answer', asymmetric, 0)

console.log(
  failures === 0
    ? '\n  the flag drops once, for both of you\n'
    : `\n  ${failures} FAILED — one car would leave before the other\n`,
)
process.exit(failures === 0 ? 0 : 1)
