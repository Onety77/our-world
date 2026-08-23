/**
 * Where you are, and how to go somewhere else.
 *
 * The name of the place, and a row of marks along the bottom — one per place,
 * the current one lit. Swiping is the real navigation; these are for knowing
 * how many places there are and that the gesture exists at all.
 *
 * No arrows, no chrome. The marks are small enough to ignore and big enough
 * to hit with a thumb.
 */

import { useEffect, useState } from 'react'
import { takenOverNow, useTakenOver } from '@/systems/attention'
import { SECTIONS } from '@/sections/registry'
import { slidePosition, useSections } from '@/systems/sections'
import { grabbed } from '@/systems/swipe'

export function Places() {
  const takenOver = useTakenOver()
  const index = useSections((s) => s.index)
  const entered = useSections((s) => s.entered)
  const go = useSections((s) => s.go)
  const enter = useSections((s) => s.enter)
  const leave = useSections((s) => s.leave)
  const next = useSections((s) => s.next)
  const previous = useSections((s) => s.previous)

  // Arrow keys, because a keyboard should be able to do what a thumb can.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      /*
        Belt and braces with whatever is on top.

        A game, a letter or a form owns the keyboard while it is up, and Escape
        inside one of them means "close this", not "walk out of the place I am
        standing in". Ember Rally stops its own Escape in the capture phase, but
        the general rule belongs here: the same guard that keeps this component
        from *drawing* over a game should keep it from acting on its keys.
      */
      if (takenOverNow()) return
      if (e.key === 'Escape' && entered) leave()
      if (!entered && e.key === 'Enter') enter()
      if (!entered && e.key === 'ArrowRight') next()
      if (!entered && e.key === 'ArrowLeft') previous()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entered, enter, leave, next, previous])

  // The landmark itself is the large tap target. The transparent gesture
  // surface owns pointer movement; once it proves the gesture was a tap rather
  // than a swipe, tapping the world crosses the selected threshold.
  useEffect(() => {
    if (entered || takenOver) return
    const onTap = (event: PointerEvent) => {
      if (grabbed()) return
      // Belt and braces with the guard above: this is a window listener, and a
      // window listener that enters a place is exactly the thing that must not
      // fire for a tap aimed at something covering the world.
      if (takenOverNow()) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, a')) return
      enter()
    }
    window.addEventListener('pointerup', onTap)
    return () => window.removeEventListener('pointerup', onTap)
  }, [entered, takenOver, enter])

  /**
   * The title fades out while the world is moving and back in when it settles,
   * so the words never smear across a slide.
   */
  const [settled, setSettled] = useState(true)
  useEffect(() => {
    let raf = 0
    const check = () => {
      const near = Math.abs(slidePosition() - index) < 0.04
      setSettled((was) => (was === near ? was : near))
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [index])

  const here = SECTIONS[index]

  if (takenOver) return null

  return (
    <>
      <div className={entered ? 'garden-name hidden' : 'garden-name'}>
        <span>The Garden Between Us</span>
        <small>four places, one world</small>
      </div>

      <div
        className={`${settled ? 'place-name' : 'place-name moving'} ${entered ? 'inside' : 'browsing'}`}
        key={`${here.id}-${entered ? 'inside' : 'outside'}`}
      >
        {!entered && <span className="place-count">0{index + 1} / 0{SECTIONS.length}</span>}
        <h1>{here.name}</h1>
        <p>{here.blurb}</p>
        {!entered && (
          <button type="button" className="enter-place" onClick={enter}>
            <span>enter this place</span>
            <i aria-hidden="true">&#8594;</i>
          </button>
        )}
      </div>

      {entered && (
        <button type="button" className="leave-place" onClick={leave}>
          <span aria-hidden="true">&#8592;</span> back to the garden
        </button>
      )}

      <div className={entered ? 'marks hidden' : 'marks'} role="tablist" aria-label="places">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={s.name}
            className={i === index ? 'mark here' : 'mark'}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </>
  )
}
