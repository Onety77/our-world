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
import { PictureTrouble, pickPicture, prepare, type Prepared } from '@/systems/picture'
import { useTrouble } from '@/systems/trouble'
import { ambience } from '@/systems/ambience'
import { toTheNewest } from '@/sections/glasshouse/aisle'

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

  const [chosen, setChosen] = useState<Prepared | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)

  // The object URL for what you picked is this component's to clean up. One
  // leaked per attempt is invisible until somebody hangs forty in an evening.
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const close = useCallback(() => {
    setHanging(false)
    setChosen(null)
    setPreview(null)
    setWhen('')
    setWhy('')
    setBusy(false)
  }, [setHanging])

  /*
    The picker opens the moment this starts, with nothing in between.

    A screen that says "choose a picture" with a button that opens the place
    you choose pictures is a doorway in front of a door. What is *not* skipped
    is what happens after: the two lines are asked once the picture is there to
    look at, because "why does it stay" is a question about this photograph and
    is unanswerable in the abstract.
  */
  useEffect(() => {
    if (!hanging || chosen || busy) return
    let gone = false
    setBusy(true)
    void (async () => {
      try {
        const file = await pickPicture()
        if (gone) return
        if (!file) {
          close()
          return
        }
        const ready = await prepare(file)
        if (gone) return
        setChosen(ready)
        setPreview(URL.createObjectURL(ready.display))
      } catch (error) {
        if (gone) return
        // By name, with the sentence `systems/picture` wrote — HEIC on a
        // desktop browser is the one that will actually happen, and "could not
        // load image" would send somebody hunting for a corrupt file.
        useTrouble.getState().say(error instanceof PictureTrouble ? error.message : 'That picture would not open.')
        close()
      } finally {
        if (!gone) setBusy(false)
      }
    })()
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hanging])

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
        <p className="leaving-waiting">
          {busy ? 'Opening your pictures…' : 'Choosing…'}
        </p>
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

  if (!memory) return null

  const mine = memory.by === me
  const theirLine = memory.theirs

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
      <div className={`opened-glass ${turned ? 'turned' : ''}`}>
        <div className="opened-front">
          {/*
            The preview underneath and the photograph over it.

            Both are in the document at once: the sixteen-pixel one came down
            with the memory and needs nothing, so there is never an empty
            rectangle, and the real one fades in on top when it arrives. If it
            never arrives — a tunnel, a bucket that has gone — what is left is
            still true, just very blurry, which is the honest failure.
          */}
          <img className="opened-blur" src={memory.blur} alt="" aria-hidden="true" />
          <img
            className={`opened-picture ${picture ? 'here' : ''}`}
            src={picture ?? memory.blur}
            alt={memory.why ?? memory.when ?? 'A memory'}
            style={{ aspectRatio: `${memory.width} / ${memory.height}` }}
          />
        </div>

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
      </div>
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
