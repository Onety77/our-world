/**
 * Two people agreeing to start at the same instant.
 *
 * ---------------------------------------------------------------------------
 * A live round already had half of this. `Presence.racing` carries the key of
 * a round somebody is sitting in, the other person sees it and joins, and both
 * end up in the same round with the same seed. That is the hard half and it
 * works.
 *
 * What it did not have is a *moment*. Joining opened the game immediately, so
 * whoever arrived second began several seconds behind — which is fine for
 * Scattergories, where the clock is generous and the letters are the same
 * either way, and is not a race. Wheel to wheel means the flag drops once, for
 * both of you.
 *
 * So three things are added, and all three ride on the channel that already
 * exists rather than on anything new:
 *
 *   being here    both of you holding the same key means you are in the room
 *   being ready   said by *when* you said it, not by a flag
 *   the moment    worked out from those two times, identically on both phones
 *
 * **Readiness is a timestamp rather than a boolean**, and that is the whole
 * trick. If it were a flag, something would have to decide when the countdown
 * begins and tell the other device — which is a write, a round trip, and a
 * question about who is in charge. Two timestamps need none of that: the last
 * person to press ready is the one the countdown hangs off, both devices can
 * see both numbers, and both arrive at the same answer without speaking.
 *
 * **It rides inside `racing` rather than in a new presence field.** The
 * Realtime Database rules validate presence field by field and reject anything
 * they do not recognise, so a new field is a rules change and a republish
 * before anybody can play. A key with a suffix on it needs neither, and
 * `racing` already means "the live round you are sitting in" — when you are
 * ready is a fact about sitting in it.
 *
 * The old bare-key form still parses as "here, not ready", so a device running
 * yesterday's build is simply somebody who has not pressed the button yet.
 * ---------------------------------------------------------------------------
 */

/** How long the flag takes to drop once the second person is ready. */
export const LOBBY_COUNTDOWN_MS = 3200

/**
 * Everything after this is when they pressed ready.
 *
 * A character that cannot occur in a key. Keys are built from a timestamp and
 * a stage name, so a letter would be ambiguous and this is not.
 */
const READY_AT = '@'

export interface Sitting {
  /** The round, without any readiness on the end. */
  key: string
  /** Server milliseconds, or null if they are here and not ready. */
  readyAt: number | null
}

export function readSitting(racing: string | undefined): Sitting | null {
  if (!racing) return null
  const at = racing.indexOf(READY_AT)
  if (at < 0) return { key: racing, readyAt: null }
  const key = racing.slice(0, at)
  const when = Number(racing.slice(at + 1))
  return { key, readyAt: Number.isFinite(when) && when > 0 ? when : null }
}

export function writeSitting(key: string, readyAt: number | null): string {
  return readyAt === null ? key : `${key}${READY_AT}${readyAt}`
}

/**
 * The instant both devices will arrive at, from the two sides of the room.
 *
 * Pulled out of the hook and made pure because it is the one piece of this
 * that is *load-bearing across two phones*: if the two devices ever disagree
 * about this number, one car starts before the other and the whole feature is
 * a lie. Everything else in here is presentation.
 *
 * Deliberately symmetric — it takes "one side" and "the other side" rather
 * than "mine" and "hers", so the same call with the arguments swapped must
 * give the same answer. That property is the whole correctness argument, and
 * it is what `npm run lobby` checks.
 */
export function agreedStart(
  key: string,
  one: Sitting | null,
  other: Sitting | null,
): number | null {
  if (one?.key !== key || other?.key !== key) return null
  if (one.readyAt === null || other.readyAt === null) return null
  return Math.max(one.readyAt, other.readyAt) + LOBBY_COUNTDOWN_MS
}

// ---------------------------------------------------------------------------
// Keys that carry a road with them
// ---------------------------------------------------------------------------

/**
 * A live rally round names its road as well as its moment.
 *
 * There is nowhere else to put it. A round document is written once and never
 * updated — the rules forbid it — and its setup is created before anybody has
 * chosen anything, so the stage in there is whatever the default was. Deriving
 * the road from a hash of the key would work and would take the choice away.
 *
 * So the key carries it: `1730000000000.moonbreak`. Both devices read the road
 * out of the same string they are already sharing, the person who opened the
 * lobby is the one who chose it, and nothing extra is written anywhere.
 */
export function raceKey(now: number, stage: string): string {
  return `${now}.${stage}`
}

export function stageOfKey(key: string, fallback: string): string {
  const at = key.indexOf('.')
  if (at < 0) return fallback
  const stage = key.slice(at + 1)
  return stage.length > 0 ? stage : fallback
}

const LEG = '#'

/**
 * One flag out of several in the same round.
 *
 * Scattergories turns a fresh glass before each of its rounds, so it needs a
 * flag before each of them, and two flags cannot share a key — the second
 * would be standing in a room the two of you had already left. So each leg
 * gets its own: `1730000000000#1`.
 *
 * **The first leg is the round key itself, unchanged.** Everything that is not
 * this game has exactly one flag, and none of it should have to know the word
 * "leg" to keep working.
 */
export function legKey(roundKey: string, leg: number): string {
  return leg === 0 ? roundKey : `${roundKey}${LEG}${leg}`
}

/**
 * The round a sitting is in, with the leg taken back off.
 *
 * `Presence.racing` has two readers. This room uses it to find each other
 * inside a round; the Threshold uses it, from outside, as the key of a round
 * to *join* — so anything the room adds to that field has to be removable
 * again, or the door starts opening rounds that do not exist. It nearly did:
 * joining her mid-Scattergories would have opened `…:race:1730000000000#1`.
 */
export function roundOfKey(key: string): string {
  const at = key.indexOf(LEG)
  return at < 0 ? key : key.slice(0, at)
}
