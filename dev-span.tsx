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
import { Vector3, type Mesh } from 'three'
import { buildMoonbreak, MoonbreakWorld } from '@/world/games/ember-rally/Moonbreak'
import { buildTunnel } from '@/world/games/ember-rally/geometry'
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

const STAGE = (new URLSearchParams(location.search).get('stage') ?? 'moonbreak') as 'moonbreak' | 'rootway'
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
  const chunks = useMemo(() => (STAGE === 'moonbreak' ? buildMoonbreak(track) : buildTunnel(track)), [])
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
    lights.uniforms.uAmbient.value.set(params.has('day') ? '#9fb3c4' : '#4a5b72')
    lights.uniforms.uFogNear.value = 60
    lights.uniforms.uFogFar.value = 460
    lights.uniforms.uHeadPower.value = params.has('day') ? 0 : 1
    rigs.forEach((rig, i) => {
      placeCar(rig, track, AT + 6 + i * 16, (i - 1) * 2.4, 0, 0, 0, 0, 0, false, held.current)
    })
  })

  return (
    <>
      {STAGE === 'moonbreak' ? <MoonbreakWorld track={track} /> : null}
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
