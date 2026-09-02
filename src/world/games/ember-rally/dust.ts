/**
 * What the Harmattan is doing, this frame.
 *
 * -----------------------------------------------------------------------------
 * The same shape as `weather.ts`, `depth.ts` and `tunnel.ts`: one plain object,
 * written once a frame by `Race`, read by anything that needs to know where the
 * car is in the weather without being handed the car.
 *
 * A module-level object rather than a store, and deliberately — this is read
 * inside a render loop sixty times a second, and a subscription that re-renders
 * React on every change of a number that changes every frame is the one shape
 * this could take that would cost anything.
 *
 * **`rumble` is the interesting one.** Everything else here is a fact about
 * *where you are*; that is a fact about what the tyres are doing, and it comes
 * straight off `CarState.rumble` — which is why the corrugation goes quiet when
 * you brake for a corner without anybody writing a rule that it should.
 * -----------------------------------------------------------------------------
 */

export const dust = {
  /** Metres per second. */
  speed: 0,
  /** Metres along the authored road. */
  s: 0,
  /** 0..1 — how exposed this piece of road is. `Band.gale`. */
  exposed: 0,
  /** 0..1 — how deep the sand under the car is. `Band.sand`. */
  sand: 0,
  /** 0..1 — how hard the corrugation is shaking the car. `CarState.rumble`. */
  rumble: 0,
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

/** A soft window: 1 inside `from`..`to`, easing to 0 either side over `fade`. */
export function district(s: number, from: number, to: number, fade = 36): number {
  const rise = clamp((s - (from - fade)) / Math.max(0.0001, fade * 2))
  const fall = clamp((s - (to - fade)) / Math.max(0.0001, fade * 2))
  const ease = (t: number) => t * t * (3 - 2 * t)
  return ease(rise) * (1 - ease(fall))
}
