/**
 * Big soft cloud banks, high and slow.
 *
 * Billboards rather than volumes: a real cloud system is a rendering project
 * of its own, and at this distance the only things your eye actually reads are
 * a soft silhouette, a bright top, a shadowed underside, and slow drift. All
 * four are cheap.
 *
 * They sit high and far out, so they never come between you and anything you
 * care about — they're there to give the sky a scale.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { makeRng, range, seedFrom } from '@/systems/rng'

const VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec2 iScale;
  attribute float iPhase;

  uniform float uTime;

  varying vec2 vUv;
  varying float vPhase;

  void main() {
    vUv = uv;
    vPhase = iPhase;

    // drift, and wrap so a bank leaving one side reappears on the other
    float drift = mod(iOffset.x + uTime * 1.6 + iPhase * 40.0 + 1400.0, 2800.0) - 1400.0;

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * position.x * iScale.x + up * position.y * iScale.y;

    vec3 world = vec3(drift, iOffset.y, iOffset.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local + world, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uTop;
  uniform vec3 uBelly;
  uniform float uOpacity;
  uniform float uTime;

  varying vec2 vUv;
  varying float vPhase;

  void main() {
    vec2 p = vUv - 0.5;

    // A few overlapping lobes rather than one disc — a single soft circle
    // reads as a smudge, and clouds are lumpy along their tops.
    float d = length(vec2(p.x * 1.0, p.y * 2.3));
    float lobes =
        smoothstep(0.52, 0.16, length(vec2((p.x - 0.22) * 1.5, (p.y - 0.06) * 3.0)))
      + smoothstep(0.52, 0.16, length(vec2((p.x + 0.20) * 1.6, (p.y - 0.02) * 3.2)))
      + smoothstep(0.55, 0.14, length(vec2(p.x * 1.2, (p.y - 0.10) * 2.6)));

    float body = clamp(lobes, 0.0, 1.0) * smoothstep(0.62, 0.30, d);
    if (body < 0.01) discard;

    // bright on top, shaded underneath, which is all the form they need
    float up = smoothstep(-0.25, 0.28, p.y);
    vec3 col = mix(uBelly, uTop, up);

    // edges thin out rather than stopping
    float alpha = body * uOpacity * (0.55 + up * 0.45);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Clouds({ palette }: { palette: SkyPalette }) {
  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom('sky:clouds'))
    /*
      Built for the worst weather, shown according to the sky.

      `instanceCount` is set every frame from the cover reading rather than the
      geometry being rebuilt, which is what makes this free: a clear day draws
      four billboards and an overcast one draws all of them, and neither costs
      an allocation. The order is the order they were dealt, so the sky fills
      in and empties out through the same clouds rather than shuffling.
    */
    const COUNT = 96

    const base = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)

    const offset = new Float32Array(COUNT * 3)
    const scale = new Float32Array(COUNT * 2)
    const phase = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      const angle = rng() * Math.PI * 2
      const distance = range(rng, 300, 900)
      offset[i * 3] = Math.cos(angle) * distance
      offset[i * 3 + 1] = range(rng, 90, 260)
      offset[i * 3 + 2] = Math.sin(angle) * distance
      // wide and shallow, the way weather actually stacks
      const w = range(rng, 150, 380)
      scale[i * 2] = w
      scale[i * 2 + 1] = w * range(rng, 0.28, 0.46)
      phase[i] = rng()
    }

    geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
    geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 2))
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.instanceCount = COUNT
    base.dispose()
    return geo
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        uniforms: {
          uTop: { value: new Color('#ffffff') },
          uBelly: { value: new Color('#b9c3d2') },
          uOpacity: { value: 0.9 },
          uTime: { value: 0 },
        },
      }),
    [],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    const day = Math.min(1, palette.sunIntensity)
    const cover = Math.max(0, Math.min(1, palette.cloud))
    // lit from the same direction as everything else, and dark at night
    u.uTop.value.set(palette.sunColor).multiplyScalar(0.55 + day * 0.5)
    u.uBelly.value.set(palette.skyBottom).multiplyScalar(0.7 + day * 0.25)
    /*
      Overcast is not a lot of little clouds, it is one big flat one.

      So cover does two things at once and they are both necessary: more of
      them, *and* each one heavier. Only raising the count gives a sky full of
      distinct fluffy shapes, which reads as a nice day with a lot of weather
      in it rather than as a grey lid. Only raising the opacity gives four very
      solid clouds and a lot of blue between them.
    */
    u.uOpacity.value = (0.45 + day * 0.45) * (1 + cover * 0.55)
  }, [material, palette])

  /*
    How many of them are up there, which is the sky's own reading.

    Written on the geometry rather than through a uniform because an instance
    that is not drawn costs nothing at all, where one drawn at zero opacity
    still costs a quad and a fragment pass across a third of the screen. A
    clear day should be as cheap as it was before weather existed.
  */
  useEffect(() => {
    const cover = Math.max(0, Math.min(1, palette.cloud))
    const most = geometry.attributes.iPhase.count
    // Never none: a garden with no clouds at all in a blue sky looks unfinished,
    // and a clear reading means "nothing much", not "vacuum".
    geometry.instanceCount = Math.max(8, Math.round(most * (0.18 + cover * 0.82)))
  }, [geometry, palette.cloud])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-7} />
}
