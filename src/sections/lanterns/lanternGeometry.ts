import { Box3, Matrix4, Ray, Vector3 } from 'three'
import { GLASS_H, GLASS_W, LANTERN_Y, hangingFor, paneSize, sideFor } from './layout'

export const LAMP_UP = 0.34
type Piece = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number) => void

/** Drawing and picking share these exact solid pieces. */
export function postPieces(index: number, width: number, height: number, piece: Piece) {
  const hung = hangingFor(index)
  const c = Math.cos(hung.yaw), s = Math.sin(hung.yaw)
  const side = sideFor(index), reach = GLASS_W / 2 + 0.055
  const x = hung.x + c * reach * side, z = hung.z - s * reach * side
  const shape = width > 0 ? paneSize(width, height) : { h: GLASS_H }
  const hood = hung.y + shape.h / 2 + 0.05
  const foot = hung.y - LANTERN_Y, top = hood + LAMP_UP
  piece(x, (foot + top) / 2, z, 0.045, top - foot, 0.045, hung.yaw)
  piece(hung.x + c * reach / 2 * side, hood + 0.055, hung.z - s * reach / 2 * side, reach, 0.035, 0.035, hung.yaw)
  piece(hung.x, hood, hung.z, GLASS_W + 0.1, 0.045, 0.16, hung.yaw)
  piece(x, top - 0.055, z, 0.115, 0.028, 0.115, hung.yaw)
  piece(x, top + 0.055, z, 0.135, 0.03, 0.135, hung.yaw)
  piece(x, top, z, 0.075, 0.09, 0.075, hung.yaw)
}

const local = new Ray(), rotation = new Matrix4(), box = new Box3(), hit = new Vector3()
/** The ray is in the carried lane's coordinates. The nearest solid wins. */
export function pickMemory(ray: Ray, memories: readonly { width: number; height: number }[], first = 0, last = memories.length - 1) {
  let nearest = Infinity, selected: number | null = null
  const orient = (x: number, y: number, z: number, yaw: number) => {
    rotation.makeRotationY(-yaw)
    local.origin.copy(ray.origin).sub(hit.set(x, y, z)).applyMatrix4(rotation)
    local.direction.copy(ray.direction).transformDirection(rotation)
  }
  for (let i = Math.max(0, first); i <= Math.min(last, memories.length - 1); i++) {
    const memory = memories[i], hung = hangingFor(i)
    if (memory) {
      orient(hung.x, hung.y, hung.z, hung.yaw)
      const distance = -local.origin.z / local.direction.z
      if (distance >= 0 && distance < nearest) {
        local.at(distance, hit)
        const size = paneSize(memory.width, memory.height)
        if (Math.abs(hit.x) <= size.w / 2 && Math.abs(hit.y) <= size.h / 2) {
          nearest = distance; selected = i
        }
      }
    }
    postPieces(i, memory?.width ?? 0, memory?.height ?? 0, (x,y,z,sx,sy,sz,yaw) => {
      orient(x,y,z,yaw)
      box.min.set(-sx/2,-sy/2,-sz/2); box.max.set(sx/2,sy/2,sz/2)
      if (!local.intersectBox(box, hit)) return
      const distance = hit.distanceTo(local.origin)
      if (distance < nearest) { nearest = distance; selected = memory ? i : null }
    })
  }
  return selected
}
