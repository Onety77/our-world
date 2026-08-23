/**
 * The ground, which is now endless.
 *
 * A fixed plane follows the camera and is displaced in the vertex shader by the
 * same height function the grass and your feet use. Snapped to the vertex grid
 * as it moves, so the sampling pattern never slides and the hills stay put
 * while you walk over them.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { TERRAIN_GLSL } from './terrainShader'
import { sunDirection } from './water'

/** Big enough that its edge is always far inside the fog. */
const SIZE = 620
const SEGMENTS = 200
const STEP = SIZE / SEGMENTS

const VERT = /* glsl */ `
  ${TERRAIN_GLSL}

  varying float vDepth;
  varying float vHeight;
  varying vec2 vWorld;
  varying vec3 vNormal;

  void main() {
    // The plane is laid flat by its own matrix, so this comes back as real
    // world coordinates — which is exactly what the height function wants.
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float h = gardenHeight(wp.xz);
    wp.y = h;

    /*
      The surface normal, by finite difference on the height function itself.

      The ground had none at all: it was tinted by *altitude*, so a hillside
      facing the sun and one facing away from it were the same colour at the
      same height, and the meadow read as a flat green sheet with soft stains
      on it. Slope is what makes rolling ground look rolled. Two extra
      evaluations of a handful of sines, once per vertex.

      The step is a metre and a half — wide enough to skip the fine ripple in
      the height function, which at this mesh density is below what a vertex
      can resolve anyway and only produces noise in the shading.
    */
    float e = 1.5;
    float hx = gardenHeight(wp.xz + vec2(e, 0.0)) - gardenHeight(wp.xz - vec2(e, 0.0));
    float hz = gardenHeight(wp.xz + vec2(0.0, e)) - gardenHeight(wp.xz - vec2(0.0, e));
    vNormal = normalize(vec3(-hx, 2.0 * e, -hz));

    vHeight = h;
    vWorld = wp.xz;

    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uGround;
  uniform vec3 uGrass;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uSun;
  uniform vec3 uSunDir;

  varying float vDepth;
  varying float vHeight;
  varying vec2 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 col = uGround;

    // dips read damper and cooler, rises catch more light
    col *= 0.95 + smoothstep(-2.0, 2.0, vHeight) * 0.16;

    /*
      Broad dry and mossy patches at two scales, so it never reads as one flat
      colour. ('patch' is a reserved word in GLSL ES 3.0 — hence the name.)

      The second term is the one that matters. The first two run on periods of
      a hundred and seventy and three hundred metres, which from ground level
      is a gradient rather than a feature; the meadow needed something at the
      scale of a dozen paces before it started reading as ground you could
      walk over.
    */
    float mottle = sin(vWorld.x * 0.037) * cos(vWorld.y * 0.031)
                 + sin((vWorld.x + vWorld.y) * 0.019 + 1.7) * 0.6;
    float near = sin(vWorld.x * 0.13 + 0.9) * cos(vWorld.y * 0.115 - 0.4)
               + sin((vWorld.x - vWorld.y) * 0.078 + 2.6) * 0.55;
    col *= 0.94 + mottle * 0.08 + near * 0.05 * (1.0 - smoothstep(40.0, 170.0, vDepth));

    /*
      Slope lighting. Half the reason the ground now has shape.

      Kept gentle and lifted well off zero: this is a soft overcast-ish world
      and a hard lambert term would put black shadow down every north face and
      wreck the calm the whole art direction is built on.
    */
    float lambert = max(0.0, dot(normalize(vNormal), normalize(uSunDir)));
    col *= 0.82 + lambert * 0.34 * (0.35 + uSun * 0.65);

    // Turf. The 3D blades only cover the ground near you; without this the
    // meadow would end at a visible circle. Low frequency on purpose —
    // anything with a period under a few metres aliases into horizontal bands
    // when the ground is viewed at a shallow angle, which is nearly always.
    float turf = sin(vWorld.x * 0.44) * sin(vWorld.y * 0.53)
               + sin(vWorld.x * 0.21 + 2.0) * sin(vWorld.y * 0.27 - 1.0) * 0.7;
    float detailFade = 1.0 - smoothstep(20.0, 90.0, vDepth);
    float colourFade = 1.0 - smoothstep(60.0, 220.0, vDepth);
    vec3 turfColor = mix(col, uGrass, 0.55);
    col = mix(col, turfColor, (0.45 + turf * 0.4 * detailFade) * colourFade);

    col = mix(col, col * uSunColor * 1.1, 0.18 * uSun);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Ground({ palette }: { palette: SkyPalette }) {
  const mesh = useRef<Mesh>(null)

  const geometry = useMemo(
    () => new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS),
    [],
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: DoubleSide,
        uniforms: {
          uGround: { value: new Color('#4b5340') },
          uGrass: { value: new Color('#a7ab72') },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
          uSunDir: { value: new Vector3(0.3, 0.8, -0.3) },
        },
      }),
    [],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uGround.value.set(palette.ground)
    u.uGrass.value.set(palette.grassTip)
    u.uFogColor.value.set(palette.fogColor)
    u.uSunColor.value.set(palette.sunColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar * 1.4
    // The same arc the sun disc rides, so the hills are lit from where the
    // light visibly is rather than from a direction picked to look nice.
    const [sx, sy, sz] = sunDirection(palette.hour)
    u.uSunDir.value.set(sx, sy, sz)
    u.uSun.value = Math.min(1, palette.sunIntensity)
  }, [material, palette])

  useFrame(({ camera }) => {
    if (!mesh.current) return
    // Snap to the vertex spacing. Following the camera smoothly would slide the
    // sampling points between vertices and make every hill crawl and shimmer.
    mesh.current.position.x = Math.round(camera.position.x / STEP) * STEP
    mesh.current.position.z = Math.round(camera.position.z / STEP) * STEP
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    />
  )
}
