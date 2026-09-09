/**
 * Reading the Fold back off a wire that will hand you anything.
 *
 * ---------------------------------------------------------------------------
 * Firestore documents are `Record<string, unknown>` and a field that has never
 * been written is simply absent, so every read here has to survive a document
 * from an older shape, a half-written one, and — the case that actually bites —
 * a field somebody's device wrote as the wrong type before a rule caught it.
 *
 * Kept out of `firebase.ts` because the *mock* wants exactly the same coercion
 * the day anything is imported into it, and because two copies of "what counts
 * as a valid Leitner box" is precisely the kind of duplication that drifts.
 * ---------------------------------------------------------------------------
 */

import {
  CREATURE_KINDS,
  FOLD_BOXES,
  PRACTICE_RECENT,
  USER_IDS,
  type CreatureKind,
  type Practice,
  type PracticeKind,
  type PracticeOwner,
  type UserId,
  type Word,
} from './types'

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback

/** A day key, or null. Anything not shaped "YYYY-MM-DD" is not a day. */
function dayOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function creatureOf(v: unknown): CreatureKind {
  return CREATURE_KINDS.includes(v as CreatureKind) ? (v as CreatureKind) : 'hare'
}

function ownerOf(v: unknown): PracticeOwner {
  if (v === 'both' || v === 'warm' || v === 'cool') return v
  return 'warm'
}

/**
 * A practice, read defensively.
 *
 * `days` is floored at the length of `recent` rather than trusted outright:
 * the two are written together and the array is the harder of the pair to
 * fake, so a count that disagrees with the days it claims to be counting is
 * corrected toward the evidence rather than shown.
 */
export function readPractice(id: string, raw: Record<string, unknown>): Practice {
  const recent = Array.isArray(raw.recent)
    ? (raw.recent.filter((d) => dayOrNull(d) !== null) as string[]).slice(0, PRACTICE_RECENT)
    : []

  const practice: Practice = {
    id,
    name: str(raw.name, 'something').slice(0, 80),
    kind: (raw.kind === 'words' ? 'words' : 'days') as PracticeKind,
    by: ownerOf(raw.by),
    creature: creatureOf(raw.creature),
    startedAt: num(raw.startedAt, 0),
    days: Math.max(0, Math.floor(num(raw.days, 0)), recent.length),
    lastDay: dayOrNull(raw.lastDay),
    recent,
  }
  const line = str(raw.lastLine, '')
  if (line !== '') practice.lastLine = line
  const resting = num(raw.restingAt, 0)
  if (resting > 0) practice.restingAt = resting
  return practice
}

/** Only the two people, and only a box the schedule actually has. */
function perPerson(raw: unknown, clamp: (n: number) => number): Partial<Record<UserId, number>> {
  const out: Partial<Record<UserId, number>> = {}
  if (typeof raw !== 'object' || raw === null) return out
  const row = raw as Record<string, unknown>
  for (const id of USER_IDS) {
    const value = row[id]
    if (typeof value === 'number' && Number.isFinite(value)) out[id] = clamp(value)
  }
  return out
}

export function readWord(id: string, raw: Record<string, unknown>): Word {
  const word: Word = {
    id,
    practiceId: str(raw.practiceId, ''),
    text: str(raw.text, '').slice(0, 120),
    meaning: str(raw.meaning, '').slice(0, 240),
    by: raw.by === 'cool' ? 'cool' : 'warm',
    at: num(raw.at, 0),
    boxes: perPerson(raw.boxes, (n) =>
      Math.max(0, Math.min(FOLD_BOXES.length - 1, Math.round(n))),
    ),
    dueAt: perPerson(raw.dueAt, (n) => n),
  }
  const note = str(raw.note, '')
  if (note !== '') word.note = note.slice(0, 240)
  if (raw.handed === true) word.handed = true
  const landed = perPerson(raw.landedAt, (n) => n)
  if (Object.keys(landed).length > 0) word.landedAt = landed
  return word
}

/**
 * A word with neither half is not a word.
 *
 * Half-written documents happen — a device that lost signal between the two
 * fields — and a deck that puts a blank card in front of somebody is worse than
 * one word short.
 */
export function isWholeWord(word: Word): boolean {
  return word.text.trim() !== '' && word.meaning.trim() !== '' && word.practiceId !== ''
}
