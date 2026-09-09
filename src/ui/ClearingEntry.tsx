import { Suspense, useEffect, useState } from 'react'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { later } from '@/systems/later'

const Clearing = later<object>(() =>
  import('./Clearing').then((module) => ({ default: module.ClearingUI })),
)

export function ClearingEntry() {
  const index = useSections((s) => s.index),
    shown = useSections((s) => s.shown)
  const here = shown.entered && SECTIONS[shown.section]?.id === 'clearing'
  const [visited, setVisited] = useState(false)
  useEffect(() => {
    if (SECTIONS[index]?.id === 'clearing') Clearing.warm()
  }, [index])
  useEffect(() => {
    if (SECTIONS[index]?.id==='clearing') setVisited(true)
  }, [index])
  // Keep the session mounted across other garden overlays, but do not fetch
  // lessons or subscribe to private practice before the first visit.
  return visited || here ? (
    <Suspense fallback={null}>
      <Clearing />
    </Suspense>
  ) : null
}
