/**
 * The emoji the two of you actually use.
 *
 * ---------------------------------------------------------------------------
 * **A short list that learns, rather than every emoji there is.**
 *
 * A full picker is fifteen hundred characters in nine categories with a search
 * box, and it is the wrong shape for this: nobody browsing a grid of flags is
 * having a conversation. What a phone gets right is not completeness, it is
 * that the eight you always use are the first eight — so this ships a small
 * starting set, counts what gets picked, and puts the ones you reach for at the
 * front. After a fortnight it is *your* list, and it stays short enough to read
 * without hunting.
 *
 * Anything missing gets pasted in — see `add`. That is the whole of the escape
 * hatch, and it is enough, because the thing you paste immediately becomes part
 * of the list and rises as you use it.
 *
 * **This device only.** It is a keyboard convenience, not a shared fact about
 * the world, and syncing it would mean her picks reordering your keyboard
 * mid-sentence.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

const KEY = 'garden:emoji:v1'

/**
 * What the list starts as.
 *
 * Chosen for two people who are apart rather than for coverage: the ones that
 * carry warmth, the ones that answer a message without a sentence, and the
 * handful that come up watching something together. Deliberately not a grid of
 * every face — a starting point that gets out of the way as the counts take
 * over.
 */
const STARTERS = [
  '❤️', '😂', '🥹', '😭', '🙂', '😍', '🥰', '😘',
  '😊', '😅', '🤣', '😌', '😴', '🤗', '🙌', '👏',
  '🔥', '✨', '🌙', '⭐', '🌸', '🌿', '☀️', '🌧️',
  '👀', '💀', '🤔', '😏', '😳', '🫶', '🤝', '👍',
  '🎬', '🍿', '🎵', '☕', '🍕', '🎂', '🎁', '✈️',
]

interface Held {
  /** Everything on the list, most-used first is worked out at read time. */
  all: string[]
  /** How many times each has been picked on this device. */
  used: Record<string, number>
}

export interface EmojiState extends Held {
  /** The list in the order it should be shown: most used, then the rest. */
  inOrder(): string[]
  /** Count a pick, so the list learns. */
  pick(emoji: string): void
  /**
   * Put a new one on the list.
   *
   * Returns what was actually added, or null if it was not usable — pasting a
   * word, or a whole sentence with an emoji buried in it, should say so rather
   * than quietly adding nothing.
   */
  add(text: string): string | null
  /** Take one off. Starters can go too; this is your keyboard. */
  drop(emoji: string): void
}

/**
 * Whether a pasted string is one emoji.
 *
 * Deliberately loose. Emoji are not one code point — a flag is two, a family is
 * seven with joiners, and a thumbs-up with a skin tone is two — so counting
 * characters is wrong in both directions. What is checked is that it is short,
 * that it contains at least one character in the pictographic range, and that
 * it has no letters, digits or spaces in it. That accepts every real emoji
 * anybody will paste and rejects the accidental sentence.
 */
function oneEmoji(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 16) return null
  if (/[\p{L}\p{N}\s]/u.test(trimmed)) return null
  if (!/\p{Extended_Pictographic}/u.test(trimmed)) return null
  return trimmed
}

function load(): Held {
  const fresh: Held = { all: [...STARTERS], used: {} }
  if (typeof localStorage === 'undefined') return fresh
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return fresh
    const held = raw as Partial<Held>
    const all = Array.isArray(held.all) ? held.all.filter((e) => typeof e === 'string') : null
    const used =
      held.used && typeof held.used === 'object' ? (held.used as Record<string, number>) : {}
    return { all: all && all.length > 0 ? all : [...STARTERS], used }
  } catch {
    return fresh
  }
}

function keep(held: Held) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(held))
  } catch {
    /* storage full or blocked; the list still works, it just forgets */
  }
}

export const useEmoji = create<EmojiState>((set, get) => ({
  ...load(),

  inOrder() {
    const { all, used } = get()
    /*
      Sorted by use, then by the order they were added, and **stably**.

      A list that reshuffles the moment you pick something is a list you cannot
      build muscle memory on — so ties keep their existing places, and an emoji
      only moves when it has genuinely been used more than the one above it.
    */
    return [...all].sort((a, b) => (used[b] ?? 0) - (used[a] ?? 0))
  },

  pick(emoji) {
    const { all, used } = get()
    const next: Held = {
      all: all.includes(emoji) ? all : [emoji, ...all],
      used: { ...used, [emoji]: (used[emoji] ?? 0) + 1 },
    }
    set(next)
    keep(next)
  },

  add(text) {
    const emoji = oneEmoji(text)
    if (!emoji) return null
    const { all, used } = get()
    // Already there is not a failure — say yes and let it be found.
    const next: Held = { all: all.includes(emoji) ? all : [emoji, ...all], used }
    set(next)
    keep(next)
    return emoji
  },

  drop(emoji) {
    const { all, used } = get()
    const rest = { ...used }
    delete rest[emoji]
    const next: Held = { all: all.filter((e) => e !== emoji), used: rest }
    set(next)
    keep(next)
  },
}))
