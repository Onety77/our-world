/**
 * The emoji the two of you actually use, in the order you put them in.
 *
 * ---------------------------------------------------------------------------
 * **A short list you arrange yourself, rather than every emoji there is.**
 *
 * A full picker is fifteen hundred characters in nine categories with a search
 * box, and it is the wrong shape for this: nobody browsing a grid of flags is
 * having a conversation. What a phone gets right is not completeness, it is
 * that the eight you always use are the first eight.
 *
 * **The order is yours, and nothing rearranges it behind you.** This used to
 * sort by how often each was picked, which sounds helpful and is not: a list
 * that reshuffles as you use it can never be learned, and the whole point of
 * arrow keys on a grid is that the third one along is always the third one
 * along. So `all` is the order, full stop — you move things, add things and
 * take things out, and it stays where you left it.
 *
 * **This device only.** It is a keyboard convenience, not a shared fact about
 * the world, and syncing it would mean her arrangement rewriting yours
 * mid-sentence.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

const KEY = 'garden:emoji:v2'

/**
 * What the list starts as.
 *
 * Chosen for two people who are apart rather than for coverage: the ones that
 * carry warmth, the ones that answer a message without a sentence, and the
 * handful that come up watching something together. A starting point to be
 * edited, not a set to be lived with.
 */
const STARTERS = [
  '❤️', '😂', '🥹', '😭', '🙂', '😍', '🥰', '😘',
  '😊', '😅', '🤣', '😌', '😴', '🤗', '🙌', '👏',
  '🔥', '✨', '🌙', '⭐', '🌸', '🌿', '☀️', '🌧️',
  '👀', '💀', '🤔', '😏', '😳', '🫶', '🤝', '👍',
  '🎬', '🍿', '🎵', '☕', '🍕', '🎂', '🎁', '✈️',
]

export interface EmojiState {
  /** Every one on the list, in the order they are shown. */
  all: string[]
  /**
   * Put a new one on the list, at the front.
   *
   * Returns what was actually added, or null if it was not usable — pasting a
   * word, or a sentence with an emoji buried in it, should say so rather than
   * quietly adding nothing.
   */
  add(text: string): string | null
  /** Take one off. Starters go too; this is your keyboard. */
  drop(emoji: string): void
  /** Move the one at `from` to `to`, carrying the rest along. */
  move(from: number, to: number): void
  /** Back to the list this shipped with. */
  reset(): void
}

/**
 * Whether a pasted string is one emoji.
 *
 * Deliberately loose. Emoji are not one code point — a flag is two, a family is
 * seven with joiners, and a thumbs-up with a skin tone is two — so counting
 * characters is wrong in both directions. What is checked is that it is short,
 * that it holds at least one pictographic character, and that it has no
 * letters, digits or spaces. That takes every real emoji anybody will paste and
 * rejects the accidental sentence.
 */
function oneEmoji(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 16) return null
  if (/[\p{L}\p{N}\s]/u.test(trimmed)) return null
  if (!/\p{Extended_Pictographic}/u.test(trimmed)) return null
  return trimmed
}

function load(): string[] {
  if (typeof localStorage === 'undefined') return [...STARTERS]
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (Array.isArray(raw)) {
      const kept = raw.filter((e): e is string => typeof e === 'string' && e.length > 0)
      if (kept.length > 0) return kept
    }
    return [...STARTERS]
  } catch {
    return [...STARTERS]
  }
}

function keep(all: string[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage full or blocked; the list still works, it just forgets */
  }
}

export const useEmoji = create<EmojiState>((set, get) => ({
  all: load(),

  add(text) {
    const emoji = oneEmoji(text)
    if (!emoji) return null
    const { all } = get()
    // Already there is not a failure — say yes, and leave it where it is.
    if (all.includes(emoji)) return emoji
    const next = [emoji, ...all]
    set({ all: next })
    keep(next)
    return emoji
  },

  drop(emoji) {
    const next = get().all.filter((e) => e !== emoji)
    set({ all: next })
    keep(next)
  },

  move(from, to) {
    const all = [...get().all]
    if (from < 0 || from >= all.length) return
    const landing = Math.max(0, Math.min(all.length - 1, to))
    if (landing === from) return
    const [held] = all.splice(from, 1)
    all.splice(landing, 0, held)
    set({ all })
    keep(all)
  },

  reset() {
    const next = [...STARTERS]
    set({ all: next })
    keep(next)
  },
}))
