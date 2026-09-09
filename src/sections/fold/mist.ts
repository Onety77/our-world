/**
 * The mist, as two numbers every material in the Fold reads once a frame.
 *
 * ---------------------------------------------------------------------------
 * **Imperative, and it has to be.** The near and far fog planes move
 * continuously while a session runs, and the garden's law is that per-frame
 * motion never goes through React — a `useState` here would re-run every
 * material's palette effect and rebuild nothing sixty times a second to move a
 * number by four centimetres.
 *
 * So the eased value lives in one ref owned by the section, and each material
 * writes its own two uniforms from it. Every shader in this place already has
 * `uFogNear` and `uFogFar` because every shader in the garden does; the mist
 * adds no drawing of its own at all.
 * ---------------------------------------------------------------------------
 */

import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import type { ShaderMaterial } from 'three'

export interface MistState {
  near: number
  far: number
}

export type MistRef = MutableRefObject<MistState>

/** Have a material take its fog distances from the mist rather than the sky. */
export function useMisted(material: ShaderMaterial | null, mist: MistRef) {
  useFrame(() => {
    if (!material) return
    const u = material.uniforms
    if (!u?.uFogNear || !u?.uFogFar) return
    u.uFogNear.value = mist.current.near
    u.uFogFar.value = mist.current.far
  })
}
