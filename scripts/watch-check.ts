/**
 * The arithmetic that keeps two people on the same second.
 *
 * ---------------------------------------------------------------------------
 * Everything else about watching together can be looked at: the screen is
 * there or it is not, the queue has a row in it or it does not. This part
 * cannot, because proving it needs two devices in two countries and a video
 * long enough to drift — and by the time it is visibly wrong, it has been
 * wrong for a while.
 *
 * So it is checked here instead, where "she pressed pause four seconds ago and
 * this phone was asleep for two of them" is three numbers rather than an
 * afternoon.
 *
 *   npm run watch
 * ---------------------------------------------------------------------------
 */

import {
  DRIFT,
  LURCH,
  BEGIN_WITH,
  advance,
  beginnings,
  clock,
  correction,
  darkScreen,
  positionOf,
  queueItem,
  videoIdIn,
} from '../src/systems/watching'
import type { Queued } from '../src/data/types'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const at = (over: Partial<ReturnType<typeof darkScreen>>) => ({ ...darkScreen(), ...over })

console.log('\nwhere the video is\n')

{
  // Paused is simply where it was left, however long ago that was.
  const held = at({ videoId: 'x', playing: false, at: 90, since: 1_000_000 })
  ok('paused, it stays where it was left', positionOf(held, 1_000_000) === 90)
  ok('and an hour later it is still there', positionOf(held, 4_600_000) === 90)

  /*
    Playing, it is where it was plus how long the world has turned. This is the
    whole mechanism: neither device stores a position that ticks, so neither can
    tick at a different rate from the other.
  */
  const going = at({ videoId: 'x', playing: true, at: 30, since: 1_000_000 })
  ok('playing, it has moved on by exactly the time that passed',
    positionOf(going, 1_012_500) === 42.5)

  /*
    The case the anchor exists for: a phone that was asleep. It does not resume
    where it stopped, it arrives where the film got to.
  */
  ok('a phone asleep for four minutes wakes up in the right place',
    positionOf(going, 1_000_000 + 240_000) === 270)

  ok('and nothing is ever before the beginning',
    positionOf(at({ playing: true, at: 0, since: 5_000 }), 0) === 0)
}

console.log('\nwhat to do about being out of step\n')

{
  ok(`a tenth of a second is left alone — under ${DRIFT}s`,
    correction(0.1).do === 'hold' && correction(-0.1).do === 'hold')
  ok('a second behind is recovered by playing very slightly faster',
    correction(-1).do === 'drift' && correction(-1).rate > 1)
  ok('a second ahead, very slightly slower',
    correction(1).do === 'drift' && correction(1).rate < 1)
  ok(`past ${LURCH}s it is a jump, not a nudge`,
    correction(4).do === 'seek' && correction(-4).do === 'seek')
  /*
    A seek is not free — the picture stalls and the sound cuts — so the band
    between the two thresholds has to be genuinely wide enough to hide a
    correction in. If these ever met, every small drift would become a stutter.
  */
  ok(`and there is real room between them — ${DRIFT}s to ${LURCH}s`, LURCH > DRIFT * 2)
  ok('every correction stays a sane playback rate', [0, 0.5, 1, 2, 3, 40, -40]
    .every((off) => {
      const { rate } = correction(off)
      return Number.isFinite(rate) && rate >= 0.5 && rate <= 2
    }))
}

console.log('\nwhat counts as a link\n')

{
  const same = 'dQw4w9WgXcQ'
  const shapes: [string, string | null][] = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', same],
    ['https://youtu.be/dQw4w9WgXcQ', same],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', same],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', same],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', same],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', same],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', same],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', same],
    ['youtube.com/watch?v=dQw4w9WgXcQ', same],
    ['  dQw4w9WgXcQ  ', same],
    ['https://vimeo.com/12345', null],
    ['not a link at all', null],
    ['', null],
    ['https://www.youtube.com/watch?v=tooshort', null],
  ]
  for (const [text, want] of shapes) {
    const got = videoIdIn(text)
    ok(`${text === '' ? '(nothing)' : text.trim().slice(0, 44)} → ${want ?? 'not a video'}`, got === want,
      `got ${got ?? 'null'}`)
  }
}

console.log('\nthe queue\n')

{
  const a = queueItem('warm', { videoId: 'aaaaaaaaaaa', title: 'one' })
  const b = queueItem('cool', { videoId: 'bbbbbbbbbbb', title: 'two' })
  ok('two things added in the same millisecond get different ids', a.id !== b.id)

  const first = advance([a, b])
  ok('the next one is the oldest', first.next?.id === a.id)
  ok('and it is off the list', first.rest.length === 1 && first.rest[0].id === b.id)

  /*
    The one move both devices may make at the same moment: a video ends on two
    phones within a frame of each other and both advance. It has to be
    *idempotent in effect* — both must compute the same next video from the same
    list, so the second write agrees with the first instead of fighting it.
  */
  const hers = advance([a, b])
  ok('both devices advancing together reach the same answer',
    hers.next?.id === first.next?.id && hers.rest[0].id === first.rest[0].id)

  const empty = advance([])
  ok('an empty queue advances to nothing rather than throwing',
    empty.next === null && empty.rest.length === 0)

  const dropped: Queued[] = [a, b].filter((q) => q.id !== a.id)
  ok('taking one out takes exactly one out', dropped.length === 1 && dropped[0].id === b.id)
}

console.log('\nsomewhere to begin\n')

{
  /*
    Three, and never the same three twice.

    The count is a *layout* fact — a fourth chip wrapped onto a second row on
    a phone and pushed the queue off the bottom of the panel — so it is held
    here rather than left to a stylesheet to be careful about.
  */
  const one = beginnings()
  ok(`three of them — ${one.length}`, one.length === BEGIN_WITH && BEGIN_WITH === 3)
  ok('all different from each other', new Set(one).size === one.length)
  ok('and none of them empty', one.every((idea) => idea.trim().length > 2))

  /*
    They have to actually rotate. A fixed set becomes furniture within a week
    and then the empty field is empty again, which is the whole reason the
    suggestions exist. Twenty draws landing on the same three every time would
    be a bug in the shuffle rather than luck.
  */
  const seen = new Set<string>()
  for (let i = 0; i < 20; i++) seen.add(beginnings().join('|'))
  ok(`and they change between sessions — ${seen.size} different sets in 20`, seen.size > 3)
}

console.log('\nsaying how long\n')

{
  ok('4:03', clock(243) === '4:03')
  ok('0:07', clock(7) === '0:07')
  ok('1:02:11', clock(3731) === '1:02:11')
  ok('nothing known says nothing', clock(0) === '' && clock(Number.NaN) === '')
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
