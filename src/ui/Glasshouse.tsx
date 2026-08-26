/**
 * Leaving a memory, and looking at one.
 *
 * ---------------------------------------------------------------------------
 * **Why the photograph is DOM and not a quad.**
 *
 * Everything else in this world is drawn in the scene, and that is right for
 * everything else: stones, water, light, a road. A photograph is different in
 * kind. It is the one thing here that somebody *chose*, that cannot be made
 * again, and whose colours are the whole content — and anything drawn inside
 * the Canvas goes through ACES tone mapping at exposure 0.98, through fog, and
 * through whatever the hour has done to the ambient level. Her face would come
 * out warmer at six and bluer at midnight.
 *
 * So the pane in the wall is a quad, lit like the building it is part of, and
 * the one you have *opened* is an `<img>` over the top of the world, untouched.
 * The Glasshouse keeps rendering behind it and takes the picture's colour into
 * the room, which is the brief's "the world responds to the image" — with the
 * response happening to the world rather than to the photograph.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { memoryById, useMemories } from '@/systems/memories'
import { useTrouble } from '@/systems/trouble'
import { ambience } from '@/systems/ambience'
import { toTheNewest } from '@/sections/glasshouse/aisle'
import { openPane } from '@/sections/glasshouse/view'

/** How long the glass takes to form, in milliseconds. Matches the shader. */
const FORMING_MS = 2400

// ---------------------------------------------------------------------------
// Leaving one
// ---------------------------------------------------------------------------

/**
 * The picker, then two questions, then it is in the building forever.
 *
 * The two questions are optional and are the *only* two. Not a title, a
 * description, tags, an album, a place and a rating — this is not image
 * management, and every field that could be left blank is a small accusation
 * that you have not finished. If the picture says enough it goes in alone.
 */
export function LeavingAMemory() {
  const data = useData()
  const hanging = useMemories((s) => s.hanging)
  const setHanging = useMemories((s) => s.setHanging)
  const forming = useMemories((s) => s.forming)

  const chosen = useMemories((s) => s.picked)
  const [preview, setPreview] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)

  /*
    One object URL per prepared picture, revoked when it is replaced.

    Made here rather than in the store because it is a *view* of the blob and
    belongs to whatever is showing it; the store holds the blob itself. One
    leaked per attempt is invisible until somebody hangs forty in an evening.
  */
  useEffect(() => {
    if (!chosen) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(chosen.display)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [chosen])

  const close = useCallback(() => {
    setHanging(false)
    setPreview(null)
    setWhen('')
    setWhy('')
    setBusy(false)
  }, [setHanging])

  if (!hanging) return null

  const hang = async () => {
    if (!chosen || busy) return
    setBusy(true)
    try {
      const memory = await data.hangMemory({ ...chosen, when, why })
      /*
        Three things, in this order, and the order is the ceremony.

        Stand at the end of the building where the frame is; let the glass form
        in it; and ring, once. The sound is last because it is the moment the
        pane finishes, not the moment the upload did.
      */
      toTheNewest()
      forming(memory.id)
      window.setTimeout(() => {
        if (useMemories.getState().formingId === memory.id) forming(null)
      }, FORMING_MS)
      ambience.said(true)
      close()
    } catch (error) {
      useTrouble.getState().say(error instanceof Error ? error.message : 'It would not go up.')
      setBusy(false)
    }
  }

  return (
    <div className="leaving">
      {preview && chosen ? (
        <>
          {/*
            What you picked, at the size it will be looked at.

            Before the two questions, not after, and not as a thumbnail. The
            answers are about this picture and you cannot write them from
            memory of a photograph you glanced at in a picker.
          */}
          <img
            className="leaving-picture"
            src={preview}
            alt=""
            style={{ aspectRatio: `${chosen.width} / ${chosen.height}` }}
          />

          <div className="leaving-lines">
            <label>
              <span>when it was</span>
              <input
                type="text"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                // Free text, never a date picker: nobody has the precision a
                // date picker insists on about the things worth keeping.
                placeholder="the night before you left"
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label>
              <span>why it stays</span>
              <input
                type="text"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="you can leave this empty"
                maxLength={240}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="leaving-ways">
            <button type="button" className="leaving-go" onClick={() => void hang()} disabled={busy}>
              {busy ? 'putting it in the glass' : 'put it in the glass'}
            </button>
            <button type="button" className="put-back quiet" onClick={close} disabled={busy}>
              not this one
            </button>
          </div>
        </>
      ) : (
        <p className="leaving-waiting">Getting it ready…</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Looking at one
// ---------------------------------------------------------------------------

/**
 * One memory, open.
 *
 * The photograph, the two lines the person who hung it wrote, and — turning it
 * over — the one line the other one left. That is everything. No counts, no
 * reactions, no "shared on", nothing that a photo library would put here.
 */
export function OpenMemory() {
  const data = useData()
  const me = data.me
  const memories = useMemories((s) => s.all)
  const openId = useMemories((s) => s.openId)
  const open = useMemories((s) => s.open)
  const memory = memoryById(memories, openId)

  const presence = useWorldSlice((s) => s.presence)
  const them = presence[otherUser(me)]
  const together = Boolean(memory && them.online && them.looking === memory.id)

  const [picture, setPicture] = useState<string | null>(null)
  const [turned, setTurned] = useState(false)
  const [lost, setLost] = useState(false)
  const [taking, setTaking] = useState(false)
  const [saying, setSaying] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  /*
    Say that you are looking at it.

    Down the live channel, cleared on the way out and cleared again when this
    unmounts for any reason at all — a place change, a reload, a phone going
    into a pocket. A stale "she is looking at this" is worse than none: it
    would put a light on a piece of glass in an empty building.
  */
  useEffect(() => {
    if (!memory) return
    data.publishPresence({ looking: memory.id })
    return () => data.publishPresence({ looking: '' })
  }, [data, memory])

  useEffect(() => {
    setTurned(false)
    setSaying(null)
    setTaking(false)
    setPicture(null)
    setLost(false)
    if (!memory) return
    let gone = false
    data
      .pictureUrl(memory)
      .then((url) => {
        if (!gone) setPicture(url)
      })
      .catch(() => {
        /*
          Say so.

          The sixteen-pixel preview stays and is still true, but a soft glowing
          rectangle where a photograph should be reads as a bug rather than as
          a state — and this is the one collection in the garden that cannot be
          made again, so "the picture itself is not here" is the single most
          important honest thing this place can ever say. It is worded as
          *right now* because the usual cause is a tunnel, not a loss.
        */
        if (!gone) setLost(true)
      })
    return () => {
      gone = true
    }
  }, [data, memory])

  // Escape closes, in the capture phase — `ui/Places` also takes Escape and
  // means "leave the place" by it, so without this one tap walks you out of
  // the picture *and* out into the meadow. The same fix the Stars' menu needed.
  useEffect(() => {
    if (!memory) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      e.stopPropagation()
      open(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [memory, open])

  /*
    Lay the photograph on the pane, every frame, without React.

    ---------------------------------------------------------------------------
    **This is what stops the open state being a lightbox.** The Glasshouse walks
    you to the memory and turns the building square to its wall; by the end of
    that the pane is exactly perpendicular, so it projects to an axis-aligned
    rectangle — and this puts the real photograph on that rectangle. What you
    see is not a panel that appeared over a scene: it is the picture in the
    pane, at the size the pane is, with the room still moving around it.

    Its own animation frame rather than `useFrame`, because this lives outside
    the Canvas — and rather than React state, because the rectangle changes
    every frame for the length of the turn and a re-render per frame of a
    full-resolution photograph is the exact thing the technical law forbids.

    The **width** matches the pane and the **height** comes from the picture's
    own proportions, which is the one place the two deliberately differ: the
    frame crops to three by two, and opening is where the rest of the
    photograph comes back. So it grows past the top and bottom of its own
    frame, which is a nice way of saying *this is all of it*.
    ---------------------------------------------------------------------------
  */
  const laid = useRef<HTMLDivElement>(null)
  /** Which way round the glass is, eased — see the note in the loop below. */
  const face = useRef(1)
  useEffect(() => {
    if (!memory) return
    let frame = 0
    const ratio = Math.max(0.2, Math.min(5, memory.width / Math.max(1, memory.height)))
    const place = () => {
      frame = requestAnimationFrame(place)
      const el = laid.current
      if (!el) return
      if (!openPane.live) {
        el.style.opacity = '0'
        return
      }
      /*
        The pane's width, and the photograph's own height.

        This is where the crop comes back: the glass in the wall is three by
        two whatever shape the picture is, and opening one lets the top and
        bottom a portrait lost grow back past the frame. Which is the right
        gesture and, unbounded, walks a nine-by-sixteen straight off the top of
        a phone and through the words at the bottom. So it is capped by the
        room left on screen, and a very tall picture gives back some width to
        keep its shape — a portrait hung on a wide pane, which is what it is.
      */
      let w = openPane.halfW * 2
      let h = w / ratio
      /*
        Half again as tall as the glass, and no taller.

        A portrait cropped to a three-by-two pane and then allowed all its
        height back is twice the height of the frame it came out of, which on a
        phone is the whole screen and the words at the bottom as well — the
        lightbox this whole pass exists to get rid of, arriving by the back
        door. Measured against the *pane* rather than the viewport because that
        is the thing it has to look right next to, and because the pane is
        already the right size for the screen: the standing distance was solved
        to make it so. The viewport line underneath is a backstop for a very
        short window.
      */
      const tallest = Math.min(openPane.halfH * 3, window.innerHeight * 0.66)
      if (h > tallest) {
        h = tallest
        w = h * ratio
      }
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      el.style.left = `${openPane.x - w / 2}px`
      el.style.top = `${openPane.y - h / 2}px`
      /*
        It arrives at the very end of the turn.

        Until then you are watching the *pane* — which already carries the real
        photograph as its texture, so there is nothing missing during the move.
        The hand-over at the end is what swaps a tone-mapped, fogged, cropped
        texture for the picture exactly as it was taken.
      */
      /*
        It arrives at the very end of the turn, and leaves when the pane does.

        Turning a pane over has to take the photograph with it — it is the same
        piece of glass — and until now it did not: the picture stayed lit on
        the wall while its own back was being read in front of it. The flip is
        a CSS transform on a different element, so this is the one line that
        keeps the two halves of one object agreeing about which way round it
        is. Eased rather than switched, because the flip it belongs to takes
        three quarters of a second and a photograph that vanishes on the first
        frame of it reads as a bug in the flip.
      */
      face.current += ((turned ? 0 : 1) - face.current) * 0.14
      el.style.opacity = String(Math.max(0, (openPane.at - 0.82) / 0.18) * face.current)
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [memory, turned])

  /*
    Nothing to look at once it has been taken out.

    There is a frame between the document being emptied and `openId` being
    cleared where this component still holds the memory it just removed — and
    it would render an `<img>` with an empty `src`, which browsers treat as a
    request for the page itself. Guarding on the memory rather than on the
    close order means it also holds if a removal ever arrives from anywhere
    else.
  */
  if (!memory || memory.removed) return null

  const mine = memory.by === me
  const theirLine = memory.theirs

  const takeItOut = async () => {
    try {
      await data.removeMemory(memory.id)
      /*
        Leave first, and only then let the building change.

        Closing the picture before the wall reflows means you never watch the
        photograph you just deleted flicker out from underneath you — you are
        already back in the aisle when the plain glass goes into that panel.
      */
      open(null)
      setTaking(false)
    } catch (error) {
      useTrouble.getState().say(
        error instanceof Error ? error.message : 'It would not come out.',
      )
    }
  }

  const say = async () => {
    const text = (saying ?? '').trim()
    try {
      await data.sayWhatIRemember(memory.id, text)
      setSaying(null)
      ambience.said(true)
    } catch (error) {
      useTrouble.getState().say(error instanceof Error ? error.message : 'That would not save.')
    }
  }

  return (
    <div
      className={`opened ${together ? 'together' : ''}`}
      // The whole colour of the room, handed to CSS once. Everything tinted by
      // this — the wash behind, the rules under the text — reads off one value,
      // so the picture and its surroundings can never disagree.
      style={{ '--memory-tint': memory.tint } as React.CSSProperties}
    >
      {/*
        The photograph, laid on the pane itself.

        Positioned every frame by the loop above, from the rectangle the scene
        projects — so this is not floating over the world, it is *on* the piece
        of glass you walked to. It sits outside the flip container because the
        flip is a thing the back does; see below.
      */}
      <div ref={laid} className="opened-laid" aria-hidden={turned}>
        {/*
          The preview underneath and the photograph over it.

          Both are in the document at once: the sixteen-pixel one came down with
          the memory and needs nothing, so there is never an empty rectangle,
          and the real one fades in on top when it arrives. If it never arrives
          — a tunnel, a bucket that has gone — what is left is still true, just
          very blurry, which is the honest failure.
        */}
        <img className="opened-blur" src={memory.blur} alt="" aria-hidden="true" />
        <img
          className={`opened-picture ${picture ? 'here' : ''}`}
          src={picture ?? memory.blur}
          alt={memory.why ?? memory.when ?? 'A memory'}
        />
      </div>

      <div className={`opened-glass ${turned ? 'turned' : ''}`}>

        {/*
          The back of the glass.

          Turning a pane over to find something written on the other side is
          the brief's idea and it is a good one: one of you leaves the moment
          and the other leaves what it was from where they were standing, and
          the second thing is not a comment under the first. It is on the back.
        */}
        <div className="opened-back">
          {theirLine ? (
            <p className={`opened-remembers ${theirLine.by}`}>{theirLine.body}</p>
          ) : mine ? (
            <p className="opened-remembers waiting">
              Nothing on this side yet. She writes here, when she gets to it.
            </p>
          ) : saying === null ? (
            <button type="button" className="opened-say" onClick={() => setSaying('')}>
              what I remember
            </button>
          ) : null}

          {!mine && saying !== null && (
            <div className="opened-writing">
              <textarea
                ref={field}
                value={saying}
                onChange={(e) => setSaying(e.target.value)}
                placeholder="what this was, from where you were"
                maxLength={600}
                rows={3}
                autoFocus
              />
              <div className="opened-ways">
                <button type="button" className="put-back" onClick={() => void say()}>
                  write it on the glass
                </button>
                <button type="button" className="put-back quiet" onClick={() => setSaying(null)}>
                  not now
                </button>
              </div>
            </div>
          )}

          {!mine && theirLine && theirLine.by === me && (
            <button
              type="button"
              className="put-back quiet"
              onClick={() => setSaying(theirLine.body)}
            >
              change what you wrote
            </button>
          )}
        </div>
      </div>

      <div className="opened-said">
        {lost && (
          <p className="opened-lost">
            The picture itself is not here right now — only its colours. It will
            come back when this device can reach it.
          </p>
        )}
        {memory.when && <p className="opened-when">{memory.when}</p>}
        {memory.why && <p className="opened-why">{memory.why}</p>}
        {together && (
          <p className="opened-both">
            {/* Only ever while it is true. See `looking` on Presence. */}
            you are both looking at this
          </p>
        )}
      </div>

      <div className="opened-ways">
        <button type="button" className="put-back" onClick={() => setTurned(!turned)}>
          {turned ? 'turn it back' : 'turn it over'}
        </button>
        <button type="button" className="put-back quiet" onClick={() => open(null)}>
          back to the glass
        </button>
        {/*
          Only yours, and only after asking twice.

          The same shape as `theirs` and the opposite side of it: she may write
          a line on yours and never take it down; you may take yours out and
          never write the line. And it is deliberately the quietest thing on
          the screen — a photograph one of you kept should not sit under a
          delete button of equal weight to the picture.
        */}
        {mine && !taking && (
          <button type="button" className="put-back quiet" onClick={() => setTaking(true)}>
            take it out
          </button>
        )}
      </div>

      {mine && taking && (
        <p className="opened-taking">
          {/*
            What actually happens, in the words that are true. Not "are you
            sure" — that asks nothing. This says the photograph is deleted, the
            wall closes, and there is no way back, because all three are facts
            somebody deserves before the tap and not after.
          */}
          <span>
            The picture is deleted and the wall closes over it. Nothing else in
            the building moves, and there is no way back.
          </span>
          <span className="opened-taking-ways">
            <button type="button" className="put-back" onClick={() => void takeItOut()}>
              take it out of the glass
            </button>
            <button type="button" className="put-back quiet" onClick={() => setTaking(false)}>
              keep it
            </button>
          </span>
        </p>
      )}
    </div>
  )
}

/** Both, mounted together — they are two halves of the same place. */
export function Glasshouse() {
  return (
    <>
      <LeavingAMemory />
      <OpenMemory />
    </>
  )
}
