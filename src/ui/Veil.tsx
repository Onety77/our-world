/**
 * The fade between places.
 *
 * The world swaps at the darkest point of this, so it exists to hide a cut —
 * but it should read as the light changing rather than as a loading screen.
 * Hence the colour: not black, but the deep green-dark the whole world sits
 * on, so it feels like passing through shade.
 */

import { useEffect, useRef, useState } from 'react'
import { FADE_MS, useSections } from '@/systems/sections'

export function Veil() {
  const entered = useSections((s) => s.entered)
  const [dark, setDark] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setDark(true)
    const id = setTimeout(() => setDark(false), FADE_MS / 2)
    return () => clearTimeout(id)
  }, [entered])

  return (
    <div
      className={dark ? 'veil dark' : 'veil'}
      style={{ ['--fade' as string]: `${FADE_MS / 2}ms` }}
      aria-hidden="true"
    />
  )
}
