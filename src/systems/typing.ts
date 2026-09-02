/**
 * Somebody is writing you something.
 *
 * =============================================================================
 * The smallest shared signal in the garden, and the one with the most ways to
 * get it subtly wrong. All of them are arithmetic, so all of them live here
 * rather than in the three composers that use it.
 *
 * **It is a time, not a flag.** See `Presence.typing`. The reader decides what
 * counts as recent, which means the indicator switches itself off when a phone
 * goes into a tunnel mid-sentence — the exact case a boolean cannot survive,
 * because the thing that would have to clear it is the write that is not
 * coming.
 *
 * **It does not say where.** One bit: she is writing *something*. Not which
 * room, not how much, not for how long. A version that reported "typing in the
 * Stars" or showed a live word count would be a different product with a
 * different feeling — this is meant to read as *she is thinking about you right
 * now*, and anything more precise than that turns warmth into surveillance.
 *
 * **The refresh is slower than the window.** Writes go out every `REFRESH` at
 * most; the reader believes them for `FRESH_FOR`, which is more than twice
 * that. So a single dropped write cannot make the indicator flicker, and it
 * takes a genuine silence to end it.
 *
 * **Stopping is not an event.** There is no "stopped typing" message, on
 * purpose. Deleting what you wrote, putting the phone down, or thinking for
 * eight seconds all end it the same way — by the clock running out — which is
 * both simpler and truer than trying to detect the difference.
 * =============================================================================
 */

import type { Presence, UserId } from '@/data/types'

/**
 * How long a report is believed for.
 *
 * Long enough to cover a pause for thought — people stop for four or five
 * seconds mid-message all the time, and an indicator that blinks off every time
 * somebody reaches for a word is worse than none. Short enough that a phone
 * that has genuinely gone quiet stops claiming otherwise within one breath.
 */
export const FRESH_FOR = 7000

/**
 * And how often one is sent while somebody keeps writing.
 *
 * Not per keystroke — that would be forty writes a sentence for a signal whose
 * whole content is one bit. Comfortably under half of `FRESH_FOR`, so two
 * refreshes have to be lost in a row before the other end notices anything.
 */
export const REFRESH = 3000

/** Is this person writing something, as far as we can tell right now? */
export function isTyping(who: Presence | undefined, now: number): boolean {
  if (!who || !who.online) return false
  const at = who.typing
  if (typeof at !== 'number' || at <= 0) return false
  /*
    A report from the future is a clock that disagrees, not a person typing
    tomorrow — and it would otherwise stick for as long as the two clocks are
    apart. Accepted, because the server stamp is the one both devices trust and
    a second of skew is ordinary, but never trusted beyond the window.
  */
  const since = now - at
  return since >= -FRESH_FOR && since < FRESH_FOR
}

/**
 * Whether to send a report now, given when the last one went out.
 *
 * Returns the time to stamp, or null to stay quiet. Written this way — a
 * decision rather than a side effect — so the rate limiting can be tested
 * without a network, a timer or a component.
 */
export function shouldReport(lastSent: number, now: number): number | null {
  if (now - lastSent < REFRESH) return null
  return now
}

/**
 * What the other person's state should say, in words.
 *
 * Here rather than in the three places that draw it, because three copies of a
 * sentence is three chances for two of them to drift — and because the name is
 * hers, so this is also the only place the phrasing has to agree with the
 * garden's rule that nothing is written from one side. The caller passes the
 * name; `{her}` never appears in a live string.
 */
export function writingLine(name: string): string {
  return `${name} is writing`
}

/**
 * A tiny per-device latch that decides when to publish.
 *
 * The composers each own one of these. It knows nothing about the network: it
 * is handed the current draft and the clock, and answers with the stamp to
 * publish or null. That keeps every timing decision in this file, which is the
 * only one with a test next to it.
 */
export function makeReporter() {
  let lastSent = 0
  let wasWriting = false

  return {
    /**
     * Call whenever the draft changes. Returns a stamp to publish, `0` to
     * publish a clear, or null to do nothing.
     *
     * The `0` is what makes sending feel instant: the moment a message goes,
     * the draft empties, and the other end should stop being told you are
     * writing *before* the message lands rather than four seconds after it.
     * Leaving that to the clock would mean the indicator outlives the thing it
     * was announcing, which reads as a second message that never arrives.
     */
    onDraft(draft: string, now: number): number | null {
      const writing = draft.trim().length > 0
      if (!writing) {
        if (!wasWriting) return null
        wasWriting = false
        lastSent = 0
        return 0
      }
      // The first keystroke always goes immediately. Waiting three seconds to
      // report that somebody started typing would mean short messages arrive
      // before the news that they were coming.
      if (!wasWriting) {
        wasWriting = true
        lastSent = now
        return now
      }
      const stamp = shouldReport(lastSent, now)
      if (stamp === null) return null
      lastSent = stamp
      return stamp
    },

    /** Call when the composer closes, so a half-written draft stops reporting. */
    stop(): number | null {
      if (!wasWriting) return null
      wasWriting = false
      lastSent = 0
      return 0
    },
  }
}

/** Who to watch: always the other one. You are never told about yourself. */
export function otherThan(me: UserId): UserId {
  return me === 'warm' ? 'cool' : 'warm'
}
