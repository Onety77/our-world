/**
 * The shape of the ground. One function, used by everything that has to sit on
 * it — the mesh, every blade of grass, the flowers, and every place's layout.
 *
 * Layered sines rather than real noise: cheap, seamless, and organic enough
 * that nothing reads as a grid. If this is ever replaced with sampled noise,
 * replace it here and nothing else changes.
 *
 * **There is no edge any more.** The old world was a plateau with a lip you
 * could stand at, because you could walk and something had to stop you. With
 * the walking gone, the places sit hundreds of metres apart along one axis and
 * an edge at a hundred and ninety-six put every one of them off the end of the
 * world — black ground, no grass, nothing rendering. It rolls on forever now,
 * which costs nothing: you only ever see the hundred and fifty metres the fog
 * lets you.
 */

/**
 * The river's valley.
 *
 * World data, not the river section's, because the ground's shape belongs to
 * the terrain and everything that stands on it has to agree. A trench running
 * along Z at the river's X, with banks that rise out of the meadow — so the
 * water has somewhere to be and the grass climbs away from it on both sides.
 *
 */
export const VALLEY = {
  /** Centre of the channel in X. Every place sits at the origin. */
  x: 0,
  /** Half-width of the flat bed. */
  bed: 13,
  /**
   * How far out the banks take to climb back to meadow level.
   *
   * Tight on purpose. The first cut spread twenty-six metres of bank over
   * three of drop — a seven-degree slope, which from eye level is simply not
   * visible. A valley has to be steep enough to *be* a valley.
   */
  banks: 30,
  /** How deep the bed sits below the surrounding ground. */
  depth: 5,
}

export function groundHeight(x: number, z: number): number {
  let h =
    Math.sin(x * 0.055) * Math.cos(z * 0.047) * 1.05 +
    Math.sin(x * 0.131 + 1.3) * 0.34 +
    Math.cos(z * 0.108 - 0.7) * 0.38 +
    Math.sin((x + z) * 0.021 + 2.1) * 0.75

  /*
    The river valley.

    The bed is *blended toward* a flat level rather than having the depth
    subtracted from it. Subtracting kept the meadow's rolling sines down in the
    channel, which swung the bed through two and a half metres and swallowed
    the water — a river needs a floor, not a rumpled one.
  */
  const across = Math.abs(x - VALLEY.x)
  if (across < VALLEY.banks) {
    const t = Math.max(0, Math.min(1, (across - VALLEY.bed) / (VALLEY.banks - VALLEY.bed)))
    const shape = 1 - t * t * (3 - 2 * t)
    // a touch of ripple left in the bed so it isn't a machined trough
    const floor = -VALLEY.depth + Math.sin(z * 0.09) * 0.18 + Math.sin(z * 0.31) * 0.07
    h = h * (1 - shape) + floor * shape
  }

  return h
}

/** Surface normal, by finite difference. Used to lay flowers flat on slopes. */
export function groundNormal(x: number, z: number, eps = 0.6): [number, number, number] {
  const hL = groundHeight(x - eps, z)
  const hR = groundHeight(x + eps, z)
  const hD = groundHeight(x, z - eps)
  const hU = groundHeight(x, z + eps)
  const nx = hL - hR
  const nz = hD - hU
  const ny = 2 * eps
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

/**
 * Where a ray meets the ground, by marching and then bisecting.
 *
 * The ground is displaced on the GPU, so there is no mesh to raycast against
 * that matches what you can see. Marching the analytic height is the only way
 * to land a tap where the eye says it should.
 */
export function raycastTerrain(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDistance = 260,
): [number, number] | null {
  const step = 0.75
  let last = 0
  let lastGap = origin.y - groundHeight(origin.x, origin.z)

  for (let t = step; t < maxDistance; t += step) {
    const x = origin.x + direction.x * t
    const y = origin.y + direction.y * t
    const z = origin.z + direction.z * t
    const gap = y - groundHeight(x, z)

    if (gap <= 0 && lastGap > 0) {
      // bisect the bracket for a clean landing point
      let lo = last
      let hi = t
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2
        const mx = origin.x + direction.x * mid
        const my = origin.y + direction.y * mid
        const mz = origin.z + direction.z * mid
        if (my - groundHeight(mx, mz) > 0) lo = mid
        else hi = mid
      }
      const hit = (lo + hi) / 2
      return [origin.x + direction.x * hit, origin.z + direction.z * hit]
    }
    last = t
    lastGap = gap
  }
  return null
}

/** Ray against a sphere. Returns the near distance, or null. */
export function raySphere(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  centre: { x: number; y: number; z: number },
  radius: number,
): number | null {
  const ox = origin.x - centre.x
  const oy = origin.y - centre.y
  const oz = origin.z - centre.z
  const b = ox * direction.x + oy * direction.y + oz * direction.z
  const c = ox * ox + oy * oy + oz * oz - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const root = Math.sqrt(disc)
  const near = -b - root
  const far = -b + root
  if (far < 0) return null
  return near >= 0 ? near : far
}

/**
 * How wide the meadow of real 3D blades is, for a given blade count.
 *
 * Spreading a fixed budget over a bigger disc thins it until you can see the
 * ground between blades; this keeps the density constant and lets the radius
 * follow the budget instead.
 */
export function meadowRadiusFor(bladeCount: number): number {
  return Math.max(17, Math.min(30, Math.sqrt(bladeCount / (Math.PI * 26))))
}
