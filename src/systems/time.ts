/**
 * Everything the garden knows about time, derived from IANA timezone names and
 * nothing else. No offset arithmetic by hand, no DST table — `Intl` already
 * knows all of it, including the day China doesn't observe DST and Nigeria
 * never has.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return true
  } catch {
    return false
  }
}

/** Hours past local midnight as a float, e.g. 21.5 for 21:30. */
export function localHourIn(timeZone: string, at: number = Date.now()): number {
  try {
    const parts = formatterFor(timeZone).formatToParts(new Date(at))
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    return hour + minute / 60
  } catch {
    return 12
  }
}

/** "21:30", in their time, for showing next to their name. */
export function localTimeLabel(timeZone: string, at: number = Date.now()): string {
  try {
    return formatterFor(timeZone).format(new Date(at))
  } catch {
    return '--:--'
  }
}

/**
 * How far ahead `b` is of `a`, in hours. Positive means b is later in the day.
 * Right now, Kano→Lagos is 0. In a month, Lagos→Shanghai is 7.
 */
export function hoursApart(a: string, b: string, at: number = Date.now()): number {
  const diff = localHourIn(b, at) - localHourIn(a, at)
  // wrap into (-12, 12] so "23:00 vs 02:00" reads as 3 hours, not -21
  return ((((diff + 12) % 24) + 24) % 24) - 12
}

/** 0 at deep night, 1 at midday, smooth across dawn and dusk. */
export function daylightAt(hour: number): number {
  const DAWN_START = 5
  const DAWN_END = 7.5
  const DUSK_START = 17
  const DUSK_END = 19.5
  if (hour <= DAWN_START || hour >= DUSK_END) return 0
  if (hour >= DAWN_END && hour <= DUSK_START) return 1
  const t =
    hour < DAWN_END
      ? (hour - DAWN_START) / (DAWN_END - DAWN_START)
      : 1 - (hour - DUSK_START) / (DUSK_END - DUSK_START)
  return t * t * (3 - 2 * t) // smoothstep
}

export function isNight(hour: number): boolean {
  return daylightAt(hour) < 0.25
}

/** "morning" / "afternoon" / "evening" / "the middle of the night" */
export function partOfDay(hour: number): string {
  if (hour < 4.5) return 'the middle of the night'
  if (hour < 11) return 'morning'
  if (hour < 15) return 'afternoon'
  if (hour < 18.5) return 'late afternoon'
  if (hour < 22) return 'evening'
  return 'night'
}

/**
 * Where someone's light sits in the sky, from their local time alone.
 *
 * East at their midnight, overhead at their noon, west at their next midnight —
 * so a glance up tells you their time of day, and how far from yours it is.
 *
 * The arc never touches the horizon. A true horizon crossing would be more
 * literal and much worse: their light would spend their whole night invisible
 * behind the treeline, which is exactly when you most want to look for it.
 */
const ARC_FLOOR = 0.16
const ARC_HEIGHT = 0.6
/**
 * How far out the arc sits. Pushed back deliberately: a tighter arc puts their
 * noon almost directly overhead, past where the camera is allowed to pitch, so
 * the one thing you'd most want to look up at would be unreachable.
 */
const ARC_DEPTH = 0.5

export function orbPosition(hour: number, radius: number): [number, number, number] {
  const angle = (hour / 24) * Math.PI
  return [
    Math.cos(angle) * radius,
    (ARC_FLOOR + ARC_HEIGHT * Math.sin(angle)) * radius,
    -radius * ARC_DEPTH,
  ]
}

/**
 * The local date, as YYYY-MM-DD, in a given zone.
 *
 * Daily things — game rounds, watering — are keyed on *your* date. For a few
 * hours a day the two of you are on different dates, seven timezones apart;
 * that is not a bug to design out. Picking one timezone as the "real" one
 * would quietly make the garden belong to that person.
 */
export function localDateKey(timeZone: string, at = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    return new Date(at).toISOString().slice(0, 10)
  }
}
