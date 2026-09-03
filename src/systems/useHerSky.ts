/**
 * Her weather, kept fresh, and never in the way.
 *
 * -----------------------------------------------------------------------------
 * The whole hook is one rule: **the garden opens whether or not this works.**
 * There is no loading state, no error state, no retry storm and no spinner. It
 * starts with a clear sky, which is exactly how the world looked before any of
 * this existed, and if an answer arrives the weather fades in underneath.
 *
 * Eased rather than switched, and that matters more than it sounds. Weather
 * arrives about eight seconds after the world does — a step change at that
 * moment reads as a bug, or worse as a flash, in the one place in this garden
 * that is meant to be still. Over a few seconds it reads as the light settling.
 * -----------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import type { Profile, UserId } from '@/data/types'
import { skyWhere, type Whose } from './whoseHour'
import { FRESH_FOR, clearSky, fetchSky, type Sky } from './sky'

/**
 * `?sky=cloud,rain,haze,wind` — weather on demand, for looking at it.
 *
 * The same kind of hook as `?hour=` and `?rally=ride`: the garden has weather
 * now and most days it is simply "a bit cloudy in Shanghai", which is no way to
 * find out what a downpour looks like. Four numbers between nought and one,
 * missing ones treated as nought.
 *
 *   ?sky=1,0,0,0    solid overcast
 *   ?sky=0.9,1,0,1  the worst night of the year
 *   ?sky=0,0,0.8,0  harmattan
 *
 * When it is present no fetch happens at all, so this is also how to see the
 * garden with the network unplugged.
 */
const FORCED: Sky | null = (() => {
  if (typeof location === 'undefined') return null
  const asked = new URLSearchParams(location.search).get('sky')
  if (asked === null) return null
  const parts = asked.split(',').map((n) => {
    const v = Number(n)
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  })
  return {
    cloud: parts[0] ?? 0,
    rain: parts[1] ?? 0,
    haze: parts[2] ?? 0,
    wind: parts[3] ?? 0,
    known: true,
  }
})()

/** How long the weather takes to arrive once it is known. */
const SETTLE_MS = 2600

export function useHerSky(
  profiles: Record<UserId, Profile>,
  me: UserId,
  whose: Whose,
): Sky {
  const where = FORCED ? null : skyWhere(profiles, me, whose)
  const lat = where?.lat ?? null
  const lon = where?.lon ?? null

  /** What the service last said — or what the URL insisted on. */
  const [target, setTarget] = useState<Sky>(() => FORCED ?? clearSky())
  /** And what the world is currently under, on its way there. */
  const [shown, setShown] = useState<Sky>(clearSky)
  const easing = useRef<number | null>(null)

  useEffect(() => {
    if (lat === null || lon === null) return
    let live = true
    const ask = () => {
      void fetchSky(lat, lon).then((sky) => {
        if (live && sky.known) setTarget(sky)
      })
    }
    ask()
    /*
      And again on the cache's own schedule. Cheap — the fetch is a no-op while
      the answer is still fresh, so this is a timer and a map lookup, not a
      request every quarter of an hour per person.
    */
    const again = window.setInterval(ask, FRESH_FOR)
    return () => {
      live = false
      window.clearInterval(again)
    }
  }, [lat, lon])

  useEffect(() => {
    if (!target.known) return
    const from = shown
    const started = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - started) / SETTLE_MS)
      // Smoothstep, so it neither starts nor stops abruptly.
      const e = t * t * (3 - 2 * t)
      setShown({
        cloud: from.cloud + (target.cloud - from.cloud) * e,
        rain: from.rain + (target.rain - from.rain) * e,
        haze: from.haze + (target.haze - from.haze) * e,
        wind: from.wind + (target.wind - from.wind) * e,
        known: true,
      })
      if (t < 1) easing.current = requestAnimationFrame(step)
    }
    easing.current = requestAnimationFrame(step)
    return () => {
      if (easing.current !== null) cancelAnimationFrame(easing.current)
    }
    // `shown` is read as a starting point and must not restart the ease.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return shown
}
