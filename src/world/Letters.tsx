/**
 * Letters hanging from the branches.
 *
 * Each one is a folded sheet on a thread, turning slowly in the same wind as
 * everything else. Unread ones — meaning hers, that you haven't opened —
 * carry a soft glow, so you can tell from the path whether she's been.
 *
 * Two meshes for the lot: the papers, and the glows. Both instanced, so a tree
 * with three hundred letters on it costs the same as one with three.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { LIGHT_COLORS } from '@/systems/palette'
import type { Letter, UserId } from '@/data/types'
import { useReading } from '@/systems/reading'
import { ambientLightLevel } from './forms'

/**
 * How wide a folded letter is, in metres.
 *
 * Generous. These hang seven metres up and are looked at from twenty-seven,
 * where a hand-sized sheet is four pixels of white and reads as a speck of
 * dust on the lens.
 */
const PAPER = 0.8
/** Total drop of the quad — paper plus the thread it hangs on. */
const DROP = PAPER * 3.4
/** Fraction of the quad, from the bottom, that is paper rather than thread. */
const PAPER_TOP = 0.42
/**
 * A letter's stored position is the middle of the paper — the thing you can
 * see and tap. The thread runs up from it to the branch. Storing the knot
 * instead would mean every piece of code that wants to point at a letter has
 * to know how far it hangs, which is exactly the sort of shared secret that
 * drifts.
 */
const PAPER_CENTRE = (DROP * (1 - PAPER_TOP)) / 2

const PAPER_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iPhase;
  attribute float iTint;
  attribute float iIndex;

  uniform float uTime;
  uniform float uWind;

  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;

  uniform float uHover;

  void main() {
    vUv = uv;
    vTint = iTint;
    vLit = abs(iIndex - uHover) < 0.5 ? 1.0 : 0.0;

    // hangs from its top edge, so it swings from the thread rather than
    // rotating about its middle like a coin
    float hang = uv.y - 1.0;

    float gust = sin(uTime * 0.42 + iOffset.x * 0.055 + iOffset.z * 0.041) * 0.5 + 0.5;
    float swing = sin(uTime * 1.05 + iPhase) * 0.5 + sin(uTime * 1.9 + iPhase * 1.6) * 0.2;
    // Generous. The swing is the whole tell that a paper is hanging on a
    // thread rather than pinned to the air, and it is read from twenty-odd
    // metres where a subtle one is no swing at all.
    float amount = swing * (0.35 + gust * 0.85) * uWind;

    // billboard, so it always presents its face to you and you never catch it
    // edge-on and lose it
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * position.x + up * position.y;

    local.x += amount * hang * 0.55;
    local.y += -abs(amount * hang) * 0.12;

    vec4 mv = modelViewMatrix * vec4(local + iOffset, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const PAPER_FRAG = /* glsl */ `
  precision mediump float;

  #define PAPER_TOP 0.42

  uniform vec3 uPaper;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;

  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;

  void main() {
    vec3 col;

    if (vUv.y > PAPER_TOP) {
      // The thread. Without it the letters read as rectangles floating in mid
      // air with no relationship to the tree at all — this one detail is most
      // of what makes them look hung rather than pasted on.
      if (abs(vUv.x - 0.5) > 0.016) discard;
      col = uPaper * 0.34 * uLight;
    } else {
      float py = vUv.y / PAPER_TOP;

      // the fold: one half catches a little more light than the other
      float fold = vUv.x < 0.5 ? 1.0 : 0.9;
      // and a crease down the middle
      float crease = 1.0 - smoothstep(0.0, 0.025, abs(vUv.x - 0.5)) * 0.22;

      col = uPaper * fold * crease * (0.92 + vTint * 0.16) * uLight;
      // the corners turn down slightly — darker toward the bottom edge
      col *= 0.86 + py * 0.2;
    }

    // the one you are pointing at lifts, so it is obvious it can be taken down
    col *= 1.0 + vLit * 0.85;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GLOW_VERT = /* glsl */ `
  attribute vec3 iOffset;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * position.x + up * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local + iOffset, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uPulse;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.6);
    float a = halo * uPulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function instanced(base: PlaneGeometry, positions: number[][], extra?: {
  phase: number[]
  tint: number[]
}): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', base.attributes.position)
  geo.setAttribute('uv', base.attributes.uv)
  if (base.index) geo.setIndex(base.index)

  const count = Math.max(1, positions.length)
  const offset = new Float32Array(count * 3)
  positions.forEach((p, i) => offset.set(p, i * 3))
  geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))

  if (extra) {
    geo.setAttribute(
      'iPhase',
      new InstancedBufferAttribute(Float32Array.from(extra.phase), 1),
    )
    geo.setAttribute(
      'iTint',
      new InstancedBufferAttribute(Float32Array.from(extra.tint), 1),
    )
    geo.setAttribute(
      'iIndex',
      new InstancedBufferAttribute(
        Float32Array.from(positions.map((_, i) => i)),
        1,
      ),
    )
  }

  geo.instanceCount = positions.length
  return geo
}

export function Letters({
  letters,
  me,
  palette,
}: {
  letters: Letter[]
  me: UserId
  palette: SkyPalette
}) {
  const { papers, glows, glowColor } = useMemo(() => {
    const positions = letters.map((l) => l.position as unknown as number[])
    const phase = letters.map((_, i) => (i * 2.399) % (Math.PI * 2))
    const tint = letters.map((_, i) => ((i * 0.618) % 1))

    // hers, unopened — the only thing in the tree that glows
    const unread = letters.filter((l) => l.by !== me && l.readAt === null)

    const paperBase = new PlaneGeometry(PAPER, DROP)
    // paper centred on the instance point, thread running up from it
    paperBase.translate(0, PAPER_CENTRE, 0)
    const glowBase = new PlaneGeometry(PAPER * 6, PAPER * 6)

    const built = {
      papers: instanced(paperBase, positions, { phase, tint }),
      glows: instanced(
        glowBase,
        unread.map((l) => l.position as unknown as number[]),
      ),
      glowColor: LIGHT_COLORS[me === 'warm' ? 'cool' : 'warm'],
    }
    paperBase.dispose()
    glowBase.dispose()
    return built
  }, [letters, me])

  useEffect(
    () => () => {
      papers.dispose()
      glows.dispose()
    },
    [papers, glows],
  )

  const paperMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: PAPER_VERT,
        fragmentShader: PAPER_FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uPaper: { value: new Color('#e8e0cd') },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uHover: { value: -1 },
        },
      }),
    [],
  )

  const glowMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uColor: { value: new Color(glowColor) },
          uPulse: { value: 0.4 },
        },
      }),
    [glowColor],
  )

  useEffect(() => () => paperMaterial.dispose(), [paperMaterial])
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial])

  useEffect(() => {
    const u = paperMaterial.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
    u.uWind.value = palette.wind
  }, [paperMaterial, palette])

  const hovered = useReading((s) => s.hoveredLetterId)
  const hoveredIndex = useMemo(
    () => (hovered ? letters.findIndex((l) => l.id === hovered) : -1),
    [hovered, letters],
  )

  useEffect(() => {
    paperMaterial.uniforms.uHover.value = hoveredIndex
  }, [paperMaterial, hoveredIndex])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    paperMaterial.uniforms.uTime.value = t.current
    // a slow breath rather than a blink — it should read as alive, not as a
    // notification badge
    glowMaterial.uniforms.uPulse.value =
      0.32 + Math.sin(t.current * 1.1) * 0.12 + Math.sin(t.current * 0.53) * 0.05
  })

  if (letters.length === 0) return null

  return (
    <>
      <mesh geometry={glows} material={glowMaterial} frustumCulled={false} renderOrder={3} />
      <mesh geometry={papers} material={paperMaterial} frustumCulled={false} />
    </>
  )
}
