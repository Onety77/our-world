/**
 * Everything the car throws off itself.
 *
 * Grit off the rear tyres, sparks off the rock, ash out of the exhaust when
 * the ember goes in, and a slow drift of dust hanging in the air of the tunnel
 * whether or not anybody is driving through it.
 *
 * The brief this was built from asks for "speed lines made from real
 * particles", and that is the whole reason this file exists rather than a
 * screen-space streak effect: the sense of speed underground comes almost
 * entirely from things whose *distance from you* is obvious flying past, and a
 * streak drawn on the glass has no distance at all.
 *
 * A ring buffer of instanced quads, stepped on the CPU. Three hundred of them
 * costs nothing and there is no way to do this on the GPU without giving up
 * knowing where the road is.
 */

import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
} from 'three'

export class Particles {
  readonly geometry: InstancedBufferGeometry

  private readonly at: Float32Array
  private readonly tint: Float32Array
  private readonly shape: Float32Array
  private readonly velocity: Float32Array
  private readonly age: Float32Array
  private readonly span: Float32Array
  private readonly born: Float32Array
  private readonly grow: Float32Array

  private next = 0

  constructor(readonly capacity: number) {
    const base = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)
    base.dispose()

    this.at = new Float32Array(capacity * 3)
    this.tint = new Float32Array(capacity * 3)
    this.shape = new Float32Array(capacity * 3)
    this.velocity = new Float32Array(capacity * 3)
    this.age = new Float32Array(capacity)
    this.span = new Float32Array(capacity)
    this.born = new Float32Array(capacity)
    this.grow = new Float32Array(capacity)

    geo.setAttribute('iAt', new InstancedBufferAttribute(this.at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(this.tint, 3))
    geo.setAttribute('iShape', new InstancedBufferAttribute(this.shape, 3))
    geo.instanceCount = capacity
    this.geometry = geo
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    size: number,
    grow: number,
    color: Color,
  ) {
    const i = this.next
    this.next = (this.next + 1) % this.capacity

    this.at[i * 3] = x
    this.at[i * 3 + 1] = y
    this.at[i * 3 + 2] = z
    this.velocity[i * 3] = vx
    this.velocity[i * 3 + 1] = vy
    this.velocity[i * 3 + 2] = vz
    this.tint[i * 3] = color.r
    this.tint[i * 3 + 1] = color.g
    this.tint[i * 3 + 2] = color.b
    this.age[i] = 0
    this.span[i] = life
    this.born[i] = size
    this.grow[i] = grow
    this.shape[i * 3] = 1
    this.shape[i * 3 + 1] = size
    this.shape[i * 3 + 2] = Math.random() * Math.PI * 2
  }

  /**
   * `drag` is the fraction of speed kept per second — 0.1 is thick air, 0.9 is
   * barely any. Stated that way because it is the only form that behaves the
   * same at 30fps and at 120.
   */
  step(dt: number, gravity: number, drag: number) {
    const keep = Math.pow(drag, dt)
    for (let i = 0; i < this.capacity; i++) {
      if (this.shape[i * 3] <= 0) continue
      this.age[i] += dt
      const life = 1 - this.age[i] / this.span[i]
      if (life <= 0) {
        this.shape[i * 3] = 0
        continue
      }
      this.velocity[i * 3] *= keep
      this.velocity[i * 3 + 1] = this.velocity[i * 3 + 1] * keep + gravity * dt
      this.velocity[i * 3 + 2] *= keep
      this.at[i * 3] += this.velocity[i * 3] * dt
      this.at[i * 3 + 1] += this.velocity[i * 3 + 1] * dt
      this.at[i * 3 + 2] += this.velocity[i * 3 + 2] * dt
      this.shape[i * 3] = life
      this.shape[i * 3 + 1] = this.born[i] * (1 + (1 - life) * this.grow[i])
    }
    ;(this.geometry.getAttribute('iAt') as BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('iShape') as BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('iTint') as BufferAttribute).needsUpdate = true
  }

  clear() {
    this.shape.fill(0)
  }

  dispose() {
    this.geometry.dispose()
  }
}

// --- what things are made of ------------------------------------------------

export const GRIT = new Color('#6b5b46')
/**
 * Tyre smoke, which is a different thing from grit and has to look it.
 *
 * Grit is thrown off the ground and falls back to it; smoke comes off the
 * *tyre*, hangs, and grows. Pale and cool rather than earth-coloured, because
 * it is rubber rather than dust — and because a pale cloud is the one thing
 * that reads instantly against black rock under a warm lamp.
 */
export const SMOKE = new Color('#a49c92')
export const WET_GRIT = new Color('#4d5257')
export const SPARK = new Color('#ffcf7a')
export const HOT_SPARK = new Color('#fff0c0')
export const BLUE_SPARK = new Color('#bcd4ff')
export const ASH = new Color('#ff8a3c')
export const MOTE = new Color('#a88a63')
export const GHOST_GRIT = new Color('#9fb6e8')
