export const VOICE_LIGHT_SECONDS = 25
export const VOICE_WAVE_SAMPLES = 48

/**
 * Why the microphone is not available, in the words of the actual reason.
 *
 * ---------------------------------------------------------------------------
 * **This exists because the honest answer is almost never "this browser".**
 *
 * `navigator.mediaDevices` is only defined in a *secure context* — https, or
 * localhost. Open the same dev server by its network address so you can also
 * try it on your phone, which is the first thing anybody does, and the whole
 * API silently disappears on the desktop too. The old message said "this
 * browser cannot record a voice-light", which sent somebody looking at Chrome
 * when the problem was the six characters at the front of the address bar.
 *
 * Measured, on the same machine, same browser, same minute:
 *
 *   http://localhost:5173        secure, getUserMedia present, records
 *   http://172.20.10.10:5173     not secure, getUserMedia gone, fails
 *
 * Same for the photo picker in the Glasshouse, and for notifications. So it is
 * worth saying which of the three things is actually wrong.
 * ---------------------------------------------------------------------------
 */
export function whyNoMicrophone(): string | null {
  if (typeof window === 'undefined') return 'There is no browser here.'
  /*
    The insecure origin is checked *first* and by name, because it is both the
    likeliest cause and the only one with a fix the person reading can act on.
    `isSecureContext` rather than sniffing the protocol: it already knows that
    localhost counts and that a file:// page does not.
  */
  if (!window.isSecureContext) {
    return (
      'The microphone only works on https, or on localhost. This page is open ' +
      'at ' + location.origin + ', and browsers hide the microphone from an ' +
      'address like that. Open it at http://localhost instead — the same ' +
      'server, a different door.'
    )
  }
  if (typeof MediaRecorder === 'undefined') {
    return 'This browser has no way to record audio at all.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser will not let a page reach the microphone.'
  }
  return null
}

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
