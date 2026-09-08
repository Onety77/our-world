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
import { Color, Group, Matrix4, Raycaster, Vector2, Vector3 } from 'three'
import { useData } from '@/data/provider'
import { useMemories } from '@/systems/memories'
import { useSceneEnv } from '@/world/SceneEnv'
import { useQuality } from '@/systems/quality'
import { useLanternLight } from '@/systems/lanternLight'
import type { SkyPalette } from '@/systems/palette'
import { GLASS_H, GLASS_W, SPACING, WALK_X, hangingFor, headFor, pathAt, sFor } from './layout'
import { alongTheLane, focus, pulling, stepFocus, stepWalk, walk, walkAt, walkTo } from './walk'
import { FarLanterns, Halos, NearLantern, PoleLamps, Posts } from './Lanterns'
import { Footprints } from './Footprints'
import { Verge } from './Verge'
import { Lane } from './Lane'
import { Pools } from './Pools'
import { Undergrowth } from './Undergrowth'
import { Air } from './Air'
import { Canopy } from './Canopy'
import { openPane } from './view'
import { paneTexture } from './picture'
import { pickMemory } from './lanternGeometry'
import { MemoryLights } from './MemoryLights'

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
function underTheTrees(palette: SkyPalette, dark: number): SkyPalette {
  const dim = (hex: string, by: number) => '#' + new Color(hex).multiplyScalar(by).getHexString()
  /*
    `dark` runs 0..1 and every figure below is that number applied to a range,
    not a constant with a slider bolted on. At 0 the lane is lit like the meadow
    outside it; at 1 almost nothing gets through the canopy. The control room
    sets it — see `systems/lanternLight`, and the note there about why this is
    the one thing here that cannot be settled from a screenshot.
  */
  const keep = (open: number, shut: number) => open + (shut - open) * dark

  /*
    A ceiling, not just a fraction — and this is what was wrong at noon.

    Multiplying the hour's own light by a constant keeps the *ratio* and throws
    away the point: a tenth of a bright afternoon is still far more light than a
    tenth of dusk, so the lane stayed pale all day and the lanterns had nothing
    to hold off. Under a real canopy what reaches the ground is roughly a fixed
    small amount whatever the sun is doing — that is what a canopy *is* — so the
    dimming takes whichever is lower.

    The hour still shows: the colour of the light, the sky through the gaps and
    the fog all still come from it. What stops changing is how much there is.
  */
  const under = (was: number, share: number, most: number) =>
    Math.min(was * keep(1, share), was * (1 - dark) + most * dark)

  return {
    ...palette,
    sunIntensity: under(palette.sunIntensity, 0.1, 0.16),
    ambientIntensity: under(palette.ambientIntensity, 0.16, 0.3),
    ambientColor: dim(palette.ambientColor, keep(1, 0.42)),
    sunColor: dim(palette.sunColor, keep(1, 0.6)),
    grassBase: dim(palette.grassBase, keep(1, 0.44)),
    grassTip: dim(palette.grassTip, keep(1, 0.5)),
    /*
      The fog is pulled in hard, and it is doing two jobs.

      It is why you cannot see the far end of the lane, which is the point — a
      walk whose whole length is legible at a glance has nowhere left to go. And
      it is what gives the lanterns something to be *in*: a light in clear air is
      a bright dot, a light in mist has a halo and a reach.
    */
    fogColor: dim(palette.fogColor, keep(1, 0.24)),
    fogNear: Math.min(palette.fogNear, keep(40, 6)),
    fogFar: Math.min(palette.fogFar, keep(160, 52)),
  }
}

export default function LanternWalk() {
  const { palette: world } = useSceneEnv()
  const dark = useLanternLight((s) => s.dark)
  const palette = useMemo(() => underTheTrees(world, dark), [world, dark])

  /*
    How much undergrowth and air this device gets.

    Taken off the meadow's own blade budget rather than invented, so a phone
    that has already been told to draw less grass out in the garden draws less
    in here too — one decision about what this machine can manage, made once, in
    the place that measures it.
  */
  const grassCount = useQuality((q) => q.grassCount)
  const grassy = Math.max(0.3, Math.min(1.15, grassCount / 20000))
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
  const pivot = useRef<Group>(null)
  const swing = useMemo(() => new Vector3(), [])
  const lift = useMemo(() => new Vector3(), [])
  const UP = useMemo(() => new Vector3(0, 1, 0), [])

  /**
   * The lantern you have stepped up to, if any.
   *
   * ---------------------------------------------------------------------------
   * **Deliberately not the same thing as the one that is open.**
   *
   * Tapping a photograph out here should not throw a full-screen picture over
   * the world — you are walking somewhere, and what you want is to *go and look
   * at it*. So a tap turns you to face it and brings you up to it, and that is
   * the whole of a tap. The picture itself is behind a press and hold, which is
   * the gesture for "I want to stop and study this one".
   *
   * Two states rather than one because they are two different intentions, and
   * collapsing them is what made the old behaviour feel like it was deciding
   * for you.
   * ---------------------------------------------------------------------------
   */
  const [focused, setFocused] = useState<number | null>(null)
  useEffect(() => { if (!openId) setFocused(null) }, [openId])

  /** The live press — see the note by [H[2J[3J in the gesture below. */
  const press = useRef<{ held: number | null; from: { x: number; y: number } | null; timer: number }>({
    held: null,
    from: null,
    timer: 0,
  })

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

  useFrame(({ camera: eye }, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20)
    stepWalk(delta)
    stepFocus(delta, focused !== null)

    // The point you are standing on comes to the head of the lane, where the
    // camera is; everything else follows it.
    const here = pathAt(walkAt())
    carried.set(WALK_X - here.x, 0, -here.z)

    /*
      Choosing one turns you to face it.

      ------------------------------------------------------------------------
      **This is a real orbit now, and the reason it could not be one before is
      worth writing down.**

      The first version slid the whole lane sideways until the chosen lantern
      was in the middle of the frame. That is a translation, and translation is
      all it could be: the world's meadow follows the *camera*, so a lane that
      rotated would have taken its trees and its footprints away from the ground
      they were measured against. What it looked like was the scenery being
      dragged past you — which is exactly the "weird, not so professional"
      feeling that was reported.

      Since the walk started carrying its own ground, that constraint is gone.
      There is no world meadow underneath any more to disagree with, so the lane
      can turn — and turning is what makes this read as *you* stepping round to
      face something rather than the set being shoved sideways.

      The lane pivots **about the camera**, not about the origin, which is the
      only pivot that feels like a head turning. Two nested groups do it: the
      outer one sits at the eye and carries the rotation, the inner one carries
      the lane's own travel less the eye. Nothing touches the camera, so
      `SlideCamera` is never fought.

      And the turn is not a guess: `-hung.yaw` brings the pane's own normal to
      face the eye exactly. A lantern is hung facing the path, so undoing that
      angle is precisely square-on — which also means the open photograph
      projects to an axis-aligned rectangle for the interface to grow out of.
      ------------------------------------------------------------------------
    */
    let turn = 0
    lift.set(0, 0, 0)
    if (focused !== null && focus.open > 0.0005) {
      const hung = hangingFor(focused)
      const t = focus.open
      turn = -hung.yaw * t

      /*
        Where the chosen lantern ends up, and how it gets there.

        `swing` is where it would land from the rotation alone; `lift` is the
        rest of the way to the spot in front of the eye. Multiplying that
        remainder by the same eased `t` is what makes the whole move one
        gesture: at nought it is exactly zero and nothing has happened, at one
        it is exactly the target, and in between the turn and the approach are
        the same movement rather than two animations of different lengths.
      */
      swing
        .set(hung.x + carried.x - eye.position.x, hung.y - eye.position.y, hung.z + carried.z - eye.position.z)
        .applyAxisAngle(UP, turn)
        .add(eye.position)

      // Square on, a little below eye line, close enough to read and far
      // enough that a tall portrait is not cropped by the top of the screen.
      lift.set(eye.position.x - swing.x, eye.position.y - 0.08 - swing.y, eye.position.z - 2.05 - swing.z)
      lift.multiplyScalar(t)
    }

    if (pivot.current) {
      pivot.current.position.copy(eye.position).add(lift)
      pivot.current.rotation.y = turn
    }
    if (carrying.current) {
      carrying.current.position.copy(carried).sub(eye.position)
    }
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

  const requests = useRef(new Map<string, Promise<string>>())
  useEffect(() => {
    let gone = false
    // Resolving one photograph must not cancel its neighbours. Share in-flight
    // work across movement, prioritise the nearest, and decode before revealing.
    const queue = [...near].sort((a, b) =>
      Math.abs(sFor(a.index) - walkAt()) - Math.abs(sFor(b.index) - walkAt()))
    const worker = async () => {
      while (!gone && queue.length) {
        const entry = queue.shift()!
        const { memory } = entry
        let request = requests.current.get(memory.id)
        if (!request) {
          request = (async () => {
            try {
              const url = await data.pictureUrl(memory, 'lane')
              await paneTexture(url)
              return url
            } catch {
              const url = await data.pictureUrl(memory)
              await paneTexture(url)
              return url
            }
          })()
          requests.current.set(memory.id, request)
        }
        try {
          const url = await request
          if (!gone) setUrls(was => was[memory.id] === url ? was : { ...was, [memory.id]: url })
        } catch {
          requests.current.delete(memory.id)
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { gone = true }
  }, [near, data])

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
    /*
      Asked of the scene graph rather than worked out again.

      The lane is carried by one group and turned by another, and both of those
      change every frame. Re-deriving that transform here would be a second
      expression of where a lantern is — which is exactly how the Tree of
      Thoughts ended up with papers you could see and targets somewhere else.
      `localToWorld` asks the objects that actually drew it.
    */
    if (!carrying.current) return null
    point.set(hung.x, hung.y, hung.z)
    carrying.current.localToWorld(point)
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
      hung.x + Math.cos(hung.yaw) * (GLASS_W / 2),
      hung.y,
      hung.z - Math.sin(hung.yaw) * (GLASS_W / 2),
    )
    carrying.current.localToWorld(point)
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

  const picker = useMemo(() => new Raycaster(), [])
  const inverse = useMemo(() => new Matrix4(), [])
  const pointer = useMemo(() => new Vector2(), [])
  const whichLantern = (cx: number, cy: number): number | null => {
    if (!carrying.current || openId) return null
    carrying.current.updateWorldMatrix(true, false)
    inverse.copy(carrying.current.matrixWorld).invert()
    pointer.set(cx / size.width * 2 - 1, 1 - cy / size.height * 2)
    picker.setFromCamera(pointer, camera)
    picker.ray.applyMatrix4(inverse)
    const here = walkAt() / SPACING
    return pickMemory(picker.ray, memories, Math.floor(here - 12), Math.ceil(here + 12))
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
    ;(window as unknown as { __walk: unknown }).__walk = { at: here, open: openId, seen,
      pictures: near.filter(entry => urls[entry.memory.id]).length, near: near.length, pick: whichLantern }
  })

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    /*
      A tap goes to it. A press and hold opens it.

      -------------------------------------------------------------------------
      **Two gestures, because they are two intentions.**

      Out here a photograph is a thing standing further down a lane, and what a
      tap means is *go and look at that one* — turn, walk up, stand square to
      it. Throwing a full-screen picture over the world instead is the interface
      deciding you were finished walking.

      So the hold is the one that opens. It is the gesture people already use
      for "stop, I want this properly", it cannot be triggered by accident while
      dragging along the lane, and it leaves the tap free to mean the thing it
      obviously means.
      -------------------------------------------------------------------------
    */
    const HOLD = 420
    /** Past this a press is a drag along the lane, and belongs to the walk. */
    const SLOP = 8

    /*
      The press lives in a ref, and the cleanup below does not touch it.

      This effect re-registers on every render — it has to, because it closes
      over the memories and the projection — and the first version kept the
      press in local variables and cancelled the timer on cleanup. Which meant a
      hold could never complete: tapping starts the lane gliding, gliding
      changes which lanterns are near, that sets state, React re-renders, the
      effect tears down and the pending hold is cancelled about eighty
      milliseconds in. Every hold silently became a tap.

      A gesture outlives a render. Keeping it in a ref is what says so.
    */
    const g = press.current

    const clear = () => {
      if (g.timer) window.clearTimeout(g.timer)
      g.timer = 0
      g.held = null
      g.from = null
    }

    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return
      if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
      const box = surface.getBoundingClientRect()
      const index = whichLantern(e.clientX - box.left, e.clientY - box.top)
      if (index === null) return
      g.held = index
      g.from = { x: e.clientX, y: e.clientY }
      g.timer = window.setTimeout(() => {
        const memory = g.held !== null ? memories[g.held] : null
        // Stand at it as well, so letting go leaves you where the picture was.
        if (memory) {
          setFocused(g.held)
          open(memory.id)
        }
        clear()
      }, HOLD)
    }

    const move = (e: PointerEvent) => {
      if (!g.from) return
      if (Math.abs(e.clientX - g.from.x) + Math.abs(e.clientY - g.from.y) > SLOP) clear()
    }

    const up = () => {
      if (g.held === null) {
        // A tap on nothing steps back out of whatever you were looking at.
        if (!pulling()) setFocused(null)
        clear()
        return
      }
      const index = g.held
      clear()
      if (pulling()) return
      const memory = memories[index]
      if (!memory) return
      // Walk to the piece of path this one was hung facing, and turn to it.
      walkTo(sFor(index) + 6.4)
      setFocused(index)
      open(memory.id)
    }

    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', clear)
    // Listeners only: the press itself lives in a ref and must survive this.
    return () => {
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerup', up)
      surface.removeEventListener('pointercancel', clear)
    }
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
    <>
      <Canopy palette={world} dark={dark} />
      <group ref={pivot}>
      <group ref={carrying}>
        <Lane length={length} trodden={deepest} palette={palette} />
        <Verge length={length} palette={palette} />
        <Footprints by={walkedBy} palette={palette} />
        <Pools memories={memories} palette={palette} />
        <Undergrowth memories={memories} length={length} palette={palette} density={grassy} />
        <Air memories={memories} palette={palette} density={grassy} />
        {/*
          One post more than there are memories: the next one is already up and
          waiting at the head of the lane, with nothing hanging on it yet. That
          is the whole of the empty state, and it needs no words — an empty walk
          is one bare post on a path nobody has worn.
        */}
        <Posts memories={memories} waiting={false} palette={palette} />
        <MemoryLights memories={memories} />
        <FarLanterns memories={memories} hide={hidden} palette={palette} />
        <Halos memories={memories} palette={palette} />
        <PoleLamps memories={memories} palette={palette} />
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
      </group>
    </>
  )
}
