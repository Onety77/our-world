/**
 * How far apart you actually are.
 *
 * Great-circle distance from two sets of coordinates, and nothing else. In
 * particular there is no geocoding: turning "Kano" into a latitude means
 * calling somebody's API, getting it wrong for anywhere ambiguous, and needing
 * a network round trip to draw a line in a garden. The coordinates are profile
 * data you can edit, seeded with the right ones, and if they're missing the
 * distance simply isn't shown rather than being invented.
 */

export interface Coordinates {
  /** Degrees, north positive. */
  lat: number
  /** Degrees, east positive. */
  lon: number
}

const EARTH_RADIUS_KM = 6371.0088
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * Haversine. Good to a few metres over these distances, which is far more
 * precision than "you are very far apart" requires.
 */
export function greatCircleKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const latA = toRadians(a.lat)
  const latB = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "830 km" / "12,700 km". Rounded to something a person would actually say. */
export function formatDistance(km: number): string {
  const rounded =
    km < 10 ? Math.round(km * 10) / 10 : km < 1000 ? Math.round(km) : Math.round(km / 10) * 10
  return `${rounded.toLocaleString()} km`
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<Coordinates>
  return (
    typeof c.lat === 'number' &&
    typeof c.lon === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180
  )
}

/** Parses "12.0022, 8.5920". Returns null rather than a plausible guess. */
export function parseCoordinates(input: string): Coordinates | null {
  const parts = input.split(/[,\s]+/).filter(Boolean)
  if (parts.length !== 2) return null
  const lat = Number(parts[0])
  const lon = Number(parts[1])
  const candidate = { lat, lon }
  return isValidCoordinates(candidate) ? candidate : null
}
