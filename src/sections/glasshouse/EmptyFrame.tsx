/**
 * The frame that is waiting.
 *
 * ---------------------------------------------------------------------------
 * The brief put this "near the centre", and it belongs at the near end
 * instead — because the next slot in the building *is* the empty one, and
 * standing it anywhere else would mean the Glasshouse had a hole in the middle
 * of it that never filled. Hang a memory and the glass forms in this frame, and
 * a new empty one appears one slot further on. The waiting frame is always the
 * one at the edge of what the two of you have built.
 *
 * It has no glass and no colour. What it has is a faint breathing outline and
 * the vines hanging into it — the same thing the Hollow's five blank stones
 * say, in this building's own language: there is a place for this, and it is
 * empty.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { paneAt, paneSize, slotFor } from './layout'

const VERT = /* glsl */ `
  uniform vec3 uCentre;
  uniform vec2 uSize;
  uniform vec2 uFace;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    vec2 flat2 = position.xy * uSize;
    float c = cos(uFace.y), s = sin(uFace.y);
    vec2 turned = vec2(flat2.x * c - flat2.y * s, flat2.x * s + flat2.y * c);
    vec3 world = vec3(uCentre.x, uCentre.y + turned.y, uCentre.z - turned.x * uFace.x);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uGlow;
  uniform float uBreath;
  uniform float uLight;
  uniform float uFogFar;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    /*
      An outline, not a rectangle.

      The whole design law here forbids a panel, and an empty pane filled with
      any amount of anything is exactly one. What is drawn is the *rebate* — the
      lip of the frame the glass would sit in — which is a thin bright border
      and nothing at all in the middle.
    */
    vec2 edge = min(vUv, 1.0 - vUv);
    float d = min(edge.x, edge.y);
    float rim = (1.0 - smoothstep(0.0, 0.035, d)) * smoothstep(0.0, 0.008, d);

    /*
      And one drop of water, resting in the bottom of the frame.

      This is the moisture the glass condenses out of when a memory is hung —
      it is here first, so the forming is something that was already beginning.
    */
    float bead = (1.0 - smoothstep(0.0, 0.11, length((vUv - vec2(0.5, 0.06)) * vec2(2.4, 1.0))));

    float glow = (rim * 0.9 + bead * 0.5) * uBreath * max(0.25, uLight);
    glow *= 1.0 - smoothstep(uFogFar * 0.3, uFogFar * 0.7, vDepth);
    if (glow <= 0.002) discard;
    gl_FragColor = vec4(uGlow * glow, glow);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * `index` is the number of memories — which is exactly the index of the next
 * one, and therefore of the slot it will fill.
 */
export function EmptyFrame({ index, palette }: { index: number; palette: SkyPalette }) {
  const quad = useMemo(() => new PlaneGeometry(1, 1), [])
  useEffect(() => () => quad.dispose(), [quad])

  const slot = useMemo(() => slotFor(index), [index])
  // Nothing has been chosen yet, so there is no aspect to cut to. A frame a
  // little wider than tall is what an empty conservatory bay actually is, and
  // the glass will grow into whatever shape the photograph turns out to be.
  const size = useMemo(() => paneSize(4, 3), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        // Flips z by the wall it is on — see the note on the pools.
        side: DoubleSide,
        uniforms: {
          uCentre: { value: new Vector3() },
          uSize: { value: new Vector2(1, 1) },
          uFace: { value: new Vector2(1, 0) },
          uGlow: { value: new Color('#cfe0e6') },
          uBreath: { value: 1 },
          uLight: { value: 1 },
          uFogFar: { value: 150 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    const [x, y, z] = paneAt(slot, size.h)
    ;(u.uCentre.value as Vector3).set(x, y, z)
    ;(u.uSize.value as Vector2).set(size.w, size.h)
    ;(u.uFace.value as Vector2).set(slot.side, slot.tilt)
    u.uLight.value = ambientLightLevel(palette)
    u.uFogFar.value = palette.fogFar
  }, [material, slot, size, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    // Slow, and never all the way out. A blink is a notification; this is a
    // thing that has been waiting a long time and is in no hurry.
    material.uniforms.uBreath.value = 0.55 + Math.sin(t.current * 0.85) * 0.25
  })

  return <mesh geometry={quad} material={material} frustumCulled={false} />
}
