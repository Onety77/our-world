/**
 * How dark the Lantern Walk is, and how brightly its lamps burn.
 *
 * ---------------------------------------------------------------------------
 * **Two numbers, because "dark enough" is not something anybody can settle from
 * a screenshot.**
 *
 * The walk is the only place in the garden whose whole point is contrast: the
 * lanterns are the light, and how well that reads depends on the room you are
 * sitting in, the phone in your hand, and how bright either of you likes it.
 * Every value picked from here so far has been picked by looking at a headless
 * render on a machine in another country, which is exactly the wrong place to
 * decide it from.
 *
 * So it moves to a pair of sliders in the control room and stops being a
 * constant somebody has to come back and edit.
 *
 * **This device only, and deliberately.** The rally car and the sound of the
 * places are shared because they are facts about the world the two of you agree
 * on. How dark your screen wants to be is a fact about your screen. Storing it
 * per device means neither of you can make the other's walk too dark to see,
 * and it needs no rules, no save button and no round trip.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

const KEY = 'garden:lanterns:v1'

export interface LanternLight {
  /**
   * How much of the world's daylight the canopy keeps out, 0..1.
   *
   * At 0 the lane is lit exactly like the meadow outside it and the lanterns
   * are decoration; at 1 almost nothing gets through and they are the only
   * light there is. The default sits near the dark end because that is what the
   * place is for.
   */
  dark: number
  /** How brightly the lamps burn, as a multiplier. 1 is the authored level. */
  lamps: number
  set(patch: Partial<Pick<LanternLight, 'dark' | 'lamps'>>): void
  reset(): void
}

export const DEFAULTS = { dark: 0.82, lamps: 1 }

function load(): { dark: number; lamps: number } {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
    const held = raw as Record<string, unknown>
    const num = (v: unknown, fallback: number, low: number, high: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback
    return {
      dark: num(held.dark, DEFAULTS.dark, 0, 1),
      lamps: num(held.lamps, DEFAULTS.lamps, 0.2, 2.5),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function keep(state: { dark: number; lamps: number }) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify({ dark: state.dark, lamps: state.lamps }))
  } catch {
    /* storage full or blocked; the walk still works, it just forgets */
  }
}

export const useLanternLight = create<LanternLight>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch)
    const { dark, lamps } = get()
    keep({ dark, lamps })
  },
  reset() {
    set({ ...DEFAULTS })
    keep({ ...DEFAULTS })
  },
}))
