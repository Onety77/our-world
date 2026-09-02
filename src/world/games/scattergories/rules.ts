/**
 * The rules of the game, with no React and no browser in them.
 *
 * Everything here is pure, and that is not tidiness: **both phones deal the
 * same match from the same seed without ever speaking to each other**, which
 * is the whole basis of an asynchronous round in this garden. If dealing were
 * impure the two of you would be answering different category lists while the
 * app insisted you were not.
 *
 * It also means the awkward part — what counts as the same answer — can be
 * driven headless by `npm run scatter` rather than by two people typing at
 * each other and squinting at the result.
 */

import { CATEGORIES, DIE_FACES, fits, type Category } from './categories'

/** Categories on a sheet. From the boxed game. */
export const PER_SHEET = 12

/**
 * Rounds in a match.
 *
 * Two, and the boxed game says three or four. Four is what a table of six
 * people play over an evening; two people on phones seven timezones apart are
 * doing something else, and four rounds of the same twelve-minute shape in a
 * row is where a good idea turns into homework. Two is one letter, then one
 * more with everything you learned from the first — which is a match, and
 * leaves you wanting the third rather than finishing it out of duty.
 */
export const ROUNDS = 2
/**
 * Five minutes, in milliseconds.
 *
 * Three was the first guess and it was short: twelve categories against one
 * letter is a lot of thinking, and the glass ran out with half the sheet blank
 * often enough that the round stopped being about *finding* answers and
 * started being about writing fast. Five is long enough to get stuck on one,
 * give up on it, and come back — which is where the good answers are.
 */
export const GLASS_MS = 5 * 60 * 1000

/** A small, stable generator. Same numbers on both devices, forever. */
function stream(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

export interface Deal {
  /** Which face came up. */
  letter: string
  /** The twelve, in the order they are written on the sheet. */
  categories: Category[]
}

/**
 * One round's letter and sheet.
 *
 * The letter is drawn first and the categories are drawn *around* it, so a
 * category that has no honest answers for this letter is never on the sheet in
 * the first place. Doing it the other way — deal twelve, then roll — is how
 * you end up asking somebody for a country beginning with U and calling it a
 * challenge.
 */
export function deal(seed: number, round: number): Deal {
  const next = stream(seed + round * 7919)
  const letter = DIE_FACES[Math.floor(next() * DIE_FACES.length)]

  const pool = CATEGORIES.filter((c) => fits(c, letter))
  const chosen: Category[] = []
  const taken = new Set<string>()
  /*
    Drawn without replacement, and with a guard.

    The guard is not paranoia about the pool running dry — it cannot, at two
    hundred against twelve — it is about a seed that happens to keep
    landing on the same index. A `while` loop whose exit depends on randomness
    is a hang waiting for a bad Tuesday.
  */
  for (let guard = 0; chosen.length < PER_SHEET && guard < PER_SHEET * 40; guard++) {
    const pick = pool[Math.floor(next() * pool.length)]
    if (!pick || taken.has(pick.id)) continue
    taken.add(pick.id)
    chosen.push(pick)
  }
  return { letter, categories: chosen }
}

/**
 * Every round of a match, dealt at once.
 *
 * No letter is used twice. Four rounds of the same letter is not variety, and
 * the boxed game rolls a fresh face each time for exactly this reason.
 */
export function dealMatch(seed: number): Deal[] {
  const rounds: Deal[] = []
  const used = new Set<string>()
  for (let n = 0; n < ROUNDS; n++) {
    let round = deal(seed, n)
    // Nudge the seed along until the face is one we have not had.
    for (let tries = 1; used.has(round.letter) && tries < 40; tries++) {
      round = deal(seed + tries * 104729, n)
    }
    used.add(round.letter)
    rounds.push(round)
  }
  return rounds
}

// ---------------------------------------------------------------------------
// What counts as the same answer
// ---------------------------------------------------------------------------

const ARTICLES = /^(a|an|the)\s+/i

/**
 * An answer, reduced to the thing two people would call the same.
 *
 * ---------------------------------------------------------------------------
 * **This function decides whether somebody scores**, so every rule in it is
 * about not punishing a person for typing.
 *
 * `The Lion King` and `lion king` are the same answer and always were. So are
 * `mother-in-law` and `mother in law`, `Jollof rice` and `jollof  rice`, and
 * `mango` and `Mangoes`. None of those differences is a different *thought*,
 * and cancelling somebody's point over a capital letter would be the worst
 * kind of pedantry in a game two people play to enjoy each other.
 *
 * It deliberately stops short of a dictionary or a stemmer. The plural rule
 * below handles the endings people actually type and nothing else, because an
 * aggressive stemmer starts merging words that are genuinely different — and
 * a wrong *merge* silently deletes a point, which is far worse than a wrong
 * miss, where you both simply score.
 * ---------------------------------------------------------------------------
 */
export function same(answer: string): string {
  let text = answer.trim().toLowerCase()
  // Hyphens and punctuation become spaces rather than vanishing, so "mother-in
  // -law" and "mother in law" meet in the middle instead of becoming
  // "motherinlaw" and "mother in law".
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  text = text.replace(ARTICLES, '')

  return text
    .split(' ')
    .map(singular)
    .join(' ')
}

/**
 * The plural endings people actually type, and no others.
 *
 * The last rule is the interesting one. Dropping a trailing `s` turns
 * *mangoes* into *mangoe*, which does not meet *mango* — but simply stripping
 * `oes` instead turns *shoes* into *sho*, which does not meet *shoe*. English
 * will not be talked into a single rule here.
 *
 * The way out is that **the key does not have to be a word**. It only has to
 * be the *same* word for both spellings, so the last rule is applied to
 * everything: *canoe* and *canoes* both come out as `cano`, which is not a
 * word and does not need to be. Only the length guard matters, and it is what
 * keeps *shoe* and *toe* whole.
 */
function singular(word: string): string {
  let stem = word
  if (stem.length > 3 && stem.endsWith('ies')) stem = stem.slice(0, -3) + 'y'
  else if (stem.length > 3 && /(ch|sh|s|x|z)es$/.test(stem)) stem = stem.slice(0, -2)
  // `ss` is not a plural — glass, dress, address.
  else if (stem.length > 3 && stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1)
  if (stem.length > 4 && stem.endsWith('oe')) stem = stem.slice(0, -1)
  return stem
}

/**
 * Whether an answer begins with the letter that was rolled.
 *
 * Generous about articles, in both directions: `The Lion King` counts for L
 * *and* for T. The boxed rules and every house rule ever played disagree about
 * which, and the only outcome that is never unfair is accepting both — a
 * person who wrote it meant one of them.
 *
 * That is the whole of the automatic checking. There is no word list: a
 * dictionary here would reject Nigerian names, Chinese places, street food,
 * slang and every private joke the two of them have, which is most of what
 * makes the game worth playing. Anything else is settled by a challenge.
 */
export function begins(answer: string, letter: string): boolean {
  const text = answer.trim().toLowerCase()
  if (text === '') return false
  const want = letter.toLowerCase()
  if (text.startsWith(want)) return true
  return text.replace(ARTICLES, '').startsWith(want)
}

/**
 * How many words of an answer start with the letter.
 *
 * The alliteration bonus: the boxed rules pay a point for each word of a
 * multi-word answer that repeats the key letter, which is why "SpongeBob
 * SquarePants" is worth having thought of.
 */
export function alliteration(answer: string, letter: string): number {
  const want = letter.toLowerCase()
  return same(answer)
    .split(' ')
    .filter((word) => word.startsWith(want)).length
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type Verdict =
  /** Nothing written. */
  | 'blank'
  /** Written, but it does not start with the letter. */
  | 'wrong-letter'
  /** The same answer as one of your own, further up the sheet. */
  | 'repeated'
  /** Struck out by a challenge. */
  | 'struck'
  /** You both wrote the same thing. Neither scores, and that is the game. */
  | 'matched'
  /** It stands. */
  | 'scored'

export interface Line {
  verdict: Verdict
  /** Points this line is worth. 0 for anything but `scored`. */
  points: number
  /** How many words repeated the letter, for the flourish on a reveal. */
  echoes: number
}

export interface Scored {
  lines: Line[]
  total: number
}

/**
 * One person's sheet, against the other's.
 *
 * Order matters and is deliberate: a line can only be *matched* if it would
 * otherwise have scored, so a wrong letter is called a wrong letter rather
 * than being quietly absorbed into a duplicate. What each line is called ends
 * up on the screen, and "you both wrote that" and "that does not start with S"
 * are different things to be told.
 */
export function score(
  mine: string[],
  theirs: string[],
  letter: string,
  struck: number[] = [],
): Scored {
  const hers = new Set(theirs.map(same).filter((a) => a !== ''))
  const usedByMe = new Set<string>()
  const strikes = new Set(struck)

  const lines = mine.map((raw, i): Line => {
    const answer = (raw ?? '').trim()
    if (answer === '') return { verdict: 'blank', points: 0, echoes: 0 }
    if (!begins(answer, letter)) return { verdict: 'wrong-letter', points: 0, echoes: 0 }

    const key = same(answer)
    // The boxed rule: one answer may not be spent on two categories.
    if (usedByMe.has(key)) return { verdict: 'repeated', points: 0, echoes: 0 }
    usedByMe.add(key)

    if (strikes.has(i)) return { verdict: 'struck', points: 0, echoes: 0 }

    const echoes = alliteration(answer, letter)
    if (hers.has(key)) return { verdict: 'matched', points: 0, echoes }
    // One for the answer, and one more for every extra word that repeats the
    // letter — so a single word is worth one and never zero.
    return { verdict: 'scored', points: Math.max(1, echoes), echoes }
  })

  return { lines, total: lines.reduce((sum, line) => sum + line.points, 0) }
}
