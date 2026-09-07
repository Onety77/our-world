/**
 * The Lantern Walk.
 *
 * ---------------------------------------------------------------------------
 * **A lane through the wood with a light for every memory, and a path worn
 * exactly as far as the two of you have walked.**
 *
 * What is on screen is, in order of how much of it there is: the wood either
 * side, the trodden path with your footprints in it, a chain of lanterns
 * alternating along the verges, and the halo each one throws. Nothing here is
 * architecture. The place this replaced was a hundred metres of iron and glass
 * that existed before a single photograph did, and it needed three separate
 * mechanisms to stop the building being the subject.
 *
 * **The lane moves, not the camera** — see `walk.ts`. Two nested groups do it:
 * the inner one carries the lane to put the point you are standing on at the
 * origin, and the outer one turns it so the way ahead runs down negative Z.
 * That is the whole of travel. `SlideCamera` keeps the camera, as it does
 * everywhere else in the garden, and the two never argue.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { useData } from '@/data/provider'
import { useMemories } from '@/systems/memories'
import { useSceneEnv } from '@/world/SceneEnv'
import { GLASS_H, GLASS_W, SPACING, WALK_X, hangingFor, headFor, pathAt, sFor } from './layout'
import { alongTheLane, focus, pulling, stepFocus, stepWalk, walk, walkAt, walkTo } from './walk'
import { FarLanterns, Halos, NearLantern, Posts } from './Lanterns'
import { Footprints } from './Footprints'
import { Verge } from './Verge'
import { Lane } from './Lane'
import { openPane } from './view'

/**
 * How close a lantern has to be before its photograph is worth fetching.
 *
 * Generous, because the fetch and the decode both take time and a picture that
 * arrives as you draw level with it has arrived late. Everything past this is a
 * pane of its own colour, which is what a lit picture looks like at range
 * anyway.
 */
const REACH = SPACING * 3.2

/** How many of those actually get a texture at once. */
const NEAR = 5

/**
 * How far past the newest memory the lane keeps going.
 *
 * `SlideCamera` stands further back on a narrow screen so an authored
 * composition is not cropped, which puts the camera several metres behind where
 * you are standing. Without overrun a nearly-empty walk ends behind the camera
 * and you arrive looking at the back of the place. Trees and path are cheap;
 * this costs a few of each and means you always arrive *on* the lane.
 */
const OVERRUN = SPACING * 4

export default function LanternWalk() {
  const { palette } = useSceneEnv()
  const all = useMemories((s) => s.all)
  const openId = useMemories((s) => s.openId)
  const formingId = useMemories((s) => s.formingId)

  /** Everything still hanging. A removed memory keeps its place but no light. */
  const memories = useMemo(() => all.filter((m) => !m.removed), [all])

  /*
    Who kept each one, oldest first — the only thing the footprints need.

    Passed as a plain array of ids rather than the memories themselves so the
    prints are not rebuilt when a picture resolves or a caption is edited. The
    path only changes when somebody walks further.
  */
  const walkedBy = useMemo(() => memories.map((m) => m.by), [memories])

  useEffect(() => {
    document.body.classList.add('on-the-walk')
    return () => document.body.classList.remove('on-the-walk')
  }, [])

  const deepest = useMemo(() => headFor(memories.length), [memories.length])

  useEffect(() => {
    walk.deepest = deepest
    // Arrive at the head of the lane, always. The first thing you should see on
    // walking in is the last thing either of you kept.
    walk.at = deepest
    walk.to = deepest
  }, [deepest])

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    return alongTheLane(surface)
  }, [])

  // --- travelling -----------------------------------------------------------

  const carrying = useRef<Group>(null)

  /**
   * Where the lane has been carried to, this frame.
   *
   * A translation and nothing else. Turning the lane to the heading as well
   * would be the truer walk — you would round a bend rather than watch it slide
   * past — and it cannot be done here: the meadow is one plane that follows the
   * *camera*, displaced from world coordinates, so a lane that rotated under it
   * would take its trees and its footprints away from the ground they were
   * measured against. The wander is still read as a wander; it arrives as the
   * path swinging across the frame instead of the frame swinging with the path.
   */
  const carried = useMemo(() => new Vector3(), [])

  /** The one being looked at, and where it hangs. */
  const opened = useMemo(() => {
    if (!openId) return null
    const index = memories.findIndex((m) => m.id === openId)
    return index < 0 ? null : { index, hung: hangingFor(index) }
  }, [openId, memories])

  /*
    Opening one *walks you to it* rather than putting a panel over a world that
    has stopped. And the place it walks to is not the lantern — it is the piece
    of path the lantern was hung facing, which is the one spot on the whole lane
    where that photograph is exactly square to you. The geometry was decided
    when it was hung; this just goes and stands there.
  */
  useEffect(() => {
    if (!opened) return
    walkTo(sFor(opened.index) + 6.4)
  }, [opened])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20)
    stepWalk(delta)
    stepFocus(delta, Boolean(opened))

    // The point you are standing on comes to the head of the lane, where the
    // camera is; everything else follows it.
    const here = pathAt(walkAt())
    carried.set(WALK_X - here.x, 0, -here.z)
    if (carrying.current) carrying.current.position.copy(carried)
  })

  // --- which ones are close enough to be worth a photograph ------------------

  const [nearIds, setNearIds] = useState<string[]>([])
  const nearKey = useRef('')

  useFrame(() => {
    const here = walkAt()
    const picked: { id: string; away: number }[] = []
    for (let i = 0; i < memories.length; i++) {
      const away = Math.abs(sFor(i) - here)
      if (away < REACH) picked.push({ id: memories[i].id, away })
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

  /** The ones the far chain must leave a gap for — see `FarLanterns`. */
  const hidden = useMemo(() => new Set(nearIds), [nearIds])

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

            The lantern keeps its sixteen-pixel preview and its colour, which is
            true — this *is* the picture, at the resolution we have — and walking
            past it again asks once more. A phone in a tunnel should not
            permanently mark a photograph as missing.
          */
        })
    }
    return () => {
      gone = true
    }
  }, [near, data, urls])

  // --- picking, and telling the interface where the open one is --------------

  const { camera, size } = useThree()
  const open = useMemories((s) => s.open)
  const point = useMemo(() => new Vector3(), [])

  /**
   * Which lantern is under a tap, in screen space.
   *
   * Deliberately not a raycast. Every lantern in the chain is drawn by one
   * instanced mesh with a shader that places it — there is no scene object per
   * lantern for a ray to hit, and adding invisible ones would be a second
   * source of truth about where a lantern is, which is exactly how the Tree of
   * Thoughts ended up with papers you could see and targets somewhere else.
   *
   * Projecting the centre and testing a box around it asks the *same* function
   * the shader asks. It cannot drift.
   */
  const whichLantern = (cx: number, cy: number): number | null => {
    let best: { index: number; away: number } | null = null
    const here = walkAt()
    for (let i = 0; i < memories.length; i++) {
      if (Math.abs(sFor(i) - here) > REACH) continue
      const hung = hangingFor(i)
      // Exactly where the group has carried it — same offset, same frame.
      point.set(hung.x + carried.x, hung.y, hung.z + carried.z)
      const depth = point.distanceTo(camera.position)
      point.project(camera)
      if (point.z > 1) continue
      const sx = (point.x * 0.5 + 0.5) * size.width
      const sy = (-point.y * 0.5 + 0.5) * size.height
      /*
        The box scales with distance the way the lantern does, so a far one is a
        small target and a near one a large one — which is what the eye already
        believes. Sized off the projection itself rather than off a guessed
        field of view: one metre at this depth, projected, is the scale of
        everything on screen at that depth.
      */
      point.set(hung.x + carried.x + GLASS_W / 2, hung.y, hung.z + carried.z)
      point.project(camera)
      const edge = (point.x * 0.5 + 0.5) * size.width
      const onScreen = Math.abs(edge - sx)
      const halfW = Math.max(16, onScreen * 1.2)
      const halfH = Math.max(14, onScreen * (GLASS_H / GLASS_W) * 1.5)
      if (depth <= 0.4) continue
      if (Math.abs(cx - sx) > halfW || Math.abs(cy - sy) > halfH) continue
      const away = Math.abs(cx - sx) + Math.abs(cy - sy)
      if (!best || away < best.away) best = { index: i, away }
    }
    return best ? best.index : null
  }

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    const tap = (e: PointerEvent) => {
      if (pulling()) return
      if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
      const box = surface.getBoundingClientRect()
      const index = whichLantern(e.clientX - box.left, e.clientY - box.top)
      if (index === null) return
      const memory = memories[index]
      if (!memory) return
      // Standing at it first, opening second — the walk is the transition.
      if (Math.abs(sFor(index) - walkAt()) > SPACING * 0.9) {
        walkTo(sFor(index) + 6.4)
        return
      }
      open(memory.id)
    }
    surface.addEventListener('pointerup', tap)
    return () => surface.removeEventListener('pointerup', tap)
  })

  /*
    Where the open lantern is on screen, for the interface to grow its
    photograph out of.

    A bounding box of the four projected corners rather than an axis-aligned
    rectangle, because a lantern is turned to face the path rather than the
    camera and the two differ by a few degrees. The interface only needs
    somewhere to start from.
  */
  useFrame(() => {
    if (!opened) {
      openPane.live = false
      openPane.at = focus.open
      return
    }
    const hung = opened.hung
    const cx = hung.x + carried.x
    const cz = hung.z + carried.z

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [ox, oy] of [
      [-GLASS_W / 2, -GLASS_H / 2],
      [GLASS_W / 2, -GLASS_H / 2],
      [GLASS_W / 2, GLASS_H / 2],
      [-GLASS_W / 2, GLASS_H / 2],
    ]) {
      point.set(cx + ox * Math.cos(hung.yaw), hung.y + oy, cz - ox * Math.sin(hung.yaw))
      point.project(camera)
      const px = (point.x * 0.5 + 0.5) * size.width
      const py = (-point.y * 0.5 + 0.5) * size.height
      minX = Math.min(minX, px); maxX = Math.max(maxX, px)
      minY = Math.min(minY, py); maxY = Math.max(maxY, py)
    }
    openPane.x = (minX + maxX) / 2
    openPane.y = (minY + maxY) / 2
    openPane.halfW = Math.max(1, (maxX - minX) / 2)
    openPane.halfH = Math.max(1, (maxY - minY) / 2)
    openPane.at = focus.open
    openPane.live = true
  })

  const length = deepest + OVERRUN

  return (
    <group ref={carrying}>
        <Lane length={length} trodden={deepest} palette={palette} />
        <Verge length={length} palette={palette} />
        <Footprints by={walkedBy} palette={palette} />
        {/*
          One post more than there are memories: the next one is already up and
          waiting at the head of the lane, with nothing hanging on it yet. That
          is the whole of the empty state, and it needs no words — an empty walk
          is one bare post on a path nobody has worn.
        */}
        <Posts count={memories.length + 1} palette={palette} />
        <FarLanterns memories={memories} hide={hidden} palette={palette} />
        <Halos memories={memories} palette={palette} />
        {near.map(({ memory, index }) => (
          <NearLantern
            key={memory.id}
            memory={memory}
            index={index}
            palette={palette}
            picture={urls[memory.id] ?? null}
            forming={memory.id === formingId}
          />
        ))}
    </group>
  )
}
