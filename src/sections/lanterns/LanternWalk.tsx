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
import { Color, Group, Vector3 } from 'three'
import { useData } from '@/data/provider'
import { useMemories } from '@/systems/memories'
import { useSceneEnv } from '@/world/SceneEnv'
import type { SkyPalette } from '@/systems/palette'
import { GLASS_H, GLASS_W, SPACING, WALK_X, WALK_Y, hangingFor, headFor, pathAt, sFor } from './layout'
import { alongTheLane, focus, pulling, stepFocus, stepWalk, walk, walkAt, walkTo } from './walk'
import { FarLanterns, Halos, NearLantern, Posts } from './Lanterns'
import { Footprints } from './Footprints'
import { Verge } from './Verge'
import { Lane } from './Lane'
import { Pools } from './Pools'
import { openPane } from './view'

/**
 * How close a lantern has to be before its photograph is worth fetching.
 *
 * Generous, because the fetch and the decode both take time and a picture that
 * arrives as you draw level with it has arrived late. Everything past this is a
 * pane of its own colour, which is what a lit picture looks like at range
 * anyway.
 */
const REACH = SPACING * 9

/**
 * How many of those actually get a photograph on them at once.
 *
 * ---------------------------------------------------------------------------
 * **Sixteen, and it was five.** Five is what the room this replaced used, and
 * there it was right: an aisle showed you two walls at arm's length and
 * everything else was a colour in the distance. A lane shows you the whole
 * chain at once, so five meant three or four real photographs at your feet and
 * a receding line of flat coloured cards — which reads exactly as "the pictures
 * are blurry", because the pictures were not there.
 *
 * Sixteen at six hundred and forty pixels is about twenty-six megabytes of
 * texture at the very worst, on a walk long enough to hold that many in range —
 * and they are cached and reused, so walking back down the lane decodes
 * nothing. The cache above it holds twenty-six, which is deliberately more than
 * this: the ones just behind you stay warm.
 * ---------------------------------------------------------------------------
 */
const NEAR = 16

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

/** A thumb needs a bigger target than a mouse pointer — see `onScreen`. */
const COARSE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

/** See the probe in the scene. Read once; it never changes in a session. */
const SHOT =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'

/**
 * The light under the trees, which is not the light in the meadow.
 *
 * ---------------------------------------------------------------------------
 * **The lanterns have to be the thing holding the darkness off, and they cannot
 * be while the sky is doing it for them.**
 *
 * The first build handed this place the world's own daylight. Everything was
 * evenly lit to the far end of the lane, nothing on the ground owed anything to
 * a lantern, and the chain read as coloured signage over a field. The lights
 * were decoration on a scene that did not need them.
 *
 * So the walk keeps the world's *hour* — it is still her afternoon or her night,
 * and the sky above the canopy still says which — but it takes a fraction of the
 * light, and the fog closes in. That is what a wooded lane is: the reason to
 * hang a lamp in one at four in the afternoon is that it is already dark in
 * there.
 *
 * One derived palette rather than a uniform threaded through six shaders. Every
 * piece of this place already reads a palette, and `ambientLightLevel` is what
 * the lanterns brighten against — so dimming the palette turns them up
 * everywhere, in one place, with nothing left to forget.
 * ---------------------------------------------------------------------------
 */
function underTheTrees(palette: SkyPalette): SkyPalette {
  const dim = (hex: string, by: number) => '#' + new Color(hex).multiplyScalar(by).getHexString()
  return {
    ...palette,
    sunIntensity: palette.sunIntensity * 0.26,
    ambientIntensity: palette.ambientIntensity * 0.34,
    ambientColor: dim(palette.ambientColor, 0.55),
    sunColor: dim(palette.sunColor, 0.7),
    grassBase: dim(palette.grassBase, 0.58),
    grassTip: dim(palette.grassTip, 0.62),
    /*
      The fog is pulled in hard, and it is doing two jobs.

      It is why you cannot see the far end of the lane, which is the point — a
      walk whose whole length is legible at a glance has nowhere left to go. And
      it is what gives the lanterns something to be *in*: a light in clear air is
      a bright dot, a light in mist has a halo and a reach.
    */
    fogColor: dim(palette.fogColor, 0.34),
    fogNear: Math.min(palette.fogNear, 8),
    fogFar: Math.min(palette.fogFar * 0.5, 62),
  }
}

export default function LanternWalk() {
  const { palette: world } = useSceneEnv()
  const palette = useMemo(() => underTheTrees(world), [world])
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

    /*
      Opening one brings it to you.

      ----------------------------------------------------------------------
      **This is the "tap a picture and go to it" that was missing, and it is
      done by moving the lane rather than the camera.**

      Walking to the lantern's own viewing spot was not enough on its own: that
      puts you the right distance away along the *path*, but the lantern is
      still off at the verge, a third of the way across the frame, at whatever
      angle the bend left it. What you want when you choose a photograph is to
      be standing square in front of it.

      `SlideCamera` owns the camera and fighting it is the mistake the racer had
      to stand it down to avoid — so the lane slides that last bit instead. The
      chosen lantern is carried to a fixed spot just in front of the eye, and
      everything it is attached to comes with it: the post, the pool of light on
      the ground, the trees behind. The whole lane leans in, which is what
      stepping up to something looks like from the inside.

      Eased by `focus.open`, which is the same 0..1 the interface fades the
      photograph in on, so the two are one movement.
      ----------------------------------------------------------------------
    */
    if (opened && focus.open > 0.0005) {
      const hung = opened.hung
      /*
        Where a chosen photograph sits: dead centre, at eye level, close enough
        to fill the middle of a phone and far enough that a lantern a metre wide
        is not cropped by it.
      */
      const wantZ = -1.35
      carried.x += (WALK_X - (hung.x + carried.x)) * focus.open
      carried.y += (WALK_Y + 1.44 - hung.y) * focus.open
      carried.z += (wantZ - (hung.z + carried.z)) * focus.open
    }

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
  /**
   * Where lantern `i` is on screen, in CSS pixels, or null if it is not.
   *
   * One function, used by the picking and by the probe below, because two
   * expressions of "where is that lantern" is exactly how the Tree of Thoughts
   * ended up with papers you could see and targets somewhere else entirely.
   */
  const onScreen = (i: number) => {
    const hung = hangingFor(i)
    // Exactly where the group has carried it — same offset, same frame.
    point.set(hung.x + carried.x, hung.y + carried.y, hung.z + carried.z)
    const depth = point.distanceTo(camera.position)
    if (depth <= 0.4) return null
    point.project(camera)
    if (point.z > 1) return null
    const x = (point.x * 0.5 + 0.5) * size.width
    const y = (-point.y * 0.5 + 0.5) * size.height

    /*
      The box scales with distance the way the lantern does, so a far one is a
      small target and a near one a large one — which is what the eye already
      believes. Sized off the projection itself rather than off a guessed field
      of view: half a metre at this depth, projected, is the scale of everything
      on screen at that depth.
    */
    point.set(
      hung.x + carried.x + Math.cos(hung.yaw) * (GLASS_W / 2),
      hung.y + carried.y,
      hung.z + carried.z - Math.sin(hung.yaw) * (GLASS_W / 2),
    )
    point.project(camera)
    const edge = (point.x * 0.5 + 0.5) * size.width
    const wide = Math.abs(edge - x)
    /*
      ------------------------------------------------------------------------
      **Bigger than it looks, and much bigger than it was.**

      These boxes used to be the lantern's own projected size with a floor of
      eighteen pixels — which is honest and unusable. The probe told the story:
      every lantern past about fifteen metres was pinned at that floor, so
      opening one meant hitting a target the size of a full stop, and the
      complaint that you *cannot* tap them was simply correct.

      A photograph twenty metres down a lane is a small thing on screen and a
      perfectly clear thing to point at — the eye has no trouble, only the
      arithmetic did. So the floor is a thumb: forty-four pixels on a touch
      screen, which is the smallest target anybody should have to hit, and less
      on a mouse because a mouse is exact.

      Overlapping boxes are fine and expected on a bend. The nearest centre to
      the tap wins, so a generous box never steals a tap that was plainly meant
      for its neighbour.
      ------------------------------------------------------------------------
    */
    return {
      x,
      y,
      halfW: Math.max(COARSE ? 44 : 30, wide * 1.5),
      halfH: Math.max(COARSE ? 40 : 26, wide * (GLASS_H / GLASS_W) * 1.9),
      depth,
    }
  }

  const whichLantern = (cx: number, cy: number): number | null => {
    let best: { index: number; away: number } | null = null
    const here = walkAt()
    for (let i = 0; i < memories.length; i++) {
      if (Math.abs(sFor(i) - here) > REACH) continue
      const at = onScreen(i)
      if (!at) continue
      if (Math.abs(cx - at.x) > at.halfW || Math.abs(cy - at.y) > at.halfH) continue
      const away = Math.abs(cx - at.x) + Math.abs(cy - at.y)
      if (!best || away < best.away) best = { index: i, away }
    }
    return best ? best.index : null
  }

  /*
    Where every reachable lantern is, published for the checks.

    The same probe the Glasshouse kept, and for the same reason: a screenshot of
    this place looks identical whether its picking works or not, so the only way
    to test "tapping a photograph opens it" is to be told where the photographs
    think they are and then tap there. Development builds only — see SHOT.
  */
  useFrame(() => {
    if (!SHOT) return
    const here = walkAt()
    const seen: { i: number; x: number; y: number; halfW: number; halfH: number }[] = []
    for (let i = 0; i < memories.length; i++) {
      if (Math.abs(sFor(i) - here) > REACH) continue
      const at = onScreen(i)
      if (at) seen.push({ i, x: at.x, y: at.y, halfW: at.halfW, halfH: at.halfH })
    }
    ;(window as unknown as { __walk: unknown }).__walk = { at: here, open: openId, seen }
  })

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
        <Pools memories={memories} palette={palette} />
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
