/**
 * Which sky the Stars is wearing, and the pull that crosses between them.
 *
 * ---------------------------------------------------------------------------
 * **Two places to talk from, and the swipe is the journey rather than a
 * switch.**
 *
 * The Stars exists to say one thing: seven timezones apart, when it is night
 * here it is morning there. The plain says it by splitting the horizon — deep
 * night above you, a band of her dawn on the far edge. That is the whole
 * sentence, and it is good, and it has always been missing its middle. The
 * blurb the place has carried since the day it was made is *"your night, their
 * morning, and the space in between"*, and the space in between has never been
 * drawn.
 *
 * So the second sky is that space. Pull from the right edge and the plain sinks
 * away under a sea of moonlit cloud — the weather both of you are on opposite
 * sides of, seen from above, with nothing under your feet and the conversation
 * still hanging in the air around you. It is the only vantage in this world
 * where being far apart *looks* like something instead of being said.
 *
 * **The crossing is a value, not a toggle**, which is the whole reason it feels
 * like anywhere. `at` runs 0..1 and everything in both skies reads it: the
 * plain falls and fades, the cloud rises and thickens, the dome crosses from
 * deep night to moonlight, the bed re-voices. Let go halfway and it settles to
 * whichever side you were nearer, so the gesture can be explored rather than
 * committed to.
 * ---------------------------------------------------------------------------
 *
 * Outside React, like the sections' own slide and the lane's walk: read every
 * frame by the scene, written every frame by the drag. State would be sixty
 * re-renders a second of a sky.
 */

const KEY = 'garden:stars-sky:v1'

/** Which side the sky settles to when nothing is being pulled. */
export type Sky = 'plain' | 'cloudsea'

function stored(): Sky {
  if (typeof localStorage === 'undefined') return 'plain'
  return localStorage.getItem(KEY) === 'cloudsea' ? 'cloudsea' : 'plain'
}

export const sky = {
  /** Where it is settling to. */
  to: stored() as Sky,
  /** Live, eased. 0 is the plain, 1 is the cloudsea. */
  at: stored() === 'cloudsea' ? 1 : 0,
  /** True while a finger or a mouse is actually pulling it. */
  grabbing: false,
  /**
   * How far the *edge* has been pulled, 0..1, before it becomes a crossing.
   *
   * Published so the hint on the edge can lean with the finger. A gesture that
   * gives nothing back until it completes is a gesture nobody believes they
   * started.
   */
  peek: 0,
}

/*
  Published for the checks, under `?shot=1` like `__frame` and `__walk`.

  A screenshot of a sky halfway through a crossing looks like a sky; the only
  way to know the gesture actually moved it is to be told the number.
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
  const want = sky.to === 'cloudsea' ? 1 : 0
  sky.at += (want - sky.at) * (1 - Math.exp(-3.4 * delta))
  if (Math.abs(want - sky.at) < 0.0006) sky.at = want
}

/** Put the sky on one side, gliding. */
export function crossTo(to: Sky): void {
  sky.to = to
  keep(to)
}

/**
 * Pulling the sky across from the right edge.
 *
 * ---------------------------------------------------------------------------
 * **From the edge, and only from the edge.**
 *
 * Horizontal drags in the middle of the screen belong to `systems/swipe`, which
 * browses places. It stands down once you are inside one, so there is no
 * collision today — but a sky that answered the same gesture as "go to the next
 * place" is one refactor away from being a bug nobody can explain. Starting at
 * the edge is also what people already expect a second layer to come from, on
 * every phone either of you has ever held.
 *
 * The Stars is the one place where a horizontal drag is otherwise free: its
 * conversation scrolls vertically, and the walk's lane is not here.
 *
 * **On the window, in the capture phase, and that is not paranoia.** The first
 * version listened on `.surface` and never fired once: the conversation lays
 * `.talking` over the whole canvas and takes the press first. Anything that
 * wants an *edge* has to be above the page's own layers by construction, or it
 * only works in the places that happen not to have covered that edge yet.
 * Capture also means this sees the press before the conversation decides what
 * to do with it, and the narrow edge band is what keeps it from stealing
 * anything that was meant for the page.
 * ---------------------------------------------------------------------------
 */
export function pullTheSky(): () => void {
  /** How near the right edge a press has to start, in pixels. */
  const EDGE = 34
  /** How far the pull has to travel to be worth a whole crossing, in pixels. */
  const ACROSS = 190
  /** Below this it is a tap, and belongs to whatever was under it. */
  const SLOP = 8

  let from: number | null = null
  let pointer: number | null = null
  let base = 0
  let moved = 0
  /** Which way this pull can go, decided once, from where it started. */
  let heading: 1 | -1 = 1

  const down = (e: PointerEvent) => {
    if (!e.isPrimary) return
    if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
    const wide = window.innerWidth
    const fromRight = wide - e.clientX
    /*
      Either edge, and which one depends on where you already are.

      On the plain the cloudsea is off to the right, so you pull it in from
      there. Standing in the cloudsea the plain is the thing off-screen, and
      reaching for the same right edge to go *back* would be pulling the side
      you are already on. The gesture is "drag the other sky in", so the edge it
      lives behind is the one you start from.
    */
    if (sky.at < 0.5) {
      if (fromRight > EDGE) return
      heading = 1
    } else {
      if (e.clientX > EDGE) return
      heading = -1
    }
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
      apart. Stopped rather than only prevented, because the listener that would
      otherwise act on it is on an element below this one.
    */
    e.preventDefault()
    e.stopPropagation()
    sky.grabbing = true
    // Pulling right-to-left crosses to the cloudsea; the other way comes back.
    const travelled = (heading === 1 ? -dx : dx) / ACROSS
    sky.at = Math.max(0, Math.min(1, base + travelled))
    sky.peek = Math.min(1, Math.abs(travelled))
  }

  const up = (e: PointerEvent) => {
    if (pointer !== null && e.pointerId !== pointer) return
    if (from !== null && moved >= SLOP) {
      /*
        Settles to the nearer side rather than to whichever way the finger was
        going. A flick that travels four pixels should not change the sky, and
        one that has already dragged it two thirds of the way across should not
        snap back because the hand slowed down at the end.
      */
      crossTo(sky.at >= 0.5 ? 'cloudsea' : 'plain')
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
