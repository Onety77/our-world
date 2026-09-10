import { Vector3 } from 'three'
import { basisAt, roadPoint } from './geometry'
import { HARMATTAN, emptyRoad, roadAt, vergeWidth, type RoadAt, type Track } from './track'

export const HARMATTAN_RING = 2
export const HARMATTAN_PROFILE = 13

/** The drawn cross-section, shared by the scenery and visual wheel support. */
export function harmattanProfile(road: RoadAt, s: number) {
  const town = s > HARMATTAN.gateAt - 20 && s < HARMATTAN.gateOut + 12
  const out = road.width + vergeWidth(road.room) + (town ? 10 : 6 + road.room * 22)
  return {
    offsets: [-out, -out, -road.width, -road.width * .92, -road.width * .62,
      -road.width * .31, 0, road.width * .31, road.width * .62,
      road.width * .92, road.width, out, out],
    heights: [town ? -.3 : -1.1, town ? .02 : .34,
      .02, .05, .075, .092, .1, .092, .075, .05, .02,
      town ? .02 : .34, town ? -.3 : -1.1],
  }
}

export interface SurfaceTriangle {
  ax: number; az: number; bx: number; bz: number; cx: number; cz: number
  minX: number; maxX: number; minZ: number; maxZ: number
  /** y = dx*x + dz*z + intercept, using the actual Float32 mesh vertices. */
  dx: number; dz: number; intercept: number; inverse: number
}

const cache = new WeakMap<Track, SurfaceTriangle[][]>()

function trianglesFor(track: Track) {
  const cached = cache.get(track)
  if (cached) return cached
  const rings = Math.floor(track.length / HARMATTAN_RING) + 1
  const vertices = new Float32Array(rings * HARMATTAN_PROFILE * 3)
  const road = emptyRoad()
  const point = new Vector3()
  for (let ring = 0; ring < rings; ring++) {
    const s = ring * HARMATTAN_RING
    roadAt(track, s, road)
    const basis = basisAt(road)
    const { offsets, heights } = harmattanProfile(road, s)
    for (let k = 0; k < HARMATTAN_PROFILE; k++) {
      roadPoint(road, offsets[k], heights[k], point, basis)
      point.toArray(vertices, (ring * HARMATTAN_PROFILE + k) * 3)
    }
  }
  const result: SurfaceTriangle[][] = []
  for (let ring = 0; ring < rings - 1; ring++) {
    const strip: SurfaceTriangle[] = []
    const add = (a: number, b: number, c: number) => {
      const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2]
      const bx = vertices[b * 3], by = vertices[b * 3 + 1], bz = vertices[b * 3 + 2]
      const cx = vertices[c * 3], cy = vertices[c * 3 + 1], cz = vertices[c * 3 + 2]
      const det = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
      if (Math.abs(det) < 1e-10) return
      const dx = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / det
      const dz = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / det
      strip.push({ ax, az, bx, bz, cx, cz, dx, dz, intercept: ay - dx * ax - dz * az,
        inverse: 1 / det, minX: Math.min(ax, bx, cx), maxX: Math.max(ax, bx, cx),
        minZ: Math.min(az, bz, cz), maxZ: Math.max(az, bz, cz) })
    }
    // Exactly CourseMesh.quad(a,b,c,d)'s diagonal. Omit the vertical outer skirts.
    for (let k = 1; k < HARMATTAN_PROFILE - 2; k++) {
      const a = ring * HARMATTAN_PROFILE + k
      const d = a + HARMATTAN_PROFILE
      add(a, a + 1, d + 1)
      add(a, d + 1, d)
    }
    result.push(strip)
  }
  cache.set(track, result)
  return result
}

/** Local strip lookup avoids raycasting scenery or searching the whole course. */
export function nearbyHarmattanSurface(track: Track, s: number, out: SurfaceTriangle[]) {
  const strips = trianglesFor(track)
  out.length = 0
  const ring = Math.floor(s / HARMATTAN_RING)
  for (let i = Math.max(0, ring - 6); i <= Math.min(strips.length - 1, ring + 6); i++) {
    for (const triangle of strips[i]) out.push(triangle)
  }
}

export function surfaceAt(triangles: readonly SurfaceTriangle[], x: number, z: number): SurfaceTriangle | undefined {
  let top: SurfaceTriangle | undefined
  let height = -Infinity
  for (const t of triangles) {
    if (x < t.minX - 1e-6 || x > t.maxX + 1e-6 || z < t.minZ - 1e-6 || z > t.maxZ + 1e-6) continue
    const u = ((x - t.ax) * (t.cz - t.az) - (z - t.az) * (t.cx - t.ax)) * t.inverse
    const v = ((t.bx - t.ax) * (z - t.az) - (t.bz - t.az) * (x - t.ax)) * t.inverse
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
      const y = surfaceHeight(t, x, z)
      if (y > height) { top = t; height = y }
    }
  }
  return top
}

export function surfaceHeight(t: SurfaceTriangle, x: number, z: number) {
  return t.dx * x + t.dz * z + t.intercept
}
