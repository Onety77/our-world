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
import { AXLE_HALF_TRACK, AXLE_REAR, WHEEL_RADIUS } from './car'
import { ChaseCamera, planShots, type Shot } from './camera'
import { attachControls, type RallyControls } from './controls'
import { spiritDriver } from './spirit'
import {
  flatBasis,
  placeCar,
  poseGhostWheels,
  poseWheels,
  shotBasis,
  shotRoad,
  useCarRig,
  type CarRig,
} from './rig'
import { CarStudio, STUDIO } from './Studio'
import { basisAt, buildTrail, buildTunnel, roadPoint } from './geometry'
import {
  LAMP_SLOTS,
  createLights,
  useBeamMaterial,
  useCarMaterial,
  useDustMaterial,
  useGlowMaterial,
  useRockMaterial,
  useTrailMaterial,
  useWheelMaterials,
  type RallyLights,
} from './materials'
import { runAt, runDurationMs, type RallyRun, type RunSample } from './model'
import {
  Recorder,
  TOP_SPEED,
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
import {
  ASH,
  BLUE_SPARK,
  GHOST_GRIT,
  GRIT,
  HOT_SPARK,
  MOTE,
  Particles,
  SMOKE,
  SPARK,
  WET_GRIT,
} from './particles'
import { useRace } from './session'
import { emptyRoad, roadAt, type Track } from './track'

/** Seconds of lamps coming up before the road opens. */
const COUNTDOWN = 3.1

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
  return <Rootway key={`${track.seed}-${mode}`} track={track} mode={mode} />
}

function Rootway({ track, mode }: { track: Track; mode: 'race' | 'replay' }) {
  const { camera } = useThree()
  const tier = useQuality((q) => q.tier)
  const surface = useRace((s) => s.surface)
  const ghostRun = useRace((s) => s.ghost)
  const replay = useRace((s) => s.replay)

  const lights = useMemo(() => createLights(), [])
  const rockMaterial = useRockMaterial(lights)
  const mineMaterial = useCarMaterial(lights, false)
  const theirsMaterial = useCarMaterial(lights, true)
  // One per corner, because a brake disc glows with *that* corner's heat.
  const mineWheels = useWheelMaterials(lights, false)
  const theirsWheels = useWheelMaterials(lights, true)
  const glowMaterial = useGlowMaterial(lights)
  const beamMaterial = useBeamMaterial(lights, '#ffcf96')
  const ghostBeamMaterial = useBeamMaterial(lights, '#9fb6e8')
  const dustMaterial = useDustMaterial(lights, false)
  const sparkMaterial = useDustMaterial(lights, true)
  const trailMaterial = useTrailMaterial(lights)

  // --- the road ------------------------------------------------------------
  const chunks = useMemo(() => buildTunnel(track), [track])
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

  const mine = useCarRig(mineMaterial, mineWheels, beamGeometry, beamMaterial)
  const theirs = useCarRig(theirsMaterial, theirsWheels, beamGeometry, ghostBeamMaterial)

  // --- what the tyres throw ------------------------------------------------
  const budget = tier === 'low' ? 0.45 : tier === 'medium' ? 0.72 : 1
  const dust = useMemo(() => new Particles(Math.round(300 * budget)), [budget])
  const sparks = useMemo(() => new Particles(Math.round(220 * budget)), [budget])
  useEffect(
    () => () => {
      dust.dispose()
      sparks.dispose()
    },
    [dust, sparks],
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
      <color attach="background" args={['#050403']} />

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

      {hearths.map((at, i) => (
        <Fire key={i} position={at} height={2.3} width={1.25} intensity={0} night={0} />
      ))}

      {trailGeometry ? (
        <mesh
          geometry={trailGeometry}
          material={trailMaterial}
          frustumCulled={false}
          renderOrder={2}
        />
      ) : null}

      <primitive object={mine.root} />
      {theirRun ? <primitive object={theirs.root} /> : null}

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
    roadAt(track, lantern.s, road)
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

interface FrameArgs {
  delta: number
  camera: PerspectiveCamera
  lights: RallyLights
  lanternAt: Float32Array
  track: Track
  chunks: Mesh[]
  chunkRanges: { from: number; to: number }[]
  mine: CarRig
  theirs: CarRig
  dust: Particles
  sparks: Particles
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
class Driving {
  private readonly car: CarState
  private recorder = new Recorder()
  private readonly chase = new ChaseCamera()
  private controls: RallyControls | null = null
  private engine: EngineVoice | null = null

  private countdown = COUNTDOWN
  private clock = 0
  private handedOver = false
  private shots: Shot[] = []
  private lampCursor = 0
  private lastGhostS = 0
  private shotIndex = -1
  /** Which go the machine has been wound back for. */
  private attempt = -1
  private cleared = false
  private motesDue = 0
  private gritDue = 0
  private smokeDue = 0
  /**
   * What was asked of the car this frame.
   *
   * Kept rather than passed around because three separate things downstream
   * want it — the brake lamps, the sound, and the smoke off a locked wheel —
   * and re-reading the controls for each of them would consume the boost tap
   * three times.
   */
  private input: CarInput = { steer: 0, brake: 0, handbrake: false, boost: false }
  /** Eases to 1 once the run is over — see ChaseCamera. */
  private settle = 0

  private readonly ghost: RunSample = {
    n: 0, s: 0, yaw: 0, drift: 0,
    boost: false, rough: false, braking: false, spinning: false,
  }
  private readonly point = new Vector3()
  private readonly forward = new Vector3()
  private readonly colour = new Color()

  private readonly autopilot: ((car: CarState, dt: number) => CarInput) | null

  constructor(private readonly track: Track) {
    this.car = createCar(track)
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
    this.recorder = new Recorder()
    this.countdown = COUNTDOWN
    this.clock = 0
    this.handedOver = false
    this.settle = 0
    this.shots = []
    this.shotIndex = -1
    this.lampCursor = 0
    this.lastGhostS = 0
    this.chase.reset()
    this.cleared = false
  }

  frame(args: FrameArgs) {
    const session = useRace.getState()
    if (session.attempt !== this.attempt) this.restart(session.attempt)
    if (!this.cleared) {
      this.cleared = true
      args.dust.clear()
      args.sparks.clear()
    }

    this.clock += args.delta
    args.lights.uniforms.uTime.value = this.clock

    if (session.phase === 'replay') this.stepReplay(args)
    else this.stepRace(args)

    this.updateChunks(args)
    this.updateLamps(args)
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
      this.countdown -= delta
      if (this.countdown <= 0) session.begin()
    } else if (phase === 'running') {
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
      const centring = Math.max(-1, Math.min(1, (-car.n * 0.25 - car.psi * 1.6)))
      this.input = { steer: centring, brake: 0.7, handbrake: false, boost: false }
      advanceCar(track, car, this.input, delta)
    }

    const speed = speedOf(car)
    const slip = slipOf(car)

    /*
      Squat, dive, lean and travel all come straight out of the physics now.

      They used to be estimated here from the yaw rate and the acceleration,
      with two clamps and two magic numbers, and the estimate was reasonable —
      but it was an animation *about* the car rather than the car. Now the same
      loads that decide how much grip each tyre has decide how far its spring
      is compressed, so the body cannot lean one way while the tyres are
      working the other.
    */
    placeCar(args.mine, track, car.s, car.n, car.psi, car.roll, car.pitch, car.heave)
    poseWheels(args.mine, car)

    // What the car is telling you about itself: the meter, the brake lamps,
    // the discs and the pipes.
    args.materials.mine.uniforms.uGlow.value = car.ember
    args.materials.mine.uniforms.uBrake.value = this.input.brake
    args.materials.mine.uniforms.uPipe.value = Math.max(
      car.boostLeft > 0 ? 1 : 0,
      car.throttle < 0.3 && car.revs > 0.45 ? 0.35 + Math.random() * 0.4 : 0,
    )
    for (let i = 0; i < 4; i++) {
      const material = args.materials.mineWheels[i]
      if (material) material.uniforms.uDisc.value = car.wheels[i].heat
    }
    this.updateLightsFrom(args, args.mine, car.ember)

    /*
      The countdown is the lamps.

      Three beats, and each one is the headlights swelling up and dying back
      while the engine blips underneath — so the thing counting you down is the
      car itself, and what it shows you each time is a little more of the road
      you are about to be on. There is no "3 2 1" drawn anywhere, because a
      number in a serif face over a cave is the single most arcade thing this
      game could possibly do.
    */
    let rev = phase === 'finished' ? 0 : car.boostLeft > 0 ? 1 : speed / TOP_SPEED
    if (phase === 'ready') {
      const beat = this.countdown - Math.floor(this.countdown)
      const rise = Math.pow(1 - beat, 2.2)
      const power = 0.07 + rise * 0.93
      args.lights.uniforms.uHeadPower.value = power
      args.lights.uniforms.uSpotPower.value = power
      args.materials.beam.uniforms.uPower.value = power * 0.9
      rev = rise * 0.85
    } else {
      args.lights.uniforms.uHeadPower.value = 1
      // The pod comes up with the ember, so a boost lights the far end of the
      // tunnel as well as pushing you down it.
      args.lights.uniforms.uSpotPower.value = 1 + (car.boostLeft > 0 ? 0.5 : 0)
      args.materials.beam.uniforms.uPower.value = 1
    }

    this.throwDust(args, car, speed, slip)

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
      speed: phase === 'ready' ? rev * 14 : speed,
      revs: phase === 'ready' ? rev : car.revs,
      gear: car.gear,
      shifting: car.shiftLeft > 0 ? 1 : 0,
      throttle: phase === 'ready' ? rev : car.throttle,
      brake: this.input.brake,
      handbrake: this.input.handbrake,
      scrubFront: scrubOf(car, false),
      scrubRear: scrubOf(car, true),
      wheelspin: wheelspinOf(car),
      lockup: lockupOf(car),
      rough: car.rough ? 1 : 0,
      wet: car.road.wet,
      tight: Math.max(0, Math.min(1, (5.4 - room) / 3.2)),
      boost: car.boostLeft > 0,
    })

    // --- her -----------------------------------------------------------------
    const ghost = session.ghost
    if (ghost) {
      // She set off when you did, so her clock is your clock. That is what
      // turns a sealed run into a race: the gap you can see is the gap there
      // would have been if you had both been here at once.
      args.theirs.root.visible = phase !== 'ready'
      const grid = Math.max(0, 1 - car.elapsed / 2.4) * -1.9
      this.showGhost(args, ghost, phase === 'ready' ? 0 : car.elapsed * 1000, grid)
      const near = Math.max(0, 1 - Math.abs(this.ghost.s - car.s) / 26)
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

  private showGhost(args: FrameArgs, run: RallyRun, elapsedMs: number, grid = 0) {
    const rig = args.theirs
    const sample = runAt(run, elapsedMs)
    Object.assign(this.ghost, sample)

    const roll = Math.max(-0.14, Math.min(0.14, sample.drift * 0.16 * Math.sign(sample.yaw || 1)))
    /*
      `grid` is the one place her car is not exactly where she drove.

      You both set off from the same standing start, so for the first couple of
      seconds her line and yours are the same line and the two cars are inside
      each other. She is drawn a car's width over for those seconds and eases
      back onto her real line — which is a starting grid, and is both prettier
      and more honest than two cars occupying one piece of road.
    */
    placeCar(rig, args.track, sample.s, sample.n + grid, sample.yaw, roll, 0)

    // Nothing recorded her speed, so the wheels turn at however fast she just
    // moved. Same number, and it stays right if the replay is ever scrubbed.
    const moved = Math.max(0, Math.min(4, sample.s - this.lastGhostS))
    this.lastGhostS = sample.s
    poseGhostWheels(
      rig,
      moved / Math.max(0.004, args.delta),
      sample.drift,
      sample.spinning,
      args.delta,
    )

    args.materials.theirs.uniforms.uGlow.value = sample.boost ? 1 : 0.45
    // Her brake lamps. Four bits in the recording, and between them they are
    // the difference between a marker being dragged along a line and somebody
    // driving — you can see her braking point before you reach your own.
    args.materials.theirs.uniforms.uBrake.value = sample.braking ? 1 : 0
    args.materials.theirs.uniforms.uPipe.value = sample.boost ? 1 : 0
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

    placeCar(args.mine, track, me.s, me.n, me.yaw, me.drift * 0.14, 0)
    poseGhostWheels(args.mine, 30, me.drift, me.spinning, delta)
    args.materials.mine.uniforms.uGlow.value = me.boost ? 1 : 0.4
    args.materials.mine.uniforms.uBrake.value = me.braking ? 1 : 0
    args.materials.mine.uniforms.uPipe.value = me.boost ? 1 : 0
    for (const material of args.materials.mineWheels) {
      material.uniforms.uDisc.value = me.braking ? 0.55 : 0
    }
    args.materials.beam.uniforms.uPower.value = 1
    args.lights.uniforms.uSpotPower.value = 1
    this.updateLightsFrom(args, args.mine, me.boost ? 1 : 0.4)
    if (me.drift > 0.25 || me.rough) {
      this.spit(args.dust, args.mine, GRIT, me.drift * 0.6 + 0.2, 0.2)
    }

    this.showGhost(args, replay.theirs, at, them.n - runAt(replay.theirs, at).n)

    // The camera and the chunk window both ask the car where it is, so it is
    // told — the replay has no physics but it does have a subject.
    this.car.s = me.s
    this.car.n = me.n
    this.car.psi = me.yaw
    this.car.vs = 30
    this.car.vn = Math.tan(me.drift * 0.6) * 30
    this.car.rough = me.rough
    this.car.boostLeft = me.boost ? 1 : 0

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
      const road = roadAt(track, Math.max(0, along), shotRoad)
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

    const road = roadAt(track, subject.s, shotRoad)
    roadPoint(road, subject.n, 0.75, this.point, basisAt(road, shotBasis))
    camera.lookAt(this.point)
    if (Math.abs(camera.fov - 56) > 0.05) {
      camera.fov = 56
      camera.updateProjectionMatrix()
    }
  }

  // --- dust, sparks, ash ---------------------------------------------------

  private throwDust(args: FrameArgs, car: CarState, speed: number, slip: number) {
    const { delta } = args
    const drifting = Math.abs(slip) > 0.13 && speed > 9

    if (drifting || car.rough) {
      const heat = Math.min(1, Math.abs(slip) * 3 + (car.rough ? 0.5 : 0))
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
          this.smokeFrom(args.dust, args.mine, worst, Math.min(1, amount))
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

    if (car.boostLeft > 0) {
      for (let i = 0; i < 3; i++) this.spitOne(args.sparks, args.mine, ASH, 0.13, 2.4, 0.4)
    }

    /*
      And the air itself.

      Dust spawned ahead of the car and then left exactly where it is. It reads
      as speed because it genuinely is not moving and you genuinely are, which
      is the whole difference between this and a streak drawn on the glass.
    */
    this.motesDue -= delta * (6 + speed * 1.6)
    while (this.motesDue < 0) {
      this.motesDue += 1
      const road = roadAt(this.track, car.s + 12 + Math.random() * 46, shotRoad)
      const basis = basisAt(road, shotBasis)
      roadPoint(
        road,
        (Math.random() * 2 - 1) * road.width * 1.1,
        0.25 + Math.random() * road.ceiling * 0.75,
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
      mesh.visible = range.to > here - 70 && range.from < here + 150
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

const IDLE: CarInput = { steer: 0, brake: 0, handbrake: false, boost: false }
