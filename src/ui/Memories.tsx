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
import { createPortal } from 'react-dom'
import { useData } from '@/data/provider'
import { useMemories } from '@/systems/memories'
import { useTrouble } from '@/systems/trouble'
import { ambience } from '@/systems/ambience'
import { toTheNewest } from '@/sections/lanterns/walk'
// Named apart from this file's own `say`, which puts words on the glass.
import { MemoryViewer } from './MemoryViewer'
import { prepare } from '@/systems/picture'

/** How long the glass takes to form, in milliseconds. Matches the shader. */
const FORMING_MS = 2400

/** Preview the complete photograph, including its saved orientation. */
function MemoryPreview({ src, turns, onTurn }: { src: string; turns: number; onTurn(turns: number): void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let gone = false
    const image = new Image()
    image.onload = () => {
      const el = canvas.current
      if (gone || !el) return
      const sideways = turns % 2 === 1
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
      const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale)
      el.width = sideways ? h : w; el.height = sideways ? w : h
      const context = el.getContext('2d')!
      context.translate(el.width / 2, el.height / 2)
      context.rotate(turns * Math.PI / 2)
      context.drawImage(image, -w / 2, -h / 2, w, h)
    }
    image.src = src
    return () => { gone = true }
  }, [src, turns])
  return <div className="memory-editor">
    <div className="memory-upload-preview"><canvas ref={canvas} role="img" aria-label="The complete photograph to keep" /></div>
    <div className="memory-editor-tools">
      <button type="button" onClick={() => onTurn((turns + 3) % 4)} aria-label="Rotate left 90 degrees">↶ Turn left</button>
      <span>The whole photograph. Nothing cropped away.</span>
      <button type="button" onClick={() => onTurn((turns + 1) % 4)} aria-label="Rotate right 90 degrees">Turn right ↷</button>
    </div>
  </div>
}

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
  const [turns, setTurns] = useState(0)
  const composer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hanging) return
    const previous = document.activeElement as HTMLElement | null
    composer.current?.focus({ preventScroll: true })
    return () => { queueMicrotask(() => previous?.focus({ preventScroll: true })) }
  }, [hanging])

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

  useEffect(() => {
    setTurns(0)
  }, [chosen])

  const close = useCallback(() => {
    setHanging(false)
    setPreview(null)
    setWhen('')
    setWhy('')
    setBusy(false)
    setTurns(0)
  }, [setHanging])

  useEffect(() => {
    if (!hanging) return
    const root = document.getElementById('root')
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const controls = Array.from(composer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === composer.current)) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus()
        }
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!busy) close()
    }
    window.addEventListener('keydown', key, true)
    return () => { if (root) root.inert = wasInert; window.removeEventListener('keydown', key, true) }
  }, [hanging, busy, close])

  if (!hanging) return null

  const hang = async () => {
    if (!chosen || busy) return
    setBusy(true)
    try {
      /*
        Turn the source once, at the end.

        The editor rotates a canvas instantly while somebody decides; doing a
        real encode on every tap would repeatedly compress the same picture.
        Only the chosen turn is baked into the stored pixels.
      */
      const ready = turns === 0 ? chosen : await prepare(chosen.source, turns)
      const { source: _source, ...picture } = ready
      const memory = await data.hangMemory({
        ...picture,
        when,
        why,
      })
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
      ambience.cue('glass', 1)
      close()
    } catch (error) {
      useTrouble.getState().say(error instanceof Error ? error.message : 'It would not go up.')
      setBusy(false)
    }
  }

  return createPortal(
    <div ref={composer} tabIndex={-1} className="leaving" role="dialog" aria-modal="true" aria-label="Keep a memory">
      {preview && chosen ? (
        <>
          {/*
            What you picked, at the size it will be looked at.

            Before the two questions, not after, and not as a thumbnail. The
            answers are about this picture and you cannot write them from
            memory of a photograph you glanced at in a picker.
          */}
          <MemoryPreview
            src={preview}
            turns={turns}
            onTurn={setTurns}
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
              {busy ? (turns ? 'lighting it' : 'hanging it on the walk') : 'hang it on the walk'}
            </button>
            <button type="button" className="put-back quiet" onClick={close} disabled={busy}>
              not this one
            </button>
          </div>
        </>
      ) : (
        <p className="leaving-waiting">Getting it ready…</p>
      )}
    </div>, document.body,
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
export const OpenMemory = MemoryViewer

/** Both, mounted together — they are two halves of the same place. */
export function Glasshouse() {
  return (
    <>
      <LeavingAMemory />
      <OpenMemory />
    </>
  )
}
