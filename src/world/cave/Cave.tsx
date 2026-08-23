/**
 * The cave under the Hollow.
 *
 * Stepping into the fire brings you here: an actual room, not a dimmed meadow.
 * Rock closing overhead, one fire in the middle of the floor, embers climbing,
 * and whatever game is being played laid out in the light of it.
 *
 * It lives at the origin of its own private space — when the cave renders, the
 * garden doesn't, so there is nothing to collide with and no fog to inherit.
 * The camera is the cave's own: a slow drift around the fire, framing the
 * space while the game itself lives in the DOM above.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  FrontSide,
  type Side,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { Fire } from '@/world/Fire'

/** Radius of the room, metres. */
const ROOM = 14

/**
 * Small fires set back against the walls.
 *
 * Deliberately not evenly spaced and not all the same size — a ring of equal
 * lights at equal angles reads as installed rather than as lit. Three to the
 * left and two to the right, which is not a mistake.
 *
 * **None of them ever crosses the middle of the screen**, and that is the
 * whole constraint. A board is drawn across the centre, and the camera drifts
 * through about forty degrees, so "off to the side" is not something that can
 * be judged by eye from one position: a hearth placed at the far wall looked
 * fine until the drift swung it straight behind the tiles.
 *
 * These were solved for rather than chosen — projected through the camera at
 * every angle it reaches, and kept only if they stay clear of the middle at
 * all of them. Two sit off to the right, two off to the left, and the fifth is
 * behind you the whole time and exists only to light the near floor.
 */
const HEARTHS: { at: [number, number, number]; size: number }[] = [
  { at: [9.4, 0.15, 0.6], size: 1 },
  { at: [8.2, 0.15, 3.4], size: 0.68 },
  { at: [-0.9, 0.15, -9.2], size: 0.92 },
  { at: [-3.4, 0.15, -10.4], size: 0.6 },
  // Behind the camera at every angle. Pure light, never seen — it is what
  // stops the near floor and the wall at your back going to nothing.
  { at: [-8.0, 0.15, 5.5], size: 0.75 },
]

const HEARTH_COUNT = HEARTHS.length

// ---------------------------------------------------------------------------
// Rock
// ---------------------------------------------------------------------------

const ROCK_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Lit from the walls, not from the middle.
 *
 * There used to be one big fire in the centre of the room and it was the whole
 * lighting model. It was also sitting directly behind everything you came here
 * to look at: a game board is drawn over the middle of the screen, and a bright
 * column of flame behind it showed straight through the tiles.
 *
 * So the light comes from several small hearths set back against the rock
 * instead. The middle of the room is the darkest part of it now, which is both
 * what the game needed and, as it turns out, what a cave actually looks like —
 * you sit at the edges where the fires are and the floor between them is dim.
 *
 * Each hearth is its own point with its own falloff and its own flicker, so the
 * folds of the rock still answer to them one at a time.
 */
const ROCK_FRAG = /* glsl */ `
  precision mediump float;

  #define HEARTHS ${HEARTH_COUNT}

  uniform vec3 uFires[HEARTHS];
  uniform float uFlickers[HEARTHS];
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 rock = vec3(0.23, 0.19, 0.16);
    vec3 fire = vec3(1.0, 0.62, 0.3);

    // a whisper of cool from above, so the shadowed side is blue-dark rather
    // than void — pure black reads as "nothing drawn here"
    float up = clamp(vNormal.y * -0.5 + 0.5, 0.0, 1.0);
    // A little more floor than before. Dark is the point; a black void where
    // the ground should be is not — it reads as nothing having been drawn.
    vec3 col = rock * 0.09 + vec3(0.05, 0.06, 0.09) * up * 0.4;

    for (int i = 0; i < HEARTHS; i++) {
      vec3 toFire = uFires[i] - vWorld;
      float d = length(toFire);
      float lambert = clamp(dot(normalize(toFire), normalize(vNormal)), 0.0, 1.0);
      /*
        A steep falloff, on purpose.

        Five lights summed across a room add up fast: at a gentle falloff the
        whole cave came out an evenly lit sandstone hall, which is the opposite
        of the point. This gives each hearth a pool of its own a few metres
        across and leaves the rest of the room dark — so the fires read as
        small fires rather than as one big light with a texture on it.
      */
      float fall = 1.0 / (1.0 + d * d * 0.28);
      col += rock * fire * lambert * fall * 4.6 * uFlickers[i];
    }

    // grain, from the world position, so it doesn't swim when the camera moves
    float g = fract(sin(dot(floor(vWorld * 7.0).xy + floor(vWorld * 7.0).z, vec2(12.9898, 78.233))) * 43758.5453);
    col *= 0.92 + g * 0.16;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function useRockMaterial(side: Side = FrontSide) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ROCK_VERT,
        fragmentShader: ROCK_FRAG,
        side,
        uniforms: {
          uFires: { value: HEARTHS.map((h) => new Vector3(...h.at)) },
          uFlickers: { value: HEARTHS.map(() => 1) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(Math.random() * 10)
  useFrame((_, delta) => {
    t.current += delta
    const flickers = material.uniforms.uFlickers.value as number[]
    for (let i = 0; i < HEARTHS.length; i++) {
      // Each on its own beat, or five fires pulsing in unison read as one
      // light with a wobble rather than as five separate flames.
      const own = t.current * (1 + i * 0.17) + i * 2.1
      flickers[i] =
        (0.82 + Math.sin(own * 7.3) * 0.09 + Math.sin(own * 13.7 + i) * 0.07) *
        HEARTHS[i].size
    }
  })
  return material
}

/** A hash the shape of the dome is grown from — stable across renders. */
function bump(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/**
 * The room: one icosahedron turned inside out and kneaded.
 *
 * Displacing each vertex along its normal by layered hash noise turns the
 * perfect sphere into something dug rather than built. The floor is the same
 * mesh — vertices below waist height get flattened toward y=0, so the walls
 * grow out of the ground with no seam to hide.
 */
function Room() {
  // We are inside this mesh, so it renders its back faces — and the normals
  // are flipped below so they point *into* the room, or the fire's lambert
  // term would light the outside of a rock nobody can see and leave the
  // inside black.
  const material = useRockMaterial(BackSide)

  const geometry = useMemo(() => {
    const geo = new IcosahedronGeometry(ROOM, 4)
    const pos = geo.attributes.position as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)

      // knead the sphere: three octaves of hash, displacing along the radius
      const n =
        bump(x * 0.11, y * 0.11, z * 0.11) * 2.2 +
        bump(x * 0.31, y * 0.31, z * 0.31) * 1.0 +
        bump(x * 0.83, y * 0.83, z * 0.83) * 0.45
      const r = Math.hypot(x, y, z) || 1
      const k = 1 + (n - 1.8) * 0.14
      x = (x / r) * ROOM * k
      y = (y / r) * ROOM * k
      z = (z / r) * ROOM * k

      // press the lower half into a floor, keeping the kneaded unevenness
      if (y < 0.4) {
        const under = Math.min(1, (0.4 - y) / (ROOM * 0.6))
        y = y * (1 - under) + (n - 1.8) * 0.22 * under
      }

      pos.setXYZ(i, x, y, z)
    }
    geo.computeVertexNormals()
    const normals = geo.attributes.normal as BufferAttribute
    for (let i = 0; i < normals.count; i++) {
      normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i))
    }
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return <mesh geometry={geometry} material={material} scale={[1, 0.62, 1]} />
}

// ---------------------------------------------------------------------------
// Embers
// ---------------------------------------------------------------------------

const EMBER_COUNT = 42

const EMBER_VERT = /* glsl */ `
  attribute float iPhase;
  attribute float iDrift;
  uniform float uTime;
  varying float vLife;

  void main() {
    // each ember loops its own climb; vLife runs 0 at the coals to 1 gone
    float t = fract(uTime * 0.09 + iPhase);
    vLife = t;

    float wobble = sin(uTime * 1.7 + iPhase * 40.0) * (0.2 + t * 0.5);
    vec3 at = vec3(
      wobble + iDrift * t * 2.6,
      0.3 + t * 6.5,
      cos(uTime * 1.3 + iPhase * 31.0) * (0.15 + t * 0.4)
    );

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    float size = 0.05 * (1.0 - t * 0.6);
    vec3 local = right * position.x * size + up * position.y * size;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(local + at, 1.0);
  }
`

const EMBER_FRAG = /* glsl */ `
  precision mediump float;
  varying float vLife;
  void main() {
    float a = (1.0 - vLife) * (1.0 - vLife) * 0.85;
    if (a < 0.02) discard;
    vec3 col = mix(vec3(1.0, 0.75, 0.35), vec3(0.8, 0.25, 0.08), vLife);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Embers({ at }: { at: [number, number, number] }) {
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)
    const phase = new Float32Array(EMBER_COUNT)
    const drift = new Float32Array(EMBER_COUNT)
    for (let i = 0; i < EMBER_COUNT; i++) {
      phase[i] = (i * 0.618034) % 1
      drift[i] = ((i * 2654435761) % 200) / 100 - 1
    }
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.setAttribute('iDrift', new InstancedBufferAttribute(drift, 1))
    geo.instanceCount = EMBER_COUNT
    base.dispose()
    return geo
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return (
    <group position={at}>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Standing stones — the cave's furniture, lit by the same fire
// ---------------------------------------------------------------------------

function Stones() {
  const material = useRockMaterial()

  /*
    Stones round the hearths, and nothing standing in the middle.

    They used to ring the centre, which is where the fire was and where the
    board now is. A few round each little fire reads as somewhere people sit;
    the floor between them stays clear.
  */
  const stones = useMemo(() => {
    const out: { pos: [number, number, number]; scale: [number, number, number]; rot: number }[] = []
    HEARTHS.forEach((hearth, h) => {
      const many = 3 + (h % 2)
      for (let i = 0; i < many; i++) {
        const golden = (h * 5 + i) * 2.399963
        const r = 1.1 + ((i * 37) % 26) / 30
        const s = (0.34 + ((i * 61) % 30) / 60) * hearth.size
        out.push({
          pos: [
            hearth.at[0] + Math.cos(golden) * r,
            s * 0.45,
            hearth.at[2] + Math.sin(golden) * r,
          ],
          scale: [s * 1.25, s * (1.0 + ((i * 13) % 10) / 10), s],
          rot: golden * 2,
        })
      }
    })
    return out
  }, [])

  return (
    <>
      {stones.map((s, i) => (
        <mesh key={i} material={material} position={s.pos} scale={s.scale} rotation={[0, s.rot, 0]}>
          <icosahedronGeometry args={[1, 1] as [number, number]} />
        </mesh>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// The cave's own camera
// ---------------------------------------------------------------------------

function CaveCamera() {
  const { camera } = useThree()
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    // a very slow drift around the fire — enough that the room feels held by a
    // hand rather than clamped, never enough to distract from the game
    const angle = Math.sin(t.current * 0.05) * 0.35 + Math.PI * 0.75
    const r = 7.2
    camera.position.set(
      Math.cos(angle) * r,
      2.4 + Math.sin(t.current * 0.11) * 0.15,
      Math.sin(angle) * r,
    )
    camera.lookAt(0, 1.1, 0)
  })

  return null
}

// ---------------------------------------------------------------------------

export default function Cave() {
  return (
    <>
      <color attach="background" args={['#0a0705']} />
      <CaveCamera />
      <Room />
      <Stones />

      {/*
        Five small fires against the walls instead of one in the middle.

        The middle of this room is where everything you came here for gets
        drawn — the row of games, a board, a keyboard. A flame behind all of
        that showed straight through it. Lighting the room from its edges is
        both what the game needed and what a cave is actually like.
      */}
      {HEARTHS.map((hearth, i) => (
        <Fire
          key={i}
          position={hearth.at}
          height={0.85 * hearth.size}
          width={0.5 * hearth.size}
          intensity={2.6 * hearth.size}
          lightDistance={ROOM * 1.1}
          night={1}
        />
      ))}

      {/* Only the two biggest throw anything up — embers off all five would
          put drifting motes back across the middle of the screen. */}
      <Embers at={HEARTHS[0].at} />
      <Embers at={HEARTHS[2].at} />
    </>
  )
}
