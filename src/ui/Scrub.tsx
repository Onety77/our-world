/**
 * The line you drag to move the film, and the ±15 either side of it.
 *
 * =============================================================================
 * **It used to seek on every pointer move**, and every one of those was a
 * YouTube seek *and* a write to the shared document — dozens a second while a
 * thumb was down. That is the whole of what was reported: sticky, laggy,
 * impossible to land on a spot, "you touch seek and hope and wait".
 *
 * Three separate faults, and they compounded:
 *
 *   **Every move was a seek.** YouTube's player takes a moment to honour one,
 *   so a stream of them queues up behind your thumb and the picture arrives
 *   somewhere you left half a second ago.
 *
 *   **Every move was a write.** The other end got each one, and so did the
 *   sync loop coming back, which then corrected *this* device toward a
 *   position it had already moved on from.
 *
 *   **And the thumb was drawn from the anchor**, not from your finger — so it
 *   did not track the drag at all. It jumped to wherever the last round trip
 *   landed, which is precisely the "sticky" feeling.
 *
 * So: while a thumb is down this owns the position entirely and tells nobody.
 * The mark follows the finger exactly, because it *is* the finger. On release
 * it seeks once and writes once. Which is also how a volume slider works, and
 * why that one always felt right.
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import { useWatching } from '@/systems/watching'

/** How far the skip buttons jump. The number every video app has settled on. */
export const SKIP = 15

export function Scrub({
  shown,
  span,
  live,
  onSeek,
  onActivity,
  children,
}: {
  /** Where the film is, in seconds, when nobody is dragging. */
  shown: number
  /** How long it is. Zero while nothing is loaded, or during an advert. */
  span: number
  live: boolean
  /** Called once, on release. Never during the drag. */
  onSeek(seconds: number): void
  onActivity?(): void
  /** The clock and the transport, which need to know the dragged position. */
  children?: (at: number, dragging: boolean) => React.ReactNode
}) {
  const line = useRef<HTMLDivElement>(null)
  /** Where the thumb is while it is down. Null when nobody is holding it. */
  const [held, setHeld] = useState<number | null>(null)

  /*
    While a thumb is down, the sync loop must not correct the picture.

    It runs every nine hundred milliseconds and pulls the player back to the
    shared anchor — which, mid-drag, is wherever the film was before you
    started. Left alone it would fight the finger with the same round-trip lag
    that made this feel sticky in the first place.
  */
  useEffect(() => {
    useWatching.getState().setScrubbing(held !== null)
    return () => useWatching.getState().setScrubbing(false)
  }, [held])

  const at = held ?? shown
  const through = span > 0 ? Math.max(0, Math.min(1, at / span)) : 0

  const positionAt = (clientX: number): number | null => {
    const box = line.current?.getBoundingClientRect()
    if (!box || box.width === 0 || span <= 0) return null
    return Math.max(0, Math.min(span, ((clientX - box.left) / box.width) * span))
  }

  const nudge = (by: number) => {
    if (!live || span <= 0) return
    onActivity?.()
    onSeek(Math.max(0, Math.min(span, shown + by)))
  }

  return (
    <>
      <div className="together-scrub">
        {/*
          Back and forward fifteen, which is the one video control everybody
          already has in their hands. Either side of the line rather than in
          the transport row, because they are *about* the line — you reach for
          them for the same reason you reach for it, and a jump you can take
          without aiming is most of what makes a scrubber tolerable on a phone.
        */}
        <button
          type="button"
          className="together-skip back"
          onClick={() => nudge(-SKIP)}
          disabled={!live || span <= 0}
          aria-label={`back ${SKIP} seconds`}
        >
          <span aria-hidden="true">↺</span>
          <b>{SKIP}</b>
        </button>

        <div
          ref={line}
          className={`together-beamline${held !== null ? ' held' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label="how far through"
          aria-valuemin={0}
          aria-valuemax={Math.round(span)}
          aria-valuenow={Math.round(at)}
          onPointerDown={(event) => {
            if (!live || span <= 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            const to = positionAt(event.clientX)
            if (to !== null) setHeld(to)
            onActivity?.()
          }}
          onPointerMove={(event) => {
            if (held === null) return
            const to = positionAt(event.clientX)
            /*
              Local only. No seek, no write — this is the frame following the
              thumb, and it is the entire reason the drag feels like a drag.
            */
            if (to !== null) setHeld(to)
            onActivity?.()
          }}
          onPointerUp={(event) => {
            if (held === null) return
            const to = positionAt(event.clientX) ?? held
            setHeld(null)
            // One seek and one write, at the end, on the place you let go of.
            onSeek(to)
            onActivity?.()
          }}
          onPointerCancel={() => setHeld(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-5) }
            if (event.key === 'ArrowRight') { event.preventDefault(); nudge(5) }
          }}
        >
          <span className="together-beam" style={{ transform: `scaleX(${through})` }} />
          {/*
            Where you are, as a thing you can take hold of.

            A one-pixel beam says how far through you are and gives a thumb
            nothing to aim at. The mark is both halves: it reads the position
            at a glance and it is the handle. `pointer-events: none` so it
            never eats the gesture belonging to the line underneath it.
          */}
          <span className="together-hold" style={{ left: `${through * 100}%` }} aria-hidden="true" />
        </div>

        <button
          type="button"
          className="together-skip on"
          onClick={() => nudge(SKIP)}
          disabled={!live || span <= 0}
          aria-label={`forward ${SKIP} seconds`}
        >
          <span aria-hidden="true">↻</span>
          <b>{SKIP}</b>
        </button>
      </div>
      {children?.(at, held !== null)}
    </>
  )
}
