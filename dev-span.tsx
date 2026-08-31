/**
 * A window onto any piece of either road, so it can be looked at.
 *
 * ---------------------------------------------------------------------------
 * **The harness for "what does it look like".** Everything else in `scripts/`
 * answers a question in numbers; this one is for the questions that only have
 * an answer on a screen. Three of the problems with the Swaying Span were
 * invisible to every check that passes — trees growing out of a suspension
 * bridge, a road hanging thirty metres over open water on a one-metre skirt,
 * and a floating tree beside it — and all three were obvious within a second
 * of rendering it.
 *
 * The game's own `?stage=&rally=ride&from=` route is better when it can be
 * used, because it shows the real thing in the real light. It cannot be used
 * from a headless browser, because the app is behind a sign-in.
 *
 *   /dev-span.html?stage=moonbreak&s=690&t=2.6&still&back=22&out=-3&up=2.4
 *
 * `s` where to stand along the road, `t` how far into the bridge's swing,
 * `still` to freeze it there, `back`/`out`/`up` to move the camera, `day` for
 * flat bright light instead of the night the road is played in.
 *
 * Not linked from the app and not in the production build — Vite only builds
 * `index.html` — so it costs nothing to keep.
 * ---------------------------------------------------------------------------
 */
import { StrictMode, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { Color, Vector3, type Mesh } from 'three'
import { buildMoonbreak, MoonbreakWorld } from '@/world/games/ember-rally/Moonbreak'
import { buildTunnel } from '@/world/games/ember-rally/geometry'
import { buildStormcrown, StormcrownWorld } from '@/world/games/ember-rally/Stormcrown'
import { storm } from '@/world/games/ember-rally/weather'
import { galeStrengthAt, stormAt } from '@/world/games/ember-rally/track'
import { basisAt, roadPoint } from '@/world/games/ember-rally/geometry'
import { MOONBREAK, makeTrack, roadAt } from '@/world/games/ember-rally/track'
import {
  createLights,
  useBeamMaterial,
  useCarMaterial,
  useRockMaterial,
  useWheelMaterials,
} from '@/world/games/ember-rally/materials'
import { placeCar, useCarRig } from '@/world/games/ember-rally/rig'
import { BoxGeometry } from 'three'

const STAGE = (new URLSearchParams(location.search).get('stage') ?? 'moonbreak') as
  | 'moonbreak'
  | 'rootway'
  | 'stormcrown'
const track = makeTrack(7, STAGE)
const params = new URLSearchParams(location.search)
/** Where along the road to stand, and how far into the swing. */
const AT = Number(params.get('s') ?? MOONBREAK.span.from + 96)
const CLOCK = Number(params.get('t') ?? 3.1)
const MOVING = params.get('still') === null
/** How far off the road, and how far up, to stand. Handy for looking at piers. */
const OUT = Number(params.get('out') ?? -6.4)
const UP = Number(params.get('up') ?? 2.7)
const BACK = Number(params.get('back') ?? 13)

export default function Span() {
  const lights = useMemo(() => createLights(), [])
  const rock = useRockMaterial(lights)
  const chunks = useMemo(
    () =>
      STAGE === 'moonbreak'
        ? buildMoonbreak(track)
        : STAGE === 'stormcrown'
          ? buildStormcrown(track)
          : buildTunnel(track),
    [],
  )
  const held = useRef(CLOCK)
  // Three cars across the deck: the middle of the road and both edges, which is
  // where a car floating off a rolling deck would show it first.
  const beam = useMemo(() => new BoxGeometry(0.1, 0.1, 0.1), [])
  const carMat = useCarMaterial(lights)
  const wheelMats = useWheelMaterials(lights)
  const beamMat = useBeamMaterial(lights)
  const rigs = [
    useCarRig(carMat, wheelMats, beam, beamMat),
    useCarRig(carMat, wheelMats, beam, beamMat),
    useCarRig(carMat, wheelMats, beam, beamMat),
  ]

  const [eye, look] = useMemo(() => {
    const road = roadAt(track, AT - BACK)
    const basis = basisAt(road)
    const from = roadPoint(road, OUT, UP, new Vector3(), basis)
    const ahead = roadAt(track, AT + 14)
    const to = roadPoint(ahead, 0, 1.6, new Vector3(), basisAt(ahead))
    return [from, to]
  }, [])

  useFrame((_, delta) => {
    if (MOVING) held.current += delta
    lights.uniforms.uSway.value.x = held.current
    lights.uniforms.uTime.value = held.current
    // The night the road is actually played in, unless asked for daylight.
    /*
      The road's own light, not a flat one of mine.

      This used to force a single bright ambient and a very long fog on every
      stage, which on the Stormcrown was badly wrong in a way that looked like a
      bug in the road: the race blends three different lighting sets by how far
      up the mountain you are — dark under the storm, blinding white *inside*
      the cloud, deep and long above it — and flattening all three to one made
      the mountainside render as a white sheet. A viewer that lights the world
      differently from the game is a viewer that reports faults the game does
      not have, and hides the ones it does.
    */
    if (STAGE === 'stormcrown') {
      const cloud = storm.inCloud
      const high = storm.above
      const mix3 = (a: number, b: number, c: number) => a + (b - a) * cloud + (c - a) * high
      lights.uniforms.uAmbient.value.set('#4a565e').lerp(new Color('#9aa7ab'), cloud).lerp(new Color('#56657e'), high)
      lights.uniforms.uFogColor.value.set('#1b2327').lerp(new Color('#b9c3c4'), cloud).lerp(new Color('#0b1220'), high)
      lights.uniforms.uFogNear.value = mix3(14, 5, 34)
      lights.uniforms.uFogFar.value = mix3(60, 32, 900)
    } else {
      lights.uniforms.uAmbient.value.set(params.has('day') ? '#9fb3c4' : '#4a5b72')
      lights.uniforms.uFogNear.value = 60
      lights.uniforms.uFogFar.value = 460
    }
    lights.uniforms.uHeadPower.value = params.has('day') ? 0 : 1
    // Otherwise they stay at the world origin, lighting the start line from
    // wherever the camera happens to be parked.
    lights.headLeft.copy(eye)
    lights.headRight.copy(eye)
    lights.spot.copy(eye)
    lights.headDir.copy(look).sub(eye).normalize()
    if (STAGE === 'stormcrown') {
      /*
        The race writes `storm` once a frame and nothing is racing here, so this
        stands in for it — at the height and exposure of wherever the camera is
        parked, which is the whole point of being able to park it anywhere.
      */
      const where = roadAt(track, AT)
      const sky = stormAt(track, AT)
      storm.s = AT
      storm.speed = 30
      storm.inCloud = sky.inCloud
      storm.above = sky.above
      // ?rain= forces the drop count up, because 540 drops spread over a box
      // 120 metres wide are too sparse to read a slant off in a still frame.
      storm.rain = params.has('rain')
        ? Number(params.get('rain'))
        : Math.max(0.15, 1 - sky.above) * (0.5 + sky.inCloud * 0.5)
      storm.wind = galeStrengthAt(where, AT, held.current)
    }
    rigs.forEach((rig, i) => {
      placeCar(rig, track, AT + 6 + i * 16, (i - 1) * 2.4, 0, 0, 0, 0, 0, false, held.current)
    })
  })

  return (
    <>
      {STAGE === 'moonbreak' ? <MoonbreakWorld track={track} /> : null}
      {STAGE === 'stormcrown' ? <StormcrownWorld track={track} /> : null}
      {chunks.map((chunk, i) => (
        <mesh
          key={i}
          geometry={chunk.geometry}
          material={rock}
          frustumCulled={false}
          ref={(node: Mesh | null) => {
            if (node) node.position.set(0, 0, 0)
          }}
        />
      ))}
      {rigs.map((rig, i) => (
        <primitive key={i} object={rig.root} />
      ))}
      <perspectiveCamera />
      <Rig eye={eye} look={look} />
    </>
  )
}

function Rig({ eye, look }: { eye: Vector3; look: Vector3 }) {
  useFrame(({ camera }) => {
    camera.position.copy(eye)
    camera.lookAt(look)
  })
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Canvas camera={{ fov: 52, near: 0.3, far: 3000 }} gl={{ antialias: true }}>
      <Span />
    </Canvas>
  </StrictMode>,
)
