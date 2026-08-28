/**
 * Where the two driving buttons sit, moved by dragging them.
 *
 * ---------------------------------------------------------------------------
 * **Sliders were the obvious build and they are the wrong one.** Four of them —
 * an x and a y each — asks somebody to hold a picture of the screen in their
 * head and convert "a bit further from my thumb" into two numbers, twice. The
 * thing being positioned is a place on a rectangle, so the control is a
 * rectangle you put things on.
 *
 * The preview is the shape of a phone held sideways, because that is the only
 * orientation the race runs in. It is deliberately not to scale with the real
 * device: what is being set is a *fraction* of the screen, so a shape with the
 * right proportions says everything a pixel-accurate one would and works on
 * the laptop this panel is usually opened on.
 * ---------------------------------------------------------------------------
 */

import { useRef } from 'react'
import { DEFAULT_LAYOUT, useTouchLayout, type Spot } from '@/world/games/ember-rally/touch'

/** How wide the phone is drawn, relative to its height. A 19.5:9 in landscape. */
const SHAPE = 19.5 / 9

function Draggable({
  which,
  glyph,
  label,
}: {
  which: 'handbrake' | 'boost'
  glyph: string
  label: string
}) {
  const layout = useTouchLayout((s) => s.layout)
  const move = useTouchLayout((s) => s.move)
  const spot = layout[which]
  const dragging = useRef(false)

  function place(event: React.PointerEvent<HTMLButtonElement>): Spot {
    const box = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!box) return spot
    return {
      x: (event.clientX - box.left) / Math.max(1, box.width),
      y: (event.clientY - box.top) / Math.max(1, box.height),
    }
  }

  return (
    <button
      type="button"
      className={`thumb-spot ${which}`}
      title={`drag to move the ${label}`}
      aria-label={`${label} position`}
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        /*
          Height, not width, because the real one is sized in `vmin` — a
          fraction of the *short* side of the screen. Sized by width the
          preview drew them nearly twice as large and much closer together than
          they land in the hand, which is worse than having no preview: it is a
          preview that lies about the one thing it is for.
        */
        height: `${layout.size * 100}%`,
      }}
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        move(which, place(event))
      }}
      onPointerUp={(event) => {
        dragging.current = false
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      /*
        And the keyboard, because this panel is mostly opened on a laptop and a
        control that can only be dragged is a control somebody on a trackpad
        fights. One percent a press, ten with shift.
      */
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.01
        const by: Record<string, Spot> = {
          ArrowLeft: { x: -step, y: 0 },
          ArrowRight: { x: step, y: 0 },
          ArrowUp: { x: 0, y: -step },
          ArrowDown: { x: 0, y: step },
        }
        const nudge = by[event.key]
        if (!nudge) return
        event.preventDefault()
        move(which, { x: spot.x + nudge.x, y: spot.y + nudge.y })
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}

export function ThumbLayout() {
  const layout = useTouchLayout((s) => s.layout)
  const resize = useTouchLayout((s) => s.resize)
  const reset = useTouchLayout((s) => s.reset)
  const moved =
    Math.abs(layout.handbrake.x - DEFAULT_LAYOUT.handbrake.x) > 1e-9 ||
    Math.abs(layout.handbrake.y - DEFAULT_LAYOUT.handbrake.y) > 1e-9 ||
    Math.abs(layout.boost.x - DEFAULT_LAYOUT.boost.x) > 1e-9 ||
    Math.abs(layout.boost.y - DEFAULT_LAYOUT.boost.y) > 1e-9 ||
    Math.abs(layout.size - DEFAULT_LAYOUT.size) > 1e-9

  return (
    <section>
      <h3>where the buttons are, on a phone</h3>
      <p className="admin-note">
        Drag either one. This is <b>this device only</b> — where a button should
        sit is a fact about your hands and your phone, so it is never sent
        anywhere. Arrow keys nudge, shift for a bigger step.
      </p>

      <div className="thumb-phone" style={{ aspectRatio: String(SHAPE) }}>
        {/*
          The two halves, drawn faintly, because the thing most worth seeing
          here is whether a button has ended up on the wrong side of the line
          that steers the car.
        */}
        <span className="thumb-half left" aria-hidden="true">
          left
        </span>
        <span className="thumb-half right" aria-hidden="true">
          right
        </span>
        <Draggable which="handbrake" glyph="✋" label="handbrake" />
        <Draggable which="boost" glyph="✦" label="ember" />
      </div>

      <label>
        <span className="k">
          how big · {Math.round(layout.size * 100)}% of the short side
        </span>
        <input
          type="range"
          min={0.07}
          max={0.3}
          step={0.005}
          value={layout.size}
          onChange={(event) => resize(Number(event.target.value))}
        />
      </label>

      <div className="row">
        <button type="button" className={moved ? '' : 'on'} disabled={!moved} onClick={reset}>
          back where they started
        </button>
      </div>

      <p className="admin-note">
        On a phone the car <b>drives itself forward</b> — there is no throttle,
        because there is no thumb left to hold one. The handbrake is also the
        brake: it is how you slow down and how you go sideways, which is the
        same thing on this road.
      </p>
    </section>
  )
}
