/**
 * The way in.
 *
 * The first thing either of you ever sees, and the first thing you see every
 * time after that. It says what this is, and then you touch it and it opens.
 *
 * **It used to exist and was cut.** The arrival gate went with travel-between-
 * places in the pivot; its styles were left behind in styles.css with nothing
 * rendering them, and the garden started dropping you straight into the meadow
 * from a blank screen. That is a worse first second than it sounds: this is a
 * gift, and a gift that opens itself before you have touched it is just an
 * application starting up.
 *
 * It also does one piece of real work. Browsers will not let a page make a
 * sound until somebody has touched it, so the garden had been waiting for any
 * stray click to start the wind. Here the gesture is deliberate: you open the
 * door, and the world is already breathing when you get through it.
 *
 * When the real backend is live this is where signing in belongs — same page,
 * same words, with two fields under them instead of a way in. `ui/Door` holds
 * the form today; the two are deliberately built to look like one thing.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ambience } from '@/systems/ambience'
import { useArrival } from '@/systems/arrival'
import { makeRng, seedFrom } from '@/systems/rng'

/** How long the gate takes to fade off the world. Matches `.arrival` in CSS. */
const FADE_MS = 1700

export function Arrival({ name }: { name: string }) {
  const openGate = useArrival((s) => s.open)
  const shut = useArrival((s) => s.shut)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const way = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    way.current?.focus()
  }, [])

  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setGone(true), FADE_MS)
    return () => clearTimeout(id)
  }, [leaving])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    Guarded by a ref, not by the state.

    The side effects — starting the audio and telling the rest of the garden
    the door is open — must not live inside a setState updater: React may run
    an updater more than once and runs it during render, so a store write in
    there updates one component while another is rendering. The ref also makes
    the guard immediate, which matters because a tap fires this twice (the
    wrapper and the button both).
  */
  /*
    A scatter of stars, seeded so it is the same sky every time.

    Thinned toward the bottom of the screen, where the dawn is: the glow washes
    them out there in reality and it does here too, so putting them everywhere
    reads as a pattern rather than as a sky.
  */
  const stars = useMemo(() => {
    const rng = makeRng(seedFrom('arrival:sky'))
    return Array.from({ length: 46 }, () => {
      const top = Math.pow(rng(), 1.5) * 88
      return {
        left: rng() * 100,
        top,
        size: 1 + rng() * 1.6,
        // the lower down, the fainter — the dawn is drowning them
        dim: (0.25 + rng() * 0.55) * (1 - top / 120),
        period: 4 + rng() * 7,
        delay: -rng() * 8,
      }
    })
  }, [])

  const opened = useRef(false)

  function open() {
    if (opened.current) return
    opened.current = true
    // The one gesture the browser is guaranteed to accept.
    void ambience.start()
    openGate()
    setLeaving(true)
  }

  // Unmounted rather than left at zero opacity: it covers the whole world and
  // a transparent sheet over everything would quietly swallow every gesture.
  if (!shut || gone) return null

  return (
    /*
      Opened on click, not on pointerdown.

      Dismissing on the way *down* leaves the matching pointerup with nothing
      on top of the world to land on, and the garden's tap-to-enter is bound to
      `window` — so opening the door also walked you straight into whichever
      place happened to be selected. The gate also stays solid while it fades,
      for the same reason: nothing underneath it is reachable until it is gone.
    */
    <div
      className={`arrival ${leaving ? 'leaving' : ''}`}
      onClick={open}
      role="presentation"
    >
      {/*
        The sky the door stands in.

        Not 3D, and it should not be — the canvas is already loading behind
        this and a second scene to look at for four seconds would be waste. It
        is the *world's* sky though, made out of gradients: night at the top,
        and low down the warm band that is her dawn, which is the whole idea
        the Stars is built on and the right thing to be standing in front of
        before you have gone in.
      */}
      <div className="arrival-sky" aria-hidden="true">
        {stars.map((star, i) => (
          <i
            key={i}
            style={
              {
                left: star.left + '%',
                top: star.top + '%',
                '--size': star.size + 'px',
                '--dim': star.dim,
                '--period': star.period + 's',
                '--delay': star.delay + 's',
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="inner">
        <h1>The Garden Between Us</h1>
        <p>
          Four places, and the two of you. A tree that keeps what you think, a
          river that runs on what you have put by, a fire with something to
          play, and a sky wide enough to talk across.
        </p>
        <button type="button" ref={way} onClick={open}>
          come in
        </button>
        <span className="arrival-who">for {name}</span>
      </div>
    </div>
  )
}
