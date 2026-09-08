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

interface CropPoint {
  x: number
  y: number
}

const centreCrop = (): CropPoint => ({ x: 0.5, y: 0.5 })

/**
 * The pane before it exists.
 *
 * A canvas rather than a CSS `object-position` preview because a quarter-turn
 * changes which dimension is being cropped. Drawing the actual three-by-two
 * result means the preview, the WebGL shader and the memory somebody later
 * opens all make the same promise.
 */
function MemoryCropEditor({
  src,
  turns,
  crop,
  onCrop,
  onTurn,
}: {
  src: string
  turns: number
  crop: CropPoint
  onCrop(point: CropPoint): void
  onTurn(turns: number): void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const image = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(0)
  const drag = useRef<{
    id: number
    x: number
    y: number
    crop: CropPoint
    overflowX: number
    overflowY: number
  } | null>(null)

  useEffect(() => {
    let gone = false
    const next = new Image()
    next.onload = () => {
      if (gone) return
      image.current = next
      setReady((n) => n + 1)
    }
    next.src = src
    return () => {
      gone = true
      image.current = null
    }
  }, [src])

  const measure = useCallback(() => {
    const img = image.current
    const el = canvas.current
    if (!img || !el) return null
    const quarter = ((turns % 4) + 4) % 4
    const sideways = quarter % 2 === 1
    const sourceW = sideways ? img.naturalHeight : img.naturalWidth
    const sourceH = sideways ? img.naturalWidth : img.naturalHeight
    const scale = Math.max(el.width / sourceW, el.height / sourceH)
    const width = sourceW * scale
    const height = sourceH * scale
    return {
      img,
      el,
      quarter,
      width,
      height,
      left: -(width - el.width) * crop.x,
      top: -(height - el.height) * crop.y,
      overflowX: Math.max(0, width - el.width),
      overflowY: Math.max(0, height - el.height),
    }
  }, [turns, crop])

  useEffect(() => {
    const at = measure()
    if (!at) return
    const ctx = at.el.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, at.el.width, at.el.height)
    ctx.save()
    if (at.quarter === 1) {
      ctx.translate(at.left + at.width, at.top)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(at.img, 0, 0, at.height, at.width)
    } else if (at.quarter === 2) {
      ctx.translate(at.left + at.width, at.top + at.height)
      ctx.rotate(Math.PI)
      ctx.drawImage(at.img, 0, 0, at.width, at.height)
    } else if (at.quarter === 3) {
      ctx.translate(at.left, at.top + at.height)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(at.img, 0, 0, at.height, at.width)
    } else {
      ctx.drawImage(at.img, at.left, at.top, at.width, at.height)
    }
    ctx.restore()

    // Old silvering and one quiet inner bevel: this is a pane being composed,
    // not a generic crop rectangle from a photo editor.
    const edge = ctx.createLinearGradient(0, 0, at.el.width, at.el.height)
    edge.addColorStop(0, 'rgba(239, 229, 201, .44)')
    edge.addColorStop(0.45, 'rgba(239, 229, 201, 0)')
    edge.addColorStop(1, 'rgba(10, 14, 13, .5)')
    ctx.strokeStyle = edge
    ctx.lineWidth = 8
    ctx.strokeRect(4, 4, at.el.width - 8, at.el.height - 8)
  }, [measure, ready])

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const at = measure()
    if (!at) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop: { ...crop },
      overflowX: at.overflowX,
      overflowY: at.overflowY,
    }
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const held = drag.current
    if (!held || held.id !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = event.currentTarget.width / Math.max(1, rect.width)
    const scaleY = event.currentTarget.height / Math.max(1, rect.height)
    const dx = (event.clientX - held.x) * scaleX
    const dy = (event.clientY - held.y) * scaleY
    onCrop({
      x: held.overflowX > 0
        ? Math.max(0, Math.min(1, held.crop.x - dx / held.overflowX))
        : 0.5,
      y: held.overflowY > 0
        ? Math.max(0, Math.min(1, held.crop.y - dy / held.overflowY))
        : 0.5,
    })
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const nudge = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const by = event.shiftKey ? 0.1 : 0.035
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    onCrop({
      x: Math.max(0, Math.min(1, crop.x + (event.key === 'ArrowLeft' ? -by : event.key === 'ArrowRight' ? by : 0))),
      y: Math.max(0, Math.min(1, crop.y + (event.key === 'ArrowUp' ? -by : event.key === 'ArrowDown' ? by : 0))),
    })
  }

  const rotate = (by: number) => {
    onCrop(centreCrop())
    onTurn(((turns + by) % 4 + 4) % 4)
  }

  return (
    <div className="memory-editor">
      <div className="memory-editor-frame">
        <canvas
          ref={canvas}
          width={720}
          height={480}
          tabIndex={0}
          role="img"
          aria-label="The part of the photograph that will appear in its glass pane"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          onKeyDown={nudge}
          onContextMenu={(event) => event.preventDefault()}
        />
        <span className="memory-editor-corners" aria-hidden="true" />
      </div>
      <div className="memory-editor-tools">
        <button type="button" onClick={() => rotate(-1)} aria-label="Rotate left 90 degrees">
          <span aria-hidden="true">&#8634;</span> turn left
        </button>
        <span>drag the photograph to choose what the lantern keeps</span>
        <button type="button" onClick={() => rotate(1)} aria-label="Rotate right 90 degrees">
          turn right <span aria-hidden="true">&#8635;</span>
        </button>
      </div>
    </div>
  )
}

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
  const [turns, setTurns] = useState(0)
  const [crop, setCrop] = useState<CropPoint>(centreCrop)

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
    setCrop(centreCrop())
  }, [chosen])

  const close = useCallback(() => {
    setHanging(false)
    setPreview(null)
    setWhen('')
    setWhy('')
    setBusy(false)
    setTurns(0)
    setCrop(centreCrop())
  }, [setHanging])

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
        cropX: crop.x,
        cropY: crop.y,
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
          <MemoryCropEditor
            src={preview}
            turns={turns}
            crop={crop}
            onCrop={setCrop}
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
