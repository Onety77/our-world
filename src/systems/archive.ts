/**
 * The archive of what the two of you have watched.
 *
 * ---------------------------------------------------------------------------
 * **Arithmetic and rules, and nothing else.** Everything here can be read,
 * argued with and checked without a database, a component, or a star on a
 * screen — the same split `systems/watching` makes against the iframe, and it
 * is here for the same reason: the interesting part of this is a *seal*, and a
 * seal is exactly the kind of thing that is easy to get subtly wrong and
 * impossible to notice.
 *
 * The seal, in one sentence: **neither of you sees the other's score until you
 * have both given one.** It is enforced in `firestore.rules`, where her score
 * lives in a document this device may not read. This file is what lets the
 * screen say the right thing about a row without ever needing to know that.
 *
 * Scores are **half-stars as integers, 1 to 10**. Halves because the gap
 * between a seven and an eight is real and five boxes cannot hold it; integers
 * because a whole number is something the rules can check exactly, and a float
 * is not. Everything user-facing divides by two on the way out.
 *
 *   npm run archive
 * ---------------------------------------------------------------------------
 */

import type { UserId, Watched } from '@/data/types'

/** How many stars a full score is. */
export const STARS = 5

/** The lowest and highest a score may be, in half-stars. */
export const LOWEST = 1
export const HIGHEST = STARS * 2

/** Whether a value off the wire is a score at all. */
export function isScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LOWEST &&
    value <= HIGHEST
  )
}

/** Half-stars to stars, which is the only number ever shown. */
export function starsOf(score: number): number {
  return score / 2
}

/**
 * Where a finger landed on the row of stars, as a score.
 *
 * `fraction` is 0 at the left edge of the first star and 1 at the right edge
 * of the last. Rounded *up* to the next half, deliberately: a tap in the left
 * half of the third star means three stars rather than two and a half, which
 * is what somebody aiming at a star means by hitting it. The alternative —
 * nearest — gives the first half of every star to the star before it, and
 * reads as a control that is off by one.
 */
export function scoreAt(fraction: number): number {
  const raw = Math.ceil(fraction * HIGHEST)
  return Math.min(HIGHEST, Math.max(LOWEST, raw))
}

/** `4`, or `3½`. The archive's only numeral. */
export function starLabel(score: number): string {
  const whole = Math.floor(score / 2)
  const half = score % 2 === 1
  if (!half) return String(whole)
  return whole === 0 ? '½' : `${whole}½`
}

/** The other one of you. There are exactly two, forever. */
export const other = (who: UserId): UserId => (who === 'warm' ? 'cool' : 'warm')

/**
 * What a row is doing, from the point of view of whoever is looking at it.
 *
 * ---------------------------------------------------------------------------
 * Four states, and the screen says something different for every one. The one
 * worth naming carefully is `hidden`: she has rated it and you have not, so
 * there is a number sitting there you are not allowed to see. That is not an
 * error and it is not "nothing yet" — it is the seal doing its job, and the
 * honest thing to show is that it is waiting on *you*.
 * ---------------------------------------------------------------------------
 */
export type Standing =
  /** Neither of you has rated it. */
  | 'open'
  /** You have; she has not. Yours is visible to you, and still changeable. */
  | 'waiting'
  /** She has; you have not. Hers exists, and is sealed until you say. */
  | 'hidden'
  /** Both are in. The two scores and the average are there for both of you. */
  | 'shown'

export function standing(row: Watched, me: UserId): Standing {
  const mine = row.rated[me] === true
  const hers = row.rated[other(me)] === true
  if (mine && hers) return 'shown'
  if (mine) return 'waiting'
  if (hers) return 'hidden'
  return 'open'
}

/**
 * The two of you averaged, in half-stars, or null while it is sealed.
 *
 * Null rather than "whatever is visible", on purpose. An average of one number
 * is that number wearing a word that promises two, and it would appear the
 * moment the first of you rated — which is precisely what this whole
 * arrangement exists to keep off the screen.
 */
export function averageOf(row: Watched, me: UserId): number | null {
  if (standing(row, me) !== 'shown') return null
  const mine = row.scores[me]?.score
  const hers = row.scores[other(me)]?.score
  /*
    Both flags true and a score missing is a row half-way through arriving. The
    flag lands with the score, but two devices and one network mean this one
    may have read the parent before it was allowed to read the child. It lasts
    a moment, and the honest answer for that moment is "not yet".
  */
  if (mine === undefined || hers === undefined) return null
  return (mine + hers) / 2
}

/** Whether a score may still be changed: only while nobody has seen it. */
export function stillMine(row: Watched, me: UserId): boolean {
  return row.rated[other(me)] !== true
}

/** A title reduced to the part that decides whether two of them are one film. */
export function looseTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** What a typed title becomes on the way in. Never parsed beyond this. */
export function tidyTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, 120)
}

/**
 * Whether the archive already holds this film.
 *
 * Matched loosely, exactly as the wanted list matches: two people keeping one
 * list will both put the same film on it, and "Dune Part Two" and
 * "dune  part two" are one evening.
 */
export function alreadyIn(rows: readonly Watched[], title: string): Watched | null {
  const want = looseTitle(title)
  if (want === '') return null
  return rows.find((row) => looseTitle(row.title) === want) ?? null
}

/** How long a note may be. Long enough for a paragraph, short of an essay. */
export const NOTE_LIMIT = 600

/**
 * The archive cut into years, newest first, each year's rows newest first.
 *
 * A flat list of two hundred films is a scroll; the same list with *2026* and
 * *2025* standing in it is a record of two people's years, which is the thing
 * this is for. The year comes from the device's own clock deliberately — an
 * archive is read where you are standing, and there is no version of this
 * where the two of you disagree about which year a film belongs to by more
 * than a few hours a decade.
 */
export function byYear(rows: readonly Watched[]): { year: number; rows: Watched[] }[] {
  const out: { year: number; rows: Watched[] }[] = []
  for (const row of [...rows].sort((a, b) => b.at - a.at)) {
    const year = new Date(row.at).getFullYear()
    const last = out[out.length - 1]
    if (last && last.year === year) last.rows.push(row)
    else out.push({ year, rows: [row] })
  }
  return out
}

/**
 * What the two of you have watched, said in one line.
 *
 * The average counts only films you can both already see a verdict on. One
 * that included half-sealed rows would move when *she* rated something, on a
 * device with no business knowing she had — which is the seal leaking through
 * a summary line, and it would leak the direction of her score too.
 */
export function summary(rows: readonly Watched[], me: UserId): {
  seen: number
  rated: number
  average: number | null
} {
  let total = 0
  let rated = 0
  for (const row of rows) {
    const avg = averageOf(row, me)
    if (avg === null) continue
    rated++
    total += avg
  }
  return {
    seen: rows.length,
    rated,
    average: rated === 0 ? null : total / rated,
  }
}
