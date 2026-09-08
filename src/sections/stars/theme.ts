/**
 * Which sky the Stars is wearing, and the pull that crosses between them.
 *
 * ---------------------------------------------------------------------------
 * **Two halves of one sentence.**
 *
 * The Stars has carried the same line since the day it was made: *"your night,
 * their morning, and the space in between."* The place has only ever drawn the
 * first half — deep night overhead, with her dawn as a band on the far horizon,
 * a rumour of somewhere else.
 *
 * The second sky is that somewhere else, stood inside. Pull from the edge and
 * the night goes out of it: the stars fade, the dark plain gives way to mist,
 * and the sun she is already under comes up over the ridge. It is the same
 * conversation, hanging in her morning instead of your night — and because it
 * is morning, **the words go dark on a pale sky**, which is the change that
 * makes it a different hour of a different day rather than a recolour.
 *
 * Crossing the screen crosses the world.
 * ---------------------------------------------------------------------------
 *
 * **The crossing is a value, not a toggle**, and everything reads it: both
 * domes, the ground, the mist, the sun, the ink the conversation is written in,
 * and the bed underneath. Let go halfway and it settles to whichever side you
 * were nearer, so it can be explored rather than committed to.
 *
 * Outside React, like the sections' own slide and the lane's walk: read every
 * frame, written every frame by the drag. State would be sixty re-renders a
 * second of a sky.
 */

const KEY = 'garden:stars-sky:v2'

/** Which side the sky settles to when nothing is being pulled. */
export type Sky = 'night' | 'morning'

function stored(): Sky {
  if (typeof localStorage === 'undefined') return 'night'
  return localStorage.getItem(KEY) === 'morning' ? 'morning' : 'night'
}

export const sky = {
  /** Where it is settling to. */
  to: stored() as Sky,
  /** Live, eased. 0 is your night, 1 is her morning. */
  at: stored() === 'morning' ? 1 : 0,
  /** True while a finger or a mouse is actually pulling it. */
  grabbing: false,
  /**
   * How far the pull has carried, 0..1, for the handle on the edge to lean by.
   *
   * A gesture that gives nothing back until it completes is a gesture nobody
   * believes they have started.
   */
  peek: 0,
}

/*
  Published for the checks, under `?shot=1` like `__frame` and `__walk`.

  A screenshot of a sky halfway through a crossing looks like a sky; the only
  way to know a gesture moved it is to be told the number.
*/
if (
  typeof window !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'
) {
  ;(window as unknown as { __sky: typeof sky }).__sky = sky
}

function keep(to: Sky) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, to)
  } catch {
    /* storage blocked; the sky still crosses, it just forgets which one */
  }
}

/** Settle toward whichever side is chosen. Called once a frame by the scene. */
export function stepSky(delta: number): void {
  if (sky.grabbing) return
  const want = sky.to === 'morning' ? 1 : 0
  sky.at += (want - sky.at) * (1 - Math.exp(-3.1 * delta))
  if (Math.abs(want - sky.at) < 0.0006) sky.at = want
}

/** Put the sky on one side, gliding. */
export function crossTo(to: Sky): void {
  sky.to = to
  keep(to)
}

/**
 * Pulling the sky across, from the edge.
 *
 * ---------------------------------------------------------------------------
 * **One edge, and it toggles.**
 *
 * The first version put the way back on the *other* edge, reasoning that each
 * sky lives behind its own side and you drag in whichever one is off-screen. It
 * is tidy and it is wrong: nobody remembers which edge they are owed, and what
 * it produced was pulling from the same place twice and having nothing happen
 * the second time.
 *
 * A handle is a handle. Pull from the right and whichever sky you are not in
 * comes across; do it again and it takes you back. One gesture, and it is its
 * own undo.
 *
 * **On the window, in the capture phase**, because the conversation lays
 * `.talking` over the whole canvas and takes the press first — a listener on
 * the canvas never fired once. Anything that wants an *edge* has to be above
 * the page's own layers by construction, or it works only in the places that
 * happen not to have covered that edge yet.
 * ---------------------------------------------------------------------------
 */
export function pullTheSky(): () => void {
  /** How near the edge a press has to start, in pixels. */
  const EDGE = 36
  /** How far the pull travels for a whole crossing, in pixels. */
  const ACROSS = 190
  /** Below this it is a tap, and belongs to whatever was under it. */
  const SLOP = 8

  let from: number | null = null
  let pointer: number | null = null
  let base = 0
  let moved = 0
  /** Which sky this pull is heading for, decided once, from where you were. */
  let target: 0 | 1 = 1

  const down = (e: PointerEvent) => {
    if (!e.isPrimary) return
    if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
    if (window.innerWidth - e.clientX > EDGE) return
    // Toward whichever one you are not standing in.
    target = sky.at < 0.5 ? 1 : 0
    from = e.clientX
    pointer = e.pointerId
    base = sky.at
    moved = 0
  }

  const move = (e: PointerEvent) => {
    if (from === null || e.pointerId !== pointer) return
    const dx = e.clientX - from
    moved = Math.max(moved, Math.abs(dx))
    if (moved < SLOP) return
    /*
      Once it is genuinely a pull, nothing else gets it.

      The conversation is underneath and scrolls; without this a diagonal drag
      would move the sky *and* the messages, which reads as the screen coming
      apart. Stopped as well as prevented, because the listener that would
      otherwise act on it is on an element below this one.
    */
    e.preventDefault()
    e.stopPropagation()
    sky.grabbing = true
    /*
      Always measured leftward, because it is always the same gesture. Which
      sky that is a crossing *to* was decided on the way down.
    */
    const gone = Math.max(0, Math.min(1, -dx / ACROSS))
    sky.at = base + (target - base) * gone
    sky.peek = gone
  }

  const up = (e: PointerEvent) => {
    if (pointer !== null && e.pointerId !== pointer) return
    if (from !== null && moved >= SLOP) {
      /*
        Settles to the nearer side rather than to whichever way the hand was
        going. A flick of four pixels should not change the sky, and one that
        has already dragged two thirds of the way across should not snap back
        because the hand slowed at the end.
      */
      crossTo(sky.at >= 0.5 ? 'morning' : 'night')
    }
    from = null
    pointer = null
    sky.grabbing = false
    sky.peek = 0
  }

  const on = { capture: true } as const
  window.addEventListener('pointerdown', down, on)
  window.addEventListener('pointermove', move, { capture: true, passive: false })
  window.addEventListener('pointerup', up, on)
  window.addEventListener('pointercancel', up, on)

  return () => {
    window.removeEventListener('pointerdown', down, on)
    window.removeEventListener('pointermove', move, on)
    window.removeEventListener('pointerup', up, on)
    window.removeEventListener('pointercancel', up, on)
    sky.grabbing = false
  }
}
