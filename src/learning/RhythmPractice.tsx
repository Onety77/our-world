import { useEffect, useRef, useState } from 'react'
import { BEATS, type Lesson } from './catalog'
import { rhythmScore } from './model'
import type { PracticeResult } from './LanguagePractice'
import { gainOf, useVolume } from '@/systems/volume'

const BEAT_MS = 750
export function RhythmPractice({
  lesson,
  onFinish,
  paused = false,
}: {
  lesson: Lesson
  onFinish(result: PracticeResult): void
  paused?: boolean
}) {
  const [mode, setMode] = useState<'idle' | 'listen' | 'play'>('idle'),
    [beat, setBeat] = useState(-4)
  const [result, setResult] = useState<ReturnType<typeof rhythmScore> | null>(null),
    [error, setError] = useState('')
  const audio = useRef<AudioContext | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    origin = useRef(0),
    taps = useRef<number[]>([]),
    stoppedAt = useRef(-1000),
    running = useRef<'listen' | 'play' | null>(null)
  const effects = useVolume((s) => s.levels.effects)
  const beats = BEATS[lesson.id] ?? BEATS['rhythm-1']
  function stop() {
    if(running.current)stoppedAt.current=performance.now()
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    running.current = null
    setMode('idle')
    void audio.current?.close()
    audio.current = null
  }
  const tap = () => {
    if (running.current === 'play' && performance.now() >= origin.current)
      taps.current.push(performance.now() - origin.current)
  }
  useEffect(() => {
    if (paused && running.current) {
      stop()
      setError('The rhythm stopped while you paused. Start again when you’re ready.')
    }
  }, [paused])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Space' && (running.current === 'play' || performance.now()-stoppedAt.current<750)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat && running.current === 'play') tap()
      }
    }
    const hidden = () => {
      if (document.hidden && running.current) {
        stop()
        setError('Practice paused while you were away. Start again when you’re ready.')
      }
    }
    window.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hidden)
      if (timer.current) clearInterval(timer.current)
      void audio.current?.close()
    }
  }, [])
  async function begin(next: 'listen' | 'play') {
    stop()
    setError('')
    setResult(null)
    try {
      const ctx = new AudioContext()
      audio.current = ctx
      await ctx.resume()
      if (audio.current !== ctx) return
      const start = ctx.currentTime + 0.18
      const click = (at: number, accent: boolean, demonstration = false) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain()
        osc.frequency.value = demonstration ? 660 : accent ? 1040 : 780
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, (demonstration ? 0.1 : 0.045) * gainOf(effects)),
          at + 0.003,
        )
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(at)
        osc.stop(at + 0.07)
      }
      for (let i = -4; i < 8; i++) click(start + ((i + 4) * BEAT_MS) / 1000, i % 4 === 0)
      if (next === 'listen')
        for (const b of beats) click(start + ((b + 4) * BEAT_MS) / 1000 + 0.07, false, true)
      // Align the visual pulse and scoring with the sound leaving the device.
      // Bluetooth and other output devices may still add unreported latency.
      const outputDelay = (ctx.outputLatency || 0) + (ctx.baseLatency || 0)
      origin.current =
        performance.now() + (start - ctx.currentTime + outputDelay) * 1000 + 4 * BEAT_MS
      taps.current = []
      running.current = next
      setMode(next)
      setBeat(-4)
      timer.current = setInterval(() => {
        const elapsed = performance.now() - origin.current
        setBeat(elapsed / BEAT_MS)
        if (elapsed >= 8 * BEAT_MS) {
          if (next === 'play') setResult(rhythmScore(taps.current, beats, BEAT_MS))
          stop()
        }
      }, 35)
    } catch {
      stop()
      setError('Sound couldn’t start. Check your device audio and try again.')
    }
  }
  return (
    <div className="clearing-rhythm">
      <p className="clearing-eyebrow">Two bars · 80 beats a minute</p>
      <h2>{lesson.title}</h2>
      <p className="clearing-note">{lesson.invitation}</p>
      {effects === 0 && (
        <p className="clearing-note">
          Effects are muted in your sound settings. You can still follow the visual pulse.
        </p>
      )}
      <div
        className="clearing-beats"
        aria-label={`Tap on beats ${beats.map((b) => `${(Math.floor(b) % 4) + 1}${b % 1 ? ' and' : ''}`).join(', ')} over two bars.`}
      >
        {Array.from({ length: 16 }, (_, i) => {
          const b = i / 2
          return (
            <span
              key={i}
              className={`${beats.includes(b) ? 'has-tap' : ''} ${mode !== 'idle' && beat >= b && beat < b + 0.5 ? 'is-now' : ''}`}
            >
              <i />
              {i % 2 === 0 ? ((i / 2) % 4) + 1 : '·'}
            </span>
          )
        })}
      </div>
      <p className="clearing-count" role="status">
        {mode === 'idle'
          ? result
            ? `${result.matched} of ${beats.length} taps in time`
            : 'Listen first. Let your hand find the pulse.'
          : beat < 0
            ? `Count in · ${Math.min(4, Math.floor(beat) + 5)}`
            : mode === 'listen'
              ? 'Listen for the warmer taps.'
              : 'Your turn · keep the pulse'}
      </p>
      <button
        className="clearing-drum"
        type="button"
        disabled={mode !== 'play'}
        onPointerDown={(e) => {
          if (e.button === 0) {
            e.preventDefault()
            tap()
          }
        }}
        onClick={(e) => {
          if (e.detail === 0) tap()
        }}
        aria-label="Tap the rhythm"
      >
        {mode === 'play' ? 'tap' : '♪'}
        <small>{mode === 'play' ? 'or press space' : 'your rhythm lives here'}</small>
      </button>
      <div data-choice-row="rhythm-actions">
        {mode === 'idle' ? (
          <>
            <button onClick={() => void begin('listen')}>Listen to the pattern</button>
            <button className="clearing-primary" onClick={() => void begin('play')}>
              {result ? 'Try it again' : 'My turn'} →
            </button>
          </>
        ) : (
          <button onClick={stop}>Stop and reset</button>
        )}
      </div>
      {result && (
        <>
          <p className="clearing-note">
            {result.score >= 60
              ? 'You found the shape of it.'
              : 'Keep counting through the spaces. Listen once more, then try again.'}{' '}
            {result.error !== null && `Matched taps averaged ${result.error} ms from the beat.`}{' '}
            Extra taps count too.
          </p>
          <div data-choice-row="keep">
            <button
              onClick={() =>
                onFinish({
                  score: result.score,
                  passed: result.score >= 60,
                  recall: [],
                  drawing: '',
                  reflection: `${result.matched} of ${beats.length} taps in time at 80 BPM.`,
                })
              }
            >
              Keep this practice →
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
