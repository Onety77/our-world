/**
 * How hard to push the device.
 *
 * Mobile is the priority surface, so this starts conservative and only steps
 * *down*. It never steps back up: a garden that oscillates between two densities
 * while you watch is worse than one that settled on the lower.
 */

import { create } from 'zustand'

export type Tier = 'low' | 'medium' | 'high'

const TIERS: Record<Tier, { grass: number; flowers: number; dpr: number }> = {
  low: { grass: 24_000, flowers: 600, dpr: 1 },
  medium: { grass: 38_000, flowers: 1_000, dpr: 1.35 },
  high: { grass: 65_000, flowers: 1_700, dpr: 1.5 },
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
  return {
    tier,
    grassCount: t.grass,
    flowerCount: t.flowers,
    dpr: t.dpr,
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
  let fired = false

  return function tick(delta: number) {
    if (fired) return
    elapsed += delta
    if (delta > 1 / 34) slowFrames++
    if (elapsed < 4) return

    // more than half the last four seconds spent under ~34fps
    if (slowFrames > 4 / (1 / 30) / 2) {
      useQuality.getState().degrade()
      fired = true
    }
    elapsed = 0
    slowFrames = 0
  }
}
