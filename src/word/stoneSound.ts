/**
 * The knock of a letter landing on a stone, for the shared-word page.
 *
 * The same sound the garden makes — see `chip` in `systems/ambience`: a short
 * bright click of filtered noise for the edge of the stone and a low triangle
 * note falling away under it for its weight. Rebuilt here rather than imported
 * because `ambience` is the garden's whole sound world and this page loads
 * none of the garden.
 *
 * The audio context is made on the first tap, inside that tap — the only way
 * a phone will let a page make a sound at all.
 */

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
const NOISE_SECONDS = 2

function wake(): AudioContext | null {
  if (!ctx) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return null
    try {
      ctx = new Context()
    } catch {
      return null
    }
    out = ctx.createGain()
    // The garden's master level with its effects bus at full.
    out.gain.value = 0.85
    out.connect(ctx.destination)

    // Brown-ish noise, as the garden's is: white noise integrated, so the click
    // is stone and not static.
    const length = ctx.sampleRate * NOISE_SECONDS
    noise = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.021 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.2
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** One stone. `weight` 0..1: the last letter of a word lands a little heavier. */
export function chip(weight = 0.5, delay = 0) {
  const c = wake()
  if (!c || !out || !noise) return
  const now = c.currentTime + delay
  const w = Math.max(0, Math.min(1, weight))

  const click = c.createBufferSource()
  click.buffer = noise
  click.playbackRate.value = 2.1 + Math.random() * 1.2
  const edge = c.createBiquadFilter()
  edge.type = 'bandpass'
  edge.frequency.value = 2400 + Math.random() * 2200
  edge.Q.value = 1.1 + Math.random() * 1.4
  const clickGain = c.createGain()
  clickGain.gain.setValueAtTime(0.0001, now)
  clickGain.gain.exponentialRampToValueAtTime(0.055 + w * 0.045, now + 0.003)
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016)
  click.connect(edge).connect(clickGain).connect(out)
  click.start(now, Math.random() * (NOISE_SECONDS - 0.1), 0.05)
  click.stop(now + 0.06)

  const ring = c.createOscillator()
  ring.type = 'triangle'
  const base = 320 + Math.random() * 260 - w * 60
  ring.frequency.setValueAtTime(base, now)
  ring.frequency.exponentialRampToValueAtTime(base * 0.66, now + 0.09)
  const ringGain = c.createGain()
  ringGain.gain.setValueAtTime(0.0001, now)
  ringGain.gain.exponentialRampToValueAtTime(0.03 + w * 0.025, now + 0.005)
  ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
  ring.connect(ringGain).connect(out)
  ring.start(now)
  ring.stop(now + 0.12)
}

/** A guess laid down: its five stones settling one after another. */
export function lay() {
  for (let i = 0; i < 5; i++) chip(0.55 + i * 0.1, i * 0.07)
}

/** A light touch on the glass, for a phone that can do it. Android only; iOS ignores it. */
export function tap(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not allowed here */
  }
}
