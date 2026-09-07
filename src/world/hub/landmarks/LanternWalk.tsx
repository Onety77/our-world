/**
 * The Lantern Walk, seen from the garden.
 *
 * ---------------------------------------------------------------------------
 * **What says "walk" from forty metres away is the chain, not the path.**
 *
 * At this distance the trodden ground is a few pixels of slightly darker grass
 * and the posts are hairlines. What carries is a *line of lights curving away
 * into the trees*, in the colours of your own photographs — which is exactly
 * what the place is, and it costs two instanced meshes.
 *
 * It grows, like everything else out here. No memories is a single bare post on
 * the grass with a gap in the treeline behind it; a full walk is a chain of
 * warm lights bending out of sight. The count and the colours come from the
 * same store the section reads, so the preview can never drift from the place.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { useMemories } from '@/systems/memories'
import { useSceneEnv } from '@/world/SceneEnv'
import { LIGHT_COLORS } from '@/systems/palette'
import {
  ambientLightLevel,
  buildInstanced,
  useFormMaterial,
  type FormInstance,
} from '@/world/forms'

/**
 * How many lanterns the preview ever draws.
 *
 * The walk itself is unbounded; a landmark is a glance. Fourteen is enough to
 * read as a chain that continues past what you can see, which is the true
 * impression whether there are twenty memories or two hundred.
 */
const SHOWN = 26

/** Metres between lanterns out here — tighter than the real walk, so it reads. */
const STEP = 2.05

/** The little arc the preview lies along. */
function previewAt(i: number): { x: number; z: number; yaw: number } {
  const s = i * STEP
  const x = Math.sin(s * 0.055) * 5.6
  return { x, z: -s, yaw: Math.atan(5.6 * 0.055 * Math.cos(s * 0.055)) }
}

/**
 * The way in.
 *
 * ---------------------------------------------------------------------------
 * **A landmark has to be a place, and the first version of this was not one.**
 *
 * It was a line of posts with lights on them, which from across the meadow read
 * as two sticks in the grass — and it was replacing a building a hundred metres
 * long, so what the garden lost was not detail, it was *presence*. The other
 * four landmarks are all one strong silhouette you could point at from any
 * distance: a great tree, a valley with water in it, a cave mouth, a plain
 * under stars.
 *
 * So the lane gets a mouth. Two heavy uprights and a lintel across them, with
 * the wood closing in either side and the path running out through it — the
 * shape of a way into somewhere. It is the only piece of built timber in the
 * whole place, and it earns itself by being the thing that says *this is an
 * entrance* rather than *this is a fence*.
 * ---------------------------------------------------------------------------
 */
function gateway(): FormInstance[] {
  const post = (side: number): FormInstance => ({
    offset: [side * 3.05, 2.25, 1.6],
    scale: [0.34, 4.5, 0.34],
    rot: 0,
    phase: side,
    color: '#1a140f',
  })
  return [
    post(-1),
    post(1),
    // The lintel, sat on top of both, and a little proud of them at each end.
    {
      offset: [0, 4.71, 1.6],
      scale: [6.9, 0.42, 0.44],
      rot: 0,
      phase: 2,
      color: '#1a140f',
    },
    // A second, lighter beam under it, so the head of the gate has some depth
    // instead of being one bar against the sky.
    {
      offset: [0, 4.4, 1.6],
      scale: [6.2, 0.16, 0.3],
      rot: 0,
      phase: 3,
      color: '#241b13',
    },
  ]
}

/** The worn path, as one long dark strip running out under the gate. */
function track(): FormInstance[] {
  const out: FormInstance[] = []
  for (let i = 0; i < 16; i++) {
    const s = -2 + i * 3.4
    const x = Math.sin(s * 0.055) * 5.6
    out.push({
      offset: [x, 0.02, -s],
      scale: [2.3, 0.02, 3.5],
      rot: Math.atan(5.6 * 0.055 * Math.cos(s * 0.055)),
      phase: i,
      color: '#2b2318',
    })
  }
  return out
}

const GLOW_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  attribute float iSize;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vUv = uv;
    vTint = iTint;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = iAt + (right * position.x + up * position.y) * iSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // A hard little core inside a soft halo — at this range the core is the
    // lantern and the halo is the only thing saying it is a light at all.
    float core = 1.0 - smoothstep(0.0, 0.34, d);
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    float a = (core * 0.85 + halo * halo * 0.5) * (0.42 + 0.58 * uNight);
    if (a <= 0.004) discard;
    gl_FragColor = vec4(vTint * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function LanternWalkLandmark() {
  const { palette } = useSceneEnv()
  const all = useMemories((s) => s.all)
  const memories = useMemo(() => all.filter((m) => !m.removed), [all])

  /*
    One post more than there are lanterns — the next one is up and waiting, out
    here as well as in there. It is also what an empty walk *is*: one stake on
    the grass, which reads as somewhere about to begin rather than as a ruin.
  */
  const posts = Math.min(SHOWN, memories.length) + 1

  const wood = useMemo(() => {
    const base = new BoxGeometry(1, 1, 1)
    const built = buildInstanced(base, [
      ...gateway(),
      ...track(),
      ...Array.from({ length: posts }, (_, i) => {
        const at = previewAt(i)
        const side = i % 2 === 0 ? -1 : 1
        return {
          offset: [
            at.x + Math.cos(at.yaw) * side * 1.15,
            1.175,
            at.z + Math.sin(at.yaw) * side * 1.15,
          ] as [number, number, number],
          scale: [0.075, 2.35, 0.075] as [number, number, number],
          rot: at.yaw,
          phase: i * 0.7,
          color: '#171310',
        }
      }),
    ])
    base.dispose()
    return built
  }, [posts])
  useEffect(() => () => wood.dispose(), [wood])

  const lights = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const count = Math.min(SHOWN, memories.length)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const size = new Float32Array(Math.max(1, count))
    const colour = new Color()
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    for (let i = 0; i < count; i++) {
      const spot = previewAt(i)
      const side = i % 2 === 0 ? -1 : 1
      at[i * 3] = spot.x + Math.cos(spot.yaw) * side * 1.15
      at[i * 3 + 1] = 2.02
      at[i * 3 + 2] = spot.z + Math.sin(spot.yaw) * side * 1.15
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.5)
      tint[i * 3] = colour.r
      tint[i * 3 + 1] = colour.g
      tint[i * 3 + 2] = colour.b
      size[i] = 1.9
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories])
  useEffect(() => () => lights.dispose(), [lights])

  const woodMat = useFormMaterial(palette, { sway: 0.06 })

  const glowMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uNight: { value: 0.5 } },
      }),
    [],
  )
  useEffect(() => () => glowMat.dispose(), [glowMat])
  useEffect(() => {
    glowMat.uniforms.uNight.value = 1 - ambientLightLevel(palette)
  }, [glowMat, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    woodMat.uniforms.uTime.value = t.current
  })

  return (
    <>
      <mesh geometry={wood} material={woodMat} />
      {memories.length > 0 ? (
        <mesh geometry={lights} material={glowMat} renderOrder={4} />
      ) : null}
    </>
  )
}
