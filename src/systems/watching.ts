/**
 * The screen the two of you are in front of.
 *
 * ---------------------------------------------------------------------------
 * **The whole problem is that there is no server.** Two phones, seven timezones
 * apart, and one video that has to be at the same second on both of them — with
 * nothing in the middle to be the referee. What there is instead is one shared
 * document and a clock both devices trust.
 *
 * So the same anchor the music uses, and for the same reason: what is stored is
 * never a position that ticks. It is *"this video was `at` seconds in when the
 * server clock read `since`, and it is playing"*. Where it is now is arithmetic,
 * done independently on both sides. That single decision is what makes this
 * possible at all:
 *
 *   · one write when somebody presses something, rather than a write a second
 *     from both devices for as long as a film lasts
 *   · two phones agree from one fact, so they cannot drift apart *between*
 *     updates the way two counters would
 *   · a phone that was asleep, backgrounded, or in a tunnel catches up to the
 *     right second the instant it wakes, instead of resuming where it stopped
 *
 * **Everything here is arithmetic and rules. Nothing here touches YouTube** —
 * that is `systems/youtube`, and the split is deliberate: this file can be
 * reasoned about, and read, without an iframe existing.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'
import type { Queued, UserId, Watching } from '@/data/types'

/** A dark screen with nothing lined up. */
export function darkScreen(): Watching {
  return {
    videoId: null,
    title: '',
    playing: false,
    at: 0,
    since: 0,
    by: 'warm',
    seq: 0,
    queue: [],
    session: '',
  }
}

/**
 * How far apart the two of you may be before it is worth a correction.
 *
 * ---------------------------------------------------------------------------
 * Under this, leave it alone. A seek is not free: the picture stalls, the sound
 * cuts, and YouTube re-buffers — so a player that corrects a tenth of a second
 * every couple of seconds is *less* in sync than one that does nothing, because
 * it spends its life stuttering.
 *
 * Three quarters of a second is under the threshold at which two people
 * watching the same thing in different rooms would notice, and comfortably
 * above the jitter of a network clock plus a browser's own playback wobble.
 * ---------------------------------------------------------------------------
 */
export const DRIFT = 0.75

/**
 * And how far apart before it is a *jump* rather than a nudge.
 *
 * Between the two, the player is asked to speed up or slow down very slightly
 * instead of seeking — a fifth of a second recovered over a few seconds is
 * invisible, where the seek that would have fixed it is not. Past this,
 * something real happened (a pause nobody sent, a stall, a phone asleep) and a
 * seek is the honest answer.
 */
export const LURCH = 2.5

/** The gentlest playback rate that still closes a gap in reasonable time. */
export const NUDGE = 0.06

export type Tab = 'talk' | 'queue'

interface WatchingState {
  /** The shared truth, straight off the wire. */
  shared: Watching
  setShared(shared: Watching): void

  /** True while the full screen is up. */
  open: boolean
  /** True once a video has been chosen — the tucked pane rides on this. */
  live: boolean
  /** Which half of the panel is showing. */
  tab: Tab
  setTab(tab: Tab): void
  show(): void
  tuck(): void
  /** Put the screen away entirely and stop the video. */
  close(): void

  /** What the search box holds, kept across a tuck so a search survives one. */
  hunt: string
  setHunt(hunt: string): void

  /**
   * Where the tucked pane has been put, as a fraction of the free space.
   *
   * -------------------------------------------------------------------------
   * **Fractions rather than pixels, so it survives a rotation.** A pane parked
   * 240 px from the left of a portrait phone is off the edge of the same phone
   * held sideways; the same pane at 0.7 of the way across is where you left it.
   *
   * Null until it has been moved, which is not the same as 0,0 — it means "put
   * it where the corner puts things", and the corner should be free to change
   * its mind about that without inheriting a position nobody chose.
   *
   * This device only, and remembered here rather than sent. Where a picture
   * sits on your screen is a fact about your screen, exactly like the volume
   * faders and the driving buttons.
   * -------------------------------------------------------------------------
   */
  spot: { x: number; y: number } | null
  putSpot(spot: { x: number; y: number } | null): void

  /**
   * True while a thumb is on the scrubber.
   *
   * The sync loop pulls the player back to the shared anchor every nine
   * hundred milliseconds, which is right every moment except this one: mid
   * drag the anchor is where the film was *before* you started, so correcting
   * toward it fights the finger. It is on the store rather than passed down
   * because the loop and the scrubber are three components apart and neither
   * is the other's parent.
   */
  scrubbing: boolean
  setScrubbing(scrubbing: boolean): void
}

const SPOT_KEY = 'garden:watching-spot:v1'

function readSpot(): { x: number; y: number } | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(SPOT_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const x = Number(raw.x)
    const y = Number(raw.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  } catch {
    return null
  }
}

export const useWatching = create<WatchingState>((set) => ({
  shared: darkScreen(),
  setShared: (shared) => set({ shared, live: shared.videoId !== null }),
  open: false,
  live: false,
  tab: 'talk',
  setTab: (tab) => set({ tab }),
  show: () => set({ open: true }),
  tuck: () => set({ open: false }),
  close: () => set({ open: false, live: false }),
  hunt: '',
  setHunt: (hunt) => set({ hunt }),
  scrubbing: false,
  setScrubbing: (scrubbing) => set({ scrubbing }),
  spot: readSpot(),
  putSpot(spot) {
    try {
      if (spot) localStorage.setItem(SPOT_KEY, JSON.stringify(spot))
      else localStorage.removeItem(SPOT_KEY)
    } catch {
      /* it still holds for this session */
    }
    set({ spot })
  },
}))

/*
  A handle on the screen, in development only.

  Two people in two countries cannot both be sitting at this machine, so the
  only way to exercise the shared half is to *be* the other device for a moment
  — write an anchor, watch this one follow it. The browser checks do exactly
  that, and it is the same reason the roads publish their soundscapes.
*/
if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __watching?: unknown }
  host.__watching = {
    show: () => useWatching.getState().show(),
    tuck: () => useWatching.getState().tuck(),
    read: () => useWatching.getState().shared,
    positionOf,
  }
}

/**
 * Where the video is now, in seconds.
 *
 * Paused, that is simply where it was left. Playing, it is where it was plus
 * however long the world has been turning since — which is the entire sync
 * mechanism, and is why this takes the server clock rather than reading
 * `Date.now()` for itself.
 */
export function positionOf(anchor: Watching, now: number): number {
  if (!anchor.playing) return Math.max(0, anchor.at)
  return Math.max(0, anchor.at + (now - anchor.since) / 1000)
}

/**
 * What to do about being `off` seconds away from where you should be.
 *
 * Returned rather than done, so the decision can be read and argued with
 * without an iframe in the room. `hold` means the difference is not worth
 * touching; `drift` means recover it by playing very slightly faster or slower;
 * `seek` means go there.
 */
export function correction(off: number): { do: 'hold' | 'drift' | 'seek'; rate: number } {
  const size = Math.abs(off)
  if (size < DRIFT) return { do: 'hold', rate: 1 }
  if (size < LURCH) return { do: 'drift', rate: off > 0 ? 1 - NUDGE : 1 + NUDGE }
  return { do: 'seek', rate: 1 }
}

// ---------------------------------------------------------------------------
// What YouTube calls a link
// ---------------------------------------------------------------------------

/**
 * The eleven characters out of whatever was pasted, or null.
 *
 * ---------------------------------------------------------------------------
 * Every shape YouTube hands out, because the one somebody actually pastes
 * depends entirely on which button they used: the share sheet gives `youtu.be`,
 * the address bar gives `watch?v=`, a phone gives `/shorts/`, and an embed
 * gives `/embed/`. A field that only took one of them would be a field that
 * mysteriously refuses half the links in the world.
 *
 * A bare id is accepted too — eleven characters of YouTube's alphabet is
 * unambiguous, and it is what you are left holding if you copy from a URL by
 * hand and miss the front of it.
 * ---------------------------------------------------------------------------
 */
const ID = /^[\w-]{11}$/

export function videoIdIn(text: string): string | null {
  const raw = text.trim()
  if (raw === '') return null
  if (ID.test(raw)) return raw

  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return ID.test(id) ? id : null
  }
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null

  const v = url.searchParams.get('v')
  if (v !== null && ID.test(v)) return v

  const parts = url.pathname.split('/').filter(Boolean)
  const after = ['shorts', 'embed', 'v', 'live']
  for (let i = 0; i < parts.length - 1; i++) {
    if (after.includes(parts[i]) && ID.test(parts[i + 1])) return parts[i + 1]
  }
  return null
}

/** `4:03`, or `1:02:11` when it needs the hours. Blank when nothing is known. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const whole = Math.floor(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * How much of a video's name the corner is allowed to say.
 *
 * ---------------------------------------------------------------------------
 * The line in the corner was written to a length: *open the night screen*, or
 * *Tife is here · open the night screen* when she is. That is the shape the
 * column was laid out around, and on a phone it is exactly as much text as
 * fits on one line.
 *
 * Then something is put on, and the same line starts saying what is on — and a
 * video's name is written by a stranger with no idea this column exists.
 * "How It's Made: Noodles, Pasta, Mac & Cheese | Season 12 Episode 4 | Full
 * Episode" is a real title and it is four times the budget.
 *
 * CSS already ellipsises it, and that was not enough: the ellipsis only bites
 * once something upstream has decided how wide the column is, and every one of
 * those decisions is a place a long word can push. Cutting the string is the
 * one fix that cannot be undone by a layout further out — the corner never
 * receives the long name in the first place.
 * ---------------------------------------------------------------------------
 */
export const TITLE_ROOM = 34

/**
 * A name cut to a length a line can hold.
 *
 * Cuts on a word boundary when there is one worth having — a title chopped
 * mid-word reads as damage, whereas one that stops between words reads as a
 * title that carries on. "Worth having" is the last two thirds of the budget;
 * a boundary earlier than that throws away more than the ragged edge costs.
 *
 * The ellipsis is one character and is inside the budget, not added to it.
 */
export function shortTitle(title: string, room = TITLE_ROOM): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean.length <= room) return clean
  const cut = clean.slice(0, room - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > room * 0.66 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Somewhere to begin
// ---------------------------------------------------------------------------

/**
 * Things worth searching for when you have opened the screen and have no idea.
 *
 * ---------------------------------------------------------------------------
 * The empty field is the hardest moment in the whole thing: two people, one
 * evening, and the question "what do you want to watch" — which has defeated
 * better systems than this one. A few concrete starting points are worth more
 * than a cleverer search box.
 *
 * They are **phrases rather than categories** on purpose. "Music" is a filing
 * cabinet; "songs from films" is an evening. Each one should sound like
 * somebody suggesting something, because that is what it is standing in for.
 * ---------------------------------------------------------------------------
 */
const BEGINNINGS = [
  'music films',
  'something funny',
  'short documentaries',
  'racing onboard',
  'live sessions',
  'the making of',
  'street food',
  'old adverts',
  'wildlife close up',
  'songs from films',
  'places from above',
  'stand up sets',
  'how it is made',
  'covers, better than the original',
  'night drives',
  'lost architecture',
  'first performances',
  'quiet cooking',
]

/** How many are offered. Three, and the number is a layout decision. */
export const BEGIN_WITH = 3

/**
 * Three of them, picked once for this visit.
 *
 * ---------------------------------------------------------------------------
 * **Three, because four wrapped.** On a phone the fourth chip dropped to a
 * second row and pushed the queue — the thing you came to look at — down off
 * the bottom of the panel. A suggestion that costs you sight of your own queue
 * is not helping.
 *
 * **Different every session, because a fixed three stop being read.** The same
 * four words in the same place every evening become furniture within a week,
 * and then the empty field is back to being empty. Rotating them means the
 * corner occasionally says something you had not thought of, which is the only
 * reason it is there.
 *
 * Picked once and held, not re-rolled per render — chips that reshuffle under
 * a thumb are unusable.
 * ---------------------------------------------------------------------------
 */
export function beginnings(): string[] {
  const pool = [...BEGINNINGS]
  const picked: string[] = []
  for (let i = 0; i < BEGIN_WITH && pool.length > 0; i++) {
    picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
  }
  return picked
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

let counter = 0

/** An id that cannot collide with hers, so removing one removes exactly one. */
export function queuedId(by: UserId): string {
  counter += 1
  return `${by}-${Date.now().toString(36)}-${counter.toString(36)}`
}

/**
 * A name for one sitting in front of the screen.
 *
 * The clock and a counter, the same as `queuedId` and for the same reason:
 * two devices may mint one in the same millisecond, and the only thing that
 * would go wrong is a device deciding lines from the other sitting are its
 * own. It never leaves this pair of people, so it does not need to be unique
 * in the universe — only unique from the sitting before it.
 */
export function newSession(): string {
  counter += 1
  return `s-${Date.now().toString(36)}-${counter.toString(36)}`
}

export function queueItem(
  by: UserId,
  video: { videoId: string; title: string; seconds?: number },
): Queued {
  return {
    id: queuedId(by),
    videoId: video.videoId,
    title: video.title,
    seconds: video.seconds ?? 0,
    by,
    at: Date.now(),
  }
}

/**
 * The next thing, and the queue with it taken off.
 *
 * One function because advancing is the one move both devices may make at the
 * same moment — a video ends on two phones within a frame of each other, and
 * both will try to move on. Doing it this way makes that harmless: both compute
 * the same next video from the same list and write the same anchor, so the
 * second write agrees with the first instead of fighting it.
 */
export function advance(queue: Queued[]): { next: Queued | null; rest: Queued[] } {
  if (queue.length === 0) return { next: null, rest: [] }
  return { next: queue[0], rest: queue.slice(1) }
}
