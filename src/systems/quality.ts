/**
 * How hard to push the device.
 *
 * Mobile is the priority surface, so this starts conservative and only steps
 * *down*. It never steps back up: a garden that oscillates between two densities
 * while you watch is worse than one that settled on the lower.
 */

import { create } from 'zustand'

export type Tier = 'low' | 'medium' | 'high'

/*
  `dpr` is the meadow's. `road` is the same tier on the road.

  They are different numbers because they are different scenes, and the garden
  is by far the more expensive one: sixty-five thousand blades of grass, each
  one moving, over a sky that is itself a shader. The tunnel is a few hundred
  metres of extruded rock and two cars — a fraction of the geometry and none of
  the instancing — and it was being drawn at the resolution chosen to stop a
  phone melting in a field of grass.

  On a phone that is the difference between a car with an edge and a car made
  of steps. The garden's number stays exactly where it was, because that one
  was chosen against real overheating and nothing about it has changed.
*/
const TIERS: Record<Tier, { grass: number; flowers: number; dpr: number; road: number }> = {
  low: { grass: 24_000, flowers: 600, dpr: 1, road: 1.5 },
  medium: { grass: 38_000, flowers: 1_000, dpr: 1.35, road: 2 },
  high: { grass: 65_000, flowers: 1_700, dpr: 1.5, road: 2 },
}

/**
 * `?tier=low` forces a tier. Put in for testing on a real phone without having
 * to convince the heuristic below — open the network URL on the device with the
 * tier pinned and you can feel the difference directly.
 */
function forcedTier(): Tier | null {
  if (typeof location === 'undefined') return null
  const asked = new URLSearchParams(location.search).get('tier')
  return asked === 'low' || asked === 'medium' || asked === 'high' ? asked : null
}

function initialTier(): Tier {
  const forced = forcedTier()
  if (forced) return forced
  if (typeof window === 'undefined') return 'medium'

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency ?? 4
  const smallSide = Math.min(window.screen?.width ?? 1280, window.screen?.height ?? 800)

  if (coarse && (cores <= 4 || smallSide <= 380)) return 'low'
  if (coarse) return 'medium'
  return cores >= 8 ? 'high' : 'medium'
}

interface QualityState {
  tier: Tier
  grassCount: number
  flowerCount: number
  dpr: number
  /** Full-screen procedural sky: capped separately on touch screens. */
  starsDpr: number
  /** What to draw at while a game owns the whole frame. See `TIERS`. */
  roadDpr: number
  /** True once we've stepped down, so the control room can say so. */
  degraded: boolean
  degrade(): void
  /**
   * Pin a tier by hand, from `/dev7731`.
   *
   * Clears `degraded`, because choosing one deliberately is not the watchdog
   * having stepped down and the two should not be confused when reading the
   * page back. `?tier=` still wins at startup, so screenshot scripts are
   * unaffected by whatever was last set here.
   */
  setTier(tier: Tier): void
}

function shape(tier: Tier, degraded: boolean): Omit<QualityState, 'degrade' | 'setTier'> {
  const t = TIERS[tier]
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return {
    tier,
    grassCount: t.grass,
    flowerCount: t.flowers,
    dpr: t.dpr,
    // The Stars shades every pixel with procedural noise. On a phone, 1.35 DPR
    // means 82% more fragment work than 1 with no extra scene information.
    // Desktop keeps the established value; touch screens keep a small amount
    // of supersampling without paying the meadow's grass-oriented budget.
    starsDpr: coarse ? Math.min(t.dpr, 1.1) : t.dpr,
    /*
      Never past the pixels the screen has, and never below the meadow's.

      The first half is the obvious one: asking for 2 on a display that is 1
      draws four times the pixels to show the same thing. The second half is
      the correction to it — the meadow already draws at 1.35 on a plain
      laptop, which is deliberate supersampling against `antialias: false`, so
      clamping the road to the device ratio made the road *softer than the
      garden it replaced*. It measured it: the canvas went from 1215 wide back
      to 900 the moment the race began.
    */
    roadDpr: Math.max(
      t.dpr,
      Math.min(t.road, typeof window === 'undefined' ? t.road : window.devicePixelRatio || 1),
    ),
    degraded,
  }
}

export const useQuality = create<QualityState>((set, get) => ({
  ...shape(initialTier(), false),
  degrade: () => {
    const next: Tier = get().tier === 'high' ? 'medium' : 'low'
    if (next === get().tier) return
    set(shape(next, true))
  },
  setTier: (tier) => set(shape(tier, false)),
}))

/**
 * Watches frame times and steps the tier down once if the device is clearly
 * struggling. Deliberately slow to trigger — a couple of janky seconds while
 * shaders compile is not a reason to permanently thin the meadow.
 */
export function createFrameWatchdog() {
  let slowFrames = 0
  let elapsed = 0
  let coolingDown = 0

  return function tick(delta: number, enabled = true) {
    if (!enabled) {
      elapsed = 0
      slowFrames = 0
      return
    }
    coolingDown = Math.max(0, coolingDown - delta)
    if (coolingDown > 0) return
    elapsed += delta
    if (delta > 1 / 34) slowFrames++
    if (elapsed < 4) return

    // more than half the last four seconds spent under ~34fps
    if (slowFrames > 4 / (1 / 30) / 2) {
      useQuality.getState().degrade()
      // Let the new geometry/DPR settle before judging it. A high-tier device
      // may need high -> medium -> low; the old one-shot watchdog could only
      // make the first of those decisions.
      coolingDown = 8
    }
    elapsed = 0
    slowFrames = 0
  }
}
