/**
 * A Fold with something already in it, for the mock.
 *
 * Same reasoning as the seeded letters and the seeded conversation: a place
 * that opens completely empty cannot be judged, and every check that walks
 * this section would otherwise be walking an empty hill.
 *
 * **Never reached by the real backend.** `data/local.ts` is the in-memory mock
 * and says so on screen.
 *
 * The dates below are deliberately uneven — one practice kept yesterday, one a
 * week ago, one abandoned in the summer — because the whole readout of this
 * place is *which animals are near and which are lying down in the mist*, and a
 * seed where everything was fed this morning would show none of it.
 */

import { newId } from './ids'
import { PRACTICE_RECENT, type Practice, type Word } from './types'

const DAY = 86_400_000

/** "YYYY-MM-DD" for a number of days before now, in UTC. Mock only. */
function dayKey(daysAgo: number, now: number): string {
  return new Date(now - daysAgo * DAY).toISOString().slice(0, 10)
}

/** The days a practice was kept, most recent first, at roughly this rate. */
function keptDays(count: number, everyNth: number, from: number, now: number): string[] {
  const days: string[] = []
  for (let i = 0; days.length < count && i < PRACTICE_RECENT * 2; i++) {
    const back = from + i * everyNth
    days.push(dayKey(back, now))
  }
  return days.slice(0, PRACTICE_RECENT)
}

export function seedPractices(now = Date.now()): Practice[] {
  return [
    {
      /*
        The shared one, and the one the brief was really asking for.

        Both of them feed it, so it is always the healthiest thing on the hill —
        which is the point: the practice two people keep is the one that
        survives. This is the dog.
      */
      id: 'seed-practice-spanish',
      name: 'Spanish',
      kind: 'words',
      by: 'both',
      creature: 'dog',
      startedAt: now - 74 * DAY,
      days: 41,
      lastDay: dayKey(0, now),
      recent: keptDays(41, 1, 0, now),
    },
    {
      id: 'seed-practice-drawing',
      name: 'drawing hands',
      kind: 'days',
      by: 'warm',
      creature: 'hare',
      startedAt: now - 30 * DAY,
      days: 12,
      lastDay: dayKey(4, now),
      recent: keptDays(12, 2, 4, now),
    },
    {
      id: 'seed-practice-piano',
      name: 'the left hand',
      kind: 'days',
      by: 'cool',
      creature: 'crane',
      startedAt: now - 52 * DAY,
      days: 23,
      lastDay: dayKey(1, now),
      recent: keptDays(23, 2, 1, now),
    },
    {
      /* Nobody has been near this since the summer. It is asleep at the far
         end of the fold, and you will not see it until the mist has lifted. */
      id: 'seed-practice-running',
      name: 'running, badly',
      kind: 'days',
      by: 'warm',
      creature: 'goat',
      startedAt: now - 96 * DAY,
      days: 7,
      lastDay: dayKey(48, now),
      recent: keptDays(7, 3, 48, now),
    },
  ]
}

/**
 * A small Spanish deck at four different stages of being learned, so the
 * spacing has something true to do on a first run.
 */
export function seedWords(now = Date.now()): Word[] {
  const rows: [string, string, string | undefined, 'warm' | 'cool', number, boolean][] = [
    ['la madrugada', 'the small hours, before dawn', 'she used it about a phone call', 'cool', 4, false],
    ['el desvelo', 'being unable to sleep', undefined, 'cool', 3, true],
    ['añorar', 'to miss something you may not get back', 'not the same as extrañar', 'warm', 3, false],
    ['el amanecer', 'daybreak', undefined, 'warm', 2, false],
    ['la niebla', 'the mist', 'on the hill, this morning', 'cool', 2, true],
    ['tender', 'to hang washing out', undefined, 'warm', 1, false],
    ['el rebaño', 'a flock, a fold of animals', undefined, 'cool', 1, false],
    ['el atardecer', 'the late part of the afternoon', undefined, 'warm', 1, false],
    ['acurrucarse', 'to curl up against someone', undefined, 'cool', 0, true],
    ['el brillo', 'a shine, a glint', undefined, 'warm', 0, false],
    ['sobremesa', 'the talk that keeps you at the table', 'no word for it in English', 'cool', 0, false],
    ['la cordillera', 'a range of hills', undefined, 'warm', 0, false],
  ]

  return rows.map(([text, meaning, note, by, box, handed], i) => ({
    id: `seed-word-${i}`,
    practiceId: 'seed-practice-spanish',
    text,
    meaning,
    ...(note ? { note } : {}),
    by,
    at: now - (rows.length - i) * 3 * DAY,
    ...(handed ? { handed: true } : {}),
    /*
      Both of them have met the older half and neither has met the newest,
      offset from each other — because two people learning the same language do
      not know the same words at the same time, and a seed where they did would
      hide the one thing this shape exists for.
    */
    boxes: {
      warm: box,
      ...(i % 3 === 0 ? {} : { cool: Math.max(0, box - 1) }),
    },
    dueAt: {
      // Half of them are due now, so a first session is not empty.
      warm: i % 2 === 0 ? now - DAY : now + 2 * DAY,
      ...(i % 3 === 0 ? {} : { cool: now - DAY }),
    },
  }))
}

/** A brand new word, as either layer would write it. */
export function newWord(input: {
  practiceId: string
  text: string
  meaning: string
  note?: string
  handed?: boolean
  by: 'warm' | 'cool'
  at: number
}): Word {
  return {
    id: newId(),
    practiceId: input.practiceId,
    text: input.text.trim(),
    meaning: input.meaning.trim(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    by: input.by,
    at: input.at,
    ...(input.handed ? { handed: true } : {}),
    boxes: {},
    dueAt: {},
  }
}
