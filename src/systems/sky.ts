/**
 * Her weather, fetched and turned into four numbers.
 *
 * =============================================================================
 * **You stand in her weather, not yours** — the same decision `whoseHour` made
 * about the clock, and for the same reason. You can see your own sky out of the
 * window; the one worth showing you is the one she is under. So this rides the
 * switch that already exists rather than adding a setting: whichever person the
 * hour is running on, the weather comes from their coordinates.
 *
 * **Open-Meteo, and that choice is load-bearing.** It needs no API key, so
 * there is no secret to keep, no proxy in `functions/` to route through, and
 * nothing to leak from a browser. A weather feature that needs a server is
 * three times the work and one more thing to go down.
 *
 * **Four numbers, and no more.** Cloud, rain, fog and wind. Not a forecast, not
 * a temperature, not an icon — this world has exactly one place weather can
 * express itself, which is the palette, and the palette is a small set of
 * colours and distances. Anything this file returned beyond what the sky can
 * actually *show* would be a number nobody reads.
 *
 * The fetch is deliberately not clever: one call, cached for a quarter of an
 * hour, and a failure means the garden looks exactly as it did before any of
 * this existed. Weather is decoration on a place two people meet in; it is
 * never allowed to be the reason the place will not open.
 * =============================================================================
 */

/** What the sky is doing, as far as this garden cares. */
export interface Sky {
  /** 0 clear to 1 solid overcast. */
  cloud: number
  /** 0 dry to 1 heavy. Millimetres, curved — see `rainOf`. */
  rain: number
  /** 0 clear air to 1 cannot see the trees. Fog, mist and dust all land here. */
  haze: number
  /** 0 still to 1 hard. */
  wind: number
  /** True once a real answer has arrived. Until then everything above is 0. */
  known: boolean
}

/** A garden that has not heard anything yet, and looks exactly as it always did. */
export function clearSky(): Sky {
  return { cloud: 0, rain: 0, haze: 0, wind: 0, known: false }
}

const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v))

/**
 * Rain, as a feeling rather than as millimetres.
 *
 * The number that arrives is precipitation in mm for the hour, and it is
 * useless raw: nine tenths of all rain that falls anywhere is under two
 * millimetres an hour, so a linear mapping would leave the garden looking dry
 * on almost every day it is actually raining. A curve puts the interesting part
 * of the range where the weather actually lives — drizzle is already visibly
 * wet, and four millimetres is as bad as this world needs to draw.
 */
export function rainOf(mm: number): number {
  if (!Number.isFinite(mm) || mm <= 0) return 0
  return clamp(Math.sqrt(mm / 4))
}

/**
 * Haze, from visibility in metres.
 *
 * Inverted and curved for the same reason as the rain: everything from ten
 * kilometres upward is simply "clear" and the whole interesting range is below
 * two. This is also where **harmattan** lands — the dust that fills the sky in
 * Kano between December and February reports as low visibility rather than as
 * any kind of precipitation, so a hazy day in Kano and a foggy morning in
 * Shanghai arrive here as the same number, which is correct: they look the
 * same from inside a garden.
 */
export function hazeOf(metres: number): number {
  if (!Number.isFinite(metres) || metres <= 0) return 0
  if (metres >= 20_000) return 0
  return clamp(1 - Math.sqrt(metres / 20_000))
}

/** Wind, from km/h. Forty is a gale as far as grass is concerned. */
export function windOf(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh <= 0) return 0
  return clamp(kmh / 40)
}

/**
 * What Open-Meteo said, as a `Sky`.
 *
 * Split out from the fetching so it can be checked without a network — every
 * shape of bad answer is a case here, and none of them may throw. A garden that
 * fails to open because a weather service returned a string is a worse garden
 * than one with no weather in it.
 */
export function readSky(payload: unknown): Sky {
  const body = payload as { current?: Record<string, unknown> } | null
  const now = body?.current
  if (!now || typeof now !== 'object') return clearSky()

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    cloud: clamp(num(now.cloud_cover) / 100),
    rain: rainOf(num(now.precipitation)),
    haze: hazeOf(typeof now.visibility === 'number' ? now.visibility : 20_000),
    wind: windOf(num(now.wind_speed_10m)),
    known: true,
  }
}

/** Fifteen minutes. Weather does not change faster than that, and nor should this. */
export const FRESH_FOR = 15 * 60_000

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

/** The one query, built in one place so the field list and `readSky` agree. */
export function skyUrl(lat: number, lon: number): string {
  const wanted = ['cloud_cover', 'precipitation', 'visibility', 'wind_speed_10m']
  return `${ENDPOINT}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&current=${wanted.join(',')}`
}

const held = new Map<string, { at: number; sky: Sky }>()

/**
 * Her sky, cached.
 *
 * Never rejects. A refused fetch, a timeout, a service having a bad afternoon
 * — all of them return the last good answer if there is one and a clear sky if
 * there is not, because the alternative is a garden that will not open.
 */
export async function fetchSky(lat: number, lon: number, now = Date.now()): Promise<Sky> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = held.get(key)
  if (cached && now - cached.at < FRESH_FOR) return cached.sky

  try {
    const answer = await fetch(skyUrl(lat, lon))
    if (!answer.ok) throw new Error(String(answer.status))
    const sky = readSky(await answer.json())
    held.set(key, { at: now, sky })
    return sky
  } catch {
    // The last thing we knew is better than nothing, and nothing is still fine.
    return cached?.sky ?? clearSky()
  }
}
