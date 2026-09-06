/**
 * The seal on a thought left for a day.
 *
 * ---------------------------------------------------------------------------
 * The rule is one sentence — *she cannot read it until the day comes* — and
 * like every rule of that shape in this world it fails silently. On one device
 * with one account it is never tested at all: alone, there is nobody to leak
 * to, and your own sealed thought is deliberately readable by you, so the
 * happy path a person would try by hand is the one path that proves nothing.
 *
 * The **enforcement** is in `firestore.rules`, under
 * `letters/{id}/sealed/words`, and cannot be run from here. What can be run
 * from here is everything above the wire — the mock, which every other check
 * in this repo trusts, and the two functions that decide what ends up on a
 * screen. If the mock hands out words the rules would refuse, then every
 * browser check in this repo is quietly testing a garden with no seal in it.
 *
 * The one thing this cannot see is a real Firestore refusing a real read. That
 * is the same standing as the archive's seal and the hearts rule, and it is
 * written down in `PLAN.md` rather than pretended away.
 *
 *   npm run sealed
 * ---------------------------------------------------------------------------
 */

/*
  One shared store, so there can be two of them.

  `data/local` keeps the world in `localStorage`, which is how two tabs — and
  in this file, two people — end up looking at the same garden. Node has none,
  so without this each layer loads its own private world and the thought one of
  them writes is invisible to the other for a reason that has nothing to do
  with seals: the check would pass on an empty room.

  Deliberately the smallest thing that satisfies the three methods used, rather
  than a dependency.
*/
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

import { sealUntil, stillSealed } from '../src/data/types'
import type { DataLayer, Letter, UserId } from '../src/data/types'

/*
  `data/local` is reached through `import()` rather than an `import` line, and
  that is the whole reason the store above works.

  Static imports are hoisted and run *before* any statement in this file, so a
  polyfill written at the top is still installed too late for anything the
  imported module does on the way up. Loading it on demand, after the store
  exists, is the only order that is actually guaranteed. `data/types` is pure
  and can come the ordinary way.
*/
const localLayer = async () => (await import('../src/data/local')).createLocalDataLayer

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const DAY = 86_400_000

/** `YYYY-MM-DD`, `days` from now, in this machine's zone — what a field gives. */
function dayField(days: number): string {
  const at = new Date()
  at.setDate(at.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/**
 * The world as one of the two of them receives it.
 *
 * `subscribe` hands over the current state *synchronously*, before it has
 * returned the function to stop with — so unsubscribing from inside the
 * listener reaches for a name that does not exist yet. The state is taken
 * here and the subscription closed after, which is the order the seam
 * actually offers.
 */
function lettersFor(layer: DataLayer): Letter[] {
  let held: Letter[] = []
  const stop = layer.subscribe((world) => {
    held = world.letters
  })
  stop()
  return held
}

async function main() {
  console.log('\nthe day, turned into a moment\n')

  const midnight = sealUntil(dayField(10))
  ok('a day becomes a number', typeof midnight === 'number')
  if (midnight !== null) {
    const at = new Date(midnight)
    ok(
      'and it is the first instant of that day, not the hour it was written',
      at.getHours() === 0 && at.getMinutes() === 0 && at.getSeconds() === 0,
      at.toString(),
    )
  }
  ok('nonsense is refused rather than opening now', sealUntil('tomorrow') === null)
  ok('an impossible day is refused', sealUntil('2026-02-31') === null, 'the 31st of February')
  ok('an empty day is refused', sealUntil('') === null)

  console.log('\nwhat each of them can see\n')

  /*
    Two people over one store, and **hers is opened after he has written**.

    A layer loads the world once, when it is made, and there are no storage
    events in Node to tell it otherwise. Making hers first would give her a
    garden from before the thought existed and the check would pass on an
    empty room — which is the way this check is most likely to lie.

    One thing here is deliberately *harder* than reality: both layers are in
    one process, so the words of the sealed thought are sitting in the same
    module-level map hers can reach. On her real phone they would never have
    arrived at all. If the seal holds here, it holds with the answer in the
    room.
  */
  const createLocalDataLayer = await localLayer()
  const his = createLocalDataLayer('warm' as UserId)

  const openAt = sealUntil(dayField(30))
  await his.writeLetter({
    body: 'the sealed words',
    placeId: 'tree',
    position: [0, 0, 0],
    openAt,
  })

  const hers = createLocalDataLayer('cool' as UserId)
  const onHerDevice = lettersFor(hers).filter((l) => l.openAt !== null)
  const onHis = lettersFor(his).filter((l) => l.openAt !== null)

  ok('the thought reaches her at all', onHerDevice.length === 1, `${onHerDevice.length} of them`)
  const sealed = onHerDevice[0]
  if (!sealed) {
    console.log('\n  nothing to check against.\n')
    process.exit(1)
  }

  /*
    The one that matters. Not "the interface did not draw it" — *the words are
    not in what her device received*. Everything else in this file is a
    consequence; this is the seal.
  */
  ok(
    'and the words are not in it',
    sealed.body === '',
    sealed.body === '' ? '' : `her device received: "${sealed.body}"`,
  )
  ok('it carries the day it opens', sealed.openAt === openAt)
  ok('it is sealed to her', stillSealed(sealed, 'cool' as UserId, Date.now()))
  ok('and never to him', !stillSealed(onHis[0]!, 'warm' as UserId, Date.now()))

  console.log('\nasking early, and asking late\n')

  ok(
    'she is refused the words before the day',
    (await hers.readSealedLetter(sealed.id)) === null,
  )
  ok(
    'he may reread his own whenever he likes',
    (await his.readSealedLetter(sealed.id)) === 'the sealed words',
  )

  /*
    The day arriving, tested by asking as if it had.

    `stillSealed` takes `now` as an argument rather than reading the clock
    precisely so that the moment a seal opens is something a check can stand
    in, instead of something only a calendar can prove.
  */
  ok(
    'and once the day has come it is open to her',
    !stillSealed(sealed, 'cool' as UserId, openAt! + 1),
  )
  ok('but not one moment before it', stillSealed(sealed, 'cool' as UserId, openAt! - 1))

  console.log('\na day already gone\n')

  /*
    The case that would be a silent disaster: a date behind us must produce an
    ordinary thought, written the ordinary way, rather than one that arrives
    sealed with its words in a second document nothing will ever open.
  */
  await his.writeLetter({
    body: 'yesterday',
    placeId: 'tree',
    position: [0, 0, 0],
    openAt: Date.now() - DAY,
  })
  const past = lettersFor(createLocalDataLayer('cool' as UserId)).find((l) => l.body === 'yesterday')
  ok('a day in the past is not a seal', past !== undefined && past.openAt === null)
  ok('and its words arrive normally', past?.body === 'yesterday')

  console.log(
    failed === 0
      ? '\n  the seal holds above the wire. firestore.rules is the half that enforces it.\n'
      : `\n  ${failed} failed.\n`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

void main()
