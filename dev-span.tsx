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
import { Color, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { buildMoonbreak, MoonbreakWorld } from '@/world/games/ember-rally/Moonbreak'
import { MOON } from '@/world/games/ember-rally/moonlight'
import { buildTunnel } from '@/world/games/ember-rally/geometry'
import { buildStormcrown, StormcrownWorld } from '@/world/games/ember-rally/Stormcrown'
import { storm } from '@/world/games/ember-rally/weather'
import { deep } from '@/world/games/ember-rally/depth'
import { sunkAt } from '@/world/games/ember-rally/track'
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
import { placeCar, poseGhostWheels, useCarRig } from '@/world/games/ember-rally/rig'
import { buildHarmattan, HarmattanWorld } from '@/world/games/ember-rally/Harmattan'
import { buildNightfall, NightfallWorld } from '@/world/games/ember-rally/Nightfall'
import { NIGHTFALL } from '@/world/games/ember-rally/track'
import { laySurface } from '@/world/games/ember-rally/roadSurface'
import { BoxGeometry } from 'three'

const STAGE = (new URLSearchParams(location.search).get('stage') ?? 'moonbreak') as
  | 'moonbreak'
  | 'rootway'
  | 'stormcrown'
  | 'harmattan'
  | 'nightfall'
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
/**
 * The cars' heading off the road, in radians, and how far apart across it they
 * stand. For looking at the tyres: a car turned across a banked corner is where
 * a wheel placed from the road's notes rather than its drawing shows first.
 */
const YAW = Number(params.get('yaw') ?? 0)
const SPREAD = Number(params.get('spread') ?? 2.4)
/** The body's own roll and heave, as if cornering hard: for looking at the tyres under the arches. */
const ROLL = Number(params.get('roll') ?? 0)
const HEAVE = Number(params.get('heave') ?? 0)

export default function Span() {
  const lights = useMemo(() => createLights(), [])
  const rock = useRockMaterial(lights)
  const chunks = useMemo(() => {
    const built = STAGE === 'moonbreak'
      ? buildMoonbreak(track)
      : STAGE === 'stormcrown'
        ? buildStormcrown(track)
        : STAGE === 'harmattan'
          ? buildHarmattan(track)
          : STAGE === 'nightfall'
            ? buildNightfall(track)
            : buildTunnel(track)
    // So the three cars stand on the drawn deck as the race's would.
    laySurface(track, built)
    return built
  }, [])
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

  // For a headless probe: what the scene is and where the camera stands, so a
  // script can raycast at a pixel and name what it sees.
  useFrame(({ scene, camera }) => {
    ;(window as unknown as { __span: unknown }).__span = { scene, camera, Raycaster, Vector2 }
  })

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
    } else if (STAGE === 'moonbreak') {
      /*
        Same argument as the Stormcrown's: the race blends the Moonbreak's light
        between above the water and under it, and writes the result out to
        `deep` for the glass, the shoals and the silt, which are the only things
        in either road that do not go through the shared light block. A viewer
        that leaves `deep.at` at zero draws the Drowned Mile as a lit plastic
        pipe in open air, which is not what anybody is looking at it to see.
      */
      const drowned = AT + 8 > MOONBREAK.deep.from && AT + 8 < MOONBREAK.deep.to
      const t = params.has('day') || !drowned ? 0 : sunkAt(track, AT + 8)
      lights.uniforms.uAmbient.value.set('#7e889c').lerp(new Color('#2b5763'), t)
      lights.uniforms.uVeinColor.value.set('#24403f').lerp(new Color('#9fe6dc'), t)
      lights.uniforms.uFogColor.value.set('#2a3244').lerp(new Color('#04161c'), t)
      lights.uniforms.uMoonColor.value.set('#b8c6e0').multiplyScalar(1 - t)
      lights.uniforms.uMoonDir.value.copy(MOON).normalize()
      lights.uniforms.uFogNear.value = 62 + (12 - 62) * t
      lights.uniforms.uFogFar.value = 235 + (78 - 235) * t
      deep.at = t
      deep.s = AT
      deep.fog.copy(lights.uniforms.uFogColor.value)
      deep.near = lights.uniforms.uFogNear.value
      deep.far = lights.uniforms.uFogFar.value
    } else if (STAGE === 'harmattan') {
      // The race's open-plain daylight — see `HAZE_*` in `Race`.
      lights.uniforms.uDaylight.value = 1
      lights.uniforms.uSunColor.value.set('#fff0d8')
      lights.uniforms.uSkyColor.value.set('#b8a58c')
      lights.uniforms.uAmbient.value.set('#ad9a82')
      lights.uniforms.uFogColor.value.set('#c9ae8a')
      lights.uniforms.uVeinColor.value.set('#000000')
      lights.uniforms.uStrata.value = 1
      lights.uniforms.uStrataTop.value = 0.8
      lights.uniforms.uFogNear.value = 16
      lights.uniforms.uFogFar.value = 108
    } else if (STAGE === 'nightfall') {
      // The place's own light, as `Race` blends it: `?light=meadow|wellspring|hollow|stars|walk`.
      const which = params.get('light') ?? (AT < NIGHTFALL.meadow.to ? 'meadow' : AT < NIGHTFALL.wellspring.to ? 'wellspring' : AT < NIGHTFALL.hollow.to ? 'hollow' : AT < NIGHTFALL.stars.to ? 'stars' : 'walk')
      const light = {
        meadow: { daylight: 0.85, sun: '#ffb478', sky: '#8d8cae', ambient: '#6e6878', fog: '#9c8890', near: 70, far: 360 },
        wellspring: { daylight: 0.42, sun: '#f2955c', sky: '#6c6d8e', ambient: '#52506a', fog: '#5f5a70', near: 28, far: 170 },
        hollow: { daylight: 0, sun: '#000000', sky: '#000000', ambient: '#8a6a4e', fog: '#241b15', near: 14, far: 90 },
        stars: { daylight: 0, sun: '#000000', sky: '#000000', ambient: '#2e3856', fog: '#0b1020', near: 90, far: 720 },
        walk: { daylight: 0, sun: '#000000', sky: '#000000', ambient: '#33392c', fog: '#0f130d', near: 22, far: 115 },
      }[which as 'meadow'] ?? { daylight: 0.85, sun: '#ffb478', sky: '#8d8cae', ambient: '#6e6878', fog: '#9c8890', near: 70, far: 360 }
      lights.uniforms.uDaylight.value = light.daylight
      lights.uniforms.uSunDir.value.set(-0.55, 0.2, -0.8).normalize()
      lights.uniforms.uSunColor.value.set(light.sun)
      lights.uniforms.uSkyColor.value.set(light.sky)
      lights.uniforms.uAmbient.value.set(light.ambient)
      lights.uniforms.uFogColor.value.set(light.fog)
      lights.uniforms.uFogNear.value = light.near
      lights.uniforms.uFogFar.value = light.far
      lights.uniforms.uVeinColor.value.set('#000000')
      // The lanterns near here, lit as the race lights them.
      let slot = 0
      for (const lantern of track.lanterns) {
        if (lantern.s < AT - 30 || lantern.s > AT + 115 || slot >= 10) continue
        const at = roadAt(track, lantern.s)
        const p = roadPoint(at, lantern.n, lantern.y, new Vector3(), basisAt(at))
        const power = lantern.fire ? 2.2 : lantern.size * 0.85
        lights.lamps[slot * 4] = p.x
        lights.lamps[slot * 4 + 1] = p.y
        lights.lamps[slot * 4 + 2] = p.z
        lights.lamps[slot * 4 + 3] = lantern.fire ? 24 : 2.4 + lantern.size * (lantern.warm > 0.4 ? 7 : 3.4)
        const [r, g, b] = lantern.warm > 0.4 ? [0.95, 0.46, 0.17] : [0.4, 0.5, 0.9]
        lights.lampColors[slot * 3] = r * power
        lights.lampColors[slot * 3 + 1] = g * power
        lights.lampColors[slot * 3 + 2] = b * power
        slot++
      }
      for (; slot < 10; slot++) lights.lamps[slot * 4 + 3] = 0.0001
    } else {
      lights.uniforms.uAmbient.value.set(params.has('day') ? '#9fb3c4' : '#4a5b72')
      lights.uniforms.uFogNear.value = 60
      lights.uniforms.uFogFar.value = 460
    }
    lights.uniforms.uHeadPower.value = params.has('day') || STAGE === 'harmattan' ? 0 : 1
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
      placeCar(rig, track, AT + 6 + i * 16, (i - 1) * SPREAD, YAW, ROLL, 0, HEAVE, 0, false, held.current)
      // And the tyres settled on the drawn road, as a race's would be.
      poseGhostWheels(rig, 0, 0, 0, false, delta, 0)
    })
  })

  return (
    <>
      {STAGE === 'moonbreak' ? <MoonbreakWorld track={track} /> : null}
      {STAGE === 'stormcrown' ? <StormcrownWorld track={track} rock={rock} /> : null}
      {STAGE === 'harmattan' ? <HarmattanWorld track={track} rock={rock} /> : null}
      {STAGE === 'nightfall' ? (
        // No garden here to read, so a garden of the size one might be after a season.
        <NightfallWorld
          track={track}
          rock={rock}
          garden={{
            thoughts: Number(params.get('thoughts') ?? 60),
            memories: Array.from({ length: Number(params.get('memories') ?? 18) }, (_, i) => ({ at: i, tint: ['#8a6f5a', '#5e7a8a', '#9a7a86', '#7d8a5e', '#a08a60'][i % 5] })),
            messages: Number(params.get('messages') ?? 140),
          }}
        />
      ) : null}
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
