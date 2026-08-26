export const VOICE_LIGHT_SECONDS = 25
export const VOICE_WAVE_SAMPLES = 48

export function recordingMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const choices = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  ]
  return choices.find((choice) => MediaRecorder.isTypeSupported(choice.mime)) ?? {
    mime: '',
    ext: 'webm',
  }
}

/** A compact, normalized pulse-map. It is visual metadata, never another copy of the voice. */
export async function voiceWaveform(blob: Blob): Promise<number[]> {
  const Ctor = window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return new Array(VOICE_WAVE_SAMPLES).fill(0.35)
  const context = new Ctor()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const data = decoded.getChannelData(0)
    const width = Math.max(1, Math.floor(data.length / VOICE_WAVE_SAMPLES))
    const raw = Array.from({ length: VOICE_WAVE_SAMPLES }, (_, index) => {
      const start = index * width
      const end = Math.min(data.length, start + width)
      let sum = 0
      for (let i = start; i < end; i++) sum += data[i] * data[i]
      return Math.sqrt(sum / Math.max(1, end - start))
    })
    const peak = Math.max(0.01, ...raw)
    return raw.map((value) => Math.max(0.08, Math.min(1, Math.pow(value / peak, 0.72))))
  } catch {
    return new Array(VOICE_WAVE_SAMPLES).fill(0).map((_, index) =>
      0.24 + Math.sin(index * 1.91) * 0.08 + Math.sin(index * 0.47) * 0.06,
    )
  } finally {
    void context.close()
  }
}
