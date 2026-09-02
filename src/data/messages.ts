/**
 * A message, onto the wire and back off it.
 *
 * =============================================================================
 * The same arrangement as `data/presence`, and for the same reason, which by
 * now is a pattern rather than a coincidence. **Four times in two days a field
 * has been added at one end of a seam and not the other**, and not once did
 * anything throw:
 *
 *   `racing`  declared, documented, validated in the rules — and never sent.
 *   `typing`  written and validated — and never read.
 *   `marks`   written and read — and refused by a Firestore rule that listed
 *             the fields a message may be updated with.
 *   `marks`   again: allowed by the rules, written to the document, and then
 *             dropped by *this* reader, which built a `Message` field by field
 *             and did not know about it. Every emoji arrived as a heart.
 *
 * Every one of them worked perfectly against the mock, because the mock keeps
 * whole objects and has no rules in it. Every one was found by somebody on a
 * phone in another country.
 *
 * So the two halves live next to each other here, with no Firebase in them,
 * and `npm run seams` round-trips every field through both. A field that is
 * written and not read — or read and never written — is a failing check now.
 * =============================================================================
 */

import type { Message, UserId } from './types'
import { HEART } from './types'

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const str = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : fallback

const asUser = (value: unknown): UserId => (value === 'cool' ? 'cool' : 'warm')

/**
 * What a heart or a mark writes.
 *
 * Returned as a patch of *dotted paths* rather than a whole object, because a
 * message is otherwise immutable and both people write to the same document:
 * `hearts.warm` touches one key and leaves hers alone, where writing the whole
 * `hearts` map would be a read-modify-write and could lose one of you.
 *
 * The keys here are also the ones `firestore.rules` names in its
 * `affectedKeys` list. Adding one means adding it there too — which is the
 * mistake that made every emoji fail on the way *out*.
 */
export function markPatch(
  me: UserId,
  on: boolean,
  mark: string | undefined,
  now: number,
  absent: unknown,
): Record<string, unknown> {
  return {
    [`hearts.${me}`]: on ? now : absent,
    /*
      A heart writes no mark at all. So a message reacted to before there was
      any choice of glyph and one hearted today are the same shape on the wire,
      and `markBy` needs no special case for the old ones.
    */
    [`marks.${me}`]: on && mark && mark !== HEART ? mark : absent,
  }
}

/** And what comes back. Returns null for anything that is not a message. */
export function readMessage(id: string, raw: unknown): Message | null {
  if (raw === null || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const body = str(d.body, '')
  if (body === '') return null

  const message: Message = { id, by: asUser(d.by), body, at: num(d.at, 0) }
  if (typeof d.replyTo === 'string') message.replyTo = d.replyTo

  /*
    Absent rather than present-and-undefined.

    `{ replyTo: undefined }` is not the same shape as `{}` to TypeScript's
    optional properties, and that is the type system pointing at something
    real: a message with an explicit undefined reply is one that has been asked
    about its reply and answered "none", which is not the same as a message
    with no reply.
  */
  const rawHearts = d.hearts as Record<string, unknown> | undefined
  const hearts: Message['hearts'] = {}
  if (typeof rawHearts?.warm === 'number') hearts.warm = rawHearts.warm
  if (typeof rawHearts?.cool === 'number') hearts.cool = rawHearts.cool
  if (hearts.warm !== undefined || hearts.cool !== undefined) message.hearts = hearts

  const rawMarks = d.marks as Record<string, unknown> | undefined
  const marks: Message['marks'] = {}
  if (typeof rawMarks?.warm === 'string' && rawMarks.warm !== '') marks.warm = rawMarks.warm
  if (typeof rawMarks?.cool === 'string' && rawMarks.cool !== '') marks.cool = rawMarks.cool
  if (marks.warm !== undefined || marks.cool !== undefined) message.marks = marks

  return message
}

/**
 * Every field on a message that is allowed to travel, named once.
 *
 * Walked by the harness rather than retyped there, so adding a field and
 * forgetting one end of the wire fails a check instead of being discovered on
 * a phone.
 */
export const TRAVELS = ['by', 'body', 'at', 'replyTo', 'hearts', 'marks'] as const
