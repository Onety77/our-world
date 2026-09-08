/**
 * Colour mixing, without three.
 *
 * ---------------------------------------------------------------------------
 * **This file exists to keep 373 KB out of the first screen.**
 *
 * `systems/palette` blends the sky, and it did that with three's `Color` — one
 * import, for a hex parse, a lerp and a hex back out. But the palette is read
 * by the very first thing the app renders, so that import put `three.core` into
 * the entry's static graph: three hundred and seventy-three kilobytes of
 * renderer, parsed before anybody could type a password, to interpolate some
 * colours.
 *
 * The rest of the world is welcome to three — it is drawing with it. The door
 * is not.
 *
 * **It is not an approximation.** Every operation here is what three does, in
 * the same order and the same space, and `npm run colour` proves it: the two
 * are compared across the whole hue circle and every keyframe the garden uses,
 * and the check fails on a single digit of difference. That check exists
 * because "close enough" on a colour pipeline is how every colour in a world
 * shifts by a shade nobody can quite name.
 * ---------------------------------------------------------------------------
 *
 * **Why linear, and why it matters here.** three's ColorManagement is on by
 * default: a hex string is sRGB, the working space is linear, and blending in
 * linear is why dusk crossfades cleanly instead of going muddy through the
 * middle. Mixing in sRGB directly — which is what "just lerp the hex" means —
 * darkens every transition in the garden.
 */

/** sRGB channel to linear. three's `SRGBToLinear`, exactly. */
function toLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
}

/** Linear channel back to sRGB. three's `LinearToSRGB`, exactly. */
function toSRGB(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/**
 * One colour, held in the linear working space.
 *
 * Mutable and reused, like the two scratch colours the palette already kept:
 * `paletteAt` runs on every frame that changes the hour, and allocating three
 * objects per call to blend a sky is work for the collector and nothing else.
 */
export class Tone {
  r = 0
  g = 0
  b = 0

  /** From an sRGB hex string — `#rrggbb`, with or without the hash. */
  set(hex: string): this {
    const n = Number.parseInt(hex.replace('#', ''), 16)
    this.r = toLinear(((n >> 16) & 255) / 255)
    this.g = toLinear(((n >> 8) & 255) / 255)
    this.b = toLinear((n & 255) / 255)
    return this
  }

  /** Straight into the working space, with no conversion — three's `setRGB`. */
  setRGB(r: number, g: number, b: number): this {
    this.r = r
    this.g = g
    this.b = b
    return this
  }

  /**
   * Toward another colour.
   *
   * Deliberately *not* clamped here, because three's is not: the palette clamps
   * at its own call sites, and it has a note explaining why it has to. Making
   * this one safe would hide that, and the next person to add a mix would not
   * find out that weather readings can sum past one.
   */
  lerp(to: Tone, t: number): this {
    this.r += (to.r - this.r) * t
    this.g += (to.g - this.g) * t
    this.b += (to.b - this.b) * t
    return this
  }

  multiplyScalar(by: number): this {
    this.r *= by
    this.g *= by
    this.b *= by
    return this
  }

  /** Back out to an sRGB hex, six digits, no hash — three's `getHexString`. */
  getHexString(): string {
    const one = (c: number) => clamp(Math.round(toSRGB(c) * 255), 0, 255)
    return ((one(this.r) << 16) | (one(this.g) << 8) | one(this.b))
      .toString(16)
      .padStart(6, '0')
  }
}
