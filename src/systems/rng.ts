/**
 * Seeded randomness.
 *
 * Everything scattered through the garden — every blade, flower and tree — is
 * placed with one of these rather than Math.random. It matters more than it
 * sounds: a world that reshuffles itself on every reload is a render, not a
 * place. The tree you noticed yesterday has to still be there.
 */

export type Rng = () => number

/** mulberry32 — small, fast, and good enough for scattering things. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable seed from a string, so each place can scatter independently. */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min)

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, (rng() * items.length) | 0)]
}
