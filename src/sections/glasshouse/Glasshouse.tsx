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
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import type { Memory } from '@/data/types'
import { useSections } from '@/systems/sections'
import { useMemories } from '@/systems/memories'
import { buildInstanced, useFormMaterial } from '@/world/forms'
import { useSceneEnv } from '@/world/SceneEnv'
import { Trees } from '@/world/Trees'
import { aisle, aisleAt, alongTheAisle, buildingZ, pulling, stepAisle, walkTo } from './aisle'
import { flagstones, ironFrame, panelKey, roofGlazing, vines, wallGlazing } from './ironwork'
import { BAY, GLASS_X, GLASS_Y, HALF, paneAt, paneSize, slotFor } from './layout'
import { FarPanes, NearPane, Pools } from './Panes'
import { EmptyFrame } from './EmptyFrame'
import { Motes } from './Motes'

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
  const probe = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    return alongTheAisle(surface)
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20)
    stepAisle(delta)
    if (building.current) building.current.position.z = buildingZ()
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
    return () => {
      delete w.__glassOpen
      delete w.__glassWalk
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
    const age = Math.max(0, memories.length - 1)
    const slot = slotFor(age)
    const { w, h } = paneSize(memories[age].width, memories[age].height)
    const [px, py, pz] = paneAt(slot, h)
    // Two vectors, because `project` works in place: one object reused would
    // measure the distance from the camera to a normalised device coordinate.
    probe.set(GLASS_X + px, GLASS_Y + py, pz + buildingZ())
    const away = probe.distanceTo(camera.position)
    const middle = probe.clone().project(camera)
    const edge = probe
      .set(GLASS_X + px, GLASS_Y + py + h / 2, pz + buildingZ() + (w / 2) * -slot.side)
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
      const away = Math.abs(slotFor(i).z - here)
      if (away < REACH) picked.push({ id: memories[i].id, index: i, away })
    }
    picked.sort((a, b) => a.away - b.away)
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

      const hit = whichPane(ray, memories, buildingZ())
      if (!hit) return

      /*
        Near enough to read, or somewhere down there?

        Tapping a pane you are standing in front of opens it. Tapping one forty
        metres away walks you to it — which is the only way to cover distance
        in here besides pulling, and it is what makes the coloured panes in the
        distance targets rather than scenery.
      */
      if (Math.abs(hit.z - aisleAt()) < REACH * 0.6) open(hit.id)
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
    // Roughly one clump per metre and a half of building, so the vines thicken
    // with the Glasshouse rather than being a fixed amount of scenery in it.
    const built = buildInstanced(base, vines(length, Math.round(length * 0.66)))
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
      <group ref={building}>
        <mesh geometry={floor} material={stoneMaterial} frustumCulled={false} />
        <mesh geometry={iron} material={ironMaterial} frustumCulled={false} />
        <mesh geometry={glazing} material={glazingMaterial} frustumCulled={false} />
        <mesh geometry={growth} material={leafMaterial} frustumCulled={false} />

        <Pools memories={memories} palette={palette} litId={openId} />
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
          />
        ))}

        <EmptyFrame index={memories.length} palette={palette} />
        <Motes length={length} palette={palette} />
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
  shift: number,
): { id: string; z: number } | null {
  const origin = ray.ray.origin
  const dir = ray.ray.direction
  let best: { id: string; z: number; t: number } | null = null

  for (const side of [-1, 1] as const) {
    // World space, so the terrace's own offset is part of the wall's position.
    const planeX = GLASS_X + side * HALF
    // Parallel to the wall, or behind us: no hit worth having.
    if (Math.abs(dir.x) < 1e-4) continue
    const t = (planeX - origin.x) / dir.x
    if (t <= 0) continue

    const y = origin.y + dir.y * t
    const z = origin.z + dir.z * t

    for (let i = 0; i < memories.length; i++) {
      const slot = slotFor(i)
      if (slot.side !== side) continue
      const { w, h } = paneSize(memories[i].width, memories[i].height)
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
      if (Math.abs(z - (slot.z + shift)) > w * 0.72) continue
      if (Math.abs(y - (GLASS_Y + paneY)) > h * 0.72) continue
      if (best === null || t < best.t) best = { id: memories[i].id, z: slot.z, t }
    }
  }

  return best ? { id: best.id, z: best.z } : null
}
