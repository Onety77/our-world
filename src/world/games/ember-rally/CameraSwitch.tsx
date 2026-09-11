import { useEffect } from 'react'
import { useRace } from './session'

export function CameraSwitch({ hasResult }: { hasResult: boolean }) {
  const view = useRace(s => s.cameraView)
  const paused = useRace(s => s.paused)
  const phase = useRace(s => s.phase)
  const available = !hasResult && !paused && (phase === 'ready' || phase === 'running')
  useEffect(() => {
    if (!available) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyC' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable ||
        target.closest('input, textarea, select'))) return
      event.preventDefault()
      event.stopPropagation()
      useRace.getState().toggleCamera()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [available])
  if (!available) return null
  const next = view === 'chase' ? 'bonnet' : 'chase'
  return (
    <button type="button" className="rally-camera-switch"
      aria-label={`Switch to ${next} view`} aria-keyshortcuts="C"
      title={`Switch to ${next} view (C)`}
      onClick={() => useRace.getState().toggleCamera()}
      onKeyDown={event => {
        // Activating the focused button must not also pull the handbrake.
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
      }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M3 7h4l2-3h6l2 3h4v13H3Z" strokeLinejoin="round" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      <span>{next} view</span><kbd>C</kbd>
    </button>
  )
}
