/**
 * The two things on the table: the die, and the glass.
 *
 * ---------------------------------------------------------------------------
 * **Objects, not controls.** The design law here has no room for a progress
 * bar or a digital clock, and it does not need one — a game played at a table
 * has a die you roll and a glass you turn, and those two things say everything
 * a bar and a clock would. The glass is better than a clock at the only job
 * that matters, which is telling you *roughly* how long is left without making
 * you read a number every four seconds.
 *
 * Both are made of gradients and a couple of elements. Not three-dimensional,
 * and deliberately: the cave is already rendering behind this in the world's
 * own pipeline, and a second lit scene stacked on top of it would be two
 * different ideas of what "firelit" means, fighting. Word Duel's board is DOM
 * over the same cave for the same reason.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import { DIE_FACES } from './categories'

/**
 * The letter die, mid-roll and then settled.
 *
 * It tumbles through faces for a moment before it lands. The tumble is the
 * point: a letter that simply *appears* is a variable being assigned, and a
 * letter that clatters to a stop is a roll. It always lands on the letter it
 * was given — the seed decided that long before this component existed — so
 * the tumble is theatre and is honest about it.
 */
export function Die({ letter, rolling }: { letter: string; rolling: boolean }) {
  const [face, setFace] = useState(letter)
  const done = useRef(false)

  useEffect(() => {
    if (!rolling) {
      setFace(letter)
      return
    }
    done.current = false
    let step = 0
    const spin = window.setInterval(() => {
      step++
      // Slowing down as it settles, the way a die actually does.
      if (step > 14) {
        window.clearInterval(spin)
        setFace(letter)
        done.current = true
        return
      }
      setFace(DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)])
    }, 60 + step * 14)
    return () => window.clearInterval(spin)
  }, [letter, rolling])

  return (
    <span className={`die ${rolling ? 'rolling' : 'settled'}`} aria-hidden="true">
      <b>{face}</b>
    </span>
  )
}

/**
 * The glass, with ember sand in it.
 *
 * `left` is 0..1 of the time remaining. The sand in the top falls, the pile in
 * the bottom grows, and under the last thirty seconds the whole thing warms
 * and starts to breathe — which is the only urgency this game has, and it is
 * enough. Written straight to the node's style rather than through React: it
 * moves every frame and a re-render per frame of a running game is the exact
 * thing the technical law is about.
 */
export function Glass({ left, urgent }: { left: number; urgent: boolean }) {
  const top = useRef<HTMLElement>(null)
  const foot = useRef<HTMLElement>(null)

  useEffect(() => {
    if (top.current) top.current.style.transform = `scaleY(${Math.max(0, left).toFixed(3)})`
    if (foot.current) foot.current.style.transform = `scaleY(${(1 - Math.max(0, left)).toFixed(3)})`
  }, [left])

  return (
    <span className={`glass ${urgent ? 'urgent' : ''}`} aria-hidden="true">
      <i className="glass-top">
        <i ref={top} className="glass-sand" />
      </i>
      {/* The thread of sand between the two, only while any is falling. */}
      {left > 0 && left < 1 && <i className="glass-thread" />}
      <i className="glass-foot">
        <i ref={foot} className="glass-sand" />
      </i>
    </span>
  )
}

/** How long is left, said in words, for anything that cannot see the glass. */
export function spoken(ms: number): string {
  const whole = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
