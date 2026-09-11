import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { fitToScreen } from './camera'
import { speedOf, type CarState } from './physics'
import { TUNE } from './tuning'

/** Just ahead of the windscreen glass, above the real bonnet. */
export class BonnetCamera {
  private readonly target = new Vector3()
  private readonly previousUp = new Vector3()
  private previousNear: number | null = null
  private fov = 64

  update(camera: PerspectiveCamera, body: Group, car: CarState, dt: number) {
    if (this.previousNear === null) {
      this.previousNear = camera.near
      this.previousUp.copy(camera.up)
      this.fov = fitToScreen(64, camera.aspect)
    }
    body.updateWorldMatrix(true, false)
    // Follow the rendered suspension rather than re-estimating the road:
    // the bonnet stays attached through banks, crests, body roll and drifting.
    camera.position.set(0, 1.16, .38).applyMatrix4(body.matrixWorld)
    this.target.set(0, 1.08, 25).applyMatrix4(body.matrixWorld)
    camera.up.set(0, 1, 0).transformDirection(body.matrixWorld)
    camera.lookAt(this.target)
    const fast = Math.min(1, speedOf(car) / TUNE.topSpeed)
    const wanted = fitToScreen(64 + fast * 10 + (car.boostLeft > 0 ? 3 : 0), camera.aspect)
    this.fov += (wanted - this.fov) * (1 - Math.exp(-3 * dt))
    camera.fov = this.fov
    camera.near = .06
    camera.updateProjectionMatrix()
  }

  restore(camera: PerspectiveCamera) {
    if (this.previousNear === null) return
    camera.near = this.previousNear
    camera.up.copy(this.previousUp)
    camera.updateProjectionMatrix()
    this.previousNear = null
  }
}
