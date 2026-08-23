/**
 * Words, and what a guess is worth.
 *
 * The two lists are big (72KB and 11KB of raw letters) and only matter once
 * somebody actually opens the game, so they are loaded on demand. Nobody
 * walking to the Pond should be downloading a dictionary.
 */

export const LENGTH = 5
export const TRIES = 6

/** What a single stone came out as. */
export type Mark = 'lit' | 'near' | 'cold'

let allowed: Set<string> | null = null
let fair: string[] | null = null
/** The everyday subset the game actually deals from. See `easy.ts`. */
let easy: string[] | null = null

/** Chop the packed string back into words. Five characters each, no gaps. */
function unpack(packed: string): string[] {
  const out: string[] = []
  for (let i = 0; i < packed.length; i += LENGTH) {
    out.push(packed.slice(i, i + LENGTH))
  }
  return out
}

export async function loadWords(): Promise<void> {
  if (allowed && fair) return
  const [a, f, e] = await Promise.all([
    import('./allowed'),
    import('./fair'),
    import('./easy'),
  ])
  allowed = new Set(unpack(a.ALLOWED))
  fair = unpack(f.FAIR)

  /*
    The everyday pile, checked against the real answer set.

    Filtered rather than trusted: `easy.ts` is a hand-written list and hand-
    written lists have typos in them. Anything that is not exactly five letters
    or is not in `FAIR` is dropped here, so a slip can only ever make the pile
    slightly smaller — never deal a word the other player would be told is
    "not in the book" when they typed it back.
  */
  const known = new Set(fair)
  const picked = e.EASY.trim()
    .split(/\s+/)
    .filter((word) => word.length === LENGTH && known.has(word))
  // If that ever collapses — a bad edit, a bad merge — fall back to the whole
  // fair list rather than dealing the same six words forever.
  easy = picked.length > 200 ? picked : fair
}

export function isWord(word: string): boolean {
  return allowed?.has(word.toLowerCase()) ?? false
}

export function wordsReady(): boolean {
  return allowed !== null
}

/**
 * A word from the pile, for when she hasn't left you one and you'd rather play
 * than wait. Drawn from the fair list — common, no cruel plurals.
 */
export function fromThePile(seed: number): string {
  const pile = easy ?? fair
  if (!pile || pile.length === 0) return 'stone'
  return pile[Math.abs(seed) % pile.length]
}

/** How many words the pile has in it. For the check script. */
export function pileSize(): number {
  return (easy ?? fair)?.length ?? 0
}

/**
 * Score a guess against the answer.
 *
 * The whole difficulty is repeated letters, and it is the one thing everybody
 * gets wrong. Guessing ALLOY against ATOLL: the first L is in the wrong place
 * but the second L *is* in the right place — so exact matches have to be taken
 * out of the running first, in a separate pass, before any of the remaining
 * letters are allowed to claim a near miss. Score left-to-right in one pass and
 * the first L greedily eats the only L the answer had to give, and the second
 * one — actually correct — comes back cold.
 */
export function score(guess: string, answer: string): Mark[] {
  const g = guess.toLowerCase().split('')
  const a = answer.toLowerCase().split('')
  const marks: Mark[] = new Array(g.length).fill('cold')

  // pass one: the letters that are exactly right, and are now spent
  const spare: Record<string, number> = {}
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) marks[i] = 'lit'
    else spare[a[i]] = (spare[a[i]] ?? 0) + 1
  }

  // pass two: what's left over can be claimed, once each
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'lit') continue
    if ((spare[g[i]] ?? 0) > 0) {
      marks[i] = 'near'
      spare[g[i]] -= 1
    }
  }

  return marks
}

/**
 * The best thing known about every letter guessed so far, for the tray.
 * "Best" matters: a letter once marked near and later lit should read lit.
 */
export function letterState(
  guesses: string[],
  answer: string,
): Record<string, Mark> {
  const rank: Record<Mark, number> = { cold: 0, near: 1, lit: 2 }
  const out: Record<string, Mark> = {}
  for (const guess of guesses) {
    const marks = score(guess, answer)
    guess.toLowerCase().split('').forEach((letter, i) => {
      const seen = out[letter]
      if (!seen || rank[marks[i]] > rank[seen]) out[letter] = marks[i]
    })
  }
  return out
}

export function solved(guesses: string[], answer: string): boolean {
  return guesses.some((g) => g.toLowerCase() === answer.toLowerCase())
}

/** Over, one way or the other. */
export function finished(guesses: string[], answer: string): boolean {
  return solved(guesses, answer) || guesses.length >= TRIES
}
