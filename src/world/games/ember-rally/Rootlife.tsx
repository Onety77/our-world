/**
 * What moves in the Rootway's air.
 *
 * ---------------------------------------------------------------------------
 * The race already puts two things in the air — dust left hanging where it was
 * spawned, and drips off the wet roof — and both belong to the car: they are
 * made where the car is going to be and they read as speed. Neither says what
 * the *cave* is like with nobody in it.
 *
 * Three things that do:
 *
 *   **spores**, pale and slow, hanging in the air everywhere and thickest in
 *   the chambers, drifting upward as warm air does in rock;
 *
 *   **embers** near the fire — keyed to how much flame there is around this
 *   metre of road, which `tunnel.ts` already knows for the ear, so the eye and
 *   the ear agree about where the fire is;
 *
 *   **a column of sparks** going up off both hearths, the one you leave and the
 *   one you come home to, so the fire at the end of the road is visible as a
 *   rising light long before its flames are.
 *
 * Two point clouds and two small instanced meshes, and the clouds are drawn at a
 * size of nought wherever their amount is.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { useQuality } from '../../../systems/quality'
import { basisAt, roadPoint } from './geometry'
import { random } from './model'
import { fieldAt, fireField, tunnel } from './tunnel'
import { emptyRoad, roadAt, type Track } from './track'

/** A cloud of seeds for points held in a box that wraps round the camera. */
function cloud(count: number, seed: number): BufferGeometry {
  const rng = random(seed)
  const data = new Float32Array(count * 3)
  for (let i = 0; i < data.length; i++) data[i] = rng()
  const geometry = new BufferGeometry()
  geometry.setAttribute('aSeed', new BufferAttribute(data, 3))
  // Points are counted off `position`, which the shaders never read.
  geometry.setAttribute('position', new BufferAttribute(data.slice(), 3))
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

const SPORE_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uAt;
  uniform float uAmount;
  uniform float uPixel;
  varying float vGlow;
  void main() {
    vec3 box = vec3(40.0, 8.0, 40.0);
    vec3 p = aSeed * box;
    p.y += uTime * (0.06 + aSeed.z * 0.1);
    p.x += sin(uTime * 0.21 + aSeed.y * 30.0) * 0.8;
    p.z += cos(uTime * 0.17 + aSeed.x * 30.0) * 0.8;
    vec3 world = uAt + mod(p - uAt, box) - box * 0.5;
    vec4 view = viewMatrix * vec4(world, 1.0);
    float away = length(view.xyz);
    vGlow = uAmount * (1.0 - smoothstep(14.0, 24.0, away)) * smoothstep(1.5, 4.0, away) * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed.x * 50.0));
    gl_PointSize = vGlow > 0.001 ? min((1.5 + aSeed.y * 1.8) * (14.0 / max(1.5, -view.z)), 4.0) * uPixel : 0.0;
    gl_Position = projectionMatrix * view;
  }
`

const SPORE_FRAG = /* glsl */ `
  precision highp float;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(0.30, 0.52, 0.48) * pow(1.0 - r, 2.0) * vGlow * 0.55, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const EMBER_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uAt;
  uniform float uAmount;
  uniform float uPixel;
  varying float vGlow;
  void main() {
    vec3 box = vec3(26.0, 7.0, 26.0);
    vec3 p = aSeed * box;
    p.y += uTime * (0.7 + aSeed.z * 0.9);
    p.x += sin(uTime * 1.7 + aSeed.y * 40.0) * 0.35;
    p.z += cos(uTime * 1.3 + aSeed.x * 40.0) * 0.35;
    vec3 world = uAt + mod(p - uAt, box) - box * 0.5;
    vec4 view = viewMatrix * vec4(world, 1.0);
    float away = length(view.xyz);
    float life = fract(uTime * (0.25 + aSeed.x * 0.3) + aSeed.z);
    vGlow = uAmount * sin(life * 3.14159) * (1.0 - smoothstep(12.0, 20.0, away)) * smoothstep(2.0, 5.0, away);
    gl_PointSize = vGlow > 0.001 ? min((1.8 + aSeed.y * 2.2) * (14.0 / max(1.5, -view.z)), 5.0) * uPixel : 0.0;
    gl_Position = projectionMatrix * view;
  }
`

const EMBER_FRAG = /* glsl */ `
  precision highp float;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(1.0, 0.46, 0.12) * pow(1.0 - r, 1.6) * vGlow * 1.5, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Sparks up off a hearth: billboards rising, drifting and going out. */
const COLUMN_VERT = /* glsl */ `
  attribute vec3 iSeed;
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform float uHeight;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    vUv = uv;
    float t = fract(uTime * (0.16 + iSeed.x * 0.14) + iSeed.y);
    vLife = sin(t * 3.14159) * (1.0 - t * 0.4);
    vec3 centre = uOrigin + vec3(
      sin(uTime * 0.9 + iSeed.z * 20.0) * (0.3 + t * 1.4),
      t * uHeight,
      cos(uTime * 0.7 + iSeed.x * 20.0) * (0.3 + t * 1.4)
    );
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float size = (0.05 + iSeed.z * 0.07) * (1.0 - t * 0.6);
    vec3 world = centre + (right * position.x + up * position.y) * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const COLUMN_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float glow = pow(1.0 - r, 1.5) * vLife;
    gl_FragColor = vec4(vec3(1.0, 0.52, 0.16) * glow * 2.2, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function sparkColumn(count: number, seed: number): InstancedBufferGeometry {
  const rng = random(seed)
  const base = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))
  geometry.setAttribute('uv', base.getAttribute('uv'))
  const data = new Float32Array(count * 3)
  for (let i = 0; i < data.length; i++) data[i] = rng()
  geometry.setAttribute('iSeed', new InstancedBufferAttribute(data, 3))
  geometry.instanceCount = count
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  base.dispose()
  return geometry
}

export function Rootlife({ track }: { track: Track }) {
  const tier = useQuality((q) => q.tier)
  const share = tier === 'low' ? 0.5 : tier === 'medium' ? 0.8 : 1
  const spores = useMemo(() => cloud(Math.round(240 * share), 0x5b07e), [share])
  const embers = useMemo(() => cloud(Math.round(100 * share), 0xe3be7), [share])
  const column = useMemo(() => sparkColumn(Math.round(48 * share), 0x4ea7), [share])
  const fire = useMemo(() => fireField(track), [track])

  const hearths = useMemo(() => {
    const road = emptyRoad()
    return track.hearths.map((hearth) => {
      roadAt(track, hearth.s, road)
      return roadPoint(road, hearth.n, 0.4, new Vector3(), basisAt(road))
    })
  }, [track])

  const materials = useMemo(
    () => ({
      spore: new ShaderMaterial({
        vertexShader: SPORE_VERT,
        fragmentShader: SPORE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAt: { value: new Vector3() }, uAmount: { value: 0 }, uPixel: { value: 1 } },
      }),
      ember: new ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAt: { value: new Vector3() }, uAmount: { value: 0 }, uPixel: { value: 1 } },
      }),
    }),
    [],
  )
  const columns = useMemo(
    () =>
      hearths.map(
        (at, i) =>
          new ShaderMaterial({
            vertexShader: COLUMN_VERT,
            fragmentShader: COLUMN_FRAG,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            uniforms: {
              uTime: { value: i * 7.3 },
              uOrigin: { value: at },
              // The one you come back to reaches higher, like its flames.
              uHeight: { value: i === hearths.length - 1 ? 9 : 6 },
            },
          }),
      ),
    [hearths],
  )

  useEffect(() => () => spores.dispose(), [spores])
  useEffect(() => () => embers.dispose(), [embers])
  useEffect(() => () => column.dispose(), [column])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])
  useEffect(() => () => columns.forEach((m) => m.dispose()), [columns])

  const clock = useRef(0)
  useFrame((state, delta) => {
    const step = Math.min(0.05, delta)
    clock.current += step
    const camera = state.camera.position
    const pixel = state.gl.getPixelRatio()

    const spore = materials.spore.uniforms
    spore.uTime.value = clock.current
    spore.uAt.value.copy(camera)
    spore.uPixel.value = pixel
    // Everywhere a little, and the open rooms a lot.
    spore.uAmount.value = 0.35 + (1 - tunnel.enclosed) * 0.65

    const ember = materials.ember.uniforms
    ember.uTime.value = clock.current
    ember.uAt.value.copy(camera)
    ember.uPixel.value = pixel
    /*
      Only where the fire is really thick. Fire lanterns stand on every corner,
      so at full weight the field is warm for most of the road and the embers
      were in every frame — sparks everywhere reads as the car being on fire.
      Squared, so the hearths and a corner hung with several fires get them and
      a single lantern on a straight does not.
    */
    const heat = Math.min(1, fieldAt(fire, tunnel.s))
    ember.uAmount.value = heat * heat * 0.9

    for (const material of columns) material.uniforms.uTime.value += step
  })

  return (
    <>
      <points geometry={spores} material={materials.spore} frustumCulled={false} renderOrder={4} />
      <points geometry={embers} material={materials.ember} frustumCulled={false} renderOrder={4} />
      {columns.map((material, i) => (
        <mesh key={i} geometry={column} material={material} frustumCulled={false} renderOrder={4} />
      ))}
    </>
  )
}
