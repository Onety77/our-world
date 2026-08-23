/**
 * Letters left at the Pond, corked into bottles and set on the water.
 *
 * Same letters, same reader as the tree — only the object differs. Each one
 * rides its own little wave, and hers-unopened glow the way they do in the
 * branches, so you can see from the bank whether she's been.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
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

const BOTTLE_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iPhase;
  attribute float iIndex;

  uniform float uTime;
  uniform float uHover;

  varying float vUp;
  varying float vDepth;
  varying float vLit;
  varying float vHeight;

  void main() {
    vUp = normalize(normal).y * 0.5 + 0.5;
    vHeight = position.y + 0.5;
    vLit = abs(iIndex - uHover) < 0.5 ? 1.0 : 0.0;

    // Each rides its own wave, and tips as it rides — a bottle that bobbed
    // straight up and down would read as a float on a fishing line.
    float bobT = uTime * 0.9 + iPhase;
    float lift = sin(bobT) * 0.05 + sin(bobT * 1.7) * 0.02;
    float tilt = sin(bobT * 0.8) * 0.16;

    float c = cos(tilt), s = sin(tilt);
    vec3 p = vec3(position.x * c - position.y * s, position.x * s + position.y * c, position.z);

    // drift slowly around the pond rather than sitting on a marked spot
    vec3 drift = vec3(sin(uTime * 0.11 + iPhase) * 0.5, 0.0, cos(uTime * 0.09 + iPhase) * 0.5);

    vec4 mv = modelViewMatrix * vec4(p + iOffset + drift + vec3(0.0, lift, 0.0), 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const BOTTLE_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uGlass;
  uniform vec3 uPaper;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;

  varying float vUp;
  varying float vDepth;
  varying float vLit;
  varying float vHeight;

  void main() {
    // green glass, with the rolled paper showing through the middle of it
    vec3 col = mix(uGlass, uPaper, smoothstep(0.28, 0.42, vHeight) * (1.0 - smoothstep(0.6, 0.74, vHeight)) * 0.55);
    col *= (0.5 + vUp * 0.6) * uLight;

    // a hard highlight along one side, which is most of what says 'glass'
    col += uPaper * pow(vUp, 6.0) * 0.35 * uLight;

    col *= 1.0 + vLit * 0.9;

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

export function Bottles({
  letters,
  me,
  palette,
}: {
  letters: Letter[]
  me: UserId
  palette: SkyPalette
}) {
  const { bottles, glows, glowColor } = useMemo(() => {
    // lying on its side, so it floats like a bottle rather than standing like
    // a skittle
    const base = new CylinderGeometry(0.09, 0.075, 0.44, 8, 1)
    base.rotateZ(Math.PI / 2)
    const solid = base.index ? base.toNonIndexed() : base

    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', solid.attributes.position)
    geo.setAttribute('normal', solid.attributes.normal)

    const n = Math.max(1, letters.length)
    const offset = new Float32Array(n * 3)
    const phase = new Float32Array(n)
    const index = new Float32Array(n)
    letters.forEach((l, i) => {
      offset.set(l.position, i * 3)
      phase[i] = (i * 2.399) % (Math.PI * 2)
      index[i] = i
    })
    geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.setAttribute('iIndex', new InstancedBufferAttribute(index, 1))
    geo.instanceCount = letters.length

    const unread = letters.filter((l) => l.by !== me && l.readAt === null)
    const glowBase = new PlaneGeometry(2, 2)
    const glowGeo = new InstancedBufferGeometry()
    glowGeo.setAttribute('position', glowBase.attributes.position)
    glowGeo.setAttribute('uv', glowBase.attributes.uv)
    if (glowBase.index) glowGeo.setIndex(glowBase.index)
    const goffset = new Float32Array(Math.max(1, unread.length) * 3)
    unread.forEach((l, i) => goffset.set(l.position, i * 3))
    glowGeo.setAttribute('iOffset', new InstancedBufferAttribute(goffset, 3))
    glowGeo.instanceCount = unread.length

    base.dispose()
    glowBase.dispose()

    return {
      bottles: geo,
      glows: glowGeo,
      glowColor: LIGHT_COLORS[me === 'warm' ? 'cool' : 'warm'],
    }
  }, [letters, me])

  useEffect(
    () => () => {
      bottles.dispose()
      glows.dispose()
    },
    [bottles, glows],
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BOTTLE_VERT,
        fragmentShader: BOTTLE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: -1 },
          uGlass: { value: new Color('#4a7052') },
          uPaper: { value: new Color('#e8e0cd') },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
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
          uPulse: { value: 0.3 },
        },
      }),
    [glowColor],
  )

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial])

  useEffect(() => {
    const u = material.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
  }, [material, palette])

  const hovered = useReading((s) => s.hoveredLetterId)
  useEffect(() => {
    material.uniforms.uHover.value = hovered
      ? letters.findIndex((l) => l.id === hovered)
      : -1
  }, [material, hovered, letters])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    glowMaterial.uniforms.uPulse.value =
      0.26 + Math.sin(t.current * 1.1) * 0.1 + Math.sin(t.current * 0.53) * 0.04
  })

  if (letters.length === 0) return null

  return (
    <>
      <mesh geometry={glows} material={glowMaterial} frustumCulled={false} renderOrder={3} />
      <mesh geometry={bottles} material={material} frustumCulled={false} />
    </>
  )
}
