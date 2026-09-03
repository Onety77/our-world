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
import { HEART } from '@/data/types'
import type { Message, UserId } from '@/data/types'

interface TalkingState {
  messages: Message[]
  /** Messages already visible here but not yet confirmed by the live feed. */
  optimistic: Record<string, Message>
  /** Optimistic messages whose write was refused. */
  failed: Record<string, true>
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
  queue(message: Message): void
  fail(id: string): void
  startWriting(): void
  stopWriting(): void
  answer(id: string | null): void
  whisper(open: boolean): void
}

export const useTalking = create<TalkingState>((set) => ({
  messages: [],
  optimistic: {},
  failed: {},
  loading: true,
  composing: false,
  replyTo: null,
  whispering: false,

  setMessages: (messages) => set((state) => {
    const received = new Set(messages.map((message) => message.id))
    const optimistic = { ...state.optimistic }
    const failed = { ...state.failed }
    for (const id of received) {
      delete optimistic[id]
      delete failed[id]
    }
    const waiting = Object.values(optimistic).filter((message) => !received.has(message.id))
    return {
      messages: [...messages, ...waiting].sort((a, b) => a.at - b.at),
      optimistic,
      failed,
      loading: false,
    }
  }),
  queue: (message) => set((state) => ({
    messages: [...state.messages.filter((item) => item.id !== message.id), message]
      .sort((a, b) => a.at - b.at),
    optimistic: { ...state.optimistic, [message.id]: message },
    failed: Object.fromEntries(
      Object.entries(state.failed).filter(([id]) => id !== message.id),
    ),
  })),
  fail: (id) => set((state) => ({ failed: { ...state.failed, [id]: true } })),
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
 * The heart, and what else you can leave.
 *
 * -----------------------------------------------------------------------------
 * Six, chosen rather than generated, and in this order: the two that carry most
 * of the traffic first, then the rest. A picker would be the obvious thing and
 * it is the wrong one — an emoji keyboard is a thousand ways to say something
 * slightly different, and the point of a reaction is that it is *instant*, one
 * tap, no deciding. Two people talking every day want a small vocabulary they
 * both know by heart, not a search field.
 *
 * The heart is first among them and stays the default: it is what a double tap
 * has always left, and it is what every message reacted to before there was a
 * choice already carries.
 * -----------------------------------------------------------------------------
 */
export { HEART }

export const MARKS = ['♥', '😂', '💀', '👀', '💃', '🫤'] as const

/** Which part of the conversation owns a finger once its intention is clear. */
export type ConversationGestureAxis = 'horizontal' | 'vertical' | null

/**
 * Wait through the small diagonal wobble at the start of a human swipe, then
 * choose one axis for the rest of that gesture. Returning `null` means there
 * is not enough evidence yet, so neither replying nor scrolling should move.
 */
export function conversationGestureAxis(dx: number, dy: number): ConversationGestureAxis {
  const x = Math.abs(dx)
  const y = Math.abs(dy)
  if (Math.max(x, y) < 8) return null
  if (x >= y * 1.15) return 'horizontal'
  if (y >= x * 1.15) return 'vertical'
  return null
}

/**
 * The newest thing she has reacted to that you have not been shown.
 *
 * =============================================================================
 * **A reaction on an old message is invisible.** The Stars is a sky you walk
 * back through, so a heart she puts on something from Tuesday lands on a line
 * that is four hundred metres above your head. She has answered you and there
 * is no way for you to know.
 *
 * Which matters more here than it would in an ordinary chat, because reacting
 * is *most* of what happens to an old message — you do not reply to something
 * from Tuesday, you put a face on it.
 *
 * So the newest one she has left is found, compared against the last one you
 * were shown, and offered as somewhere to go. `hearts` already carries the time
 * each reaction was left, so **no new field crosses the wire for this** — which,
 * after four bugs in two days caused by exactly that, is most of why it is
 * built this way round.
 *
 * "Have I seen it" is a fact about *you looking*, not about the world, so it is
 * kept on the device that did the looking. That is also why it needs no rules,
 * no validation and no reader — see `data/messages` for what those cost.
 * =============================================================================
 */
export interface UnseenMark {
  id: string
  mark: string
  at: number
}

export function newestMarkFrom(
  messages: Message[],
  them: UserId,
  seenUpTo: number,
): UnseenMark | null {
  let best: UnseenMark | null = null
  for (const message of messages) {
    const at = message.hearts?.[them]
    if (typeof at !== 'number' || at <= seenUpTo) continue
    /*
      Her own messages count too. She reacts to things she said herself — a
      laugh at her own line half a day later is a real thing people do, and it
      is as much worth walking back to as one she left on yours.
    */
    if (best === null || at > best.at) {
      best = { id: message.id, mark: markBy(message, them) ?? HEART, at }
    }
  }
  return best
}

/** Where this device got to. Local, because it is about your eyes. */
const SEEN_KEY = 'garden:marks-seen:v1'

export function marksSeenUpTo(): number {
  if (typeof localStorage === 'undefined') return 0
  const raw = Number(localStorage.getItem(SEEN_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

export function rememberMarksSeen(at: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at))
  } catch {
    /* it still holds for this session */
  }
}

/** What `who` left on this message, or null if they left nothing. */
export function markBy(message: Message, who: UserId): string | null {
  if (!heartedBy(message, who)) return null
  const mark = message.marks?.[who]
  return typeof mark === 'string' && mark !== '' ? mark : HEART
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
  walk.at += (walk.to - walk.at) * (1 - Math.exp(-11 * delta))
}

/** Snap straight back to the newest, without a long glide from far away. */
export function toNewest() {
  walk.to = 0
  if (walk.at > 4) walk.at = 4
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
