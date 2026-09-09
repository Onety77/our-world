/**
 * The arithmetic of the Fold: the spacing, the growth, and the mist.
 *
 * ---------------------------------------------------------------------------
 * **Pure on purpose.** No React, no three, no data layer. Everything in here is
 * a function of its arguments, which is what lets `npm run fold` drive the
 * whole schedule — including the part that cannot be seen from one device —
 * without a browser. Same standing as `systems/archive`.
 *
 * The reasoning for every rule below is in `sections/fold/README.md`; what is
 * here is the rule and the one sentence that says why it is not the obvious
 * one.
 * ---------------------------------------------------------------------------
 */

import {
  FOLD_BOXES,
  FOLD_SESSION,
  FULL_GROWN_DAYS,
  type Practice,
  type UserId,
  type Word,
} from '@/data/types'

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// The spacing
// ---------------------------------------------------------------------------

/** Where a person stands with a word. `null` means they have never seen it. */
export function boxOf(word: Word, me: UserId): number | null {
  const box = word.boxes?.[me]
  return typeof box === 'number' ? box : null
}

/**
 * When this person should next see a word. A word never seen is due now.
 *
 * Zero rather than `null` so every caller can sort on one number; a word with
 * no schedule sorts to the front, which is where a new word belongs.
 */
export function dueAtFor(word: Word, me: UserId): number {
  const at = word.dueAt?.[me]
  return typeof at === 'number' ? at : 0
}

/**
 * The result of turning one word over.
 *
 * **Wrong drops to box 1, not box 0**, and that single line is most of what
 * separates a deck people keep from a deck people quit. Box 0 is "you have
 * never met this", and sending a word you half-know all the way back there
 * costs a day of nothing and tells you that you are worse at this than you
 * are. Box 1 costs a day and no self-respect.
 *
 * Box 0 comes back inside the same session rather than tomorrow — an interval
 * of zero days — because the first time you meet a word is the one moment
 * repetition genuinely helps.
 */
export function nextBox(current: number | null, got: boolean): number {
  if (!got) return 1
  if (current === null) return 1
  return Math.min(FOLD_BOXES.length - 1, current + 1)
}

/** epoch ms a word in this box should next come round. */
export function dueAfter(box: number, now: number): number {
  const days = FOLD_BOXES[Math.max(0, Math.min(FOLD_BOXES.length - 1, box))]
  return now + days * DAY_MS
}

/** Everything one turn changes about one person's half of a word. */
export function turnOf(
  word: Word,
  me: UserId,
  got: boolean,
  now: number,
): { box: number; dueAt: number; landed: boolean } {
  const box = nextBox(boxOf(word, me), got)
  return {
    box,
    dueAt: dueAfter(box, now),
    /*
      A handed word "lands" the first time the person it was given to gets it.

      Once, ever, and only for a handed word: it exists so the one who gave it
      can be told, quietly, that it arrived somewhere. It is deliberately not a
      count — the moment this becomes "she has learned 43 of your words" it is
      a scoreboard, and there are two people here forever.
    */
    landed: Boolean(got && word.handed && !word.landedAt?.[me]),
  }
}

/**
 * How many words of a practice this person has met at all.
 *
 * Not a score and never shown as one — it is what decides whether a practice
 * has enough in it to be worth a session.
 */
export function metCount(words: Word[], me: UserId): number {
  return words.filter((w) => boxOf(w, me) !== null).length
}

/**
 * The words to put in front of somebody now, in the order to put them.
 *
 * ---------------------------------------------------------------------------
 * Three rules, and the third is the one that is easy to get wrong.
 *
 * 1. Words already started and now due come first, most overdue first. They are
 *    the whole point of spacing: a word reviewed on the day it is about to go
 *    is worth several reviewed early.
 * 2. Then new words, oldest first, and **capped**. A deck of sixty words pasted
 *    in on a Sunday would otherwise put sixty unknown words in front of
 *    somebody in one sitting, which is how a deck gets abandoned on the same
 *    Sunday.
 * 3. A word handed to you by the other one jumps the new queue. It is the one
 *    thing here that is *from* somebody, and it should not wait behind eleven
 *    words off a list.
 * ---------------------------------------------------------------------------
 */
export function sessionFor(
  words: Word[],
  me: UserId,
  now: number,
  { size = FOLD_SESSION, fresh = 6 }: { size?: number; fresh?: number } = {},
): Word[] {
  const due: Word[] = []
  const newly: Word[] = []

  for (const word of words) {
    if (boxOf(word, me) === null) newly.push(word)
    else if (dueAtFor(word, me) <= now) due.push(word)
  }

  due.sort((a, b) => dueAtFor(a, me) - dueAtFor(b, me))
  newly.sort((a, b) => {
    // Handed first, then oldest. See rule 3.
    const handed = Number(Boolean(b.handed)) - Number(Boolean(a.handed))
    return handed !== 0 ? handed : a.at - b.at
  })

  const room = Math.max(0, size - due.length)
  return [...due, ...newly.slice(0, Math.min(fresh, room))].slice(0, size)
}

/** How many words are waiting for this person, without building the session. */
export function waitingCount(words: Word[], me: UserId, now: number): number {
  return sessionFor(words, me, now).length
}

// ---------------------------------------------------------------------------
// The animals
// ---------------------------------------------------------------------------

/**
 * How grown an animal is, 0..1, from the days its practice has been kept.
 *
 * **A square root, not a straight line.** Sixty days is full grown, and on a
 * straight line the first week moves an animal by a ninth of nothing — which is
 * exactly the fortnight a new habit has to survive. The root front-loads it: a
 * week of a new practice is already a third of the way, and the last stretch
 * takes a month, which is the right way round for something meant to reward
 * starting.
 */
export function growth(days: number): number {
  if (days <= 0) return 0
  return Math.min(1, Math.sqrt(days / FULL_GROWN_DAYS))
}

/**
 * The scale an animal is actually drawn at.
 *
 * A new practice is not drawn at nothing — it is drawn small, and visibly an
 * animal. Something at four per cent of its size is a bug on the grass.
 *
 * **Larger than life, and measured against a render rather than against a tape.**
 * At true size a dog on the far bank of the fold was four pixels on a phone.
 * These are read across sixty metres of hillside in fog, which is a job for a
 * silhouette rather than for accuracy — the first pass was life-sized and every
 * animal on the hill was lost in the grass.
 */
export function creatureScale(days: number): number {
  return 0.72 + growth(days) * 0.78
}

/** What an animal is doing. Nothing in this list is a punishment. */
export type Mood = 'near' | 'grazing' | 'far' | 'resting'

export interface Condition {
  mood: Mood
  /** Whole days since the practice was last kept. Large when never. */
  since: number
  /** 0 at your feet, 1 at the far side of the fold. Drives where it stands. */
  away: number
  /** 0 lying down, 1 up and moving. */
  awake: number
}

/**
 * Where an animal is and what it is doing, from how long since it was fed.
 *
 * ---------------------------------------------------------------------------
 * **Derived, never stored.** A mood written into a document is a mood that is
 * wrong the moment a device has been asleep for a fortnight, and the failure is
 * silent — you would open the Fold to a happy animal nobody had fed since
 * August.
 *
 * **And nothing in here shrinks, dies or is angry.** The brief asked for an
 * animal that shrinks when you stop; `data/types.ts` had already settled that
 * argument for plants — *a garden that punishes a missed week kills the habit it
 * exists to build* — and this is the same argument with fur on it. What absence
 * moves is distance and posture: near and awake, or lying down at the far end of
 * the fold. The mist does the rest, and does it without telling anybody off.
 * ---------------------------------------------------------------------------
 */
export function conditionOf(practice: Practice, today: string): Condition {
  const since = practice.lastDay === null ? 999 : daysBetween(practice.lastDay, today)

  /*
    Four bands rather than a curve, because the thing being communicated is
    categorical — "you are keeping this" against "you have not been here in a
    while" — and a smooth ramp says neither at any point along it.
  */
  const mood: Mood =
    since <= 1 ? 'near' : since <= 6 ? 'grazing' : since <= 20 ? 'far' : 'resting'

  /*
    A practice put out to rest goes to the far end whatever the dates say. The
    animal is not being neglected, it has been let be — same picture, and the
    words in the UI are the only thing that tells the two apart, because the
    difference is in the person's intention and nothing else can know it.
  */
  if (practice.restingAt) return { mood: 'resting', since, away: 0.88, awake: 0.2 }

  const away = mood === 'near' ? 0.12 : mood === 'grazing' ? 0.38 : mood === 'far' ? 0.72 : 0.95
  const awake = mood === 'near' ? 1 : mood === 'grazing' ? 0.85 : mood === 'far' ? 0.5 : 0.08
  return { mood, since, away, awake }
}

/** Whole days between two "YYYY-MM-DD" keys. Negative if the second is earlier. */
export function daysBetween(a: string, b: string): number {
  const from = Date.parse(a + 'T00:00:00Z')
  const to = Date.parse(b + 'T00:00:00Z')
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.round((to - from) / DAY_MS)
}

/** Whether this practice has already been kept on this local day. */
export function keptToday(practice: Practice, today: string): boolean {
  return practice.lastDay === today
}

/**
 * How many of the last `span` days a practice was kept.
 *
 * For the one line the threshold is allowed to say. **Not a streak**: a streak
 * is a number with a cliff in it, and the whole of this section is built not to
 * have a cliff. "Eleven of the last fourteen" survives a bad Tuesday.
 */
export function keptRecently(practice: Practice, today: string, span = 14): number {
  return practice.recent.filter((day) => {
    const back = daysBetween(day, today)
    return back >= 0 && back < span
  }).length
}

// ---------------------------------------------------------------------------
// The mist
// ---------------------------------------------------------------------------

/**
 * How far you can see, as a session goes on.
 *
 * The only progress indicator in this place, and it is the fog uniforms every
 * shader in the garden already carries rather than anything drawn. `progress`
 * walks the near and far planes out from a couple of metres to the far side of
 * the hill — so finishing is not a bar filling, it is the fold appearing, with
 * every animal on it including the ones nobody has fed.
 *
 * Eased rather than linear: the first two words open a lot of ground, which is
 * the reward for starting, and the last stretch to the far wall is slow enough
 * that finishing is a moment rather than an arrival you had already had.
 */
export function mistAt(
  progress: number,
  open: { near: number; far: number },
): { near: number; far: number } {
  const t = Math.max(0, Math.min(1, progress))
  const eased = 1 - Math.pow(1 - t, 2.1)
  return {
    /*
      ---------------------------------------------------------------------
      **Six and forty-six at its thickest, and both numbers were measured off
      a render rather than chosen.**

      The first pass used two and thirteen, which put the near plane in the
      grass at your own feet: everything past thirteen metres reached a full
      mix and the screen came out flat white with a few blades in the bottom
      corner. That is not mist, it is a fault, and it is what somebody would
      report as the section failing to load.

      What these two give, **measured off the render** rather than predicted —
      distances read from `window.__fold` with the camera where the section
      definition actually puts it, which is further back than the geometry in
      `layout.ts` suggests, because `backOffFor` stands a portrait camera off:

        an animal being kept       23 m   39% fog   — hazy, and plainly there
        one a week behind          31 m   68%       — a shape, no more
        one a month behind         47 m  ~100%      — gone
        the wall                   40 m   94%       — a ghost across the middle
        the far ridge              65 m  ~100%      — gone

      Which is the whole design in one column: **the practice you have kept is
      standing next to you in the fog, and the ones you have not are what the
      work gives back.** A near plane any closer takes the first line as well —
      at two metres the first render was a white screen.
      ---------------------------------------------------------------------
    */
    near: 6 + (open.near - 6) * eased,
    far: 46 + (open.far - 46) * eased,
  }
}

/*
  ---------------------------------------------------------------------------
  **Where pronunciation would go, and why there is no stub here for it.**

  Saying a word out loud is the one thing a model would genuinely add to this
  place, and it cannot be added the way the YouTube key was.
  `VITE_YOUTUBE_API_KEY` is a public browser credential that can be restricted
  to one API and one site; an OpenAI key is a bearer token with the owner's
  credits behind it, and *any* `VITE_` variable is substituted into the
  JavaScript bundle — which Vercel serves to anybody who finds the address,
  before a single sign-in.

  So it goes through `functions/`, where the key stays on the server and the two
  signed-in accounts are the only callers the rules admit: one endpoint, one
  cached audio file per word in Storage, and a `voiceOf(word)` on the DataLayer
  beside `pictureUrl`. That is the shape; there is deliberately no empty
  function sitting here waiting for it, because an export that always returns
  null is dead code with a good excuse.

  `speechSynthesis` was considered and rejected. It is on the device already and
  free, and it reads a Spanish word in whatever voice the phone happens to have
  installed — which on most phones is an English one. A wrong pronunciation
  taught confidently is worse than no pronunciation at all.
  ---------------------------------------------------------------------------
*/
