/**
 * What a phone shows on top of the road: two buttons, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * **Nothing is drawn for the steering**, and that is the decision this file is
 * mostly about. The left half of the screen turns left. Drawing a pad, a wheel
 * or a pair of chevrons on top of that makes a large target look like a small
 * one, and people aim at what is drawn — so the control gets *worse* the more
 * you illustrate it. The one exception is the first race, where nobody could
 * possibly know yet: see `RallyArrows`, which shows once and then never again
 * for anyone who has finished a road.
 *
 * The two buttons are drawn, because a button that is not drawn is not a
 * button. They sit where `touch.ts` says, which is somewhere the person
 * holding the phone decided — see the layout editor in `/dev7731`.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { hasFinishedARace } from './best'
import { mirrored, releaseThumbs, thumb, useTouchLayout } from './touch'
import { useRace } from './session'

/**
 * One button, held.
 *
 * `pointerdown` rather than `click`, because a click is not delivered until
 * the finger comes *up* — a handbrake on click would apply itself when you let
 * go of it, which is the opposite of a handbrake.
 */
function Button({
  which,
  side,
  label,
  glyph,
}: {
  which: 'handbrake' | 'boost'
  /**
   * Which thumb this copy is under.
   *
   * The two copies of a control are the same control — they write the same
   * flag — so nothing downstream knows or cares which one was pressed. This
   * exists only to place it and to name it for a screen reader.
   */
  side: 'left' | 'right'
  label: string
  glyph: string
}) {
  const layout = useTouchLayout((s) => s.layout)
  const spot = side === 'left' ? layout[which] : mirrored(layout[which])
  const held = useRef(false)
  const node = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = node.current
    if (!el) return

    const down = (event: PointerEvent) => {
      // Otherwise the press also reaches the steering surface underneath and
      // the car turns whenever the handbrake is pulled.
      event.preventDefault()
      event.stopPropagation()
      el.setPointerCapture(event.pointerId)
      held.current = true
      el.classList.add('on')
      if (which === 'handbrake') thumb.handbrake = true
      // Edge-triggered: leaning on it is one measure of ember, not the bar.
      else thumb.boost = true
    }
    const up = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!held.current) return
      held.current = false
      el.classList.remove('on')
      if (which === 'handbrake') thumb.handbrake = false
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      if (which === 'handbrake') thumb.handbrake = false
    }
  }, [which])

  return (
    <button
      ref={node}
      type="button"
      className={`rally-thumb ${which} ${side}`}
      aria-label={`${label}, ${side} hand`}
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        // vmin, so the button is the same physical size in either orientation
        // and stays round on a tablet.
        width: `${layout.size * 100}vmin`,
        height: `${layout.size * 100}vmin`,
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}

/**
 * Which way is left, said once.
 *
 * Two arrows, low-contrast, fading out the moment the car moves — and shown
 * only to somebody who has never finished a road on this device. A tutorial
 * that appears on the fourth race is not a tutorial, it is clutter, and the
 * cheapest reliable signal for "this person knows" is that they have got to
 * the end of something. See `best.ts`.
 */
function RallyArrows() {
  const phase = useRace((s) => s.phase)
  const shown = useRef(!hasFinishedARace())
  if (!shown.current) return null
  if (phase !== 'ready' && phase !== 'running') return null
  return (
    <div className={`rally-arrows${phase === 'running' ? ' going' : ''}`} aria-hidden="true">
      <span className="left">
        <b>‹</b>
        hold this side
      </span>
      <span className="right">
        hold this side
        <b>›</b>
      </span>
    </div>
  )
}

/**
 * Turn the phone.
 *
 * Not a preference. The road is a corridor seen from behind a car, and in
 * portrait you can see about a second and a half of it — which is less than
 * the time it takes to react to a corner, so the game is not hard in portrait,
 * it is unfair. Better to say so than to let somebody lose a race to the shape
 * of their hand.
 *
 * The race pauses itself underneath, so nobody comes back to a car that has
 * been driving into a wall while they rotated.
 */
/*
  Turning the phone upright stops the road — except when she is on it.

  Holding the world still is exactly right on your own: the screen is unusable,
  so there is nothing to be gained by letting the car drive on into a wall.
  In a live race it is not available. Stopping your car does not stop hers, and
  a frozen car publishes nothing, so she would watch you vanish off the road
  rather than crash on it. Better to crash, honestly, in front of her.

  The overlay still comes up either way. It is only the pause that is refused.
*/
function TurnIt() {
  const pause = useRace((s) => s.pause)
  const resume = useRace((s) => s.resume)
  const wheelToWheel = useRace((s) => s.wheelToWheel)
  const paused = useRef(false)

  useEffect(() => {
    releaseThumbs()
    if (!paused.current && !wheelToWheel) {
      paused.current = true
      pause()
    }
    return () => {
      if (paused.current) {
        paused.current = false
        resume()
      }
    }
  }, [pause, resume, wheelToWheel])

  return (
    <div className="rally-turn" role="status">
      <span className="rally-turn-phone" aria-hidden="true" />
      <p>turn your phone</p>
      <p className="rally-turn-why">the road is wider than it is tall</p>
    </div>
  )
}

/**
 * Which way up the phone is, without a resize listener per component.
 *
 * A media query rather than comparing width to height, because the visual
 * viewport on a phone changes size when the address bar hides — and a race
 * that decided it had gone portrait because a toolbar slid away would stop
 * itself mid-corner.
 */
const PORTRAIT = '(orientation: portrait)'
function subscribe(fn: () => void) {
  if (typeof matchMedia === 'undefined') return () => {}
  const query = matchMedia(PORTRAIT)
  query.addEventListener('change', fn)
  return () => query.removeEventListener('change', fn)
}
function isPortrait() {
  return typeof matchMedia !== 'undefined' && matchMedia(PORTRAIT).matches
}

/** Everything a phone adds to the road, and nothing a keyboard ever sees. */
export function TouchDriving() {
  const portrait = useSyncExternalStore(subscribe, isPortrait, () => false)
  useEffect(() => releaseThumbs, [])
  if (portrait) return <TurnIt />
  /*
    Four, and the order across the screen is: handbrake, ember · ember,
    handbrake. See the note on mirroring in `touch.ts` — the two on the right
    are the two on the left reflected, so neither hand is the wrong hand for
    anything.
  */
  return (
    <>
      <RallyArrows />
      <Button which="handbrake" side="left" label="handbrake" glyph="✋" />
      <Button which="boost" side="left" label="ember" glyph="✦" />
      <Button which="boost" side="right" label="ember" glyph="✦" />
      <Button which="handbrake" side="right" label="handbrake" glyph="✋" />
    </>
  )
}
