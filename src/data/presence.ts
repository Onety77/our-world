/**
 * Presence, onto the wire and back off it.
 *
 * =============================================================================
 * **Two functions, and the only reason they are here is that they have to be
 * checked against each other.**
 *
 * Presence has one shape written by `flush` in `data/firebase` and another read
 * by the `onValue` beside it, and for a long time both were written out by hand
 * in that file, a hundred lines apart. That arrangement has now failed twice,
 * in both directions, and neither failure threw anything:
 *
 *   **`racing` was never sent.** Declared on `Presence`, documented, and
 *   validated in `database.rules.json` since the day live rounds were built —
 *   and the writer never included it. Live rounds worked perfectly against the
 *   mock and would have done nothing at all the first time it was tried for
 *   real.
 *
 *   **`typing` was never read.** Same story, other end. The writer was right,
 *   the rules were right, and the reader built its object field by field and
 *   dropped it. Tested end to end in a browser and passed, because the mock
 *   merges a presence patch wholesale and so does not have this failure mode.
 *
 * The two bugs are the same bug: **the mock and the wire are two
 * implementations of one interface, and a browser test only ever exercises the
 * mock.** So the field lists live here, as ordinary functions with no Firebase
 * in them, and `npm run presence` round-trips every field through both. A
 * field that is written and not read — or read and never written — now fails a
 * check rather than being discovered on a phone.
 * =============================================================================
 */

import type { Presence, UserId } from './types'

/** After this long with no word, somebody is gone whatever their last write said. */
export const PRESENCE_STALE = 45_000

/**
 * What goes on the wire.
 *
 * `pending` is whatever the last `publishPresence` asked for; `here` is what
 * this device already believed. The optional fields are left *out* of the
 * object entirely when empty rather than written as null or nought — RTDB
 * rejects `undefined`, and a `null` would pass a `.validate` on a string field
 * and read back as `""`, which every consumer would then have to know about.
 */
export function presenceBody(
  here: Presence,
  pending: Partial<Omit<Presence, 'id'>>,
  lastSeen: unknown,
): Record<string, unknown> {
  const racing = pending.racing ?? here.racing
  const looking = pending.looking ?? here.looking
  const driving = pending.driving ?? here.driving
  const typing = pending.typing ?? here.typing
  return {
    online: true,
    placeId: pending.placeId ?? here.placeId,
    position: pending.position ?? here.position,
    heading: pending.heading ?? here.heading,
    ...(racing ? { racing } : {}),
    ...(looking ? { looking } : {}),
    ...(driving ? { driving } : {}),
    ...(typing ? { typing } : {}),
    lastSeen,
  }
}

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const str = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : fallback

function vec3(value: unknown): [number, number, number] {
  if (!Array.isArray(value)) return [0, 0, 0]
  return [num(value[0], 0), num(value[1], 0), num(value[2], 0)]
}

/** Somebody who is not here. */
export function offlinePresence(id: UserId): Presence {
  return {
    id,
    online: false,
    placeId: 'clearing',
    position: [0, 0, 0],
    heading: 0,
    lastSeen: 0,
  }
}

/**
 * And what comes back off it.
 *
 * `now` is the server clock, not the device's — a phone whose own clock is
 * twenty minutes fast would otherwise decide the other person went stale
 * twenty minutes ago and has been gone ever since.
 */
export function readPresence(id: UserId, raw: unknown, now: number): Presence {
  if (raw === null || typeof raw !== 'object') return offlinePresence(id)
  const d = raw as Record<string, unknown>
  const lastSeen = num(d.lastSeen, 0)
  const them: Presence = {
    id,
    /*
      Both conditions. `onDisconnect` usually clears this, but a phone that
      dies outright leaves its last position behind for ever.
    */
    online: d.online === true && now - lastSeen < PRESENCE_STALE,
    placeId: str(d.placeId, 'clearing'),
    position: vec3(d.position),
    heading: num(d.heading, 0),
    lastSeen,
  }
  // Absent rather than present-and-empty, so `if (them.racing)` reads the same
  // here as it does against the mock.
  if (typeof d.racing === 'string' && d.racing !== '') them.racing = d.racing
  if (typeof d.driving === 'string' && d.driving !== '') them.driving = d.driving
  if (typeof d.looking === 'string' && d.looking !== '') them.looking = d.looking
  if (typeof d.typing === 'number' && d.typing > 0) them.typing = d.typing
  return them
}

/**
 * Every field that is allowed to travel, named once.
 *
 * The harness walks this rather than a list of its own, so adding a field to
 * `Presence` and forgetting one end of the wire is a failing check instead of
 * something you find out about on a phone in another country.
 */
export const TRAVELS = ['placeId', 'position', 'heading', 'racing', 'looking', 'driving', 'typing'] as const
