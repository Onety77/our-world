import { useEffect, useRef } from 'react'
import { useRace } from './session'

export function PersonalSplit() {
  const node = useRef<HTMLParagraphElement>(null)
  const personal = useRace(s => s.personalGhost)
  const phase = useRace(s => s.phase)
  useEffect(() => {
    useRace.getState().setSplitLabel(node.current)
    return () => useRace.getState().setSplitLabel(null)
  }, [personal])
  if (!personal) return null
  return <div className="rally-personal-best" data-ready={phase === 'ready'}>
    <span>{phase === 'ready' ? 'Your best run is waiting' : 'Chasing your best'}</span>
    <p ref={node} role="status" aria-live="polite" aria-atomic="true" />
  </div>
}
