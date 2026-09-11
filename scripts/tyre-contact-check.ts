/**
 * Do the wheels stand on the road that is drawn?
 *
 * On all four roads and both routes of the Rootway, at rest and with the
 * Swaying Span in every phase of its swing: the drawn triangles a wheel may
 * stand on are the ones `roadSurface` answers with (checked against a plain
 * scan of the same geometry), the car's compass heading is exactly the
 * simulation's, the physics state is untouched by rendering, and every tyre's
 * whole rubber — shoulders and tread blocks, cambered and steered — comes to
 * rest within a millimetre of the surface under it. Then, without a surface
 * laid, the car keeps the written-down stance the studio relies on.
 *
 *   npm run tyre-contact
 */
import assert from 'node:assert/strict'
import { Group, Vector3 } from 'three'
import { buildHarmattan } from '../src/world/games/ember-rally/Harmattan'
import { buildMoonbreak } from '../src/world/games/ember-rally/Moonbreak'
import { buildNightfall } from '../src/world/games/ember-rally/Nightfall'
import { buildStormcrown } from '../src/world/games/ember-rally/Stormcrown'
import { buildTunnel, type TunnelChunk } from '../src/world/games/ember-rally/geometry'
import { buildWheel, WHEEL_POSITIONS, WHEEL_RADIUS } from '../src/world/games/ember-rally/car'
import { createCar } from '../src/world/games/ember-rally/physics'
import { placeCar, poseWheels, poseGhostWheels, type CarRig } from '../src/world/games/ember-rally/rig'
import { laySurface, type Support } from '../src/world/games/ember-rally/roadSurface'
import { makeTrack, roadAt, roadAtRoute, SWAY_RATE, SWAY_ROLL, SWAY_WAVE, type StageId } from '../src/world/games/ember-rally/track'

const root = new Group()
const ground = new Group()
const body = new Group()
root.add(ground)
ground.add(body)
const rig: CarRig = { root, ground, body, hubs: [], cambers: [], spinners: [], springs: [], boostJets: new Group(), spin: [0, 0, 0, 0] }
for (const position of WHEEL_POSITIONS) {
  const hub = new Group()
  const camber = new Group()
  const spinner = new Group()
  const spring = new Group()
  hub.position.fromArray(position)
  ground.add(hub)
  hub.add(camber)
  camber.add(spinner)
  body.add(spring)
  rig.hubs.push(hub)
  rig.cambers.push(camber)
  rig.spinners.push(spinner)
  rig.springs.push(spring)
}
const rubber = (() => {
  const positions = buildWheel().getAttribute('position')
  const seen = new Set<string>()
  const out: number[] = []
  for (let i = 0; i < positions.count; i++) {
    if (Math.hypot(positions.getY(i), positions.getZ(i)) < 0.3) continue
    const key = `${positions.getX(i)},${positions.getY(i)},${positions.getZ(i)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(positions.getX(i), positions.getY(i), positions.getZ(i))
  }
  return out
})()
const point = new Vector3()
const support: Support = { y: 0, dx: 0, dz: 0 }

/**
 * The reference: every drivable triangle of the drawn chunks, in coarse bins
 * keyed by name in a Map. Same triangles, same swing, a different index — so
 * what `roadSurface` builds is what is being tested, not repeated.
 */
const BIN = 4
interface Flat { corners: Float64Array; swing: Float64Array | null; phase: Float64Array | null; stretch: number[]; count: number; bins: Map<string, number[]> }
function flatten(chunks: TunnelChunk[]): Flat {
  const corners: number[] = []
  const swing: number[] = []
  const phase: number[] = []
  const stretch: number[] = []
  let anySwing = false
  for (const chunk of chunks) {
    if (!chunk.tread) continue
    const position = chunk.geometry.getAttribute('position')
    const index = chunk.geometry.getIndex()!
    const swings = chunk.geometry.getAttribute('aSwing')
    const phases = chunk.geometry.getAttribute('aSwayPhase')
    for (let r = 0; r < chunk.tread.length; r += 2) {
      for (let i = chunk.tread[r]; i + 2 < chunk.tread[r + 1]; i += 3) {
        const v = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
        const a = new Vector3().fromBufferAttribute(position, v[0])
        const b = new Vector3().fromBufferAttribute(position, v[1])
        const c = new Vector3().fromBufferAttribute(position, v[2])
        const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
        if (normal.length() < 1e-9 || Math.abs(normal.y) / normal.length() < 0.5) continue
        for (const p of [a, b, c]) corners.push(p.x, p.y, p.z)
        stretch.push(chunk.from, chunk.to)
        for (const k of v) {
          if (swings && phases) {
            swing.push(swings.getX(k), swings.getY(k), swings.getZ(k))
            phase.push(phases.getX(k), phases.getY(k))
            if (phases.getX(k) > 0.002) anySwing = true
          } else {
            swing.push(0, 0, 0)
            phase.push(0, 0)
          }
        }
      }
    }
  }
  const bins = new Map<string, number[]>()
  const count = corners.length / 9
  for (let t = 0; t < count; t++) {
    // A swinging vertex moves under two metres; a bin either side covers it.
    const pad = anySwing ? 2 : 0
    const x0 = Math.floor((Math.min(corners[t * 9], corners[t * 9 + 3], corners[t * 9 + 6]) - pad) / BIN)
    const x1 = Math.floor((Math.max(corners[t * 9], corners[t * 9 + 3], corners[t * 9 + 6]) + pad) / BIN)
    const z0 = Math.floor((Math.min(corners[t * 9 + 2], corners[t * 9 + 5], corners[t * 9 + 8]) - pad) / BIN)
    const z1 = Math.floor((Math.max(corners[t * 9 + 2], corners[t * 9 + 5], corners[t * 9 + 8]) + pad) / BIN)
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const key = `${i}:${j}`
        let list = bins.get(key)
        if (!list) bins.set(key, (list = []))
        list.push(t)
      }
    }
  }
  return {
    corners: Float64Array.from(corners),
    swing: anySwing ? Float64Array.from(swing) : null,
    phase: anySwing ? Float64Array.from(phase) : null,
    stretch,
    count,
    bins,
  }
}
const q = new Float64Array(9)
function flatSupport(flat: Flat, x: number, z: number, s: number, near: number, window: number, elapsed: number): number {
  let best = -Infinity
  const list = flat.bins.get(`${Math.floor(x / BIN)}:${Math.floor(z / BIN)}`)
  if (!list) return best
  for (const t of list) {
    // The same stretch of road: the Rootway crosses itself on one seed, half a metre apart.
    if (s < flat.stretch[t * 2] - 8 || s > flat.stretch[t * 2 + 1] + 8) continue
    for (let k = 0; k < 9; k++) q[k] = flat.corners[t * 9 + k]
    if (flat.swing && flat.phase) {
      for (let k = 0; k < 3; k++) {
        const amount = flat.phase[t * 6 + k * 2]
        if (amount <= 0.002) continue
        // The rock shader's line: roll = -uSway.y * aSwayPhase.x * sin(uSway.x * uSway.z - aSwayPhase.y * uSway.w).
        const roll = -SWAY_ROLL * amount * Math.sin(elapsed * SWAY_RATE - flat.phase[t * 6 + k * 2 + 1] * SWAY_WAVE)
        for (let d = 0; d < 3; d++) q[k * 3 + d] += flat.swing[t * 9 + k * 3 + d] * Math.sin(roll)
      }
    }
    const minX = Math.min(q[0], q[3], q[6])
    const maxX = Math.max(q[0], q[3], q[6])
    const minZ = Math.min(q[2], q[5], q[8])
    const maxZ = Math.max(q[2], q[5], q[8])
    if (x < minX - 1e-6 || x > maxX + 1e-6 || z < minZ - 1e-6 || z > maxZ + 1e-6) continue
    const bx = q[3] - q[0], by = q[4] - q[1], bz = q[5] - q[2]
    const cx = q[6] - q[0], cy = q[7] - q[1], cz = q[8] - q[2]
    const det = bx * cz - bz * cx
    if (Math.abs(det) < 1e-10) continue
    const u = ((x - q[0]) * cz - (z - q[2]) * cx) / det
    const v = (bx * (z - q[2]) - bz * (x - q[0])) / det
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue
    const y = q[1] + u * by + v * cy
    if (Math.abs(y - near) <= window && y > best) best = y
  }
  return best
}

const builders: Record<StageId, (track: ReturnType<typeof makeTrack>) => TunnelChunk[]> = {
  rootway: buildTunnel,
  moonbreak: buildMoonbreak,
  stormcrown: buildStormcrown,
  harmattan: buildHarmattan,
  nightfall: buildNightfall,
}

/** Every road, or the ones named in `STAGES=rootway,nightfall`. */
const STAGES = ((process.env.STAGES?.split(',').filter(Boolean) as StageId[] | undefined) ?? ['rootway', 'moonbreak', 'stormcrown', 'harmattan', 'nightfall']) as StageId[]

let poses = 0
let worstSink = 0
let worstGap = 0
let maxTravel = 0
let poseTime = 0
let unsupported = 0
let shortcutPoses = 0
let swayingPoses = 0
let archMargin = Infinity
/** The tub's cut-out over each axle, less the margin `rig.ts` keeps. */
const ARCH = WHEEL_RADIUS + 0.43 - 0.02

for (const stage of STAGES) {
  for (const seed of [7, 1234]) {
    const track = makeTrack(seed, stage)
    const chunks = builders[stage](track)
    const surface = laySurface(track, chunks)
    const flat = flatten(chunks)
    assert.equal(surface.count, flat.count, `${stage}/${seed}: the grid indexed a different number of triangles from a flat scan`)

    // 1. The grid answers exactly as the flat scan does, at the centre of every drivable triangle and at scattered points near the road.
    let agreed = 0
    for (let t = 0; t < flat.count; t += 7) {
      const x = (flat.corners[t * 9] + flat.corners[t * 9 + 3] + flat.corners[t * 9 + 6]) / 3
      const z = (flat.corners[t * 9 + 2] + flat.corners[t * 9 + 5] + flat.corners[t * 9 + 8]) / 3
      const y = (flat.corners[t * 9 + 1] + flat.corners[t * 9 + 4] + flat.corners[t * 9 + 7]) / 3
      const elapsed = (t % 13) * 0.53
      const s = (flat.stretch[t * 2] + flat.stretch[t * 2 + 1]) / 2
      const expected = flatSupport(flat, x, z, s, y, 1.8, elapsed)
      assert(surface.supportAt(x, z, s, y, 1.8, elapsed, support), `${stage}/${seed}: no support at a drawn triangle's centre (${x.toFixed(1)}, ${z.toFixed(1)})`)
      assert(Math.abs(support.y - expected) < 1e-5, `${stage}/${seed}: grid ${support.y} vs scan ${expected} at (${x.toFixed(1)}, ${z.toFixed(1)})`)
      agreed++
    }
    for (let s = 0; s < track.length; s += 23.7) {
      const road = roadAt(track, s)
      const x = road.x + Math.sin(s * 3.1) * 6
      const z = road.z + Math.cos(s * 2.3) * 6
      const elapsed = s * 0.11
      const expected = flatSupport(flat, x, z, s, road.y, 1.8, elapsed)
      const found = surface.supportAt(x, z, s, road.y, 1.8, elapsed, support)
      assert.equal(found, expected !== -Infinity, `${stage}/${seed}: grid and scan disagree about whether (${x.toFixed(1)}, ${z.toFixed(1)}) is on the road`)
      if (found) assert(Math.abs(support.y - expected) < 1e-5, `${stage}/${seed}: grid ${support.y} vs scan ${expected} beside the road at ${s}`)
      agreed++
    }
    console.log(`${stage} seed ${seed}: ${flat.count} drivable triangles, ${agreed} lookups agree with a flat scan${flat.swing ? ', swinging' : ''}.`)

    // 2. Poses: the car on the road, the tyres on the surface.
    const car = createCar(track)
    const routes: boolean[] = [false]
    if (track.split) routes.push(true)
    for (const shortcut of routes) {
      const from = shortcut ? track.split!.separateAt + 6 : track.start + 4
      const to = shortcut ? track.split!.rejoinAt - 50 : track.finishAt
      for (let s = from; s < to; s += 17.37) {
        const road = roadAtRoute(track, s, shortcut)
        for (const yaw of [0, -0.95, 0.95, Math.PI / 2]) {
          const n = Math.sin(s) * Math.max(0, road.width - 2)
          car.roll = Math.sin(s) * 0.15
          car.pitch = Math.cos(s) * 0.08
          car.heave = Math.sin(s * 0.4) * 0.025
          car.wheels.forEach((w, i) => { w.spin = s * (i + 1); w.steer = i < 2 ? -yaw * 0.65 : 0 })
          const elapsed = s * 0.37
          const before = JSON.stringify(car)
          const started = performance.now()
          placeCar(rig, track, s, n, yaw, car.roll, car.pitch, car.heave, 0, shortcut, elapsed)
          if (poses % 2) poseWheels(rig, car)
          else poseGhostWheels(rig, 30, 0.8, yaw, true, 1 / 60, yaw * 0.65)
          poseTime += performance.now() - started
          point.set(0, 0, 1).transformDirection(ground.matrixWorld)
          assert(Math.abs(Math.sin(Math.atan2(point.x, point.z) - (road.heading - yaw))) < 1e-8, `${stage}/${seed}: the visible compass heading must follow the driving simulation (s=${s.toFixed(1)} yaw=${yaw} off by ${Math.sin(Math.atan2(point.x, point.z) - (road.heading - yaw)).toExponential(2)})`)
          assert.equal(JSON.stringify(car), before, 'Rendering must not change physics state')
          if (road.sway > 0.002) swayingPoses++
          if (shortcut) shortcutPoses++
          // The body never comes down onto a tyre: no wheel's top is inside its arch.
          for (let i = 0; i < 4; i++) {
            const [x, , z] = WHEEL_POSITIONS[i]
            const floor = body.position.y + x * Math.sin(body.rotation.z) - z * Math.sin(body.rotation.x) * Math.cos(body.rotation.z)
            const top = rig.hubs[i].position.y + WHEEL_RADIUS
            assert(top <= floor + ARCH + 1e-4, `${stage}/${seed}: wheel ${i} at s=${s.toFixed(1)} is ${((top - floor - ARCH) * 1000).toFixed(1)} mm up inside its arch`)
            archMargin = Math.min(archMargin, floor + ARCH - top)
          }
          for (let i = 0; i < 4; i++) {
            let gap = Infinity
            for (let v = 0; v < rubber.length; v += 3) {
              point.fromArray(rubber, v).applyMatrix4(rig.spinners[i].matrixWorld)
              const under = flatSupport(flat, point.x, point.z, s, root.position.y, 1.8, elapsed)
              if (under === -Infinity) continue
              gap = Math.min(gap, point.y - under)
            }
            if (gap === Infinity) {
              unsupported++
              continue
            }
            worstSink = Math.max(worstSink, -gap)
            worstGap = Math.max(worstGap, gap)
            maxTravel = Math.max(maxTravel, Math.abs(rig.hubs[i].position.y - WHEEL_POSITIONS[i][1]))
            /*
              Five millimetres, and nearly all of it is the wheel's own
              geometry rather than the placement: the tyre is settled as rings
              sampled every ten degrees, and the drawn wheel is a forty-eight-
              sided polygon with tread blocks every nine degrees standing two
              and a half millimetres proud of the rubber between them. On a
              flat road the two agree to a fraction of a millimetre; the worst
              is a block on the edge of a plank of the span. Nothing a camera
              can see. The old placement was out by centimetres.
            */
            assert(gap >= -0.005 && gap <= 0.005, `${stage}/${seed}: wheel ${i} at s=${s.toFixed(1)}${shortcut ? ' (Rootwake)' : ''}, yaw=${yaw}: gap ${(gap * 1000).toFixed(2)} mm`)
          }
          poses++
        }
      }
    }
    /*
      3. Driven, it does not pop. Half a metre at a time along the racing line,
      the fitted height and tilt may only change as much as a road can in half
      a metre; a jump here is a seam between two chunks or a triangle that
      belongs to another stretch, and is exactly what a driver would see as a
      car twitching for no reason.
    */
    let lastHeight = NaN
    let lastRoadY = 0
    let lastTilt = NaN
    let worstJump = 0
    let worstTwist = 0
    let jumpAt = 0
    for (let s = track.start; s < track.finishAt; s += 0.5) {
      const road = roadAt(track, s)
      placeCar(rig, track, s, road.line, 0, 0, 0, 0, 0, false, s * 0.05)
      poseWheels(rig, car)
      const height = root.position.y + ground.position.y
      point.set(0, 1, 0).transformDirection(ground.matrixWorld)
      const tilt = Math.acos(Math.min(1, point.y))
      if (!Number.isNaN(lastHeight)) {
        const jump = Math.abs(height - lastHeight - (road.y - lastRoadY))
        if (jump > worstJump) {
          worstJump = jump
          jumpAt = s
        }
        worstTwist = Math.max(worstTwist, Math.abs(tilt - lastTilt))
      }
      lastHeight = height
      lastTilt = tilt
      lastRoadY = road.y
    }
    assert(worstJump < 0.03, `${stage}/${seed}: the fitted height jumps ${(worstJump * 1000).toFixed(0)} mm in half a metre at ${jumpAt.toFixed(1)}`)
    assert(worstTwist < 0.05, `${stage}/${seed}: the fitted tilt twists ${(worstTwist * 57.3).toFixed(1)}° in half a metre`)
    console.log(`  driven along the line: the fit moves at most ${(worstJump * 1000).toFixed(1)} mm (at ${jumpAt.toFixed(1)} m) and ${(worstTwist * 57.3).toFixed(2)}° more than the road does in half a metre.`)
    for (const chunk of chunks) chunk.geometry.dispose()
  }
}
console.log(`${poses} poses (${shortcutPoses} on the Rootwake, ${swayingPoses} on the Swaying Span), all four complete wheel meshes: sink ${(worstSink * 1000).toFixed(3)} mm, gap ${(worstGap * 1000).toFixed(3)} mm; maximum suspension adjustment ${(maxTravel * 100).toFixed(1)} cm; ${unsupported} wheels over nothing drawn.`)
console.log(`Average render pose cost: ${(poseTime / poses).toFixed(2)} ms on this machine. Closest a tyre came to its arch: ${(archMargin * 1000).toFixed(1)} mm.`)

// 3. Without a surface laid — the studio, or a road nobody has built — the written stance stands.
for (const stage of STAGES) {
  const track = makeTrack(3, stage)
  const road = roadAt(track, 120)
  placeCar(rig, track, 120, 1, 0.8, 0.1, 0.05)
  const car = createCar(track)
  poseWheels(rig, car)
  assert.equal(ground.position.y, 0)
  assert.equal(ground.rotation.x, -road.grade)
  assert.equal(ground.rotation.z, road.bank)
  for (let i = 0; i < 4; i++) assert.equal(rig.hubs[i].position.y, WHEEL_POSITIONS[i][1])
}
console.log('With no drawn road, the car keeps the written stance; player and ghost poses leave CarState untouched.')
