/** Render-only suspension support. Never writes to CarState or tyre forces. */
import { Matrix4, Quaternion, Vector3 } from 'three'
import { buildWheel, SPRING_MOUNT_Y, SPRING_POSITIONS, WHEEL_POSITIONS, WHEEL_RADIUS } from './car'
import { nearbyHarmattanSurface, surfaceAt, surfaceHeight, type SurfaceTriangle } from './harmattanSurface'
import type { CarRig } from './rig'
import type { Track } from './track'

interface Contact { triangles: SurfaceTriangle[] }
const contacts = new WeakMap<CarRig, Contact>()
const point = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const rotation = new Matrix4()
const inverse = new Quaternion()
const heights = new Float64Array(4)
const candidates: SurfaceTriangle[] = []

/** Fit the car's road frame to its footprint, in world space even during a drift. */
export function placeTyreContact(rig: CarRig, track: Track, s: number, drop: number) {
  rig.ground.position.set(0, 0, 0)
  if (track.stage !== 'harmattan' || drop !== 0) {
    contacts.delete(rig)
    return
  }
  let contact = contacts.get(rig)
  if (!contact) {
    contact = { triangles: [] }
    contacts.set(rig, contact)
  }
  nearbyHarmattanSurface(track, s, contact.triangles)
  for (let i = 0; i < 4; i++) {
    const [x, , z] = WHEEL_POSITIONS[i]
    point.set(x, 0, z).applyQuaternion(rig.root.quaternion).add(rig.root.position)
    const triangle = surfaceAt(contact.triangles, point.x, point.z)
    if (!triangle) { contacts.delete(rig); return }
    heights[i] = surfaceHeight(triangle, point.x, point.z) - rig.root.position.y
  }
  const halfTrack = WHEEL_POSITIONS[1][0]
  const front = WHEEL_POSITIONS[0][2], rear = WHEEL_POSITIONS[2][2]
  const dx = (heights[1] + heights[3] - heights[0] - heights[2]) / (4 * halfTrack)
  const dz = (heights[0] + heights[1] - heights[2] - heights[3]) / (2 * (front - rear))
  const height = (heights[0] + heights[1] + heights[2] + heights[3]) / 4 - dz * (front + rear) / 2
  up.set(-dx, 1, -dz).normalize().applyQuaternion(rig.root.quaternion)
  forward.set(0, 0, 1).applyQuaternion(rig.root.quaternion)
  // Preserve the simulation's compass heading exactly; only add road pitch.
  forward.y = -(up.x * forward.x + up.z * forward.z) / up.y
  forward.normalize()
  right.crossVectors(up, forward).normalize()
  rotation.makeBasis(right, up, forward)
  inverse.copy(rig.root.quaternion).invert()
  rig.ground.quaternion.setFromRotationMatrix(rotation).premultiply(inverse)
  rig.ground.position.y = height
}

let tread: Float32Array | undefined
function treadVertices() {
  if (tread) return tread
  // Use the actual rubber, including the raised tread blocks and rounded
  // shoulders. A nominal-radius sphere misses both tyre width and camber.
  const geometry = buildWheel()
  const positions = geometry.getAttribute('position')
  const unique = new Set<string>()
  const vertices: number[] = []
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    if (Math.hypot(y, z) < .3) continue
    const key = `${x},${y},${z}`
    if (unique.has(key)) continue
    unique.add(key)
    vertices.push(x, y, z)
  }
  geometry.dispose()
  tread = new Float32Array(vertices)
  return tread
}

/** Run after steering, camber and spin, so their final tyre silhouette is supported. */
export function poseTyreContact(rig: CarRig) {
  const contact = contacts.get(rig)
  if (!contact) return
  const vertices = treadVertices()
  rig.root.updateMatrixWorld(true)
  const elements = rig.ground.matrixWorld.elements
  up.set(elements[4], elements[5], elements[6])
  for (let i = 0; i < 4; i++) {
    const hub = rig.hubs[i]
    hub.getWorldPosition(point)
    candidates.length = 0
    for (const triangle of contact.triangles) {
      if (triangle.minX <= point.x + .65 && triangle.maxX >= point.x - .65 &&
          triangle.minZ <= point.z + .65 && triangle.maxZ >= point.z - .65) candidates.push(triangle)
    }
    // Moving along the suspension axis changes x/z slightly on a bank. Repeat
    // against the final triangles to handle a tread straddling a mesh seam.
    for (let pass = 0; pass < 3; pass++) {
      rig.spinners[i].updateWorldMatrix(true, false)
      const matrix = rig.spinners[i].matrixWorld
      let lift = -Infinity
      for (let j = 0; j < vertices.length; j += 3) {
        point.fromArray(vertices, j).applyMatrix4(matrix)
        const triangle = surfaceAt(candidates, point.x, point.z)
        if (!triangle) continue
        const separation = surfaceHeight(triangle, point.x, point.z) - point.y
        const along = up.y - triangle.dx * up.x - triangle.dz * up.z
        if (along > .1) lift = Math.max(lift, separation / along)
      }
      if (!Number.isFinite(lift)) break
      hub.position.y += lift
      if (Math.abs(lift) < .00001) break
    }
    // The top mount belongs to the rolling body; the bottom follows this hub.
    const spring = rig.springs[i]
    const [sx, sy, sz] = SPRING_POSITIONS[i]
    rig.body.updateMatrix()
    point.set(sx, sy, sz).applyMatrix4(rig.body.matrix)
    const span = SPRING_MOUNT_Y - WHEEL_RADIUS
    spring.scale.y = Math.max(.5, Math.min(1.7, (point.y - hub.position.y) / span))
  }
  rig.root.updateMatrixWorld(true)
}
