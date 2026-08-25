/**
 * The conversation in the Stars.
 *
 * Its own store rather than part of the world, matching the seam underneath
 * it: `watchMessages` is deliberately separate from `subscribe` so that two
 * people talking does not repaint the meadow, the river and the overlay on
 * every sentence. Putting the messages into a world slice here would have
 * thrown that away one layer up.
 *
 * `back` — how far into the past you have walked — is kept out of React
 * entirely, for the same reason the slide is: it is written by a wheel and a
 * dragging thumb many times a second, and a store update per frame is visible
 * stutter. The sky reads it imperatively; only things that change rarely
 * (which message is newest, whether the composer is open) live in the store.
 */

import { create } from 'zustand'
import type { Message, UserId } from '@/data/types'

interface TalkingState {
  messages: Message[]
  /** True until the first snapshot lands, so "empty" and "not yet" differ. */
  loading: boolean
  /** The composer is open. */
  composing: boolean
  /**
   * The message being answered, or null.
   *
   * Shared by both composers on purpose. The Stars and the corner are two
   * views of one conversation, so picking a line to answer in one of them and
   * then typing in the other is a perfectly reasonable thing to do, and there
   * is no version of "which reply target is this composer's" that is worth the
   * confusion of having two.
   */
  replyTo: string | null
  /** The conversation folded into the corner is open. */
  whispering: boolean

  setMessages(messages: Message[]): void
  startWriting(): void
  stopWriting(): void
  answer(id: string | null): void
  whisper(open: boolean): void
}

export const useTalking = create<TalkingState>((set) => ({
  messages: [],
  loading: true,
  composing: false,
  replyTo: null,
  whispering: false,

  setMessages: (messages) => set({ messages, loading: false }),
  startWriting: () => set({ composing: true }),
  // Closing the composer drops the reply with it. A quote left standing after
  // you changed your mind about answering is the next thing you say landing
  // under a line you had forgotten you picked.
  stopWriting: () => set({ composing: false, replyTo: null }),
  answer: (replyTo) => set({ replyTo }),
  whisper: (whispering) => set({ whispering }),
}))

/**
 * The message an id names, or null.
 *
 * Null is a real answer and not a failure: the conversation is loaded in a
 * window of the most recent few hundred, so a reply to something said last
 * spring points at a message that is not in memory. The quote says so rather
 * than showing nothing and looking broken.
 */
export function messageById(messages: Message[], id: string | null): Message | null {
  if (!id) return null
  return messages.find((m) => m.id === id) ?? null
}

/** Whether you have put a heart on it. */
export function heartedBy(message: Message, who: UserId): boolean {
  return typeof message.hearts?.[who] === 'number'
}

/**
 * How far back through the conversation you have walked, in messages.
 *
 * 0 is the newest thing either of you said. Fractional, because it is eased —
 * the sky drifts rather than stepping, and a scroll that lands on whole
 * numbers reads as a list rather than as a place.
 */
export const walk = {
  /** Where the view actually is. Eased toward `to` every frame. */
  at: 0,
  /** Where it is heading. Written by the wheel and by drags. */
  to: 0,
  /** How many there are, so it can be clamped without asking the store. */
  count: 0,
}

/** Step the eased walk. Call once per frame before reading `walk.at`. */
export function stepWalk(delta: number) {
  const furthest = Math.max(0, walk.count - 1)
  walk.to = Math.max(0, Math.min(furthest, walk.to))
  walk.at += (walk.to - walk.at) * (1 - Math.exp(-7 * delta))
}

/** Snap straight back to the newest, without a long glide from far away. */
export function toNewest() {
  walk.to = 0
  if (walk.at > 6) walk.at = 6
}

// ---------------------------------------------------------------------------
// The shape of the sky
// ---------------------------------------------------------------------------

/**
 * Where a message sits, given how old it is in the list.
 *
 * `age` is 0 for the newest and counts upward into the past, already offset by
 * how far you have walked back — so `age` here is really "how far above the
 * read head", and it can be negative for the newest few when you have walked
 * away from them.
 *
 * The newest hangs lowest and nearest, just above the horizon where her dawn
 * is. Everything older climbs and recedes, so the history of the two of you
 * runs up into the star field and the oldest things you ever said are the
 * furthest away and the faintest. Which is, more or less, true.
 */
export const SKY = {
  /** Height of the newest message, in metres. */
  base: 3.1,
  /** Distance of the newest message in front of the camera. */
  near: 12,
  /**
   * How much higher each older message sits.
   *
   * Matched to the 74 pixels the words step by in ui/Talking: at twelve metres
   * with a 55° field of view a metre is about seventy-two pixels, so this is
   * what puts a light behind its own line rather than beside it.
   */
  rise: 1.03,
  /** How much further back each older message sits. */
  recede: 1.42,
  /** Sideways lean, so the column is a drift rather than a ruled line. */
  drift: 0.55,
}

export function skySpot(age: number, seed: number): [number, number, number] {
  // A slow wander across the column. Seeded off the message so it never moves.
  const sway = Math.sin(seed * 1.7 + age * 0.42) * SKY.drift
  return [
    sway,
    SKY.base + age * SKY.rise,
    -SKY.near - age * SKY.recede,
  ]
}

/** A stable small number from an id, for jitter that never changes. */
export function seedOf(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (h % 1000) / 1000
}

/** Which of the two lights said it. */
export function isMine(message: Message, me: UserId): boolean {
  return message.by === me
}
