/**
 * Making an id.
 *
 * **This exists because of a bug that made the whole garden read-only on a
 * phone.** Everything that creates anything — a thought, a contribution, a
 * message, a plant — needs an id, and every one of them called
 * `crypto.randomUUID()` directly.
 *
 * `crypto.randomUUID` is marked `[SecureContext]` in the WebCrypto spec, which
 * means it is `undefined` on any plain-http origin that is not localhost. The
 * dev server is deliberately bound to the LAN (`host: true` in vite.config, so
 * the garden can be opened on a phone), and a phone reaches it at
 * `http://192.168.x.x` — not a secure context. So on the one device this thing
 * is mainly *for*, every write threw `TypeError: crypto.randomUUID is not a
 * function` the moment it was called.
 *
 * It failed in the worst possible way: silently. The throw happened inside an
 * async data-layer method, nothing awaited it with a catch, and the button
 * simply did nothing. Reading worked perfectly, which made it look like the
 * database was down rather than like a missing function.
 *
 * `crypto.getRandomValues` is *not* secure-context-gated and is available
 * everywhere, so the fallback is a real random v4 UUID and not a downgrade in
 * quality — only in convenience.
 */

/** Set once, so a missing API is not re-probed on every id. */
const hasUuid =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'

const hasValues =
  typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'

const HEX: string[] = []
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1))

/**
 * A v4 UUID, on any origin.
 *
 * Ids end up in stored records and in Firestore document paths, so this has to
 * keep producing the same shape it always has — anything already written stays
 * readable and nothing downstream has to care which branch made it.
 */
export function newId(): string {
  if (hasUuid) return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (hasValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Nothing shipping this decade lands here. Kept so an id is never
    // undefined, which would write a document called "undefined".
    for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0
  }

  // version 4, variant 10xx — the two bytes that make it a valid v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return (
    HEX[bytes[0]] + HEX[bytes[1]] + HEX[bytes[2]] + HEX[bytes[3]] + '-' +
    HEX[bytes[4]] + HEX[bytes[5]] + '-' +
    HEX[bytes[6]] + HEX[bytes[7]] + '-' +
    HEX[bytes[8]] + HEX[bytes[9]] + '-' +
    HEX[bytes[10]] + HEX[bytes[11]] + HEX[bytes[12]] +
    HEX[bytes[13]] + HEX[bytes[14]] + HEX[bytes[15]]
  )
}
