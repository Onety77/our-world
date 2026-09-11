import { Vector2, Vector4 } from 'three'
import type { CarState } from './physics'
import type { RoadAt } from './track'
import type { StageId } from './model'

/** Per-attempt cosmetics. Neither these values nor the shader affect tyre grip. */
export class CarWear {
  readonly surface = new Vector4() // dust, wetness, mud, travel-driven rain flow
  readonly scuffs = new Vector2() // mesh -X / +X sides
  reset() { this.surface.set(0, 0, 0, 0); this.scuffs.set(0, 0) }
  update(car: CarState, road: RoadAt, stage: StageId, rain: number, dt: number) {
    const distance = Math.hypot(car.vs, car.vn) * dt
    const dry = 1 - Math.max(road.wet, rain)
    const dust = stage === 'harmattan' ? .002 : .00025
    this.surface.x = Math.min(.9, Math.max(0, this.surface.x + distance * dust * dry *
      (1 + road.sand + (car.rough ? 2 : 0)) - rain * dt * .018))
    const wet = Math.max(rain, road.wet * Math.min(1, distance / Math.max(dt, .001) / 20) * .65)
    this.surface.y += (wet - this.surface.y) * (1 - Math.exp(-dt * (wet > this.surface.y ? .4 : .025)))
    this.surface.z = Math.min(.85, Math.max(0, this.surface.z + distance * road.wet *
      (car.rough ? .007 : .0007) - rain * dt * .002))
    this.surface.w += distance * .015 + rain * dt * .3
    if (car.hitWall > .01 && distance > .01) {
      const mark = Math.min(.08, car.hitWall * distance * .07)
      if (car.n >= 0) this.scuffs.x = Math.min(1, this.scuffs.x + mark)
      else this.scuffs.y = Math.min(1, this.scuffs.y + mark)
    }
  }
}
