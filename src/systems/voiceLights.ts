import { create } from 'zustand'
import type { VoiceLight } from '@/data/types'

interface VoiceLightState {
  lights: VoiceLight[]
  limit: number
  loaded: boolean
  selectedId: string | null
  setGarden(lights: VoiceLight[], limit: number): void
  select(id: string | null): void
}

export const useVoiceLights = create<VoiceLightState>((set) => ({
  lights: [],
  limit: 3,
  loaded: false,
  selectedId: null,
  setGarden: (lights, limit) => set({ lights, limit, loaded: true }),
  select: (selectedId) => set({ selectedId }),
}))

/** Read by WebGL every frame without turning audio progress into React renders. */
export const voicePlayback = {
  id: null as string | null,
  playing: false,
  progress: 0,
  amplitude: 0,
}

export function voicePulse(light: VoiceLight, progress: number): number {
  const samples = light.waveform
  if (samples.length === 0) return 0.25
  const at = Math.min(samples.length - 1, Math.max(0, progress * (samples.length - 1)))
  const low = Math.floor(at)
  const high = Math.min(samples.length - 1, low + 1)
  return samples[low] + (samples[high] - samples[low]) * (at - low)
}
