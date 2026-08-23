/**
 * One line, when something didn't work.
 *
 * On the world with a lift shadow like everything else — no dialog, no panel,
 * nothing to dismiss. It clears itself after a few seconds and never blocks
 * you from trying again, which on a flaky connection is usually the fix.
 */

import { useEffect } from 'react'
import { useTrouble } from '@/systems/trouble'

export function Trouble() {
  const what = useTrouble((s) => s.what)
  const clear = useTrouble((s) => s.clear)

  useEffect(() => {
    if (!what) return
    const id = setTimeout(clear, 5200)
    return () => clearTimeout(id)
  }, [what, clear])

  if (!what) return null

  return (
    <div className="trouble" role="status" aria-live="polite">
      <span>{what}. nothing was lost — try again.</span>
    </div>
  )
}
