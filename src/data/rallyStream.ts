import type {
  RallyStream,
  RallyStreamFrame,
  RallyStreamInput,
  RallyStreamStats,
  UserId,
} from './types'

/** The existing car cadence: about sixteen authoritative updates a second. */
export const RALLY_STREAM_INTERVAL = 60

/** The database rules and the old compatibility field share this ceiling. */
export const RALLY_CAR_MAX = 64

/** The deliberately terse object that actually crosses Realtime Database. */
export interface RallyWireFrame {
  v: 1
  q: number
  c: string
  t: number
  f: number
  l: number
  y: number
  w: number
  a: number
}

/**
 * Realtime Database forbids `. # $ / [ ]` in path segments.
 *
 * Rally rooms currently contain a dot (`timestamp.moonbreak`). Escaping every
 * non-key-safe character rather than merely replacing it prevents two
 * different room names collapsing onto the same stream later.
 */
export function rallyRoomKey(room: string): string {
  let key = ''
  for (const char of room) {
    if (/^[A-Za-z0-9_-]$/.test(char)) key += char
    else key += `~${char.codePointAt(0)!.toString(16)}~`
  }
  return key || 'room'
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const rounded = (value: number, scale: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, value)) * scale)

/** Quantise the motion extras; the recorder-compatible car remains untouched. */
export function writeRallyFrame(
  input: RallyStreamInput,
  sequence: number,
  sentAt: number,
): RallyWireFrame {
  return {
    v: 1,
    q: Math.max(0, Math.floor(sequence)),
    c: input.car.slice(0, RALLY_CAR_MAX),
    t: Math.max(0, Math.round(input.clock)),
    f: rounded(input.speed, 100, -100, 100),
    l: rounded(input.lateral, 100, -100, 100),
    y: rounded(input.yawRate, 1000, -20, 20),
    w: rounded(input.steering, 1000, -2, 2),
    a: Math.max(1, Math.round(sentAt)),
  }
}

/** Refuse malformed or implausible remote data before it reaches Three.js. */
export function readRallyFrame(raw: unknown): RallyStreamFrame | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<RallyWireFrame>
  if (d.v !== 1) return null
  const sequence = d.q
  if (!finite(sequence) || !Number.isInteger(sequence) || sequence < 0 || sequence > 2_147_483_647) return null
  if (typeof d.c !== 'string' || d.c.length === 0 || d.c.length > RALLY_CAR_MAX) return null
  if (!finite(d.t) || d.t < 0 || d.t > 3_600_000) return null
  if (!finite(d.f) || Math.abs(d.f) > 10_000) return null
  if (!finite(d.l) || Math.abs(d.l) > 10_000) return null
  if (!finite(d.y) || Math.abs(d.y) > 20_000) return null
  if (!finite(d.w) || Math.abs(d.w) > 2_000) return null
  if (!finite(d.a) || d.a <= 0) return null
  return {
    sequence,
    car: d.c,
    clock: d.t,
    speed: d.f / 100,
    lateral: d.l / 100,
    yawRate: d.y / 1000,
    steering: d.w / 1000,
    sentAt: d.a,
  }
}

/**
 * Counts the real transport, not the animation built from it.
 *
 * Kept independent of Firebase so the same evidence exists on the local mock
 * and the arithmetic can be tested without a network or browser.
 */
export class RallyStreamMeter {
  private readonly begun: number
  private queued = 0
  private sent = 0
  private received = 0
  private missed = 0
  private duplicates = 0
  private outOfOrder = 0
  private resets = 0
  private errors = 0
  private lastSequence: number | null = null
  private lastSentAt = 0
  private lastArrival: number | null = null
  private readonly gaps: number[] = []
  private maxGap = 0
  private age = 0
  private maxAge = 0

  constructor(
    private readonly now: () => number,
    startedAt = now(),
  ) {
    this.begun = startedAt
  }

  noteQueued() {
    this.queued++
  }

  noteSent() {
    this.sent++
  }

  noteError() {
    this.errors++
  }

  /** True only when the frame is new enough to hand to the race. */
  noteReceived(frame: RallyStreamFrame, arrivedAt = this.now()): boolean {
    if (this.lastSequence !== null) {
      /*
        A tab reloading in the same room starts its sequence at zero again.
        The new frame's corrected send time distinguishes that from a repeated
        or reordered packet, whose send time is not newer than what we hold.
      */
      if (frame.sequence <= this.lastSequence && frame.sentAt > this.lastSentAt) {
        this.resets++
        this.lastSequence = null
      } else if (frame.sequence === this.lastSequence) {
        this.duplicates++
        return false
      } else if (frame.sequence < this.lastSequence) {
        this.outOfOrder++
        return false
      }
      if (this.lastSequence !== null && frame.sequence > this.lastSequence + 1) {
        this.missed += frame.sequence - this.lastSequence - 1
      }
    }
    this.lastSequence = frame.sequence
    this.lastSentAt = frame.sentAt
    this.received++

    if (this.lastArrival !== null) {
      const gap = Math.max(0, arrivedAt - this.lastArrival)
      this.gaps.push(gap)
      if (this.gaps.length > 48) this.gaps.shift()
      this.maxGap = Math.max(this.maxGap, gap)
    }
    this.lastArrival = arrivedAt
    // Both clocks are corrected from the same RTDB server offset. Clamp a
    // briefly negative result while that correction is settling to zero.
    this.age = Math.max(0, arrivedAt - frame.sentAt)
    this.maxAge = Math.max(this.maxAge, this.age)
    return true
  }

  snapshot(): RallyStreamStats {
    let mean = 0
    let jitter = 0
    if (this.gaps.length > 0) {
      for (const gap of this.gaps) mean += gap
      mean /= this.gaps.length
      for (const gap of this.gaps) jitter += Math.abs(gap - mean)
      jitter /= this.gaps.length
    }
    return {
      startedAt: this.begun,
      queued: this.queued,
      sent: this.sent,
      received: this.received,
      missed: this.missed,
      duplicates: this.duplicates,
      outOfOrder: this.outOfOrder,
      resets: this.resets,
      meanGap: Math.round(mean),
      jitter: Math.round(jitter),
      maxGap: Math.round(this.maxGap),
      age: Math.round(this.age),
      maxAge: Math.round(this.maxAge),
      errors: this.errors,
    }
  }
}

/** The local backend's stand-in for two RTDB child listeners. */
interface LocalRallySeat {
  user: UserId
  receive(frame: RallyWireFrame): void
}
const LOCAL_RALLY_ROOMS = new Map<string, Set<LocalRallySeat>>()

/**
 * Open the same sequenced, throttled connection without a network.
 *
 * Exported from this pure module so the complete two-client seam can be tested
 * under Node; importing the whole local world would also import Vite's runtime
 * environment and would turn that test into a browser impersonation.
 */
export function openLocalRallyStream(
  me: UserId,
  room: string,
  listener: (frame: RallyStreamFrame) => void,
  now: () => number = () => Date.now(),
): RallyStream {
  const roomKey = rallyRoomKey(room)
  const seats = LOCAL_RALLY_ROOMS.get(roomKey) ?? new Set<LocalRallySeat>()
  LOCAL_RALLY_ROOMS.set(roomKey, seats)
  const meter = new RallyStreamMeter(now)
  let pending: RallyStreamInput | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSent = 0
  let sequence = 0
  let closed = false

  const seat: LocalRallySeat = {
    user: me,
    receive(raw) {
      const frame = readRallyFrame(raw)
      if (!frame) return
      if (meter.noteReceived(frame)) listener(frame)
    },
  }
  seats.add(seat)

  const flush = () => {
    timer = null
    if (closed || !pending) return
    const at = now()
    const raw = writeRallyFrame(pending, sequence++, at)
    pending = null
    lastSent = at
    meter.noteSent()
    for (const other of seats) {
      if (other !== seat && other.user !== me) other.receive(raw)
    }
  }

  return {
    send(frame) {
      if (closed) return
      pending = frame
      meter.noteQueued()
      const since = now() - lastSent
      if (since >= RALLY_STREAM_INTERVAL) {
        flush()
        return
      }
      if (timer) return
      timer = setTimeout(flush, RALLY_STREAM_INTERVAL - since)
    },

    stats: () => meter.snapshot(),

    close() {
      if (closed) return
      closed = true
      pending = null
      if (timer) clearTimeout(timer)
      seats.delete(seat)
      if (seats.size === 0) LOCAL_RALLY_ROOMS.delete(roomKey)
    },
  }
}
