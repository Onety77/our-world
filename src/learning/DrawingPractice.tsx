import { useRef, useState, type PointerEvent } from 'react'
import type { Lesson } from './catalog'
import type { Stroke } from './model'
import type { PracticeResult } from './LanguagePractice'
import { DrawingGuide } from './DrawingGuide'

export function DrawingPreview({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 700 360"
      role="img"
      aria-label="A drawing from practice"
    >
      {strokes.map((line, i) => (
        <polyline
          key={i}
          points={line.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
export function DrawingPractice({
  lesson,
  onFinish,
}: {
  lesson: Lesson
  onFinish(result: PracticeResult): void
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]),
    [paper, setPaper] = useState(false),
    [reflection, setReflection] = useState('')
  const active = useRef<number | null>(null),
    strokesRef = useRef<Stroke[]>([])
  const update = (next: Stroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }
  function point(event: PointerEvent<SVGSVGElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect()
    return [
      Math.round(Math.max(0, Math.min(700, ((event.clientX - rect.left) * 700) / rect.width))),
      Math.round(Math.max(0, Math.min(360, ((event.clientY - rect.top) * 360) / rect.height))),
    ]
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || active.current !== null || strokesRef.current.length >= 60) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    active.current = event.pointerId
    update([...strokesRef.current, [point(event)]])
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (active.current !== event.pointerId) return
    const current = strokesRef.current,
      last = current[current.length - 1],
      p = point(event)
    if (Math.hypot(p[0] - last[last.length - 1][0], p[1] - last[last.length - 1][1]) < 3) return
    // Thin long strokes instead of cutting them off halfway through a curve.
    const line = last.length >= 149 ? last.filter((_, i) => i % 2 === 0) : last
    update([...current.slice(0, -1), [...line, p]])
  }
  const meaningful = paper || strokes.some((line) => line.length >= 4)
  return (
    <div className="clearing-drawing">
      <p className="clearing-eyebrow">A small drawing study</p>
      <h2>{lesson.title}</h2>
      <p className="clearing-note">{lesson.invitation}</p>
      <DrawingGuide lesson={lesson.id} />
      <div data-choice-row="medium">
        <button aria-pressed={!paper} onClick={() => setPaper(false)}>
          Draw here
        </button>
        <button aria-pressed={paper} onClick={() => setPaper(true)}>
          I’m using paper
        </button>
      </div>
      {!paper ? (
        <>
          <svg
            className="clearing-paper"
            viewBox="0 0 700 360"
            aria-label="Drawing surface. Use a pointer, or choose paper above."
            role="img"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => {
              active.current = null
            }}
            onPointerCancel={() => {
              active.current = null
            }}
          >
            {strokes.map((line, i) => (
              <polyline
                key={i}
                points={line.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {!strokes.length && (
              <text x="350" y="180" textAnchor="middle">
                A place for your first mark.
              </text>
            )}
          </svg>
          <div data-choice-row="tools">
            <button disabled={!strokes.length} onClick={() => update(strokes.slice(0, -1))}>
              Undo last stroke
            </button>
            <button disabled={!strokes.length} onClick={() => update([])}>
              Fresh paper
            </button>
            <small>
              {strokes.length >= 60
                ? 'This sheet is full. Undo a stroke or keep your study.'
                : 'Finger, mouse, or pen · 60 strokes per sheet'}
            </small>
          </div>
        </>
      ) : (
        <p className="clearing-paper-message">
          Take your time. Look more than you draw.
          <br />
          Come back when you’ve tried the study.
        </p>
      )}
      <label htmlFor="drawing-reflection">What did you notice?</label>
      <textarea
        id="drawing-reflection"
        maxLength={600}
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
        placeholder="A line that felt steadier? A shape you saw differently?"
      />
      <small>This is your observation, not an automatic art grade.</small>
      <div data-choice-row="finish">
        <button
          className="clearing-primary"
          disabled={!meaningful || reflection.trim().length < 4}
          onClick={() =>
            onFinish({
              score: 100,
              passed: true,
              recall: [],
              drawing: paper ? '' : JSON.stringify(strokes),
              reflection: reflection.trim(),
            })
          }
        >
          {paper ? 'I tried it on paper · keep this practice' : 'Keep this study'} →
        </button>
      </div>
    </div>
  )
}
