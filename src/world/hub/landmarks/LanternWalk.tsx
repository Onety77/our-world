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
import { ambientLightLevel, buildInstanced, useFormMaterial } from '@/world/forms'

/**
 * How many lanterns the preview ever draws.
 *
 * The walk itself is unbounded; a landmark is a glance. Fourteen is enough to
 * read as a chain that continues past what you can see, which is the true
 * impression whether there are twenty memories or two hundred.
 */
const SHOWN = 14

/** Metres between lanterns out here — tighter than the real walk, so it reads. */
const STEP = 1.9

/** The little arc the preview lies along. */
function previewAt(i: number): { x: number; z: number; yaw: number } {
  const s = i * STEP
  const x = Math.sin(s * 0.075) * 3.4
  return { x, z: -s, yaw: Math.atan(3.4 * 0.075 * Math.cos(s * 0.075)) }
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
    const built = buildInstanced(
      base,
      Array.from({ length: posts }, (_, i) => {
        const at = previewAt(i)
        const side = i % 2 === 0 ? -1 : 1
        return {
          offset: [at.x + Math.cos(at.yaw) * side * 0.8, 0, at.z + Math.sin(at.yaw) * side * 0.8] as [number, number, number],
          scale: [0.055, 1.72, 0.055] as [number, number, number],
          rot: at.yaw,
          phase: i * 0.7,
          color: '#171310',
        }
      }),
    )
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
      at[i * 3] = spot.x + Math.cos(spot.yaw) * side * 0.8
      at[i * 3 + 1] = 1.62
      at[i * 3 + 2] = spot.z + Math.sin(spot.yaw) * side * 0.8
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.5)
      tint[i * 3] = colour.r
      tint[i * 3 + 1] = colour.g
      tint[i * 3 + 2] = colour.b
      size[i] = 1.5
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
