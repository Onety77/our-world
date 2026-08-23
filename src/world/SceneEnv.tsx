/**
 * What every place needs to know about the moment it's being looked at:
 * the light, and how hard we're allowed to push this device.
 *
 * Passed by context rather than props so a PlaceDefinition's Scene can stay a
 * zero-prop component — adding a place should never mean threading arguments.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { SkyPalette } from '@/systems/palette'

export interface SceneEnv {
  palette: SkyPalette
  grassCount: number
  flowerCount: number
  /** Local hour in the viewer's own timezone. The garden runs on your clock. */
  hour: number
}

const Ctx = createContext<SceneEnv | null>(null)

export function SceneEnvProvider({
  value,
  children,
}: {
  value: SceneEnv
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSceneEnv(): SceneEnv {
  const env = useContext(Ctx)
  if (!env) throw new Error('useSceneEnv must be used inside <SceneEnvProvider>')
  return env
}
