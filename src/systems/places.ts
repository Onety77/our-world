/**
 * A city name, turned into a place on the earth.
 *
 * =============================================================================
 * **Coordinates are a bad thing to ask a person for.** The garden needed them
 * for two things — the distance between the two of you, and now her weather —
 * and asked for them the only way it could: a text field wanting
 * `12.0022, 8.592`, which means going and looking them up, and where a typo of
 * one degree is a hundred and eleven kilometres and no error message.
 *
 * Meanwhile there was already a field, right beside it, where somebody had
 * typed **Kano**. It was a label — the word in the corner next to the clock —
 * and it knew everything needed to find the rest.
 *
 * Same service as the weather, and the same reason: **no API key.** Nothing to
 * keep secret, no proxy to route through, and one fewer thing that can be down.
 *
 * It comes back with the timezone as well, which is the small bonus that makes
 * this worth doing rather than merely tidy: typing a city now sets the clock,
 * the distance and the weather in one go, and none of the three can disagree
 * with the other two.
 * =============================================================================
 */

/** Somewhere on the earth, found by name. */
export interface Place {
  lat: number
  lon: number
  /** What was actually found — "Kano, Nigeria" — so a wrong match is visible. */
  label: string
  /** The IANA zone there, which is very often the thing you meant anyway. */
  timeZone: string
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

/** The one query, in one place, so the fields asked for and read stay in step. */
export function placeUrl(name: string): string {
  return `${ENDPOINT}?name=${encodeURIComponent(name.trim())}&count=1&language=en&format=json`
}

/**
 * What the service said, as a `Place`.
 *
 * Split from the fetching so every shape of unhelpful answer is a case that can
 * be checked without a network — and none of them may throw. A dev panel that
 * breaks because a geocoder returned something odd is worse than one that
 * quietly says it could not find the place.
 */
export function readPlace(payload: unknown): Place | null {
  const body = payload as { results?: unknown } | null
  const results = body?.results
  if (!Array.isArray(results) || results.length === 0) return null
  const first = results[0] as Record<string, unknown>

  const lat = first.latitude
  const lon = first.longitude
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  const name = typeof first.name === 'string' ? first.name : ''
  const country = typeof first.country === 'string' ? first.country : ''
  /*
    The country is in the label because the first answer is not always the one
    you meant — "Kano" is a city of five million in Nigeria and also a hamlet
    in Osaka. Showing what was actually found is what lets somebody notice, and
    typing "Kano, Nigeria" is how they fix it.
  */
  const label = [name, country].filter(Boolean).join(', ') || name || 'somewhere'

  return {
    lat,
    lon,
    label,
    timeZone: typeof first.timezone === 'string' ? first.timezone : '',
  }
}

/**
 * Find a place by name. Never rejects; null means "could not find it".
 *
 * No cache, deliberately: this runs when somebody types a city into the dev
 * panel, which happens roughly twice in the life of a garden.
 */
export async function findPlace(name: string): Promise<Place | null> {
  if (name.trim().length < 2) return null
  try {
    const answer = await fetch(placeUrl(name))
    if (!answer.ok) return null
    return readPlace(await answer.json())
  } catch {
    return null
  }
}
