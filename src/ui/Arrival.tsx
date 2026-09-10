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

    A handful of them are given a halo. An even field of identical dots is a
    texture; a sky has half a dozen stars you would point at and several
    hundred you would not, and it is the difference between the two that makes
    it read as depth rather than as noise.
  */
  const stars = useMemo(() => {
    const rng = makeRng(seedFrom('arrival:sky'))
    return Array.from({ length: 110 }, () => {
      const top = Math.pow(rng(), 1.6) * 86
      const bright = rng() < 0.06
      return {
        left: rng() * 100,
        top,
        size: (bright ? 2.2 : 0.8) + rng() * (bright ? 1 : 1.1),
        // the lower down, the fainter — the dawn is drowning them
        dim: (bright ? 0.7 : 0.2) + rng() * 0.45 * (1 - top / 130),
        halo: bright,
        period: 4 + rng() * 8,
        delay: -rng() * 9,
      }
    })
  }, [])

  /*
    The land, as one silhouette across the bottom.

    **This is the piece that was missing.** What stood here was a vertical
    gradient with a warm smudge low down in it and forty-six dots on top — and
    a gradient is not a place, however carefully it is graded. The one thing
    that turns a wash of colour into somewhere you are standing is a horizon
    with something on it, and it costs two paths.

    Two ridges, because one is a wall. The far one is smooth, higher, and paler
    with the haze; the near one is nearly black and carries a wood along its
    top — the same low hazy range and the same treeline that are behind the
    garden itself, so the door is a view of the world rather than a title card
    in front of it.

    Generated rather than drawn, and seeded, so it is imperfect in the way the
    design law asks for and identical every time you open the door.
  */
  const land = useMemo(() => {
    const rng = makeRng(seedFrom('arrival:land'))
    const W = 1200
    const H = 300

    /** A smooth line of hills, as a path along the top of a filled mass. */
    const ridge = (base: number, amp: number, roll: number) => {
      const shift = rng() * 40
      const parts: string[] = []
      for (let x = 0; x <= W; x += 12) {
        const y =
          base -
          Math.sin((x + shift) * roll) * amp -
          Math.sin((x + shift) * roll * 2.7 + 1.3) * amp * 0.35
        parts.push(`${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`)
      }
      return `${parts.join(' ')} L${W},${H} L0,${H} Z`
    }

    /*
      The near ridge, with a wood standing on it.

      Each tree is a few points — up the near side, over the crown, down the
      far — laid end to end along the skyline. Two things decide whether that
      reads as a wood or as a saw blade, and the first cut got both wrong:

      **Height has to be uneven, and mostly short.** Drawn from a flat range
      every tree comes out roughly the same and the edge is a comb. Cubing the
      random makes most of them low and lets one in ten or so stand well over
      the rest, which is what a treeline looks like from far enough away to be
      a shape.

      **A tree has to be wider than it is tall, at this size.** A dozen pixels
      of crown over five of trunk is a spike; the same crown over fifteen
      pixels of width is foliage. Distant woodland is a soft ragged edge, not a
      row of firs.
    */
    const wood = () => {
      const parts: string[] = []
      let x = -20
      let first = true
      while (x < W + 20) {
        const w = 9 + rng() * 15
        const tall = Math.pow(rng(), 3)
        const h = 3 + tall * 22
        const base = 232 - Math.sin(x * 0.0052) * 16 - Math.sin(x * 0.011 + 2.1) * 7
        for (const [dx, dy] of [
          [0, 0],
          [w * 0.2, -h * 0.5],
          [w * 0.38, -h * 0.92],
          [w * 0.58, -h],
          [w * 0.78, -h * 0.55],
        ] as const) {
          parts.push(`${first ? 'M' : 'L'}${(x + dx).toFixed(1)},${(base + dy).toFixed(1)}`)
          first = false
        }
        // Overlapped a little, so the crowns run into one another rather than
        // standing in a row with the skyline showing between every pair.
        x += w * 0.82
      }
      return `${parts.join(' ')} L${W + 20},${H} L-20,${H} Z`
    }

    return { far: ridge(178, 26, 0.0041), near: wood(), viewBox: `0 0 ${W} ${H}` }
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
        {/* The faint band of the galaxy, so the field has a grain running
            through it rather than being evenly sprinkled. */}
        <span className="arrival-milk" />

        {stars.map((star, i) => (
          <i
            key={i}
            className={star.halo ? 'bright' : undefined}
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

        {/* Three sheets of high cloud lit from underneath, crossing over
            minutes. Slow enough that you never catch one moving and the sky is
            not the same one twice. */}
        <span className="arrival-cloud one" />
        <span className="arrival-cloud two" />
        <span className="arrival-cloud three" />

        <svg
          className="arrival-land"
          viewBox={land.viewBox}
          preserveAspectRatio="none"
          focusable="false"
        >
          <path className="far" d={land.far} />
          <path className="near" d={land.near} />
        </svg>
      </div>

      <div className="inner">
        <p className="arrival-who">for {name}</p>
        <h1>The Garden Between Us</h1>
        <p className="arrival-what">
          Five places, and the two of you. A tree that keeps what you think, a
          river that runs on what you have put by, a fire with something to
          play, a sky wide enough to talk across, and a glasshouse built out of
          every picture worth keeping.
        </p>
        <button type="button" ref={way} onClick={open}>
          come in
        </button>
      </div>
    </div>
  )
}
