/**
 * What the tyres leave behind.
 *
 * Short dark strips laid flat on the stone wherever a tyre was doing something
 * other than rolling — sliding sideways through a corner, locked under
 * braking, spinning up out of one. They fade out over about twelve seconds.
 *
 * ---------------------------------------------------------------------------
 * **Why this is worth its own file.**
 *
 * A car on a featureless surface at forty metres a second is very hard to
 * believe, because nothing it does leaves any evidence. The dust helps and the
 * smoke helps, but both of them hang in the *air* and drift away — they show
 * that something is happening, not that it happened *there*. A mark on the
 * ground is the only thing that stays where the tyre was, so it is the only
 * thing that says the car and the road are actually touching.
 *
 * They also do a second job, quietly. They appear in corners and almost never
 * on a straight, so a few seconds after you have driven a bend the road behind
 * you is a drawing of what you did to it: two dark arcs where you got it right,
 * a smeared mess where you did not. It is the only feedback in the game that
 * you can look back at.
 * ---------------------------------------------------------------------------
 *
 * **Deliberately not a decal system.** No render targets, no texture the road
 * is drawn into, no persistence between runs. A ring buffer of flat quads,
 * stepped on the CPU, exactly like `particles.ts` — the marks are short-lived,
 * so a few hundred of them is a road that always looks freshly driven and
 * never accumulates a lap's worth of scribble.
 */

import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type BufferAttribute,
} from 'three'

/** Seconds a mark takes to disappear. Matched by `uLife` in the material. */
export const MARK_LIFE = 12

export class Marks {
  readonly geometry: InstancedBufferGeometry

  private readonly at: Float32Array
  private readonly fwd: Float32Array
  private readonly side: Float32Array
  /** x: how black, y: when it was laid. */
  private readonly mark: Float32Array

  private next = 0

  constructor(readonly capacity: number) {
    const base = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)
    base.dispose()

    this.at = new Float32Array(capacity * 3)
    this.fwd = new Float32Array(capacity * 3)
    this.side = new Float32Array(capacity * 3)
    this.mark = new Float32Array(capacity * 2)

    geo.setAttribute('iAt', new InstancedBufferAttribute(this.at, 3))
    geo.setAttribute('iFwd', new InstancedBufferAttribute(this.fwd, 3))
    geo.setAttribute('iSide', new InstancedBufferAttribute(this.side, 3))
    geo.setAttribute('iMark', new InstancedBufferAttribute(this.mark, 2))
    geo.instanceCount = capacity
    this.geometry = geo
  }

  /**
   * Lay one strip.
   *
   * `fwd` and `side` arrive already scaled to half a length and half a width,
   * so the shader can build the quad with two multiplies and never needs to
   * know which way up the road is. `strength` is how black, and it is the only
   * thing standing between "the car was working here" and a tunnel that looks
   * like somebody has been at it with a marker pen.
   */
  lay(
    x: number, y: number, z: number,
    fx: number, fy: number, fz: number,
    sx: number, sy: number, sz: number,
    strength: number,
    now: number,
  ) {
    const i = this.next
    this.next = (this.next + 1) % this.capacity

    this.at[i * 3] = x
    this.at[i * 3 + 1] = y
    this.at[i * 3 + 2] = z
    this.fwd[i * 3] = fx
    this.fwd[i * 3 + 1] = fy
    this.fwd[i * 3 + 2] = fz
    this.side[i * 3] = sx
    this.side[i * 3 + 1] = sy
    this.side[i * 3 + 2] = sz
    this.mark[i * 2] = strength
    this.mark[i * 2 + 1] = now

    this.dirty = true
  }

  private dirty = false

  /**
   * Push whatever was laid this frame.
   *
   * The fading is entirely in the shader — it is a function of `now` minus the
   * moment each mark was laid — so on a frame where nothing new was laid there
   * is nothing to upload at all, which is most frames on a straight.
   */
  flush() {
    if (!this.dirty) return
    this.dirty = false
    ;(this.geometry.getAttribute('iAt') as BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('iFwd') as BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('iSide') as BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('iMark') as BufferAttribute).needsUpdate = true
  }

  clear() {
    this.mark.fill(0)
    this.dirty = true
  }

  dispose() {
    this.geometry.dispose()
  }
}
