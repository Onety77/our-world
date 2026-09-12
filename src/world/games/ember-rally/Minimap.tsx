import { useEffect, useRef, useState } from 'react'
import type { Track } from './track'
import { useRace } from './session'
import { createMapPainter, rallyMap } from './mapPainter'
import './Minimap.css'

export function Minimap({ track, hasResult }: { track: Track; hasResult: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const phase = useRace(s => s.phase)
  const paused = useRace(s => s.paused)
  const [shown, setShown] = useState(() => {
    try { return localStorage.getItem('rally-map-hidden') !== '1' } catch { return true }
  })
  const available = !hasResult && !paused && (phase === 'ready' || phase === 'running')
  useEffect(() => {
    try { localStorage.setItem('rally-map-hidden', shown ? '0' : '1') } catch { /* optional preference */ }
  }, [shown])
  useEffect(() => {
    if (!available || !shown || !canvas.current) return
    const draw = createMapPainter(canvas.current, track)
    rallyMap.draw = draw
    return () => { if (rallyMap.draw === draw) rallyMap.draw = null }
  }, [track, shown, available])
  useEffect(() => {
    if (!available) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyM' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault(); event.stopPropagation(); setShown(value => !value)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [available])
  if (!available) return null
  return <aside className="rally-minimap" aria-label="Live route map">
    {shown && <canvas ref={canvas} role="img" aria-label="Road ahead. Your arrow follows the car; a dot marks the nearby rival. Shortcuts are pale blue." />}
    <button type="button" aria-pressed={shown} aria-keyshortcuts="M"
      aria-label={shown ? 'Hide route map' : 'Show route map'}
      onClick={() => setShown(value => !value)}
      onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation() }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m2 4 5-2 6 2 5-2v14l-5 2-6-2-5 2Zm5-2v14m6-12v14" /></svg>
      <span>{shown ? 'hide map' : 'show map'}</span><kbd>M</kbd>
    </button>
  </aside>
}
