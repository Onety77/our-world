/**
 * The Glasshouse.
 *
 * An old iron conservatory, half overgrown, with a photograph in every pane.
 * The ironwork is always whole — iron outlasts glass — and the glass is only
 * where one of you has hung something, so the building is *made of* what the
 * two of you have kept. Empty, it is a skeleton against the sky; after a few
 * years it should be a tunnel of colour you walk back through.
 *
 * The oldest memory stands at the far end. You arrive at the near one, where
 * the newest is and where the empty frame waits, so the only direction there
 * is in here is backwards through time.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BoxGeometry,
  Group,
  PlaneGeometry,
  Matrix4,
  type PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import type { Memory } from '@/data/types'
import { useSections } from '@/systems/sections'
import { useMemories } from '@/systems/memories'
import { ambience } from '@/systems/ambience'
import { isHersAndNew, useStoodIn } from '@/systems/newness'
import { buildInstanced, useFormMaterial } from '@/world/forms'
import { useSceneEnv } from '@/world/SceneEnv'
import { Trees } from '@/world/Trees'
import {
  aisle,
  aisleAt,
  alongTheAisle,
  buildingX,
  buildingTurn,
  buildingZ,
  lean,
  pulling,
  stepAisle,
  focus,
  stepLean,
  walkTo,
} from './aisle'
import { flagstones, ironFrame, panelKey, roofGlazing, vines, wallGlazing } from './ironwork'
import { BAY, GLASS_X, GLASS_Y, HALF, forceStand, paneAt, paneSize, slotFor, standFor } from './layout'
import { FarPanes, NearPane, Pools } from './Panes'
import { EmptyFrame } from './EmptyFrame'
import { Motes } from './Motes'
import { Flowers } from './Flowers'
import { openPane } from './view'

/**
 * How many panes get their actual photograph.
 *
 * Five. Each one is a texture, a decode and — the first time — a request, and
 * on a phone walking the length of a long Glasshouse that is the difference
 * between a place and a slideshow of loading spinners. Everything else is its
 * own average colour, which is not a fallback: a wall of coloured glass
 * receding into the dark is what this place looks like.
 */
const NEAR = 5

/** Metres either side of where you stand that count as near. */
const REACH = 9

/**
 * How far past the last memory the ironwork runs.
 *
 * ---------------------------------------------------------------------------
 * **Five bays, and the number is set by the camera rather than by taste.**
 *
 * It was two, which is enough for the empty frame plus a bay of scaffolding
 * against the sky — and on a laptop it looked right. On a phone it was wrong
 * in a way that took a measurement to see: `SlideCamera` stands further back
 * on a narrow screen so an authored composition is not cropped, which here
 * puts the camera about eleven and a half metres behind where you are
 * standing. With two bays of overrun a nearly-empty Glasshouse is only
 * six metres long past the newest pane — so the camera was *outside the
 * building*, looking in at the end of it, and the two photographs in it were
 * slivers at the edges of the frame.
 *
 * Sixteen metres of ironwork past the newest memory keeps the camera inside at
 * every width. It costs nothing — bays are instanced — and it says the right
 * thing anyway: the frame is up and waiting, and there is more building than
 * there is glass.
 * ---------------------------------------------------------------------------
 */
const OVERRUN = BAY * 5

/** See the note on the probe below. Read once; it never changes in a session. */
const SHOT =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'

export default function Glasshouse() {
  const { palette } = useSceneEnv()
  const memories = useMemories((s) => s.all)
  const openId = useMemories((s) => s.openId)
  const open = useMemories((s) => s.open)
  const formingId = useMemories((s) => s.formingId)

  const me = useData().me
  const presence = useWorldSlice((s) => s.presence)
  const theirs = presence[otherUser(me)]

  /** How long the building is, in metres, including the empty frame's bay. */
  const length = useMemo(() => {
    if (memories.length === 0) return BAY * 3
    return slotFor(memories.length).bay * BAY + OVERRUN
  }, [memories.length])

  /*
    Where you can walk to.

    Zero is the oldest pane; `deepest` is the empty frame at the near end. Set
    here rather than in the store because the store has no idea how many
    memories there are, and the one place that does is this component.
  */
  const deepest = useMemo(
    () => (memories.length === 0 ? 0 : slotFor(memories.length).bay * BAY),
    [memories.length],
  )

  useEffect(() => {
    aisle.deepest = deepest
    // Arrive at the newest end, always. The first thing you should see on
    // walking in is the last thing either of you left.
    aisle.at = deepest
    aisle.to = deepest
  }, [deepest])

  // --- travelling ----------------------------------------------------------

  const building = useRef<Group>(null)
  const facingRef = useRef<Group>(null)
  const probe = useMemo(() => new Vector3(), [])
  const standing = useMemo(() => new Vector3(), [])
  const sideways = useMemo(() => new Vector3(), [])
  const forward = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    return alongTheAisle(surface)
  }, [])

  /*
    Which wall the nearest pane is on.

    A ref, written by the same pass that decides which memories are near — it
    already sorts them by distance, so the lean costs no search of its own.
  */
  const facing = useRef<-1 | 0 | 1>(0)

  /*
    The one that is open, resolved to its age and slot once rather than every
    frame. Null while you are walking.
  */
  /*
    What she hung here while you were away.

    Frozen on arrival and cleared on the way out — see `useStoodIn`. Which
    means the corridor greets you with her photographs lit, once, and is an
    ordinary corridor the next time you walk it. The count in the corner still
    says how many; this says *which*, and where, and that somebody was here.
  */
  const since = useStoodIn('glasshouse')
  const freshIds = useMemo(
    () =>
      new Set(
        memories
          .filter((memory) => !memory.removed && isHersAndNew(memory, otherUser(me), since))
          .map((memory) => memory.id),
      ),
    [memories, me, since],
  )

  const opened = useMemo(() => {
    if (!openId) return null
    const age = memories.findIndex((m) => m.id === openId)
    return age < 0 ? null : { age, slot: slotFor(age) }
  }, [openId, memories])

  /*
    Walk to it, and hold the wall it is on.

    Opening a memory *moves you to it* — the aisle glides to its bay and the
    building turns square to its wall — rather than putting a panel over a
    world that has stopped. By the time the photograph is readable you are
    standing in front of the pane it lives in, which is the whole difference
    between this and a lightbox.
  */
  useEffect(() => {
    if (!opened) return
    walkTo(opened.slot.z)
  }, [opened])

  useFrame(({ camera, size }, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20)
    stepAisle(delta)
    stepLean(delta, opened ? opened.slot.side : facing.current, Boolean(opened))
    const group = building.current

    if (group) {
      group.position.z = buildingZ()
      group.position.x = buildingX()
    }
    if (facingRef.current) facingRef.current.rotation.y = buildingTurn()

    /*
      Where that pane lands on screen, for the photograph to sit on.

      Two points projected — the centre, and one corner — which is all an
      axis-aligned rectangle needs. It is only axis-aligned because the pane is
      exactly perpendicular by the end of the turn and has no tilt of its own;
      see the notes on `stepLean` and on `slotFor`. The matrix has to be
      refreshed by hand because this runs *before* three updates the world
      matrices for the frame, and a frame-old transform is a photograph that
      lags the pane it is supposed to be lying on.
    */
    if (!group || !opened) {
      openPane.at = focus.open
      if (focus.open < 0.002) openPane.live = false
      return
    }
    group.updateWorldMatrix(true, false)
    const { w, h } = paneSize()
    const [px, py, pz] = paneAt(opened.slot, h)

    /*
      Stepping across, as well as along.

      -----------------------------------------------------------------------
      **The turn pivots about the middle of the aisle. Nobody stands there.**

      The note on the nested groups says the building turns about the point the
      camera is looking at, and for a twenty-degree glance that is true enough
      to be worth saying. It is not true at ninety. SlideCamera stands the
      camera a metre or so off the aisle centreline and several metres back
      down it, aimed with a yaw of its own, and `backOffFor` moves it again
      with the aspect — so swinging a wall a full quarter turn about the
      centreline carries the open pane sideways by however far off it you
      happen to be standing. Measured on a phone: the photograph settled with
      its centre thirty-two pixels from the left edge, most of it past the side
      of the screen, while every eased number in the system reported it had
      arrived exactly where it was asked to. Which is what `__glass.open` is
      for.

      The correction is a walk. Once the building is square, its local Z *is*
      the screen's sideways axis — so stepping across to stand in front of a
      picture and walking along the aisle to reach its bay turn out to be the
      same motion through the same number.

      Solved rather than guessed. Matching the pane's X to the camera's was the
      obvious version and left it fifty pixels out, because being level with
      something is not the same as having it in front of you when the camera is
      also turned. What is actually wanted is the pane on the camera's own
      sideways axis: how far the pane is off that axis now, over how fast one
      metre of aisle moves it along that axis. Both come straight out of the
      matrices, so this holds for any camera the sections ever hand it, at any
      aspect, without a constant to keep in step.

      Faded on `focus.open` because it is only the right correction at ninety
      degrees, and only wanted there.
      -----------------------------------------------------------------------
    */
    if (focus.open > 0.0005) {
      /*
        Two solves, in this order, because the second reads what the first did.

        Both have the same shape. Take how far the pane currently misses the
        mark along one of the camera's own axes; divide by how fast one metre
        of building movement carries it along that axis; move the building by
        that much. Fade it on the turn, because both are only the right answer
        once the wall is square.

        Depth first, along local X, until the pane is `standFrom()` metres in
        front of the camera. Then across, along local Z — which is the aisle,
        and which after the turn is the screen's sideways axis — until the pane
        is on the camera's centre line.
      */
      sideways.setFromMatrixColumn(camera.matrixWorld, 0)
      // Cameras look down their own -Z, so this is the way you are facing.
      forward.setFromMatrixColumn(camera.matrixWorld, 2).negate()

      const depth = probe.set(px, py, pz).applyMatrix4(group.matrixWorld).sub(camera.position).dot(forward)
      const perMetre = standing.set(1, 0, 0).transformDirection(group.matrixWorld).dot(forward)
      // Near zero while the wall is still edge-on: moving sideways does not
      // change how far away it is, and the answer is not meaningful yet.
      if (Math.abs(perMetre) > 1e-3) {
        const want = standFor((camera as PerspectiveCamera).fov, size.width / Math.max(1, size.height))
        group.position.x += ((want - depth) / perMetre) * focus.open
        group.updateWorldMatrix(true, false)
      }

      const off = probe.set(px, py, pz).applyMatrix4(group.matrixWorld).sub(camera.position)
      const along = standing.set(0, 0, 1).transformDirection(group.matrixWorld)
      const rate = along.dot(sideways)
      if (Math.abs(rate) > 1e-3) {
        group.position.z += (-off.dot(sideways) / rate) * focus.open
        group.updateWorldMatrix(true, false)
      }
    }

    probe.set(px, py, pz).applyMatrix4(group.matrixWorld).project(camera)
    const cx = (probe.x * 0.5 + 0.5) * size.width
    const cy = (-probe.y * 0.5 + 0.5) * size.height

    probe
      .set(px, py + h / 2, pz + (w / 2) * -opened.slot.side)
      .applyMatrix4(group.matrixWorld)
      .project(camera)
    const ex = (probe.x * 0.5 + 0.5) * size.width
    const ey = (-probe.y * 0.5 + 0.5) * size.height

    openPane.x = cx
    openPane.y = cy
    openPane.halfW = Math.abs(ex - cx)
    openPane.halfH = Math.abs(ey - cy)
    openPane.at = focus.open
    openPane.live = true
  })

  /*
    `?shot=1` also hands over the two verbs, once.

    Opening a particular memory from a test otherwise means aiming a mouse at a
    quad on a wall three metres away in a building that is sliding past — which
    tests the raycast, not the thing under test, and fails for reasons that have
    nothing to do with what is being checked. The flow test drives the real ray;
    everything about the *rules* — who may answer whose memory, what the seal
    permits — goes through here. Same switch and same reason as `window.__rally`.
  */
  useEffect(() => {
    if (!SHOT) return
    const w = window as unknown as Record<string, unknown>
    w.__glassOpen = (id: string | null) => useMemories.getState().open(id)
    w.__glassWalk = (metres: number) => walkTo(metres)
    w.__glassReach = (metres: number) => forceStand(metres)
    return () => {
      delete w.__glassOpen
      delete w.__glassWalk
      delete w.__glassReach
    }
  }, [])

  /*
    `?shot=1` publishes where the pane you are standing at lands on screen.

    The same switch and the same reason as `window.__rally`: this is a place
    whose whole composition is decided by geometry — a corridor under three
    metres wide, seen through a vertical field of view, on a screen that might
    be twice as tall as it is wide — and "does the picture fit in the frame"
    is not a question anybody can answer by eye across four viewports. It is a
    rectangle in pixels, and this is what reports it.
  */
  useFrame(({ camera, size }) => {
    if (!SHOT || memories.length === 0) return
    let age = memories.length - 1
    while (age >= 0 && memories[age].removed) age--
    if (age < 0) return
    const slot = slotFor(age)
    const { w, h } = paneSize()
    const [px, py, pz] = paneAt(slot, h)
    // Two vectors, because `project` works in place: one object reused would
    // measure the distance from the camera to a normalised device coordinate.
    const group = building.current
    if (!group) return
    /*
      Through the group's own matrix.

      The building leans *and* turns now, so adding the offsets by hand would
      measure a pane that is not where this one is — and the whole value of
      this probe is that it reports the real rectangle rather than a plausible
      one. Same reason `whichPane` inverts the same matrix.
    */
    probe.set(px, py, pz).applyMatrix4(group.matrixWorld)
    const away = probe.distanceTo(camera.position)
    const middle = probe.clone().project(camera)
    const edge = probe
      .set(px, py + h / 2, pz + (w / 2) * -slot.side)
      .applyMatrix4(group.matrixWorld)
      .project(camera)
    ;(window as unknown as Record<string, unknown>).__glass = {
      camera: [camera.position.x, camera.position.y, camera.position.z].map((n) => +n.toFixed(2)),
      // Normalised device coordinates: inside the frame is -1..1 on both axes.
      centre: [+middle.x.toFixed(3), +middle.y.toFixed(3)],
      onScreen: Math.abs(middle.x) < 1 && Math.abs(middle.y) < 1,
      wholeThing: Math.abs(edge.x) < 1 && Math.abs(edge.y) < 1,
      // The whole pane across, in real pixels — which is what decides whether
      // it is a photograph or a coloured speck, and whether a thumb can hit it.
      widthPx: +(Math.abs(edge.x - middle.x) * size.width).toFixed(0) * 2,
      away: +away.toFixed(1),
      /*
        And the open state's own workings.

        Where the photograph lands when a memory is open is decided by three
        eased numbers pulling against each other — how far through the turn,
        how far the building has been pushed sideways, and where along the
        aisle it has walked to. If the picture comes out off-centre, the only
        useful question is *which of the three has not arrived*, and by eye
        that is unanswerable. Headless caps delta per frame, so all three
        settle in slow motion and a test that waits a fixed time measures a
        half-finished turn and calls it a bug.
      */
      open: opened
        ? {
            at: +focus.open.toFixed(3),
            shift: +lean.shift.toFixed(2),
            turn: +lean.turn.toFixed(3),
            walked: +aisleAt().toFixed(2),
            wants: +aisle.to.toFixed(2),
            side: opened.slot.side,
            z: +opened.slot.z.toFixed(2),
            /*
              Where you are standing, in the building's own coordinates.

              `stand[0]` is the one that matters: the aisle is 5.24 metres
              across, so anything past ±2.62 means the camera has left through
              a wall — which looks, on a screenshot, exactly like a photograph
              nicely framed against a flat grey nothing.
            */
            stand: (() => {
              const at = standing.copy(camera.position)
              group.worldToLocal(at)
              return [+at.x.toFixed(2), +at.z.toFixed(2)]
            })(),
          }
        : null,
    }
  })

  /*
    Which memories are close enough to be worth their picture.

    Recomputed from the live aisle position, but only into React when the *set*
    changes — which is every few metres of walking, not every frame. The
    comparison is on a joined key rather than on the array, because a new array
    of the same five ids every frame would re-render the whole wall sixty times
    a second and that is precisely the rule this world has about per-frame work.
  */
  const [nearIds, setNearIds] = useState<string[]>([])
  const nearKey = useRef('')

  useFrame(() => {
    const here = aisleAt()
    const picked: { id: string; index: number; away: number }[] = []
    for (let i = 0; i < memories.length; i++) {
      if (memories[i].removed) continue
      const away = Math.abs(slotFor(i).z - here)
      if (away < REACH) picked.push({ id: memories[i].id, index: i, away })
    }
    picked.sort((a, b) => a.away - b.away)
    /*
      Lean toward the closest, and only while it is genuinely close.

      Past four metres the building straightens up, so walking the length of
      the aisle is not a continuous sway from side to side — it settles onto a
      pane, holds while you are with it, and lets go.
    */
    facing.current =
      picked.length > 0 && picked[0].away < 4 ? slotFor(picked[0].index).side : 0
    const ids = picked.slice(0, NEAR).map((p) => p.id)
    const key = ids.join('|')
    if (key === nearKey.current) return
    nearKey.current = key
    setNearIds(ids)
  })

  const near = useMemo(() => {
    const wanted = new Set(nearIds)
    return memories
      .map((memory, index) => ({ memory, index }))
      .filter((entry) => wanted.has(entry.memory.id))
  }, [nearIds, memories])

  const hideIds = useMemo(() => new Set(nearIds), [nearIds])

  // --- the pictures for those few -------------------------------------------

  const data = useData()
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let gone = false
    for (const { memory } of near) {
      if (urls[memory.id]) continue
      data
        .pictureUrl(memory)
        .then((url) => {
          if (!gone) setUrls((was) => (was[memory.id] ? was : { ...was, [memory.id]: url }))
        })
        .catch(() => {
          /*
            Left out of the map rather than stored as a failure.

            The pane keeps its sixteen-pixel preview and its colour, which is
            true — this *is* the picture, at the resolution we have — and the
            next time you walk past it the request happens again. A phone in a
            tunnel should not permanently mark a photograph as missing.
          */
        })
    }
    return () => {
      gone = true
    }
  }, [near, data, urls])

  // --- picking --------------------------------------------------------------

  const { camera, size } = useThree()
  const ray = useMemo(() => new Raycaster(), [])

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (!useSections.getState().entered) return
      // A drag along the aisle ends in a pointerup too, and it is not a tap.
      if (pulling()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, a')) return

      const ndc = new Vector2(
        (e.clientX / size.width) * 2 - 1,
        -(e.clientY / size.height) * 2 + 1,
      )
      ray.setFromCamera(ndc, camera)

      if (!building.current) return
      const hit = whichPane(ray, memories, building.current)
      if (!hit) return

      /*
        Near enough to read, or somewhere down there?

        Tapping a pane you are standing in front of opens it. Tapping one forty
        metres away walks you to it — which is the only way to cover distance
        in here besides pulling, and it is what makes the coloured panes in the
        distance targets rather than scenery.
      */
      if (Math.abs(hit.z - aisleAt()) < REACH * 0.6) {
        ambience.cue('glass', 0.34)
        open(hit.id)
      }
      else walkTo(hit.z)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [memories, camera, size, ray, open])

  // --- the building ---------------------------------------------------------

  const ironMaterial = useFormMaterial(palette, { sway: 0.12 })
  const leafMaterial = useFormMaterial(palette, { sway: 0.9, doubleSided: true })
  const stoneMaterial = useFormMaterial(palette, { sway: 0 })
  // Double-sided: half the roof is seen from underneath and half against the
  // sky, and a single-sided panel overhead is a hole that is not really one.
  const glazingMaterial = useFormMaterial(palette, { sway: 0.12, doubleSided: true })

  const iron = useMemo(() => {
    const base = new BoxGeometry(1, 1, 1)
    const built = buildInstanced(base, ironFrame(length))
    base.dispose()
    return built
  }, [length])
  useEffect(() => () => iron.dispose(), [iron])

  /*
    Which wall panels a memory is standing in, so the plain glazing leaves them
    alone. Keyed by bay and side rather than by memory index, because that is
    the one thing both descriptions of the wall actually share.
  */
  const taken = useMemo(() => {
    const keys = new Set<string>()
    for (let i = 0; i < memories.length; i++) {
      // A memory that has been taken out does *not* hold its panel open. The
      // ordinary milky glazing goes back in and the wall closes over it with
      // no gap and no empty frame — see the note on Memory.removed.
      if (memories[i].removed) continue
      const slot = slotFor(i)
      keys.add(panelKey(slot.bay, slot.side))
    }
    // The empty frame holds its panel open as well, or the next memory would
    // form behind a sheet of somebody else's plain glass.
    const next = slotFor(memories.length)
    keys.add(panelKey(next.bay, next.side))
    return keys
  }, [memories.length])

  const glazing = useMemo(() => {
    const base = new PlaneGeometry(1, 1)
    // Roof and walls in one batch: same material, same shader, same milky
    // glass, and no reason for the building to cost two draw calls.
    const built = buildInstanced(base, [
      ...roofGlazing(length),
      ...wallGlazing(length, taken),
    ])
    base.dispose()
    return built
  }, [length, taken])
  useEffect(() => () => glazing.dispose(), [glazing])

  const floor = useMemo(() => {
    const base = new BoxGeometry(1, 1, 1)
    const built = buildInstanced(base, flagstones(length))
    base.dispose()
    return built
  }, [length])
  useEffect(() => () => floor.dispose(), [floor])

  const growth = useMemo(() => {
    const base = new PlaneGeometry(1, 1)
    /*
      Two and a half clumps a metre, and it was two thirds of one.

      Sparse growth reads as a few leaves somebody stuck on, and the whole
      point of it is that this place has been left alone for a long time. It is
      one instanced quad per leaf in a batch that already existed, so the cost
      of making the Glasshouse feel properly overgrown is a few thousand
      triangles and no extra draw call.
    */
    const built = buildInstanced(base, vines(length, Math.round(length * 2.5)))
    base.dispose()
    return built
  }, [length])
  useEffect(() => () => growth.dispose(), [growth])

  return (
    <>
      {/*
        The wood it stands in.

        Drawn outside the moving group, so it does not slide past with the
        building — a treeline that travelled with you would make the whole
        place feel like a treadmill. It is what you see through the missing
        panes and the open roof, and it is the same generator the rest of the
        garden uses, so walking in from outside never contradicts itself.
      */}
      <Trees
        palette={palette}
        openings={[Math.PI * 0.5, Math.PI * 1.5]}
        seed="glasshouse:wood"
        count={130}
        centre={[GLASS_X, 0]}
        innerRadius={22}
        outerRadius={64}
        gapWidth={0.9}
        flatten={0.4}
        leafDetail={0.34}
        /* The heaviest thing in the Glasshouse was never the Glasshouse — it
            was the branchwork of these hundred and thirty trees. See woodDetail. */
        woodDetail={0.3}
      />

      {/*
        The building, on its terrace.

        Two nested groups doing two different jobs: the outer one puts the
        Glasshouse where it stands in the world — offset in X, clear of the
        river's valley, up on level stone — and the inner one is the *travel*,
        sliding the whole thing past a camera that never moves. Keeping them
        apart means the aisle never has to know where the building is, and the
        terrace never has to know how far down it you have walked.
      */}
      <group position={[GLASS_X, GLASS_Y, 0]}>
      {/*
        Three groups, and the nesting is what makes the turn work.

        Outer: where the Glasshouse stands in the world, on its terrace.
        Middle (`facingRef`): the turn — and because this group's own origin is
          the point the camera is looking at, the building pivots *about the
          spot in front of you* rather than about its far end. Rotating the
          travelling group instead would swing the near bays through the camera
          and leave the far end static, which is the opposite of turning your
          head.
        Inner (`building`): the travel, and the sideways lean.
      */}
      <group ref={facingRef}>
      <group ref={building}>
        <mesh geometry={floor} material={stoneMaterial} frustumCulled={false} />
        <mesh geometry={iron} material={ironMaterial} frustumCulled={false} />
        <mesh geometry={glazing} material={glazingMaterial} frustumCulled={false} />
        <mesh geometry={growth} material={leafMaterial} frustumCulled={false} />

        <Pools memories={memories} palette={palette} litId={openId} freshIds={freshIds} />
        <FarPanes
          memories={memories}
          palette={palette}
          formingId={formingId}
          hideIds={hideIds}
        />
        {near.map(({ memory, index }) => (
          <NearPane
            key={memory.id}
            memory={memory}
            index={index}
            palette={palette}
            picture={urls[memory.id] ?? null}
            together={theirs.online && theirs.looking === memory.id}
            forming={memory.id === formingId}
            opened={memory.id === openId}
          />
        ))}

        <Flowers memories={memories} palette={palette} />
        <EmptyFrame index={memories.length} palette={palette} />
        <Motes length={length} palette={palette} />
      </group>
      </group>
      </group>
    </>
  )
}

/**
 * Which pane a ray hits, if any.
 *
 * By hand against the two wall planes rather than through mesh events, for the
 * same reason the Tree of Thoughts picks its flowers by hand: every pane in the
 * building is one instanced mesh, so three.js can say *that* it was hit and
 * never which one. Two plane intersections and a bounds test is also far
 * cheaper than a mesh raycast against several hundred quads.
 *
 * `shift` is the building group's own z offset and comes from `buildingZ`,
 * never from the aisle position: the ray is in world space and the panes are
 * not — they are described in the building's own coordinates and then moved
 * bodily past a camera that never moves. Two expressions of the same offset is
 * how a tap lands on the photograph next to the one you aimed at.
 */
function whichPane(
  ray: Raycaster,
  memories: Memory[],
  /**
   * The travelling group. The ray is put into *its* space rather than the maths
   * being redone in world space.
   *
   * That started as tidiness and became necessary: the building now leans and
   * *turns*, so the walls are no longer planes of constant world x and the
   * closed-form version quietly began answering with the pane next to the one
   * you tapped. Inverting one matrix is exact under any transform this place
   * ever grows, and it means the slot coordinates below — which is how every
   * other part of the section thinks — are the coordinates being tested.
   */
  group: Group,
): { id: string; z: number } | null {
  const local = ray.ray.clone().applyMatrix4(WORLD_TO_LOCAL.copy(group.matrixWorld).invert())
  const origin = local.origin
  const dir = local.direction
  let best: { id: string; z: number; t: number } | null = null

  for (const side of [-1, 1] as const) {
    const planeX = side * HALF
    // Parallel to the wall, or behind us: no hit worth having.
    if (Math.abs(dir.x) < 1e-4) continue
    const t = (planeX - origin.x) / dir.x
    if (t <= 0) continue

    const y = origin.y + dir.y * t
    const z = origin.z + dir.z * t

    for (let i = 0; i < memories.length; i++) {
      if (memories[i].removed) continue
      const slot = slotFor(i)
      if (slot.side !== side) continue
      const { w, h } = paneSize()
      // Through `paneAt`, never off the slot directly: the slot's height is a
      // wish and `paneAt` is where it is clamped to fit under the eaves. Using
      // the raw one is how a target ends up somewhere the picture is not.
      const [, paneY] = paneAt(slot, h)
      /*
        A generous box, and deliberately.

        This is aimed at with a thumb on a phone, from several metres away, in
        a moving building. Half a pane of slop either way is the difference
        between "tap the picture" and "tap exactly the picture".
      */
      if (Math.abs(z - slot.z) > w * 0.72) continue
      if (Math.abs(y - paneY) > h * 0.72) continue
      if (best === null || t < best.t) best = { id: memories[i].id, z: slot.z, t }
    }
  }

  return best ? { id: best.id, z: best.z } : null
}

/** Scratch, so picking allocates nothing per tap. */
const WORLD_TO_LOCAL = new Matrix4()
