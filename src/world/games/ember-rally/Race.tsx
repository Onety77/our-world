/**
 * The Rootway, as a place.
 *
 * This mounts *inside the garden's own Canvas*, in place of whatever section
 * was on screen, and takes the camera. Everything you can see while racing is
 * built here: the tunnel, the car, hers, the lamps, the dust, and the two
 * cones of light the whole thing is rendered from.
 *
 * Per-frame work never touches React. One `useFrame`, imperative reads, direct
 * writes to object transforms and shader uniforms — the same law the rest of
 * the garden runs on, and the reason a forty-five second race at sixty frames
 * a second does not stutter.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  Vector3,
  type PerspectiveCamera,
  type ShaderMaterial,
} from 'three'
import { Fire } from '@/world/Fire'
import { ambience, type EngineVoice } from '@/systems/ambience'
import { useQuality } from '@/systems/quality'
import { AXLE_FRONT, AXLE_HALF_TRACK, AXLE_REAR, WHEEL_RADIUS } from './car'
import { ChaseCamera, planShots, type Shot } from './camera'
import { attachControls, type RallyControls } from './controls'
import { spiritDriver } from './spirit'
import {
  flatBasis,
  placeCar,
  poseGhostWheels,
  poseWheels,
  MESH_FOR_WHEEL,
  shotBasis,
  shotRoad,
  useCarRig,
  type CarRig,
} from './rig'
import { CarStudio, STUDIO } from './Studio'
import { basisAt, buildTrail, buildTunnel, roadPoint } from './geometry'
import { buildMoonbreak, MoonbreakWorld } from './Moonbreak'
import { buildStormcrown, StormcrownWorld } from './Stormcrown'
import { deep } from './depth'
import { storm } from './weather'
import { enclosureOf, tunnel } from './tunnel'
import { setRaceMusic, type RaceMusicState } from './roadMusic'
import { RootwaySound } from './RootwaySound'
import {
  LAMP_SLOTS,
  createLights,
  useBeamMaterial,
  useCarMaterial,
  type Whose,
  useDustMaterial,
  useGlowMaterial,
  useRockMaterial,
  useMarkMaterial,
  useTrailMaterial,
  useWheelMaterials,
  type RallyLights,
} from './materials'
import { runAt, runDurationMs, type RunSample } from './model'
import {
  packCar,
  Recorder,
  advanceCar,
  createCar,
  lockupOf,
  scrubOf,
  slipOf,
  speedOf,
  vergeWidth,
  wheelspinOf,
  type CarInput,
  type CarState,
} from './physics'
import { TUNE } from './tuning'
import {
  BLUE_SPARK,
  EXHAUST_HAZE,
  GHOST_GRIT,
  GRIT,
  HOT_SPARK,
  DRIP,
  LOOSE_EARTH,
  MOTE,
  NITRO_CORE,
  NITRO_FLAME,
  Particles,
  SMOKE,
  SPARK,
  WET_GRIT,
} from './particles'
import { MARK_LIFE, Marks } from './marks'
import { useData } from '@/data/provider'
import { otherUser } from '@/data/types'
import { readSitting } from '@/systems/lobby'
import { keepRallyDiagnostics } from '@/systems/rallyDiagnostics'
import { useRace, type RaceSession } from './session'
import {
  KEEPALIVE_MS,
  Rolling,
  readCar,
  readClock,
  stamp,
  writeCar,
  type RollingSample,
} from './wire'
import {
  emptyRoad,
  galeStrengthAt,
  roadAt,
  roadAtRoute,
  type Track,
  sunkAt,
  stormAt,
} from './track'

/** Seconds of lamps coming up before the road opens. */
const COUNTDOWN = 3.1

/**
 * The fraction of top speed the frame starts closing in at.
 *
 * A third, so half the speedometer passes before anything happens at all and
 * the effect belongs to the top of the range where it is telling the truth.
 * Below this it is exactly zero — a vignette that is always slightly on is
 * just a darker game.
 */
const RUSH_FROM = 0.34

/**
 * Grains of sand a second off the back of the car, flat out on the loosest road.
 *
 * Low on purpose. This is the thin trail that says the tyres are touching the
 * ground, not a rally car on a gravel special — and everything else that throws
 * dust (the drift, the verge, the wheelspin) is still there on top of it.
 */
const SAND_RATE = 26

/**
 * How high the air goes, in metres above the road.
 *
 * The band a driver looks through. Above this a mote is weather rather than
 * speed: it never crosses the frame, it just sits there being slightly grey.
 */
const MOTE_CEILING = 4.2

/**
 * `?rally=ride` hands your car to the fire-spirit and lets it drive.
 *
 * For looking at the road, not for playing: the whole tunnel end to end, the
 * same way every time, without anybody having to be good at the game. Same
 * argument as `?hour=` and `?section=` in the garden.
 */
const RIDE =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('rally') === 'ride'
const ROOTWAKE_RIDE =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shortcut') === '1'
/**
 * `?rootwake=mouth` and `?rootwake=exit` hold the car at either end of the
 * hidden road, engine off, so both joins can be looked at without driving to
 * them. They were called `?veil=` when there was something growing across the
 * entrance; there is not any more — see the note on the mouth in `geometry`.
 */
const ROOTWAKE_MOUTH_HOLD =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('rootwake') === 'mouth'
const ROOTWAKE_EXIT_HOLD =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('rootwake') === 'exit'

/**
 * `?from=<metres>` stands the car that far up the road before the flag drops.
 *
 * For looking at *part* of the tunnel. The road is fourteen hundred metres
 * long and the software renderer the screenshots run on takes seconds a frame,
 * so reviewing the last forty metres of it by driving there is not a plan —
 * the same reason `?rally=studio&at=` exists rather than waiting for a
 * turntable to come round to the angle you wanted. Pairs with `?rally=ride`:
 * the spirit picks the car up from wherever it has been put down.
 */
const FROM = (() => {
  if (typeof location === 'undefined') return 0
  const asked = new URLSearchParams(location.search).get('from')
  const metres = asked === null ? 0 : Number(asked)
  return Number.isFinite(metres) ? Math.max(0, metres) : 0
})()

/**
 * `?shot=1` also publishes what the car is doing to `window.__rally`.
 *
 * `scripts/rally-check.ts` can drive the physics headless, which answers every
 * question about the *model* — but not one about the wiring. Whether a key
 * reaches the tyres runs through the browser's event handling, `controls.ts`,
 * the frame loop and the session, and none of that exists in Node. The renderer
 * is far too slow under the software renderer used for screenshots to *watch*
 * the answer, so twice now the only available check has been "no exception was
 * thrown", which is not a check.
 *
 * So, behind the same switch that turns on the readable canvas: one object,
 * written once a frame, saying where the car is and what is being asked of it.
 * Off by default, costs nothing, and makes "does the throttle work" a question
 * a script can answer.
 */
const TELEMETRY =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

export function RootwayStage() {
  const phase = useRace((s) => s.phase)
  const track = useRace((s) => s.track)
  if (phase === 'off' || !track) return null
  // `?rally=studio` never builds the tunnel at all — see `Studio.tsx`.
  if (STUDIO) return <CarStudio />
  const mode = phase === 'replay' ? 'replay' : 'race'
  return <RallyCourse key={`${track.stage}-${track.seed}-${mode}`} track={track} mode={mode} />
}

function RallyCourse({ track, mode }: { track: Track; mode: 'race' | 'replay' }) {
  const { camera } = useThree()
  const tier = useQuality((q) => q.tier)
  const surface = useRace((s) => s.surface)
  const ghostRun = useRace((s) => s.ghost)
  const replay = useRace((s) => s.replay)

  /*
    ==========================================================================
    Her car, while the two of you are actually on the road together.

    Wheel to wheel used to be two people driving the same road at the same
    moment and seeing nothing of each other, which is a time trial with better
    manners. This is the channel that fixes it: one race-scoped Realtime
    Database child per car, about sixteen times a second, both ways, with no
    server of our own. See `wire.ts` for what goes down it and `npm run wire`
    for the arithmetic that keeps it looking like a car.

    Held in a ref and fed from a subscription rather than from React state, on
    purpose. Putting arrivals through a re-render would rebuild this component
    — every mesh, every material — mid-race on a phone. The direct listener
    writes the ref instead and React never hears about any of it.
    ==========================================================================
  */
  const data = useData()
  const wheelToWheel = useRace((s) => s.wheelToWheel)
  const live = useRef<LiveWheel | null>(null)
  useEffect(() => {
    if (!wheelToWheel) {
      live.current = null
      return
    }
    const rolling = new Rolling()
    const them = otherUser(data.me)
    const presence = data.snapshot().presence
    const room =
      readSitting(presence[data.me]?.racing)?.key ??
      readSitting(presence[them]?.racing)?.key ??
      ''
    const startedAt = data.now()
    let legacyReceived = 0
    const stream = room
      ? data.openRallyStream(room, (frame) => {
          const sample = readCar(frame.car)
          if (sample) rolling.push(sample, performance.now(), frame.clock, frame)
        })
      : null

    const rememberLink = (endedAt: number | null = null) => {
      keepRallyDiagnostics({
        version: 1,
        stage: track.stage,
        startedAt,
        updatedAt: data.now(),
        endedAt,
        direct: stream?.stats() ?? null,
        legacyReceived,
        smoother: rolling.stats(),
      })
    }
    const checkpoint = window.setInterval(() => rememberLink(), 1000)
    let sent = ''
    let sentAt = 0
    live.current = {
      rolling,
      send(text, elapsedMs, speed, lateral, yawRate, steering) {
        /*
          Skip a repeat, but never go quiet.

          The stream is already throttled to `RALLY_STREAM_INTERVAL`; this is
          about not queueing a frame that says exactly what the last one said,
          which is every frame of a car sitting still on the grid. The
          keepalive is the other half of that, and it is not optional: the far
          end drops a car it has not heard from in `LOST_MS`, so a perfectly
          still car would be sent once, deduped for ever, and disappear off her
          screen two and a half seconds later — which is precisely the moment
          you would both be looking at the grid.
        */
        const now = performance.now()
        // Deduped on the car alone. The clock on the end changes every frame
        // by design, so including it here would defeat the whole check and
        // turn a parked car into a write every frame.
        if (text === sent && now - sentAt < KEEPALIVE_MS) return
        sent = text
        sentAt = now
        stream?.send({
          car: text,
          clock: elapsedMs,
          speed,
          lateral,
          yawRate,
          steering,
        })
        // Keep yesterday's cached build visible during this first rollout.
        data.publishPresence({ driving: stamp(text, elapsedMs) })
      },
    }
    /*
      ==========================================================================
      Only when it is actually new — and this is what made her car judder.

      `subscribe` fires on every change to the world, and one of the things
      that changes the world is *you writing your own presence*, which happens
      six times a second all race long. Every one of those woke this listener,
      which read her `driving` field — unchanged, because she had not sent
      anything since — and pushed it in again as though it were fresh.

      A repeat is poison to the smoother. It works out how fast she is going
      from the distance between two samples, and two copies of one sample are
      no distance at all: her speed came out as **zero**. Which stops the dead
      reckoning that carries her between updates, so her car parks itself until
      a genuinely new sample lands and jumps it forward. Several times a second,
      for the whole race.

      The direct stream no longer travels through this subscription at all.
      This reader remains only so a phone on yesterday's cached build is still
      visible, and the guard remains because a compatibility path must not be
      allowed to reintroduce the old freeze.
      ==========================================================================
    */
    let seen = ''
    /*
      What the visual buffer is doing, under `?shot=1` and in development.

      The production evidence is kept once a second as the last-race report
      and read from `/dev7731`, including from another tab or PWA window.

      How far behind her car is drawn is not a number anybody picked — it is
      measured from how evenly her updates arrive, and it settles somewhere
      different on a good evening than a bad one. `__wheel()` is how that gets
      looked at from a phone over remote debugging, rather than inferred from
      whether the race felt smooth. Same switch and same reason as `__glass`,
      `__local` and `__duel`.

        behind  milliseconds the drawn car sits behind the newest sample
        gap     mean milliseconds between her updates arriving
        jitter  how much that gap wanders, which is what sets `behind`
        dry     frames where nothing had arrived to interpolate between
    */
    if (import.meta.env.DEV) {
      ;(globalThis as Record<string, unknown>).__wheel = () => rolling.stats()
    }

    const stop = data.subscribe((world) => {
      const text = world.presence[them]?.driving ?? ''
      if (text === seen) return
      seen = text
      const sample = readCar(text)
      if (sample) {
        legacyReceived++
        rolling.push(sample, performance.now(), readClock(text))
      }
    })
    return () => {
      window.clearInterval(checkpoint)
      rememberLink(data.now())
      stream?.close()
      stop()
      live.current = null
      // Take the car off the road behind you. Left standing, it is an
      // invitation to a race that finished, sitting in her presence until the
      // tab closes.
      data.publishPresence({ driving: '' })
    }
  }, [wheelToWheel, data, track.stage])

  const lights = useMemo(() => {
    const next = createLights()
    if (track.stage === 'moonbreak') {
      next.uniforms.uAmbient.value.set('#a3b2c4')
      next.uniforms.uVeinColor.value.set('#8bcfc4')
      next.uniforms.uFogColor.value.set('#172131')
      next.uniforms.uFogNear.value = 62
      next.uniforms.uFogFar.value = 235
      next.uniforms.uHeadColor.value.set('#ffe2b8')
      next.uniforms.uSpotColor.value.set('#e8f2ff')
    } else if (track.stage === 'stormcrown') {
      next.uniforms.uAmbient.value.set('#86999d')
      next.uniforms.uVeinColor.value.set('#bdd9dc')
      next.uniforms.uFogColor.value.set('#172126')
      next.uniforms.uFogNear.value = 48
      next.uniforms.uFogFar.value = 205
      next.uniforms.uHeadColor.value.set('#ffe0b2')
      next.uniforms.uSpotColor.value.set('#dcecef')
    }
    return next
  }, [track.stage])
  const rockMaterial = useRockMaterial(lights)
  const mineMaterial = useCarMaterial(lights, 'mine')
  // Solid when she is really out there, see-through when she is a recording.
  const hers: Whose = wheelToWheel ? 'live' : 'chase'
  const theirsMaterial = useCarMaterial(lights, hers)
  // One per corner, because a brake disc glows with *that* corner's heat.
  const mineWheels = useWheelMaterials(lights, 'mine')
  const theirsWheels = useWheelMaterials(lights, hers)
  const glowMaterial = useGlowMaterial(lights)
  const beamMaterial = useBeamMaterial(lights, '#ffcf96')
  const ghostBeamMaterial = useBeamMaterial(lights, '#9fb6e8')
  const boostOuterMaterial = useBeamMaterial(lights, '#61bfff')
  const boostCoreMaterial = useBeamMaterial(lights, '#fff2cf')
  const dustMaterial = useDustMaterial(lights, false)
  const sparkMaterial = useDustMaterial(lights, true)
  const trailMaterial = useTrailMaterial(lights)
  const markMaterial = useMarkMaterial(lights)

  // --- the road ------------------------------------------------------------
  const chunks = useMemo(
    () => track.stage === 'moonbreak'
      ? buildMoonbreak(track)
      : track.stage === 'stormcrown'
        ? buildStormcrown(track)
        : buildTunnel(track),
    [track],
  )
  useEffect(() => () => chunks.forEach((chunk) => chunk.geometry.dispose()), [chunks])
  const chunkMeshes = useRef<Mesh[]>([])

  // --- the lamps -----------------------------------------------------------
  const lanterns = useMemo(() => buildLanterns(track), [track])
  useEffect(() => () => lanterns.geometry.dispose(), [lanterns])

  const hearths = useMemo(() => {
    const road = emptyRoad()
    const basis = flatBasis()
    const point = new Vector3()
    return track.hearths.map((hearth) => {
      roadAt(track, hearth.s, road)
      basisAt(road, basis)
      roadPoint(road, hearth.n, 0.1, point, basis)
      return [point.x, point.y, point.z] as [number, number, number]
    })
  }, [track])

  // --- the cars ------------------------------------------------------------
  const beamGeometry = useMemo(() => {
    // The wide end is +Y in a cylinder's own space and its v runs 0 at the
    // narrow end, so after this rotation the beam points down +Z with v=0 at
    // the lamp — which is what the beam shader fades from.
    const geo = new CylinderGeometry(2.2, 0.09, 13, 14, 1, true)
    geo.rotateX(Math.PI / 2)
    geo.translate(0, 0, 6.5)
    return geo
  }, [])
  useEffect(() => () => beamGeometry.dispose(), [beamGeometry])

  const mine = useCarRig(
    mineMaterial,
    mineWheels,
    beamGeometry,
    beamMaterial,
    boostOuterMaterial,
    boostCoreMaterial,
  )
  const theirs = useCarRig(
    theirsMaterial,
    theirsWheels,
    beamGeometry,
    ghostBeamMaterial,
    boostOuterMaterial,
    boostCoreMaterial,
  )

  // --- what the tyres throw ------------------------------------------------
  const budget = tier === 'low' ? 0.45 : tier === 'medium' ? 0.72 : 1
  const dust = useMemo(() => new Particles(Math.round(300 * budget)), [budget])
  const sparks = useMemo(() => new Particles(Math.round(220 * budget)), [budget])
  // Rubber on the stone. Cheap — nothing moves once it is laid, it only fades.
  const marks = useMemo(() => new Marks(Math.round(420 * budget)), [budget])
  useEffect(
    () => () => {
      dust.dispose()
      marks.dispose()
      sparks.dispose()
    },
    [dust, sparks, marks],
  )

  // --- her line ------------------------------------------------------------
  const theirRun = replay ? replay.theirs : ghostRun
  // Only while racing. In the replay both cars are on the screen at once, and
  // a ribbon marking where one of them went is answering a question nobody is
  // asking any more.
  const trailGeometry = useMemo(
    () => (theirRun && mode === 'race' ? buildTrail(track, theirRun) : null),
    [track, theirRun, mode],
  )
  useEffect(() => () => trailGeometry?.dispose(), [trailGeometry])

  // --- the machine ---------------------------------------------------------
  const drive = useRef<Driving | null>(null)
  drive.current ??= new Driving(track)

  useEffect(() => {
    const machine = drive.current!
    machine.attach(mode === 'race' ? surface : null)
    return () => machine.detach()
  }, [surface, mode])

  /*
    Give the garden its own field of view back.

    The race opens it out to eighty degrees at speed and no section camera ever
    touches `fov`, so without this the Hollow — and everywhere else — would be
    left looking through a fisheye until the tab was reloaded.
  */
  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    const was = perspective.fov
    return () => {
      perspective.fov = was
      perspective.updateProjectionMatrix()
    }
  }, [camera])

  useFrame((_, rawDelta) => {
    drive.current!.frame({
      delta: Math.min(0.05, rawDelta),
      camera: camera as PerspectiveCamera,
      lights,
      lanternAt: lanterns.at,
      track,
      chunks: chunkMeshes.current,
      chunkRanges: chunks,
      mine,
      theirs,
      dust,
      sparks,
      marks,
      markMaterial,
      live: live.current,
      materials: {
        mine: mineMaterial,
        theirs: theirsMaterial,
        mineWheels,
        theirsWheels,
        beam: beamMaterial,
        ghostBeam: ghostBeamMaterial,
        trail: trailMaterial,
      },
    })
  })

  return (
    <>
      <color
        attach="background"
        args={[
          track.stage === 'moonbreak'
            ? '#172131'
            : track.stage === 'stormcrown'
              ? '#172126'
              : '#050403',
        ]}
      />

      {track.stage === 'moonbreak' ? <MoonbreakWorld track={track} /> : null}
      {track.stage === 'stormcrown' ? <StormcrownWorld track={track} /> : null}
      {/*
        The Rootway has no world component of its own — the tunnel, the lamps
        and the fires are all built inline above — so its soundscape mounts
        here rather than inside one. It draws nothing.
      */}
      {track.stage === 'rootway' ? <RootwaySound track={track} /> : null}

      {chunks.map((chunk, i) => (
        <mesh
          key={i}
          ref={(node) => {
            if (node) chunkMeshes.current[i] = node
          }}
          geometry={chunk.geometry}
          material={rockMaterial}
        />
      ))}


      <mesh
        geometry={lanterns.geometry}
        material={glowMaterial}
        frustumCulled={false}
        renderOrder={3}
      />

      {/*
        The one you come back to is bigger than the one you left.

        Not decoration: it is what the last hundred metres of road are aimed
        at, it is six metres in front of where the car comes to rest, and the
        result of the run is read over the top of it. The one at the start is
        seen for a second and a half over your shoulder at forty metres a
        second. `intensity` is zero on both because nothing in this world is
        lit by scene lights — the rock takes its firelight from the lantern
        window instead, and these two are in it.
      */}
      {track.stage === 'rootway' ? hearths.map((at, i) => {
        const arriving = i === hearths.length - 1
        return (
          <Fire
            key={i}
            position={at}
            height={arriving ? 3.3 : 2.3}
            width={arriving ? 1.8 : 1.25}
            intensity={0}
            night={0}
          />
        )
      }) : null}

      {trailGeometry ? (
        <mesh
          geometry={trailGeometry}
          material={trailMaterial}
          frustumCulled={false}
          renderOrder={2}
        />
      ) : null}

      <primitive object={mine.root} />
      {theirRun || wheelToWheel ? <primitive object={theirs.root} /> : null}

      {/* Flat on the stone, so it goes down before anything in the air. */}
      <mesh
        geometry={marks.geometry}
        material={markMaterial}
        frustumCulled={false}
        renderOrder={1}
      />

      <mesh
        geometry={dust.geometry}
        material={dustMaterial}
        frustumCulled={false}
        renderOrder={5}
      />
      <mesh
        geometry={sparks.geometry}
        material={sparkMaterial}
        frustumCulled={false}
        renderOrder={6}
      />
    </>
  )
}

/**
 * Every lantern on the road, as one additive billboard each.
 *
 * The glow you can see and the light on the rock are two different things: the
 * sprite is drawn for all of them at once, and the *light* is a window of ten
 * refilled every frame from the car's position — see `Driving.updateLamps`.
 */
function buildLanterns(track: Track) {
  const base = new PlaneGeometry(1, 1)
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', base.attributes.position)
  geo.setAttribute('uv', base.attributes.uv)
  if (base.index) geo.setIndex(base.index)
  base.dispose()

  const count = track.lanterns.length
  const at = new Float32Array(count * 3)
  const tint = new Float32Array(count * 3)
  const shape = new Float32Array(count * 3)

  const road = emptyRoad()
  const basis = flatBasis()
  const point = new Vector3()
  const warm = new Color('#ff9a45')
  const cold = new Color('#54d3bd')
  const colour = new Color()

  track.lanterns.forEach((lantern, i) => {
    roadAtRoute(track, lantern.s, lantern.shortcut ?? false, road)
    basisAt(road, basis)
    roadPoint(road, lantern.n, lantern.y, point, basis)
    at[i * 3] = point.x
    at[i * 3 + 1] = point.y
    at[i * 3 + 2] = point.z
    colour.copy(cold).lerp(warm, lantern.warm)
    tint[i * 3] = colour.r
    tint[i * 3 + 1] = colour.g
    tint[i * 3 + 2] = colour.b
    shape[i * 3] = lantern.size * (lantern.fire ? 1.5 : 0.95)
    shape[i * 3 + 1] = (i * 0.618034) % 1
    shape[i * 3 + 2] = lantern.warm
  })

  geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
  geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
  geo.setAttribute('iShape', new InstancedBufferAttribute(shape, 3))
  geo.instanceCount = count
  return { geometry: geo, at }
}

// ---------------------------------------------------------------------------
// Everything that happens per frame
// ---------------------------------------------------------------------------

/**
 * Both ends of a live race, as the frame sees them.
 *
 * `rolling` is her, smoothed out of six updates a second into something that
 * moves like a car. `send` is you, going the other way. Neither exists unless
 * the round is actually wheel to wheel.
 */
interface LiveWheel {
  rolling: Rolling
  /** The four-integer car, and her own elapsed race time to stamp it with. */
  send(
    text: string,
    elapsedMs: number,
    speed: number,
    lateral: number,
    yawRate: number,
    steering: number,
  ): void
}

interface FrameArgs {
  delta: number
  camera: PerspectiveCamera
  lights: RallyLights
  lanternAt: Float32Array
  track: Track
  chunks: Mesh[]
  chunkRanges: { from: number; to: number; shortcut?: boolean }[]
  mine: CarRig
  theirs: CarRig
  dust: Particles
  sparks: Particles
  marks: Marks
  markMaterial: ShaderMaterial
  /** Present only while the two of you are on the road at the same moment. */
  live: LiveWheel | null
  materials: {
    mine: ShaderMaterial
    theirs: ShaderMaterial
    /** One per corner. `uDisc` on each is that wheel's own brake heat. */
    mineWheels: ShaderMaterial[]
    theirsWheels: ShaderMaterial[]
    beam: ShaderMaterial
    ghostBeam: ShaderMaterial
    trail: ShaderMaterial
  }
}

/**
 * The race, as a small machine with no React in it.
 *
 * Kept in one object held by a ref rather than in a drawerful of `useRef`s, so
 * that everything which has to survive between frames — the car, the recorder,
 * the controls, the camera, the engine — has one place and one lifetime.
 */
/** Scratch for the weather's once-a-frame look at the road under the car. */
const stormRoad = emptyRoad()
/** The same, for the Rootway's look at how big the rock around it is. */
const rootRoad = emptyRoad()
/**
 * One frame of the race, as the music hears it.
 *
 * Module-level and rewritten in place, like the three road-state objects — this
 * is written sixty times a second and allocating a fresh one each frame is the
 * kind of garbage that turns into a stutter on a phone halfway down a road.
 */
const music: RaceMusicState = {
  phase: 'off',
  paused: false,
  since: 0,
  drift: 0,
  depth: 0,
  thunder: 0,
}

class Driving {
  private readonly car: CarState
  private recorder = new Recorder()
  private readonly chase = new ChaseCamera()
  private controls: RallyControls | null = null
  private engine: EngineVoice | null = null

  private countdown = COUNTDOWN
  /** Counts down to the next grain of sand off a rear wheel. See `throwDust`. */
  private sandDue = 0
  /** 0..1, eased. How far the edges of the frame have closed in. */
  private rush = 0
  private shownRush = -1
  private clock = 0
  private handedOver = false
  private shots: Shot[] = []
  private lampCursor = 0
  private lastGhostS = 0
  /**
   * What the ember held at the instant it was lit, in seconds.
   *
   * The sound needs the burn as a fraction rather than as a countdown, and
   * dividing by `TUNE.boostSeconds` is not the same thing: a half-charged
   * ember would then start life already sounding two-thirds spent. Catching
   * the launch value costs one number and makes a short burn a complete
   * small burn rather than the tail of a big one.
   */
  private boostFrom = 0
  private shotIndex = -1
  /** Which go the machine has been wound back for. */
  private attempt = -1
  private cleared = false
  private motesDue = 0
  private dripDue = 0
  /** Whether the meter is currently drawn as full. Toggled, not set. */
  private barFull = false
  private barBurning = false
  /** Last whole km/h written to the meter, so it is written once per change. */
  private shownKmh = -1
  private speedFlat = false
  private gritDue = 0
  private smokeDue = 0
  /** Per-tyre loose-ground cadence; one wheel crossing the edge is visible. */
  private readonly earthDue = [0, 0, 0, 0]
  /** Twin-silencer cadence at the start line and during the first pull-away. */
  private exhaustDue = 0
  private exhaustLoaded = false
  /** Nitro is continuous, but its pressure front is an edge. */
  private nitroDue = 0
  private nitroBurning = false
  /**
   * What was asked of the car this frame.
   *
   * Kept rather than passed around because three separate things downstream
   * want it — the brake lamps, the sound, and the smoke off a locked wheel —
   * and re-reading the controls for each of them would consume the boost tap
   * three times.
   */
  private input: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }
  /** Eases to 1 once the run is over — see ChaseCamera. */
  private settle = 0
  /** How far under the water, eased. See the drive in `frame`. */
  private sunk = 0
  /** And how deep into Rootwake, eased the same way. See ROOTWAKE_DARK. */
  private hidden = 0
  /** Seconds of *racing* — not of being on the road. The music's own clock. */
  private musicSince = 0
  /** Seconds until the next stroke, and how many are left in this flash. */
  private nextStrike = 2
  private strokesLeft = 1

  private readonly ghost: RunSample = {
    n: 0, s: 0, yaw: 0, drift: 0,
    boost: false, rough: false, braking: false, spinning: false, shortcut: false,
  }
  private readonly point = new Vector3()
  private readonly forward = new Vector3()
  private readonly sideways = new Vector3()
  private readonly heading = new Vector3()
  private readonly across = new Vector3()
  private readonly up = new Vector3(0, 1, 0)
  /** Metres of travel since each wheel last laid a mark. */
  private readonly markDue = [0, 0, 0, 0]
  private readonly colour = new Color()

  private readonly autopilot: ((car: CarState, dt: number) => CarInput) | null

  constructor(private readonly track: Track) {
    this.car = createCar(track)
    if (ROOTWAKE_EXIT_HOLD && track.split) {
      this.car.s = track.split.rejoinAt - 32
      this.car.shortcut = true
    } else if (ROOTWAKE_MOUTH_HOLD && track.split) {
      this.car.s = track.split.from + 10
      this.car.shortcut = true
    } else if (ROOTWAKE_RIDE && track.split) this.car.s = track.split.from + 2
    else if (FROM > 0) this.car.s = Math.min(track.length - 2, FROM)
    this.autopilot = RIDE ? spiritDriver(track, track.seed ^ 0x1234) : null
  }

  attach(surface: HTMLElement | null) {
    this.detach()
    if (surface) this.controls = attachControls(surface)
    this.engine = ambience.engine()
  }

  detach() {
    this.controls?.detach()
    this.controls = null
    this.engine?.stop()
    this.engine = null
  }

  /**
   * Back to the start line, without rebuilding the tunnel.
   *
   * Everything with a memory of the last run gets cleared: the car, what it
   * recorded, the clock, the countdown, the camera's springs, the dust still
   * hanging in the air, and the cursor into the lantern list.
   */
  private restart(attempt: number) {
    this.attempt = attempt
    Object.assign(this.car, createCar(this.track))
    if (ROOTWAKE_EXIT_HOLD && this.track.split) {
      this.car.s = this.track.split.rejoinAt - 32
      this.car.shortcut = true
    } else if (ROOTWAKE_MOUTH_HOLD && this.track.split) {
      this.car.s = this.track.split.from + 10
      this.car.shortcut = true
    } else if (ROOTWAKE_RIDE && this.track.split) this.car.s = this.track.split.from + 2
    else if (FROM > 0) this.car.s = Math.min(this.track.length - 2, FROM)

    /*
      Your own side of the road, before anybody moves.

      Set on the car itself rather than drawn as an offset, because in a live
      race the other person is really there: a car shown a metre from where it
      is, is a car you can drive through. This is a real grid slot, it goes
      down the wire with everything else, and it is where the physics starts
      you. Zero for anything that is not wheel to wheel.
    */
    this.car.n = useRace.getState().grid

    this.recorder = new Recorder()
    this.countdown = COUNTDOWN
    this.rush = 0
    this.shownRush = -1
    this.clock = 0
    this.handedOver = false
    this.settle = 0
    this.shots = []
    this.shotIndex = -1
    this.lampCursor = 0
    this.lastGhostS = 0
    this.earthDue.fill(0)
    this.exhaustDue = 0
    this.exhaustLoaded = false
    this.nitroDue = 0
    this.nitroBurning = false
    this.chase.reset()
    this.cleared = false
  }

  /**
   * The music, which is the one sound here that belongs to the *race* rather
   * than to the road.
   *
   * All three of its ducks come from numbers something else is already using:
   * the slip the tyres are running, the depth the water is drawn at, and the
   * thunder envelope the mountain's own soundscape books when a stroke is
   * dealt. Nothing is computed for the music's benefit — the same rule the
   * engine's inputs follow, and the reason the drift ducks on the exact frame
   * the tyres let go rather than a moment after it.
   *
   * The clock is its own rather than `car.elapsed`, for two reasons. A replay
   * does not advance the car's timer the way a run does, and the music should
   * arrive over a replay exactly as it arrived over the race. And a pause must
   * not go on counting: coming back from a minute in the menu should resume the
   * swell, not skip past it.
   */
  private driveMusic(args: FrameArgs, session: RaceSession) {
    const racing = session.phase === 'running' || session.phase === 'replay'
    if (!racing) this.musicSince = 0
    else if (!session.paused) this.musicSince += args.delta

    const sideways = Math.abs(slipOf(this.car))
    music.drift = Math.max(
      this.car.driftBlend,
      Math.max(0, Math.min(1, (sideways - 0.1) / 0.32)),
    )
    music.depth = this.track.stage === 'moonbreak' ? deep.at : 0
    music.thunder = this.track.stage === 'stormcrown' ? storm.thunder : 0
    music.phase = session.phase
    music.paused = session.paused
    music.since = this.musicSince
    setRaceMusic(music, args.delta)
  }

  frame(args: FrameArgs) {
    const session = useRace.getState()
    if (session.attempt !== this.attempt) this.restart(session.attempt)
    if (!this.cleared) {
      this.cleared = true
      args.dust.clear()
      args.sparks.clear()
      args.marks.clear()
    }

    /*
      Paused: the world stays exactly where it is.

      Nothing is stepped — not the car, not the clock, not the dust, not the
      lamps' flicker — so the frame you were looking at is the frame you come
      back to. The engine is told the car is stopped rather than being torn
      down, because rebuilding the voice would cost the tunnel's reverb tail
      and you would come back to silence.
    */
    /*
      The music is told first, and it is told even while paused.

      Everything else in this method is *stepping the world*, and the world does
      not step while you are in the menu — so returning early is right for all
      of it. The music is the exception, because the pause is a thing that
      happened *to* it and it has a fade to run: told nothing, it simply held
      whatever it was playing at full level under the paused screen, which is
      the one place a soundtrack must not be.
    */
    this.driveMusic(args, session)

    if (session.paused) {
      this.engine?.set(SILENT)
      this.engine?.pressure(0)
      return
    }

    this.clock += args.delta
    args.lights.uniforms.uTime.value = this.clock
    /*
      The bridge is timed off the *race* clock, not this one. They differ by
      the countdown, and they have to differ: physics phases the swing on
      `car.elapsed`, so a deck drawn on `this.clock` would be a second or two
      out of step with the force and the car would sit visibly through it.
    */
    args.lights.uniforms.uSway.value.x = this.car.elapsed
    // `boostLeft` only ever jumps up on the press and falls from there, so the
    // high-water mark *is* the launch value, with nothing to reset by hand.
    if (this.car.boostLeft > this.boostFrom) this.boostFrom = this.car.boostLeft
    if (this.car.boostLeft <= 0) this.boostFrom = 0


    /*
      The Stormcrown's weather, off the height of the road under the car.

      Eased, but not much: two seconds. Coming out of the top of the cloud
      should be quick enough to be an event and slow enough that no single
      frame is the one it happened on.
    */
    if (this.track.stage === 'stormcrown') {
      storm.s = this.car.s
      storm.speed = Math.hypot(this.car.vs, this.car.vn)
      const want = stormAt(this.track, this.car.s + 20)
      const ease = 1 - Math.exp(-1.6 * args.delta)
      storm.inCloud += (want.inCloud - storm.inCloud) * ease
      storm.above += (want.above - storm.above) * ease
      /*
        And how hard it is blowing, which is the same number the car is being
        shoved by — see `storm.wind`. Followed much more quickly than the cloud
        is: a gust that arrives in the rain a second after it arrives in the
        steering is a gust nobody connects to anything, and the whole point of
        drawing it is that you see it coming.
      */
      const blowing = galeStrengthAt(roadAt(this.track, this.car.s, stormRoad), this.car.s, this.car.elapsed)
      storm.wind += (blowing - storm.wind) * (1 - Math.exp(-9 * args.delta))
      /*
        And how hard it is raining, which is one number for the drops and the
        noise both — see the note in `weather`.

        Heaviest in the cloud, still real underneath it, and gone once you are
        properly out of the top: climbing out of the weather is the reward the
        whole road is built around, and arriving in silence and dry air is most
        of what makes it one.
      */
      storm.rain = Math.max(0, Math.min(1, (0.62 + storm.inCloud * 0.38) * (1 - storm.above)))
      this.strike(args.delta)

      const u = args.lights.uniforms
      const cloud = storm.inCloud
      const high = storm.above
      // Low, then cloud over the top of it, then clear air over the top of
      // that. Applied in that order because they overlap: you are briefly both
      // leaving the cloud and above it, and the second should win.
      u.uAmbient.value.copy(STORM_LOW.ambient).lerp(STORM_CLOUD.ambient, cloud).lerp(STORM_HIGH.ambient, high)
      u.uFogColor.value.copy(STORM_LOW.fog).lerp(STORM_CLOUD.fog, cloud).lerp(STORM_HIGH.fog, high)
      const mix = (a: number, b: number, c: number) => (a + (b - a) * cloud) * (1 - high) + c * high
      u.uFogNear.value = mix(STORM_LOW.near, STORM_CLOUD.near, STORM_HIGH.near)
      u.uFogFar.value = mix(STORM_LOW.far, STORM_CLOUD.far, STORM_HIGH.far)

      /*
        And the strike itself, on the ambient.

        Through the shared block, so the rock, the road, the cedars and the car
        all take it together. A flash that lights the sky and not the ground is
        a screen effect; one that lights everything is weather.
      */
      if (storm.flash > 0.001) {
        u.uAmbient.value.lerp(FLASH, storm.flash * (0.55 + high * 0.25))
      }
    }

    /*
      How big the rock is around the car, for the ear.

      Sampled a little way *up* the road rather than under the wheels, for the
      same reason the Moonbreak reads its depth eight metres ahead: a chamber
      that arrives in the sound on the frame the bonnet enters it has already
      been visible for half a second, and a room you can see before you can
      hear it is a painting. Twelve metres is about a third of a second at
      racing speed, which is enough to lead the eye without leading it visibly.

      Eased, and not much — a metre of road either side of a throat genuinely is
      a step in the geometry, but stepping the *sound* would make every seam
      between two bands audible as a click in the reverb.
    */
    if (this.track.stage === 'rootway') {
      const road = roadAtRoute(this.track, this.car.s + 12, this.car.shortcut, rootRoad)
      const want = enclosureOf(road.ceiling, road.width + vergeWidth(road.room))
      const ease = 1 - Math.exp(-4.5 * args.delta)
      tunnel.s = this.car.s
      tunnel.speed = Math.hypot(this.car.vs, this.car.vn)
      tunnel.enclosed += (want - tunnel.enclosed) * ease
      tunnel.ceiling += (road.ceiling - tunnel.ceiling) * ease
      tunnel.wet += (road.wet - tunnel.wet) * ease
    }

    /*
      And how deep into Rootwake we are, which moves the light itself.

      Three seconds of easing either way. Off the car's own route flag rather
      than off a pair of distances, so it can never disagree with which road
      the car is actually on — including on the way back out at the far end,
      where the same ease runs in reverse and the lanterns come back.
    */
    if (this.track.stage === 'rootway' && this.track.split) {
      const want = this.car.shortcut ? 1 : 0
      this.hidden += (want - this.hidden) * (1 - Math.exp(-0.9 * args.delta))
      const t = this.hidden
      const u = args.lights.uniforms
      u.uAmbient.value.copy(ROOTWAY_LIT.ambient).lerp(ROOTWAKE_DARK.ambient, t)
      u.uFogNear.value = ROOTWAY_LIT.fogNear + (ROOTWAKE_DARK.fogNear - ROOTWAY_LIT.fogNear) * t
      u.uFogFar.value = ROOTWAY_LIT.fogFar + (ROOTWAKE_DARK.fogFar - ROOTWAY_LIT.fogFar) * t
    }

    /*
      And how far under the water we are, which moves the light itself.

      Off the road's own height — see `sunkAt` — so the light can never
      disagree with the geometry that put the car down there. Read from where
      the *camera* is rather than where the car is, and a little ahead of it:
      the chase camera trails the car by several metres, so keying this to the
      car alone would turn the world green while the surface was still visibly
      over the driver's shoulder, and back again the same way on the climb out.
      Eight metres up the road is about where the eye is actually looking.

      Eased rather than set, because `sunkAt` is a ramp along the road and the
      car crosses it at forty metres a second: at the top of the dive that is a
      ramp about a fifth of a second wide, which is a cut. Half a second of
      exponential either side turns it into water closing over.
    */
    if (this.track.stage === 'moonbreak') {
      const want = sunkAt(this.track, this.car.s + 8)
      this.sunk += (want - this.sunk) * (1 - Math.exp(-3.2 * args.delta))
      const t = this.sunk
      const u = args.lights.uniforms
      u.uAmbient.value.copy(ABOVE.ambient).lerp(UNDER.ambient, t)
      u.uVeinColor.value.copy(ABOVE.vein).lerp(UNDER.vein, t)
      u.uFogColor.value.copy(ABOVE.fog).lerp(UNDER.fog, t)
      u.uFogNear.value = ABOVE.near + (UNDER.near - ABOVE.near) * t
      u.uFogFar.value = ABOVE.far + (UNDER.far - ABOVE.far) * t
      deep.at = t
      deep.s = this.car.s
      // And out to whatever is not lit by the shared block — see `depth`.
      deep.fog.copy(u.uFogColor.value)
      deep.near = u.uFogNear.value
      deep.far = u.uFogFar.value
    }

    /*
      And the music, which is the one sound here that belongs to the *race*
      rather than to the road.

      Everything it needs is already worked out by this point in the frame, and
      all three of its ducks come from numbers something else is already using:
      the slip the tyres are running, the depth the water is drawn at, and the
      thunder envelope the mountain's own soundscape books when a stroke is
      dealt. Nothing here is computed for the music's benefit — which is the
      same rule the engine's inputs follow, and the reason the drift ducks on
      the exact frame the tyres let go rather than a moment after it.
    */
    if (session.phase === 'replay') this.stepReplay(args)
    else this.stepRace(args)

    this.updateChunks(args)
    this.updateLamps(args)
    // The marks fade in the shader, so all they need is the clock and a push
    // of whatever was laid this frame.
    args.markMaterial.uniforms.uNow.value = this.clock
    args.markMaterial.uniforms.uLife.value = MARK_LIFE
    args.marks.flush()
    args.dust.step(args.delta, -1.6, 0.24)
    args.sparks.step(args.delta, -4.5, 0.1)
  }

  // --- driving -------------------------------------------------------------

  private stepRace(args: FrameArgs) {
    const { delta, track } = args
    const car = this.car
    const session = useRace.getState()
    const phase = session.phase

    if (phase === 'ready') {
      // The start line listens before it moves. Holding the throttle can raise
      // the engine against the lamps, but physics stays locked until begin().
      // Previously the countdown invented three rev blips with no input.
      this.input = this.autopilot
        ? IDLE
        : (this.controls?.read(0) ?? IDLE)
      if (!ROOTWAKE_MOUTH_HOLD && !ROOTWAKE_EXIT_HOLD) this.countdown -= delta
      if (this.countdown <= 0) session.begin()
    } else if (phase === 'running') {
      if (
        ROOTWAKE_RIDE &&
        track.split &&
        !car.shortcut &&
        car.s >= track.split.from + 5 &&
        car.s < track.split.rejoinAt
      ) {
        car.shortcut = true
        car.n = 0
      }
      // The controls are told how fast the car is going, because how quickly
      // the hands may move the wheel depends on it — see `controls.ts`.
      const input = this.autopilot
        ? this.autopilot(car, delta)
        : (this.controls?.read(speedOf(car)) ?? IDLE)
      this.input = input
      advanceCar(track, car, input, delta)
      this.recorder.sample(car)

      if (car.finished && !this.handedOver) {
        this.handedOver = true
        const run = this.recorder.finish(car)
        session.finish()
        session.onFinish?.(run)
      }
    } else if (phase === 'finished') {
      /*
        Rolling in.

        The clock stopped at the finish, but the road did not: there are fifty
        metres of chamber left and a fire at the end of them. The engine comes
        off, the car steers itself back to the middle and coasts, and the
        result comes up over the top of it. A race that stops dead on a line is
        an arcade game.
      */
      /*
        The brake comes off as the car slows, and it has to do both jobs.

        It was a flat three tenths, chosen to stay under the threshold that
        selects reverse — holding a heavy brake at a stand for a third of a
        second is the request for reverse, and a car that coasted in with the
        pedal buried would come to rest, select reverse, and quietly drive
        itself back up the tunnel while the result was on screen. That was the
        right worry and the wrong answer: three tenths does not stop a car from
        forty metres a second inside any hall anybody would want to build, so
        every run ended against the end of the road instead.

        Tapered, it is a firm brake while there is speed to lose and almost
        nothing by the time the car is walking — under four and a half metres a
        second it is already below the reverse threshold, so the gearbox is
        never asked. Which is also simply what a driver does.
      */
      const centring = Math.max(-1, Math.min(1, (-car.n * 0.25 - car.psi * 1.6)))
      this.input = {
        steer: centring,
        throttle: 0,
        brake: Math.min(0.55, Math.max(0.16, speedOf(car) * 0.05)),
        handbrake: false,
        boost: false,
      }
      advanceCar(track, car, this.input, delta)
    }

    const speed = speedOf(car)
    const slip = slipOf(car)
    /*
      Physics is deliberately frozen behind the start lamps, so `car.revs`
      remains zero there. The live pedal still raises the engine, however, and
      every pre-start consumer â€” sound, exhaust glow and silencer haze â€” must
      read the same synthetic rev value or the car visibly contradicts itself.
    */
    const readyRevs =
      phase === 'ready'
        ? this.input.throttle * (0.56 + Math.sin(this.clock * 11) * 0.018)
        : car.revs

    if (TELEMETRY) {
      ;(window as unknown as { __rally?: unknown }).__rally = {
        phase,
        s: car.s,
        n: car.n,
        speed,
        slip,
        gear: car.gear,
        revs: car.revs,
        reversing: car.reversing,
        steer: this.input.steer,
        steerAngle: car.steerAngle,
        throttle: this.input.throttle,
        brake: this.input.brake,
        handbrake: this.input.handbrake,
        drifting: car.drifting,
        // The Stormcrown's weather, so the three bands can be checked from a
        // script rather than argued about from a screenshot.
        inCloud: +storm.inCloud.toFixed(2),
        above: +storm.above.toFixed(2),
        flash: +storm.flash.toFixed(2),
        ember: car.ember,
        /*
          Seconds of boost left, so "did the ember key work" is a question a
          script can answer.

          The bar filling was already visible and the *spend* was not, which is
          exactly the gap the AltGr bug hid in: from outside, a key that never
          reached the game and a key that reached it while the meter was empty
          look identical.
        */
        boostLeft: car.boostLeft,
        driftAngle: car.driftAngle,
        touching: car.touching,
        shortcut: car.shortcut,
        strikes: car.strikes,
        /*
          Which way the *drawn* front wheel is actually pointing, as an angle
          off the car's own nose, right positive.

          Reported rather than inferred because the mesh and the model do not
          agree about which way round the car is — see `MESH_FOR_WHEEL` — and
          the front wheels spent a long time visibly steering the wrong way
          while driving perfectly correctly. A number that comes off the world
          matrix is the only one that settles it.
        */
        drawnSteer: drawnSteerOf(args.mine),
      }
    }

    /*
      Squat, dive, lean and travel all come straight out of the physics now.

      They used to be estimated here from the yaw rate and the acceleration,
      with two clamps and two magic numbers, and the estimate was reasonable —
      but it was an animation *about* the car rather than the car. Now the same
      loads that decide how much grip each tyre has decide how far its spring
      is compressed, so the body cannot lean one way while the tyres are
      working the other.
    */
    placeCar(
      args.mine,
      track,
      car.s,
      car.n,
      car.psi,
      car.roll,
      car.pitch,
      car.heave,
      0,
      car.shortcut,
      car.elapsed,
    )
    poseWheels(args.mine, car)

    // What the car is telling you about itself: the meter, the brake lamps,
    // the discs and the pipes.
    args.materials.mine.uniforms.uGlow.value = car.ember

    /*
      The meter, written straight to its node.

      Scaled rather than sized, so the browser never has to lay anything out —
      a width in per cent once a frame is a reflow once a frame, and this is
      the one thing on screen you are watching while cornering.
    */
    const bar = session.emberBar
    if (bar) {
      bar.style.transform = `scaleX(${car.ember.toFixed(3)})`
      const full = car.ember >= 1
      if (full !== this.barFull) {
        this.barFull = full
        bar.classList.toggle('full', full)
      }
      /*
        And it says which way it is going.

        The bar fills and drains through the same numbers now, so on its own it
        is ambiguous — a bar at a third could be one you have half spent or one
        you are half way to earning, and those want opposite decisions. Burning
        turns it white-hot and stops the breathing, because it is no longer
        asking to be spent: it is being spent.
      */
      const burning = car.boostLeft > 0
      if (burning !== this.barBurning) {
        this.barBurning = burning
        bar.classList.toggle('burning', burning)
      }
    }

    /*
      The speedometer, written the same way and for the same reason.

      The *text* only changes when the whole number does, which is a handful of
      times a second rather than sixty: setting `textContent` to the string it
      already holds still dirties the node and costs a layout on some browsers,
      and this sits over a scene that needs every millisecond. The line under
      it is a transform, which never costs layout at all.
    */
    const speedo = session.speedo
    if (speedo) {
      const kmh = Math.round(speed * 3.6)
      if (kmh !== this.shownKmh) {
        this.shownKmh = kmh
        speedo.value.textContent = String(kmh)
      }
      // Against the real top speed, so full means full. See TUNE.topSpeed.
      const of = Math.min(1, speed / TUNE.topSpeed)
      speedo.line.style.transform = `scaleX(${of.toFixed(3)})`
      const flat = of > 0.965
      if (flat !== this.speedFlat) {
        this.speedFlat = flat
        speedo.line.classList.toggle('flat', flat)
      }
    }
    /*
      The edges of the frame, closing in.

      One custom property a frame, which the compositor turns into a gradient
      it was already drawing — see `Rush`. Squared, so the first half of the
      speedometer does nothing at all and the last quarter does most of it: a
      cue that comes on linearly is a cue you notice at forty miles an hour,
      which is not what it is for.
    */
    const rush = session.rush
    if (rush) {
      const of = Math.min(1, speed / TUNE.topSpeed)
      const past = Math.max(0, (of - RUSH_FROM) / (1 - RUSH_FROM))
      const want = past * past
      // Eased, or it flickers on every gear change and every kerb.
      this.rush += (want - this.rush) * (1 - Math.exp(-4 * delta))
      if (Math.abs(this.rush - this.shownRush) > 0.004) {
        this.shownRush = this.rush
        rush.style.setProperty('--rush', this.rush.toFixed(3))
      }
    }

    args.materials.mine.uniforms.uBrake.value = car.braking
    const pipeThrottle = phase === 'ready' ? this.input.throttle : car.throttle
    args.materials.mine.uniforms.uPipe.value = Math.max(
      car.boostLeft > 0 ? 1 : 0,
      // The silencers now answer a loaded engine before the flag as well as
      // glowing on overrun. Previously this read the locked physics throttle,
      // which is always zero during the countdown.
      phase === 'ready' && pipeThrottle > 0.04
        ? 0.22 + pipeThrottle * 0.68 + Math.sin(this.clock * 31) * 0.06
        : pipeThrottle < 0.3 && readyRevs > 0.45
          ? 0.35 + Math.random() * 0.4
          : 0,
    )
    for (let i = 0; i < 4; i++) {
      // The mesh numbers its wheels on the other side — see `MESH_FOR_WHEEL`.
      const material = args.materials.mineWheels[MESH_FOR_WHEEL[i]]
      if (material) material.uniforms.uDisc.value = car.wheels[i].heat
    }
    this.updateLightsFrom(args, args.mine, car.ember)
    this.updateBoostJets(args.mine, car.boostLeft > 0)

    /*
      The countdown is the lamps.

      Three beats, and each one is the headlights swelling up and dying back.
      The engine deliberately does not answer those beats: before the green it
      only rises when the driver holds the throttle, while the car itself stays
      locked. The gantry in EmberRally.tsx makes the same three beats legible.
    */
    let rev = phase === 'finished' ? 0 : car.boostLeft > 0 ? 1 : speed / TUNE.topSpeed
    if (phase === 'ready') {
      const beat = this.countdown - Math.floor(this.countdown)
      const rise = Math.pow(1 - beat, 2.2)
      const power = 0.07 + rise * 0.93
      args.lights.uniforms.uHeadPower.value = power
      args.lights.uniforms.uSpotPower.value = power
      args.materials.beam.uniforms.uPower.value = power * 0.9
      // Full throttle holds roughly 4,700 rpm. The car is still physically
      // locked; this is only the driver's foot loading the engine for launch.
      rev = readyRevs
    } else {
      args.lights.uniforms.uHeadPower.value = 1
      // The pod comes up with the ember, so a boost lights the far end of the
      // tunnel as well as pushing you down it.
      args.lights.uniforms.uSpotPower.value = 1 + (car.boostLeft > 0 ? 0.5 : 0)
      args.materials.beam.uniforms.uPower.value = 1
    }

    this.throwDust(args, car, speed, slip)
    this.layMarks(args, car, speed)

    /*
      What the ear is given.

      Every one of these is a number the tyre model already has, rather than
      something derived from the speed for the sound's benefit — so the note
      cuts on the same frame the gearbox cuts, the scrub comes off the end of
      the car that is actually sliding, and the wind whistles where the rock
      genuinely closes in.
    */
    const room = car.road.width + vergeWidth(car.road.room)
    this.engine?.set({
      speed: phase === 'ready' ? 0 : speed,
      revs: phase === 'ready' ? rev : car.revs,
      gear: car.gear,
      shifting: car.shiftLeft > 0 ? 1 : 0,
      throttle: phase === 'ready' ? this.input.throttle : car.throttle,
      brake: car.braking,
      /*
        A drift counts as the handbrake for as long as it lasts.

        The button is only held for the moment that starts one — after that
        you need both hands for the arrows — but the car is still sideways and
        must still sound like it. This also means the ratchet clicks once per
        drift, on the way in, rather than once per press.
      */
      handbrake: this.input.handbrake || car.drifting,
      scrubFront: scrubOf(car, false),
      scrubRear: scrubOf(car, true),
      wheelspin: wheelspinOf(car),
      lockup: lockupOf(car),
      rough: car.rough ? 1 : 0,
      wet: car.road.wet,
      tight: Math.max(0, Math.min(1, (5.4 - room) / 3.2)),
      boost: car.boostLeft > 0,
      boostLeft: this.boostFrom > 0 ? car.boostLeft / this.boostFrom : 0,
    })

    /*
      --- you, going the other way ------------------------------------------
      From the moment the road opens, not from the flag.

      Sending only while running left the start line empty: her car appeared
      the instant the lights went out, which is the one moment you are least
      able to look at it. Being able to see her sitting in the other grid slot
      through the countdown is most of what makes this a race rather than two
      people pressing go. After the finish the last thing sent stands, which is
      where she actually stopped.
    */
    if (args.live && (phase === 'ready' || phase === 'running')) {
      const packed = packCar(car)
      args.live.send(
        writeCar(packed.n, packed.s, packed.psi, packed.state),
        car.elapsed * 1000,
        car.vs,
        car.vn,
        car.yaw,
        car.steerAngle,
      )
    }

    // --- her -----------------------------------------------------------------
    const rolling = args.live ? args.live.rolling.at(performance.now()) : null
    const ghost = session.ghost
    if (rolling) {
      /*
        She is really there.

        No `grid` offset and no clock: a recording is played back against your
        own elapsed time, but she is not being played back at all. Where the
        wire says she is, is where she is — including on the start line, which
        is why her car is visible in the `ready` phase here and not for a
        ghost. Seeing her sitting beside you before the flag is most of what
        makes this feel like a race rather than a countdown.
      */
      args.theirs.root.visible = true
      this.showGhost(args, rolling, car.elapsed * 1000)
      const near = rolling.shortcut === car.shortcut
        ? Math.max(0, 1 - Math.abs(rolling.s - car.s) / 26)
        : 0
      this.engine?.pressure(near * near)
    } else if (args.live) {
      // Live, but nothing has arrived yet, or she has gone quiet. Better an
      // empty road than a car frozen where she was two seconds ago.
      args.theirs.root.visible = false
      args.lights.uniforms.uGhostPower.value = 0
      this.engine?.pressure(0)
    } else if (ghost) {
      // She set off when you did, so her clock is your clock. That is what
      // turns a sealed run into a race: the gap you can see is the gap there
      // would have been if you had both been here at once.
      args.theirs.root.visible = phase !== 'ready'
      const grid = Math.max(0, 1 - car.elapsed / 2.4) * -1.9
      const elapsedMs = phase === 'ready' ? 0 : car.elapsed * 1000
      this.showGhost(args, runAt(ghost, elapsedMs), elapsedMs, grid)
      const near = this.ghost.shortcut === car.shortcut
        ? Math.max(0, 1 - Math.abs(this.ghost.s - car.s) / 26)
        : 0
      this.engine?.pressure(near * near)
    } else {
      args.lights.uniforms.uGhostPower.value = 0
      this.engine?.pressure(0)
    }

    if (car.slam > 0.02) this.chase.jolt(car.slam * 1.1)
    if (car.hitStone) this.chase.jolt(0.5)
    this.settle += ((phase === 'finished' ? 1 : 0) - this.settle) * (1 - Math.exp(-1.6 * delta))
    this.chase.update(
      args.camera,
      track,
      car,
      delta,
      phase === 'ready' ? 1 - this.countdown / COUNTDOWN : 1,
      this.settle,
    )
  }

  /**
   * What the shaders are told about where the light is.
   *
   * Taken off the rig itself rather than recomputed from the road, so when the
   * body rolls into a corner the beams roll with it. That is most of why a
   * drift through a narrow section looks like a car and not like a torch
   * running along a rail.
   */
  private updateLightsFrom(args: FrameArgs, rig: CarRig, ember: number) {
    const { lights } = args
    rig.root.updateMatrixWorld(true)
    lights.headLeft.set(-0.46, 0.62, 1.66).applyMatrix4(rig.body.matrixWorld)
    lights.headRight.set(0.46, 0.62, 1.66).applyMatrix4(rig.body.matrixWorld)
    // The pod, from where it actually sits on the bonnet — so when the nose
    // dives under braking the long beam dips with it and the far end of the
    // straight goes dark, which is exactly what it does in a real car.
    lights.spot.set(0, 0.86, 1.56).applyMatrix4(rig.body.matrixWorld)
    this.forward.set(0, 0, 1).transformDirection(rig.body.matrixWorld).normalize()
    lights.headDir.copy(this.forward)

    lights.uniforms.uEmberPos.value.set(0, 0.5, -0.5).applyMatrix4(rig.body.matrixWorld)
    lights.uniforms.uEmberPower.value = 1.15 + ember * 1.3
  }

  /** A continuous exhaust jet with pressure in it, rooted in both silencers. */
  private updateBoostJets(rig: CarRig, burning: boolean) {
    rig.boostJets.visible = burning
    if (!burning) return
    const pulse = 1 + Math.sin(this.clock * 43) * 0.1 + Math.sin(this.clock * 71) * 0.055
    // Most of the movement is lengthwise. A flame that inflates like a balloon
    // reads as magic; a pressure column that lashes behind the pipes reads as
    // thrust even in a still frame.
    rig.boostJets.scale.set(0.96 + pulse * 0.08, 0.96 + pulse * 0.08, 1.04 + pulse * 0.18)
  }

  /*
    The second car, from wherever it came from.

    It used to take a recording and a time and look her up. It takes the sample
    itself now, because in a live race there is no recording to look anything
    up in — she is driving, and the sample came off her phone a fraction of a
    second ago. Everything below this line is the same either way, which is the
    point: her brake lamps, her smoke and her line are drawn from the same four
    numbers whether they were saved last night or arrived just now.
  */
  private showGhost(args: FrameArgs, sample: RunSample, elapsedMs: number, grid = 0) {
    const rig = args.theirs
    Object.assign(this.ghost, sample)

    const live = 'liveMotion' in sample ? sample as RollingSample : null
    const driftRoll = sample.drift * 0.16 * Math.sign(sample.yaw || 1)
    const turningRoll = live ? live.yawRate * live.speed * 0.0035 : 0
    const roll = Math.max(-0.14, Math.min(0.14, driftRoll + turningRoll))
    /*
      `grid` is the one place her car is not exactly where she drove.

      You both set off from the same standing start, so for the first couple of
      seconds her line and yours are the same line and the two cars are inside
      each other. She is drawn a car's width over for those seconds and eases
      back onto her real line — which is a starting grid, and is both prettier
      and more honest than two cars occupying one piece of road.
    */
    placeCar(
      rig, args.track, sample.s, sample.n + grid, sample.yaw, roll, 0, 0, 0,
      sample.shortcut, elapsedMs / 1000,
    )

    // A live car brings its smoothed velocity. A recording has no velocity,
    // so its wheels retain the distance-per-frame fallback when replayed.
    const moved = Math.max(0, Math.min(4, sample.s - this.lastGhostS))
    this.lastGhostS = sample.s
    poseGhostWheels(
      rig,
      live ? Math.max(-25, Math.min(90, live.speed)) : moved / Math.max(0.004, args.delta),
      sample.drift,
      sample.yaw,
      sample.spinning,
      args.delta,
      live?.liveMotion ? live.steering : undefined,
    )

    args.materials.theirs.uniforms.uGlow.value = sample.boost ? 1 : 0.45
    // Her brake lamps. Four bits in the recording, and between them they are
    // the difference between a marker being dragged along a line and somebody
    // driving — you can see her braking point before you reach your own.
    args.materials.theirs.uniforms.uBrake.value = sample.braking ? 1 : 0
    args.materials.theirs.uniforms.uPipe.value = sample.boost ? 1 : 0
    this.updateBoostJets(rig, sample.boost)
    for (const material of args.materials.theirsWheels) {
      material.uniforms.uDisc.value = sample.braking ? 0.55 : 0
    }
    args.materials.ghostBeam.uniforms.uPower.value = 0.34
    args.materials.trail.uniforms.uNow.value = elapsedMs / 1000

    rig.root.updateMatrixWorld(true)
    args.lights.uniforms.uGhostPos.value.set(0, 0.7, 0).applyMatrix4(rig.root.matrixWorld)
    args.lights.uniforms.uGhostPower.value = 0.85

    if (sample.drift > 0.25 || sample.rough) {
      this.spit(args.dust, rig, GHOST_GRIT, sample.drift * 0.5 + 0.2, 0.16)
    }
  }

  // --- the replay ----------------------------------------------------------

  private stepReplay(args: FrameArgs) {
    const replay = useRace.getState().replay
    if (!replay) return
    const { track, delta } = args

    const duration =
      Math.max(runDurationMs(replay.mine), runDurationMs(replay.theirs)) / 1000 + 1.6
    if (this.shots.length === 0) {
      this.shots = planShots(
        (t) => runAt(replay.mine, t * 1000).s - runAt(replay.theirs, t * 1000).s,
        duration,
      )
    }
    if (this.clock > duration) this.clock = 0

    const at = this.clock * 1000
    // In a replay this clock *is* the race clock, so the bridge follows it.
    args.lights.uniforms.uSway.value.x = this.clock
    const me = runAt(replay.mine, at)
    const them = runAt(replay.theirs, at)

    /*
      Side by side rather than inside each other.

      Two people who drove the same road at the same pace were, for those
      seconds, in the same piece of it — which is the whole point of the chase
      and completely illegible to look at. Where they are within a car's width
      of each other the replay opens them out to either side of where they both
      were. It is the only place in the game where a car is not exactly where
      somebody drove it, and it earns that by being the difference between a
      pass you can see and two cars flickering through one another.
    */
    let split = 0
    if (Math.abs(me.s - them.s) < 4.5) {
      const apart = Math.abs(me.n - them.n)
      if (apart < 2.1) split = ((2.1 - apart) / 2.1) * 1.15
    }
    const side = me.n >= them.n ? 1 : -1
    me.n += split * side
    them.n -= split * side

    placeCar(args.mine, track, me.s, me.n, me.yaw, me.drift * 0.14, 0, 0, 0, me.shortcut, this.clock)
    poseGhostWheels(args.mine, 30, me.drift, me.yaw, me.spinning, delta)
    args.materials.mine.uniforms.uGlow.value = me.boost ? 1 : 0.4
    args.materials.mine.uniforms.uBrake.value = me.braking ? 1 : 0
    args.materials.mine.uniforms.uPipe.value = me.boost ? 1 : 0
    this.updateBoostJets(args.mine, me.boost)
    for (const material of args.materials.mineWheels) {
      material.uniforms.uDisc.value = me.braking ? 0.55 : 0
    }
    args.materials.beam.uniforms.uPower.value = 1
    args.lights.uniforms.uSpotPower.value = 1
    this.updateLightsFrom(args, args.mine, me.boost ? 1 : 0.4)
    if (me.drift > 0.25 || me.rough) {
      this.spit(args.dust, args.mine, GRIT, me.drift * 0.6 + 0.2, 0.2)
    }

    this.showGhost(args, runAt(replay.theirs, at), at, them.n - runAt(replay.theirs, at).n)

    // The camera and the chunk window both ask the car where it is, so it is
    // told — the replay has no physics but it does have a subject.
    this.car.s = me.s
    this.car.n = me.n
    this.car.psi = me.yaw
    this.car.vs = 30
    this.car.vn = Math.tan(me.drift * 0.6) * 30
    this.car.rough = me.rough
    this.car.boostLeft = me.boost ? 1 : 0
    this.car.shortcut = me.shortcut

    this.directShot(args, me)
  }

  /**
   * The camera, cut rather than driven.
   *
   * `planShots` chose the cuts before the replay began, against the real gap
   * between the two cars, so a lead change is cut *to* rather than caught up
   * with. All that is left here is placing the camera for whichever shot is
   * running and pointing it at the right car.
   */
  private directShot(args: FrameArgs, me: RunSample) {
    const { camera, track, delta } = args

    let shot = this.shots[0]
    let index = 0
    for (let i = 0; i < this.shots.length; i++) {
      if (this.shots[i].at <= this.clock) {
        shot = this.shots[i]
        index = i
      } else break
    }
    // A cut is a cut. Easing between two shots drags the camera through
    // whatever rock happens to be between them, which is both ugly and, for a
    // second or so, completely opaque.
    const cut = index !== this.shotIndex
    this.shotIndex = index

    const subject = shot.on === 'theirs' ? this.ghost : me

    if (shot.kind === 'chase') {
      this.chase.update(camera, track, this.car, delta)
      return
    }
    // Coming back to a chase shot later should not inherit a stale spring.
    if (cut) this.chase.reset()

    /*
      Every fixed shot is placed in the road's own frame and then clamped
      inside the tunnel, because the tunnel is the only thing there is: a
      camera two and a half metres off the middle of a three-metre road is
      inside a wall, and what that renders as is a full-screen slab of orange
      with no way to tell what went wrong.
    */
    const place = (along: number, n: number, y: number) => {
      const road = roadAtRoute(track, Math.max(0, along), subject.shortcut, shotRoad)
      const basis = basisAt(road, shotBasis)
      const inside = road.width + vergeWidth(road.room) - 0.7
      roadPoint(
        road,
        Math.max(-inside, Math.min(inside, n)),
        Math.max(0.3, Math.min(road.ceiling - 0.6, y)),
        this.point,
        basis,
      )
      if (cut) camera.position.copy(this.point)
      else camera.position.lerp(this.point, 1 - Math.exp(-7 * delta))
    }

    switch (shot.kind) {
      // Standing at the edge of the road a little way along, watching them come
      // and then go. The camera holds still; the pan is the cars.
      case 'trackside':
        place(subject.s + 22, 99 * (index % 2 ? 1 : -1), 1.3)
        break
      // Down at axle height, just off the racing line.
      case 'low':
        place(subject.s + 6, subject.n + (index % 2 ? 2.4 : -2.4), 0.36)
        break
      // Up in the vault of a chamber, looking down as they come through.
      case 'chamber':
        place(subject.s + 16, 0, 99)
        break
      // Just ahead of the nose, travelling with them.
      default:
        place(subject.s + 8, subject.n * 0.6, 1.5)
        break
    }

    const road = roadAtRoute(track, subject.s, subject.shortcut, shotRoad)
    roadPoint(road, subject.n, 0.75, this.point, basisAt(road, shotBasis))
    camera.lookAt(this.point)
    if (Math.abs(camera.fov - 56) > 0.05) {
      camera.fov = 56
      camera.updateProjectionMatrix()
    }
  }

  // --- dust, sparks, ash ---------------------------------------------------

  /**
   * Lightning, in strokes rather than a sine.
   *
   * -------------------------------------------------------------------------
   * The sky already had a flash and it was `pow(sin(t), 96)` — perfectly even,
   * exactly the same every time, and a storm you can set your watch by is not
   * a storm. Real lightning is a stroke, a gap you could count in, and often
   * another one down the same channel; it is the *irregularity* that makes it
   * frightening.
   *
   * So: a countdown to the next flash, and a flash that is one, two or three
   * strokes with a beat between them. Decay is fast — a tenth of a second —
   * because what makes a flash read as enormously bright is not its brightness,
   * it is how quickly it is gone.
   * -------------------------------------------------------------------------
   */
  private strike(delta: number) {
    this.nextStrike -= delta
    if (this.nextStrike <= 0) {
      if (this.strokesLeft > 0) {
        this.strokesLeft--
        storm.flash = 0.55 + Math.random() * 0.45
        this.nextStrike = 0.06 + Math.random() * 0.12
      } else {
        // Rarer up in the clear air: the storm is behind and below you now.
        const quiet = 3.2 + storm.above * 5
        this.nextStrike = quiet + Math.random() * 6
        this.strokesLeft = Math.random() < 0.45 ? 2 : 1
      }
    }
    storm.flash *= Math.exp(-9 * delta)
  }

  private throwDust(args: FrameArgs, car: CarState, speed: number, slip: number) {
    const { delta } = args
    const drifting = Math.abs(slip) > 0.13 && speed > 9

    /*
      Sand off the back wheels, the whole time the car is moving.

      `throwLooseEarth` below only fires when a wheel is actually *off* the
      road, and the grit further down only when the car is sliding — so on the
      two roads made of sand, driving normally down the middle of them threw
      nothing at all. A rear tyre on a canyon floor is always lifting a little
      of it, and that thin trail behind the car is most of what says the wheels
      are touching the ground rather than hovering over a picture of it.

      Rate rather than a per-frame count, so it is the same trail at thirty
      frames a second as at a hundred and twenty. Scaled by speed *and* by
      throttle, because a car being driven kicks up more than one rolling to a
      stop, and squared against the road's own looseness so the Moonbreak's
      stone causeway gets essentially nothing.
    */
    const loose = args.track.loose
    if (loose > 0.05 && speed > 3) {
      const want = loose * loose * (0.6 + car.throttle * 0.8) * Math.min(1, speed / 18)
      this.sandDue -= delta * want * SAND_RATE
      while (this.sandDue < 0) {
        this.sandDue += 1
        this.colour.copy(car.road.wet > 0.45 ? WET_GRIT : GRIT)
        this.spitOne(args.dust, args.mine, this.colour, 0.1 + speed * 0.003, 0.9, 2.4)
      }
    }

    this.throwLooseEarth(args, car, speed)
    this.throwSilencerHaze(args, car, speed)
    this.throwNitro(args, car, speed)

    if (drifting) {
      const heat = Math.min(1, Math.abs(slip) * 3)
      this.colour.copy(car.road.wet > 0.45 ? WET_GRIT : GRIT)
      this.spit(args.dust, args.mine, this.colour, heat, 0.15 + speed * 0.005)
    }

    /*
      And smoke, off whichever tyres are actually sliding.

      Not the same thing as the grit above, and it comes from somewhere else:
      grit is picked up off loose ground and thrown backwards, smoke is the
      tyre itself giving up and it hangs where it was made. Each wheel is
      asked separately, so a locked inside-front under braking smokes on its
      own — and once you have seen that once you know why the car would not
      turn in.

      Nothing at all on the loose stuff. Rubber only smokes on something hard
      enough to tear it.
    */
    if (!car.rough && speed > 8) {
      let sliding = 0
      for (const wheel of car.wheels) {
        sliding = Math.max(sliding, Math.abs(wheel.slipRatio) - 0.22, Math.abs(wheel.slipAngle) - 0.2)
      }
      if (sliding > 0) {
        this.smokeDue -= delta * (10 + sliding * 90) * Math.min(1, speed / 22)
        while (this.smokeDue < 0) {
          this.smokeDue += 1
          // Pick the worst offender, so the smoke is where the mistake is.
          let worst = 0
          let amount = 0
          for (let i = 0; i < 4; i++) {
            const wheel = car.wheels[i]
            const bad = Math.abs(wheel.slipRatio) * 0.6 + Math.abs(wheel.slipAngle) * 2
            if (bad > amount) {
              amount = bad
              worst = i
            }
          }
          this.smokeFrom(args.dust, args.mine, MESH_FOR_WHEEL[worst], Math.min(1, amount))
        }
      }
    }

    if (car.slam > 0.02 || car.hitStone) {
      const force = car.hitStone ? 0.7 : car.slam
      this.engine?.hit(force)
      this.chase.jolt(0.35)
      const many = 8 + Math.round(force * 14)
      for (let i = 0; i < many; i++) {
        this.spitOne(args.sparks, args.mine, HOT_SPARK, 0.11, 4.5, 0)
      }
    } else if (car.hitWall > 0.01) {
      // Scraping along it — a trickle rather than a burst.
      this.gritDue -= delta * 70 * car.hitWall
      while (this.gritDue < 0) {
        this.gritDue += 1
        this.spitOne(args.sparks, args.mine, SPARK, 0.075, 2.6, 0)
      }
    }

    if (car.released > 0) {
      this.engine?.chirp(car.released)
      this.chase.jolt(0.18 * car.released)
      const many = 12 + car.released * 12
      for (let i = 0; i < many; i++) {
        this.spitOne(
          args.sparks,
          args.mine,
          car.released > 1 ? BLUE_SPARK : SPARK,
          0.095,
          3.2,
          0,
        )
      }
    }

    /*
      And the air itself.

      Dust spawned ahead of the car and then left exactly where it is. It reads
      as speed because it genuinely is not moving and you genuinely are, which
      is the whole difference between this and a streak drawn on the glass.

      **In the band you can actually see through, not up to the roof.** This
      used to spread the motes over three quarters of the ceiling, which is
      fine in a tunnel — the Rootway's roof is 5.6 metres and every mote landed
      in front of you. The Moonbreak's "ceiling" is 18 and the Stormcrown's is
      34, because those are open sky rather than rock, so nine out of ten motes
      were spawning somewhere above your head where they read as haze and never
      passed the camera at all. Which is exactly why those two roads looked
      parked with the engine off, and the tunnel did not.

      Capped at head height instead. The tunnel is unchanged to within a
      handspan; the open roads get the same air, in the place it is worth
      having, without a single extra particle being drawn.
    */
    this.motesDue -= delta * (6 + speed * 1.6)
    while (this.motesDue < 0) {
      this.motesDue += 1
      const road = roadAt(this.track, car.s + 12 + Math.random() * 46, shotRoad)
      const basis = basisAt(road, shotBasis)
      roadPoint(
        road,
        (Math.random() * 2 - 1) * road.width * 1.1,
        0.25 + Math.random() * Math.min(road.ceiling * 0.75, MOTE_CEILING),
        this.point,
        basis,
      )
      args.dust.spawn(
        this.point.x, this.point.y, this.point.z,
        (Math.random() - 0.5) * 0.4, -0.05 - Math.random() * 0.1, (Math.random() - 0.5) * 0.4,
        3.4 + Math.random() * 2.6,
        0.035 + Math.random() * 0.05,
        0.4,
        MOTE,
      )
    }

    /*
      And water off the roof.

      Rarer than the dust and much faster: a bright cold streak falling out of
      the dark, straight down, gone in under a second. Two of them a second at
      most, and only where the rock is wet.

      It is the smallest thing in the tunnel and it does more than its size.
      Everything else down here either belongs to the car or is standing still,
      so the drips are the only evidence that the cave is a *place* that goes on
      whether or not anybody is driving through it — and being vertical, in a
      world where everything else is streaming past horizontally, they read as
      scale without anybody having to think about it.
    */
    const wet = car.road.wet
    if (wet > 0.12) {
      this.dripDue -= delta * (0.5 + wet * 2.6)
      while (this.dripDue < 0) {
        this.dripDue += 1
        const road = roadAt(this.track, car.s + 14 + Math.random() * 40, shotRoad)
        const basis = basisAt(road, shotBasis)
        roadPoint(
          road,
          (Math.random() * 2 - 1) * road.width * 1.15,
          road.ceiling * (0.72 + Math.random() * 0.24),
          this.point,
          basis,
        )
        args.dust.spawn(
          this.point.x, this.point.y, this.point.z,
          0, -2.6 - Math.random() * 1.8, 0,
          1.1,
          0.02 + Math.random() * 0.018,
          // It stretches as it falls rather than swelling like dust.
          1.6,
          DRIP,
        )
      }
    }
  }

  /**
   * Loose ground, wheel by wheel.
   *
   * `car.rough` only changes after the centre of the car has left the stone;
   * that is the right threshold for handling and the wrong threshold for what
   * the eye sees. A single outside tyre can already be deep in roots and soil.
   * This uses each contact patch, so the first wheel over the edge speaks first
   * and all four build a proper wake once the whole car is off-road.
   */
  private throwLooseEarth(args: FrameArgs, car: CarState, speed: number) {
    if (speed < 1.5) {
      this.earthDue.fill(0)
      return
    }

    const cos = Math.cos(car.psi)
    const sin = Math.sin(car.psi)
    const edge = car.road.width - 0.12

    for (let i = 0; i < 4; i++) {
      const along = i < 2 ? AXLE_FRONT : AXLE_REAR
      const lateral = i % 2 === 0 ? -AXLE_HALF_TRACK : AXLE_HALF_TRACK
      const wheelN = car.n + lateral * cos + along * sin
      const depth = Math.max(0, Math.min(1, (Math.abs(wheelN) - edge) / 0.72))
      if (depth <= 0) {
        this.earthDue[i] = 0
        continue
      }

      this.earthDue[i] -= args.delta * (12 + speed * 2.25) * (0.35 + depth * 0.65)
      while (this.earthDue[i] <= 0) {
        this.earthDue[i] += 1
        this.earthFromWheel(args.dust, args.mine, i, depth, speed, car.road.wet)
      }
    }
  }

  /** One clod and its dust, born exactly under one tyre. */
  private earthFromWheel(
    into: Particles,
    rig: CarRig,
    wheel: number,
    depth: number,
    speed: number,
    wet: number,
  ) {
    const hub = rig.hubs[MESH_FOR_WHEEL[wheel]]
    hub.updateMatrixWorld(true)
    this.point.set(0, -WHEEL_RADIUS + 0.045, 0).applyMatrix4(hub.matrixWorld)
    this.forward.set(0, 0, -1).transformDirection(rig.body.matrixWorld).normalize()
    const side = wheel % 2 === 0 ? 1 : -1
    this.sideways.set(side, 0, 0).transformDirection(rig.body.matrixWorld).normalize()
    const throwBack = 1.8 + Math.min(4.2, speed * 0.1)
    const throwOut = 0.5 + depth * 1.4
    const colour = wet > 0.48 ? WET_GRIT : LOOSE_EARTH

    into.spawn(
      this.point.x,
      this.point.y,
      this.point.z,
      this.forward.x * throwBack + this.sideways.x * throwOut + (Math.random() - 0.5) * 0.8,
      0.65 + depth * 1.35 + Math.random() * 0.75,
      this.forward.z * throwBack + this.sideways.z * throwOut + (Math.random() - 0.5) * 0.8,
      0.55 + Math.random() * 0.5,
      0.11 + depth * 0.17 + Math.random() * 0.07,
      1.6 + depth * 1.3,
      colour,
    )

    // A smaller, denser piece inside the cloud is what makes the cloud read
    // as ground being thrown rather than smoke being played at the wheel.
    if (Math.random() < 0.46 + depth * 0.3) {
      into.spawn(
        this.point.x,
        this.point.y,
        this.point.z,
        this.forward.x * throwBack * 1.2 + this.sideways.x * throwOut,
        1 + Math.random() * 1.8,
        this.forward.z * throwBack * 1.2 + this.sideways.z * throwOut,
        0.35 + Math.random() * 0.35,
        0.035 + Math.random() * 0.045,
        0.25,
        wet > 0.48 ? WET_GRIT : GRIT,
      )
    }
  }

  /**
   * Low-speed exhaust from the two silencers.
   *
   * It follows the live pedal during the countdown, not the locked physics
   * throttle. At road speed the wake tears it away too quickly to see, so it
   * naturally retires after the launch instead of becoming permanent smoke.
   */
  private throwSilencerHaze(args: FrameArgs, car: CarState, speed: number) {
    if (car.boostLeft > 0) {
      this.exhaustLoaded = false
      this.exhaustDue = 0
      return
    }
    const phase = useRace.getState().phase
    const pedal = phase === 'ready' ? this.input.throttle : car.throttle
    const lowSpeed = Math.max(0, 1 - speed / 17)
    const loaded = pedal * lowSpeed
    if (loaded < 0.035) {
      this.exhaustLoaded = false
      this.exhaustDue = 0
      return
    }

    if (!this.exhaustLoaded) {
      // The first squeeze clears both pipes with a short, visible cough.
      for (let i = 0; i < 4; i++) this.silencerPuff(args.dust, args.mine, loaded, i % 2 === 0 ? -1 : 1)
      this.exhaustLoaded = true
      this.exhaustDue = 0.16
    }
    this.exhaustDue -= args.delta * (4 + loaded * 13)
    while (this.exhaustDue <= 0) {
      this.exhaustDue += 1
      this.silencerPuff(args.dust, args.mine, loaded, Math.random() < 0.5 ? -1 : 1)
    }
  }

  /** One pulse out of one physical tailpipe. */
  private silencerPuff(into: Particles, rig: CarRig, load: number, side: number) {
    rig.body.updateMatrixWorld(true)
    this.point.set(side * 0.3, 0.26, -1.94).applyMatrix4(rig.body.matrixWorld)
    this.forward.set(0, 0, -1).transformDirection(rig.body.matrixWorld).normalize()
    const shove = 1.25 + load * 2.5
    into.spawn(
      this.point.x,
      this.point.y,
      this.point.z,
      this.forward.x * shove + (Math.random() - 0.5) * 0.36,
      0.16 + Math.random() * 0.34,
      this.forward.z * shove + (Math.random() - 0.5) * 0.36,
      0.48 + Math.random() * 0.42,
      0.08 + load * 0.12 + Math.random() * 0.035,
      2.4,
      EXHAUST_HAZE,
    )
  }

  /** A pressure front at ignition, then a dense flame torn from both pipes. */
  private throwNitro(args: FrameArgs, car: CarState, speed: number) {
    const burning = car.boostLeft > 0
    if (!burning) {
      this.nitroBurning = false
      this.nitroDue = 0
      return
    }

    if (!this.nitroBurning) {
      this.nitroBurning = true
      this.chase.jolt(0.28)
      for (let i = 0; i < 24; i++) {
        this.nitroParticle(args.sparks, args.mine, i < 8)
      }
    }

    this.nitroDue -= args.delta * (30 + Math.min(32, speed * 0.7))
    while (this.nitroDue <= 0) {
      this.nitroDue += 1
      this.nitroParticle(args.sparks, args.mine, Math.random() < 0.18)
    }
  }

  /** One short additive lick, always born at a pipe rather than in the air. */
  private nitroParticle(into: Particles, rig: CarRig, core: boolean) {
    rig.body.updateMatrixWorld(true)
    const side = Math.random() < 0.5 ? -0.3 : 0.3
    this.point.set(side, 0.26, -1.98).applyMatrix4(rig.body.matrixWorld)
    this.forward.set(0, 0, -1).transformDirection(rig.body.matrixWorld).normalize()
    const shove = 6 + Math.random() * 7
    into.spawn(
      this.point.x,
      this.point.y,
      this.point.z,
      this.forward.x * shove + (Math.random() - 0.5) * 1.1,
      (Math.random() - 0.35) * 1.1,
      this.forward.z * shove + (Math.random() - 0.5) * 1.1,
      0.16 + Math.random() * 0.2,
      core ? 0.09 + Math.random() * 0.07 : 0.07 + Math.random() * 0.09,
      core ? 0.15 : 0.55,
      core ? NITRO_CORE : NITRO_FLAME,
    )
  }

  /**
   * A puff of rubber off one named wheel.
   *
   * Spawned at the *contact patch* — the bottom of the tyre, not the middle of
   * the axle — because smoke that appears at hub height reads as steam coming
   * off the engine. Barely any velocity of its own: it is left behind, and the
   * car leaving it behind at forty metres a second is the whole effect.
   */
  private smokeFrom(into: Particles, rig: CarRig, wheel: number, amount: number) {
    const hub = rig.hubs[wheel]
    hub.updateMatrixWorld(true)
    this.point.set(0, -WHEEL_RADIUS + 0.06, 0).applyMatrix4(hub.matrixWorld)
    into.spawn(
      this.point.x,
      this.point.y,
      this.point.z,
      (Math.random() - 0.5) * 1.4,
      0.5 + Math.random() * 1.1,
      (Math.random() - 0.5) * 1.4,
      0.7 + Math.random() * 0.8,
      0.16 + amount * 0.2,
      // Smoke grows a great deal as it hangs, which is what separates it from
      // grit at a glance even before you have registered the colour.
      3.4,
      SMOKE,
    )
  }

  /**
   * Lay rubber, wheel by wheel.
   *
   * Distance-based rather than time-based: a mark every twenty-five centimetres
   * of travel, so the strips overlap into one smear at any speed instead of
   * being sparse at forty metres a second and piled up at ten.
   *
   * The direction is the one the *tyre* is travelling, not the one the car is
   * pointing — which is the whole difference. A car in a drift lays its marks
   * along the line it is actually taking, at an angle to itself, and that
   * angle is exactly what you can read off the road afterwards.
   */
  private layMarks(args: FrameArgs, car: CarState, speed: number) {
    if (car.rough || speed < 4) return
    const rig = args.mine
    rig.body.updateMatrixWorld(true)

    // The car's own axes in the world. Its right is −X of the mesh: see the
    // note on the mirror in `rig.ts`.
    this.forward.set(0, 0, 1).transformDirection(rig.body.matrixWorld).normalize()
    this.sideways.set(-1, 0, 0).transformDirection(rig.body.matrixWorld).normalize()

    // Where the car is going, as opposed to where it is facing.
    const travel = Math.max(0.001, Math.hypot(car.vs, car.vn))
    this.heading
      .copy(this.forward)
      .multiplyScalar(car.vs / travel)
      .addScaledVector(this.sideways, car.vn / travel)
      .normalize()
    this.across.crossVectors(this.heading, this.up).normalize()

    for (let i = 0; i < 4; i++) {
      const wheel = car.wheels[i]
      /*
        How hard this tyre is working, as one number.

        Sliding sideways, locked, or spinning up — any of the three leaves
        rubber. The threshold is what keeps a straight line clean: an ordinary
        tyre at speed carries a couple of degrees of slip and half a per cent
        of slip ratio, and none of that should mark the road.
      */
      const scrub = Math.max(
        Math.abs(wheel.slipAngle) - 0.075,
        Math.abs(wheel.slipRatio) - 0.14,
      )

      /*
        On sand, a rolling tyre marks the road too.

        The threshold above is the right one for tarmac: an ordinary tyre at
        speed carries a couple of degrees of slip and half a per cent of slip
        ratio, and on stone none of that should leave rubber. On a canyon floor
        or a dust road it is the wrong question entirely — the surface moves out
        of the way of the tyre whatever the tyre is doing, so a car driven dead
        straight still leaves two lines behind it. Without this the Rootway had
        a car that never touched the ground.

        Rear wheels only, and far apart. Four wheels marking every twenty-five
        centimetres is four hundred and eighty marks a second at speed, against
        a pool of four hundred and twenty that holds twelve seconds — the whole
        trail would recycle inside a second and vanish behind the car. Two
        wheels every couple of metres is a continuous pair of tracks that lasts
        as long as it is meant to. The strips stretch to cover their own gap
        anyway, so wider spacing is not a dashed line.
      */
      const rear = i >= 2
      const rolling = rear ? args.track.loose : 0
      if (scrub <= 0 && rolling <= 0) {
        this.markDue[i] = 0
        continue
      }

      this.markDue[i] += speed * args.delta
      // Close together where rubber is actually being torn off; far apart when
      // this is only the ground giving way under a rolling wheel.
      if (this.markDue[i] < (scrub > 0 ? 0.25 : 1.9)) continue
      /*
        Each mark is as long as the gap it is filling.

        Only one strip is laid per wheel per frame, so a fixed length leaves
        holes the moment the car travels further than that in a frame — which
        at forty metres a second is every frame. The result was a dashed line,
        which reads as a row of tiles rather than as rubber. Stretching the
        strip to cover the distance since the last one makes it tile at any
        speed and any frame rate, and costs nothing.
      */
      const gap = this.markDue[i]
      this.markDue[i] = 0
      // Generous overlap: the shader tapers each end, so strips sized exactly
      // to the gap still leave a faded seam between them.
      const half = Math.max(0.22, gap * 0.78)

      const hub = rig.hubs[MESH_FOR_WHEEL[i]]
      hub.updateMatrixWorld(true)
      // The contact patch, lifted a centimetre so it does not fight the stone.
      this.point.set(0, -WHEEL_RADIUS + 0.012, 0).applyMatrix4(hub.matrixWorld)
      // Laid *behind* the wheel, because that is the ground it has covered.
      this.point.addScaledVector(this.heading, -gap * 0.5)

      /*
        A rolling track is a faint one. It is the ground remembering a wheel,
        not a tyre being destroyed, and if it comes out anywhere near as dark
        as a drift mark then every road looks permanently abused.
      */
      const strength =
        Math.max(Math.min(0.8, scrub * 2.4), rolling * 0.16) * (1 - car.road.wet * 0.5)
      args.marks.lay(
        this.point.x, this.point.y, this.point.z,
        this.heading.x * half, this.heading.y * half, this.heading.z * half,
        this.across.x * 0.1, this.across.y * 0.1, this.across.z * 0.1,
        strength,
        this.clock,
      )
    }
  }

  /** Grit off the back tyres. Many, small, and they swell as they hang. */
  private spit(into: Particles, rig: CarRig, colour: Color, heat: number, size: number) {
    const many = 2 + Math.round(heat * 4)
    for (let i = 0; i < many; i++) this.spitOne(into, rig, colour, size, 1.4, 2.2)
  }

  /**
   * One particle, thrown from a rear wheel.
   *
   * `grow` is the one parameter worth naming: dust expands as it hangs and
   * sparks do not. Everything was on the same value once, and a spark that
   * grows to two metres across is a paper bag.
   */
  private spitOne(
    into: Particles,
    rig: CarRig,
    colour: Color,
    size: number,
    spread: number,
    grow: number,
  ) {
    rig.body.updateMatrixWorld(true)
    this.point
      .set((Math.random() < 0.5 ? -1 : 1) * AXLE_HALF_TRACK, 0.12, AXLE_REAR - 0.15)
      .applyMatrix4(rig.body.matrixWorld)
    this.forward.set(0, 0, -1).transformDirection(rig.body.matrixWorld)
    into.spawn(
      this.point.x,
      this.point.y,
      this.point.z,
      this.forward.x * spread + (Math.random() - 0.5) * spread * 1.4,
      0.7 + Math.random() * spread * 0.8,
      this.forward.z * spread + (Math.random() - 0.5) * spread * 1.4,
      0.45 + Math.random() * 0.7,
      size * (0.5 + Math.random() * 0.8),
      grow,
      colour,
    )
  }

  // --- bookkeeping ---------------------------------------------------------

  /**
   * Only draw the road you can see.
   *
   * The fog closes at a hundred and twenty metres, so a chunk beginning past
   * that is a hundred per cent fog colour, and one two hundred metres behind
   * you is behind the camera. Frustum culling would get there eventually, but
   * it still has to transform every bounding sphere; this is a subtraction.
   */
  private updateChunks(args: FrameArgs) {
    const here = this.car.s
    for (let i = 0; i < args.chunkRanges.length; i++) {
      const mesh = args.chunks[i]
      if (!mesh) continue
      const range = args.chunkRanges[i]
      const ahead = this.track.stage === 'rootway' ? 150 : this.track.stage === 'moonbreak' ? 230 : 205
      const close = range.to > here - 70 && range.from < here + ahead
      if (!close) {
        mesh.visible = false
        continue
      }
      const split = this.track.split
      if (!split || range.shortcut === undefined) {
        mesh.visible = true
        continue
      }
      /*
        Keep both roads drawn for the whole physical fork.

        This used to stop at `from + 5`, while the route could still be chosen
        until `commitAt` and the two shells did not finish separating until
        `separateAt`. The unchosen road therefore vanished in the middle of the
        decision and the junction visually collapsed back into one tunnel.
      */
      const atJunction = here < split.separateAt + 18 || here > split.rejoinAt - 80
      mesh.visible = range.shortcut === this.car.shortcut || atJunction
    }
  }

  /**
   * Which ten lanterns are lit.
   *
   * A window that walks along with the car. The cursor mostly only moves
   * forward, so this is a couple of comparisons a frame rather than a search
   * through a hundred and twenty lights — and it walks back too, because a
   * replay loops round to the start.
   */
  private updateLamps(args: FrameArgs) {
    const { track, lights, lanternAt } = args
    const here = this.car.s
    const lanterns = track.lanterns

    while (this.lampCursor < lanterns.length - 1 && lanterns[this.lampCursor].s < here - 26) {
      this.lampCursor++
    }
    while (this.lampCursor > 0 && lanterns[this.lampCursor - 1].s > here - 26) {
      this.lampCursor--
    }

    let slot = 0
    for (let i = this.lampCursor; i < lanterns.length && slot < LAMP_SLOTS; i++) {
      const lantern = lanterns[i]
      if (lantern.s > here + 115) break

      const flicker =
        lantern.warm > 0.4
          ? 0.86 +
            Math.sin(this.clock * 7.7 + i * 2.1) * 0.09 +
            Math.sin(this.clock * 14.3 + i) * 0.06
          : 0.94 + Math.sin(this.clock * 0.9 + i) * 0.06
      const power = (lantern.fire ? 2.2 : lantern.size * 0.85) * flicker

      lights.lamps[slot * 4] = lanternAt[i * 3]
      lights.lamps[slot * 4 + 1] = lanternAt[i * 3 + 1]
      lights.lamps[slot * 4 + 2] = lanternAt[i * 3 + 2]
      lights.lamps[slot * 4 + 3] = lantern.fire
        ? 24
        : 2.4 + lantern.size * (lantern.warm > 0.4 ? 7 : 3.4)

      if (lantern.warm > 0.4) {
        lights.lampColors[slot * 3] = 0.95 * power
        lights.lampColors[slot * 3 + 1] = 0.46 * power
        lights.lampColors[slot * 3 + 2] = 0.17 * power
      } else {
        lights.lampColors[slot * 3] = 0.16 * power
        lights.lampColors[slot * 3 + 1] = 0.6 * power
        lights.lampColors[slot * 3 + 2] = 0.52 * power
      }
      slot++
    }
    for (; slot < LAMP_SLOTS; slot++) {
      lights.lamps[slot * 4 + 3] = 0.0001
      lights.lampColors[slot * 3] = 0
      lights.lampColors[slot * 3 + 1] = 0
      lights.lampColors[slot * 3 + 2] = 0
    }
  }
}

const IDLE: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }

const drawnAhead = new Vector3()
const drawnWheel = new Vector3()

/**
 * The angle the drawn front wheels make with the drawn car, right positive.
 *
 * Both directions are taken out of world matrices, so this reports what is on
 * the screen rather than what anything intended. The cross product against the
 * body's up gives the sign: positive means the wheel is turned toward the side
 * of the car that the physics calls right.
 */
function drawnSteerOf(rig: CarRig): number {
  rig.root.updateMatrixWorld(true)
  drawnAhead.set(0, 0, 1).transformDirection(rig.body.matrixWorld).normalize()
  drawnWheel.set(0, 0, 1).transformDirection(rig.hubs[0].matrixWorld).normalize()
  const dot = Math.max(-1, Math.min(1, drawnAhead.dot(drawnWheel)))
  // In this scene the car's right is −X of the mesh, so a wheel turned that
  // way has a *negative* cross-product component about the world up.
  const cross = drawnAhead.x * drawnWheel.z - drawnAhead.z * drawnWheel.x
  return Math.acos(dot) * Math.sign(cross || 1)
}

/** What the engine is told while the race is paused: a car, stopped. */
const SILENT = {
  speed: 0,
  revs: 0,
  gear: 0,
  shifting: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  scrubFront: 0,
  scrubRear: 0,
  wheelspin: 0,
  lockup: 0,
  rough: 0,
  wet: 0,
  tight: 0,
  boost: false,
  boostLeft: 0,
}/**
 * What the light is like above the water, and what it is like underneath.
 *
 * ---------------------------------------------------------------------------
 * **Going under is a change to the light, not a thing drawn on top of one.**
 *
 * Every material in this game — road, rock, car, wheels, dust, sparks, tyre
 * marks, the ghost, the glow of the lanterns — reads the same handful of
 * uniforms. That was built so the tunnel and the car could never be lit by two
 * different ideas of "lit", and it turns out to be exactly what a dive needs:
 * move these five numbers and the whole world goes under together, including
 * the parts of it nobody thought about. Anything else — a blue pane over the
 * camera, a second fog — would put the car in one world and the water in
 * another, and that is the version of this that looks like a filter.
 *
 * The fog does most of the work and it does two jobs at once. Pulling it in
 * from 62–235 metres to 15–95 is what water *is* — the far end of a straight
 * dissolves and the tube ahead of you fades into green — and it also means the
 * heaviest part of the road to draw is the part you can no longer see. The
 * Drowned Mile is the cheapest kilometre on the Moonbreak, which is a good
 * thing to be true of the one place where there are also fish.
 *
 * The ambient stays higher than the fog would suggest. Under water everything
 * is lit from *everywhere* — there is no shadow side to a fish — and a low
 * ambient with a tight fog reads as a cave with green mist rather than as
 * being submerged. It is the one number here that is chosen against realism.
 * ---------------------------------------------------------------------------
 */
/**
 * What the Rootway's light is on the lit road, and what it is inside Rootwake.
 *
 * ---------------------------------------------------------------------------
 * **Going into the hidden road is a change to the light, not a thing you drive
 * through.**
 *
 * The mouth used to be covered by a curtain of roots and old web that you
 * smashed. That is the wrong idea twice: it signposts the very thing it is
 * meant to conceal, and it turns an opening into a barrier. What actually
 * marks the crossing is the thing that is true about it — **the lanterns
 * stop.** The main road is hung with them every dozen metres; down here there
 * are three at the mouth and then nothing at all for a kilometre, and the only
 * light in the world is the two on the front of your own car.
 *
 * So the ambient falls away and the fog closes in, over about three seconds of
 * driving. Nothing flashes, nothing breaks, and the moment you notice is a
 * little after the moment it happened — which is exactly how going somewhere
 * darker actually feels.
 *
 * It leans on the same one property everything else in this garden leans on:
 * every material reads one shared block of uniforms, so moving these numbers
 * takes the rock, the car, the dust, the tyre marks and the ghost with it. A
 * darkness applied to some of those and not the others is a filter.
 * ---------------------------------------------------------------------------
 */
/**
 * The Stormcrown's three weathers, and you climb through all of them.
 *
 * ---------------------------------------------------------------------------
 * The fog is the whole instrument here, and it does the opposite thing in each
 * band — which is exactly why the road reads as three places rather than one
 * long grey ribbon:
 *
 *   under it   fog pulled in to sixty metres and coloured like wet slate. Rain
 *              in the headlights, cedars close on both sides. It is not dark
 *              for atmosphere; it is dark because you are under a storm
 *   in it      thirty-two metres, and *pale*. This is the only fog in the whole
 *              garden that is brighter than the thing it hides, because that is
 *              what cloud is: you are not losing the road to darkness, you are
 *              losing it to whiteness, which is far worse and much rarer in a
 *              racing game. The ambient goes right up — inside cloud there is
 *              no shadow side to anything
 *   above it   four hundred metres of clear black air, and the stars. The
 *              relief is the point, and it is measured in fog distance: from
 *              thirty-two to four hundred over about a hundred metres of road
 *
 * A driver who has just come up through the middle band will feel the third
 * one in their shoulders. That is the whole design.
 * ---------------------------------------------------------------------------
 */
/** What a stroke leaves on everything for a tenth of a second. */
const FLASH = new Color('#dfe9ef')

const STORM_LOW = {
  ambient: new Color('#4a565e'),
  fog: new Color('#1b2327'),
  near: 14,
  far: 60,
}

const STORM_CLOUD = {
  // Brighter than what it hides. See above.
  ambient: new Color('#9aa7ab'),
  fog: new Color('#b9c3c4'),
  near: 5,
  far: 32,
}

const STORM_HIGH = {
  ambient: new Color('#56657e'),
  fog: new Color('#0b1220'),
  /*
    Nine hundred metres, which is a long way for this garden and the whole
    point of being up here.

    At four hundred the peaks were fogged to black silhouettes and the snow on
    them — the one thing that says how high you have climbed — never survived
    to the screen. Above weather on a clear night you can see for miles; the
    only ceiling is the camera's own far plane at 2400.
  */
  near: 200,
  far: 900,
}

const ROOTWAY_LIT = {
  ambient: new Color('#4a5b72'),
  fogNear: 22,
  fogFar: 118,
}

const ROOTWAKE_DARK = {
  // Not black: a cave with no ambient at all reads as nothing having been
  // drawn, which is the note already written against the cave's own shader.
  ambient: new Color('#232c39'),
  fogNear: 13,
  fogFar: 68,
}

const ABOVE = {
  ambient: new Color('#a3b2c4'),
  vein: new Color('#8bcfc4'),
  fog: new Color('#172131'),
  near: 62,
  far: 235,
}

const UNDER = {
  ambient: new Color('#2b5763'),
  vein: new Color('#9fe6dc'),
  fog: new Color('#04161c'),
  near: 12,
  far: 78,
}
