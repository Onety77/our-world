/**
 * A word, carried in a link.
 *
 * ---------------------------------------------------------------------------
 * **The link is the whole challenge, and there is no server behind it.** The
 * word you pick and the name it comes from are packed into a short code on the
 * end of the URL — `/w/<code>` — and the page that opens it (`src/word`) reads
 * them back out. Nothing is written anywhere, nobody needs an account, and a
 * link keeps working for as long as the site does.
 *
 * The word is not *in* the link where anybody can read it. The bytes are
 * mixed with a keystream from a random salt, so the same word gives a
 * different-looking link every time and no letters show in the URL. That is a
 * veil, not a lock — somebody determined enough to read this file could undo
 * it — which is the right amount for a word game between friends: the point
 * is that a glance at the address bar gives nothing away.
 *
 * A check byte means a link that was cut short or mistyped says it is broken
 * instead of dealing a nonsense word.
 * ---------------------------------------------------------------------------
 *
 * No imports from the garden. The public page uses this, and it must stay a
 * page that loads nothing of the world.
 */

import { LENGTH, TRIES, score, solved } from './words'

export interface Challenge {
  /** Five lowercase letters. */
  word: string
  /** Who sent it. May be empty. */
  from: string
}

const VERSION = 1
/** Room for a name, in UTF-8 bytes. */
const NAME_BYTES = 24
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** xorshift32, from the salt: the same salt always gives the same stream. */
function keystream(salt: number, count: number): number[] {
  let s = (Math.imul(salt + 1, 2654435761) ^ 0x5bd1e995) >>> 0 || 1
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    out.push((s >>> 11) & 255)
  }
  return out
}

function checksum(bytes: number[], salt: number): number {
  let h = 2166136261 ^ salt
  for (const b of bytes) h = Math.imul(h ^ b, 16777619)
  return (h >>> 0) & 255
}

function toText(bytes: number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const left = bytes.length - i
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const chars = left >= 3 ? 4 : left + 1
    for (let c = 0; c < chars; c++) out += B64[(n >>> (18 - 6 * c)) & 63]
  }
  return out
}

function fromText(text: string): number[] | null {
  const out: number[] = []
  for (let i = 0; i < text.length; i += 4) {
    const group = text.slice(i, i + 4)
    if (group.length === 1) return null
    let n = 0
    for (let c = 0; c < 4; c++) {
      const v = c < group.length ? B64.indexOf(group[c]) : 0
      if (v < 0) return null
      n |= v << (18 - 6 * c)
    }
    for (let b = 0; b < group.length - 1; b++) out.push((n >>> (16 - 8 * b)) & 255)
  }
  return out
}

/** A name, tidied and cut to fit — never through the middle of a character. */
export function tidyName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim()
  const encoder = new TextEncoder()
  let kept = ''
  for (const ch of clean) {
    if (encoder.encode(kept + ch).length > NAME_BYTES) break
    kept += ch
  }
  return kept.trim()
}

/** Five letters a–z, and nothing else. */
export function isFiveLetters(word: string): boolean {
  return new RegExp(`^[a-z]{${LENGTH}}$`).test(word)
}

function randomSalt(): number {
  const bytes = new Uint8Array(2)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 2; i++) bytes[i] = Math.floor(Math.random() * 256)
  return (bytes[0] << 8) | bytes[1]
}

/** Pack a challenge into a code. `salt` is for the check script; leave it out. */
export function encodeChallenge(challenge: Challenge, salt = randomSalt()): string {
  const word = challenge.word.toLowerCase()
  if (!isFiveLetters(word)) throw new Error('A challenge word is five letters, a to z.')
  const plain = [
    ...word.split('').map((ch) => ch.charCodeAt(0) - 97),
    ...new TextEncoder().encode(tidyName(challenge.from)),
  ]
  plain.push(checksum(plain, salt))
  const stream = keystream(salt, plain.length)
  return toText([VERSION, salt >>> 8, salt & 255, ...plain.map((b, i) => b ^ stream[i])])
}

/** Read a code back, or null if it is not one of ours or has been damaged. */
export function decodeChallenge(code: string): Challenge | null {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(code)) return null
  const bytes = fromText(code)
  if (!bytes || bytes.length < 3 + LENGTH + 1 || bytes[0] !== VERSION) return null
  const salt = (bytes[1] << 8) | bytes[2]
  const body = bytes.slice(3)
  const stream = keystream(salt, body.length)
  const plain = body.map((b, i) => b ^ stream[i])
  const check = plain.pop()
  if (check !== checksum(plain, salt)) return null
  const letters = plain.slice(0, LENGTH)
  if (letters.some((v) => v > 25)) return null
  let from = ''
  try {
    from = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(plain.slice(LENGTH)))
  } catch {
    return null
  }
  return { word: letters.map((v) => String.fromCharCode(97 + v)).join(''), from: tidyName(from) }
}

/**
 * Where links point.
 *
 * The page's own origin, which on the web is exactly right. Inside the native
 * shell it is not — `https://localhost` means nothing on somebody else's phone
 * — so a build for the app sets `VITE_SHARE_ORIGIN` to the real site.
 */
export function shareOrigin(): string {
  const configured = (import.meta.env.VITE_SHARE_ORIGIN as string | undefined)?.trim()
  return (configured || location.origin).replace(/\/+$/, '')
}

export function challengeLink(code: string): string {
  return `${shareOrigin()}/w/${code}`
}

/** The code in a page's address: `/w/<code>`, or `?w=<code>` as a fallback. */
export function codeFromAddress(pathname: string, search: string): string | null {
  const path = pathname.match(/^\/w\/([A-Za-z0-9_-]+)\/?$/)
  if (path) return path[1]
  return new URLSearchParams(search).get('w')
}

/**
 * Put something on the clipboard. The async clipboard needs a secure context
 * and a recent tap; the textarea is for everything else (an old WebView, plain
 * http on the LAN while developing).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const done = document.execCommand('copy')
    area.remove()
    return done
  } catch {
    return false
  }
}

/**
 * Hand something to the phone's own share sheet — WhatsApp, Messages,
 * whatever they use — and copy it where there is no share sheet.
 */
export async function handOver(payload: { title: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      /* no share target, or not allowed here — copy instead */
    }
  }
  const whole = payload.url && !payload.text.includes(payload.url) ? `${payload.text}\n${payload.url}` : payload.text
  return (await copyText(whole)) ? 'copied' : 'failed'
}

/**
 * How you did, as text to send back — the grid everybody already knows how to
 * read, and never the word.
 */
export function resultText(challenge: Challenge, guesses: string[], link: string): string {
  const won = solved(guesses, challenge.word)
  const whose = challenge.from ? `${challenge.from}'s word` : 'A word duel'
  const rows = guesses.map((guess) =>
    score(guess, challenge.word)
      .map((mark) => (mark === 'lit' ? '🟧' : mark === 'near' ? '🟨' : '⬛'))
      .join(''),
  )
  return [`${whose} · ${won ? guesses.length : 'X'}/${TRIES}`, '', ...rows, '', link].join('\n')
}
