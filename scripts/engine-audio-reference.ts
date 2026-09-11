/** Browser-side regression fixture. Import from a Vite page and call renderEngineReference().
 * It renders the real Web Audio graph, including filters, transients and compression. */
import type { EngineState } from '../src/systems/engine'

export async function renderEngineReference(moduleUrl = '/src/systems/engine.ts', tight = 0) {
  const { createEngineVoice } = await import(/* @vite-ignore */ moduleUrl)
  const rate = 24000, seconds = 16
  const offline = new OfflineAudioContext(1, rate * seconds, rate)
  let clock = 0, seed = 71813
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296 }
  // Scheduling against a controllable clock lets exactly the same inputs
  // drive both mixes; rendering itself still runs through native Web Audio.
  const ctx = new Proxy(offline, { get(target, key) {
    if (key === 'currentTime') return clock
    const value = Reflect.get(target, key, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const master = offline.createGain()
  master.connect(offline.destination)
  const grain = offline.createBuffer(1, rate * 3, rate)
  const data = grain.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
  const realRandom = Math.random
  let voice: ReturnType<typeof createEngineVoice>
  try {
    Math.random = random
    voice = createEngineVoice(ctx, master, grain, 3, () => {})
    for (let frame = 0; frame < seconds * 60; frame++) {
      clock = frame / 60
      const pulling = clock >= 2 && clock < 12
      const boost = clock >= 7 && clock < 11
      const shifting = clock >= 4 && clock < 4.13
      const state: EngineState = {
        speed: clock < 2 ? 0 : clock < 5 ? (clock - 2) * 11 : clock < 12 ? 33 : Math.max(0, 33 - (clock - 12) * 9),
        revs: clock < 2 ? .03 : clock < 4 ? .15 + (clock - 2) * .34 : clock < 5 ? .43 + (clock - 4) * .29 : clock < 12 ? .72 : .1,
        gear: clock < 4 ? 0 : 1, shifting: shifting ? 1 : 0,
        throttle: pulling ? .9 : .02, brake: clock >= 12 ? .6 : 0,
        handbrake: false, scrubFront: 0, scrubRear: 0, wheelspin: 0, lockup: 0,
        rough: 0, wet: 0, tight, boost, boostLeft: boost ? (11 - clock) / 4 : 0,
      }
      voice.set(state)
    }
  } finally { Math.random = realRandom }
  const buffer = await offline.startRendering()
  const samples = buffer.getChannelData(0)
  const stats = (from: number, to: number) => {
    let energy = 0, highEnergy = 0, peak = 0, low = 0
    for (let i = Math.floor(from * rate); i < to * rate; i++) {
      const x = samples[i]
      if (!Number.isFinite(x)) throw Error('Non-finite audio sample')
      low += .4 * (x - low)
      energy += x * x; highEnergy += (x - low) ** 2; peak = Math.max(peak, Math.abs(x))
    }
    const count = (to - from) * rate
    return { rms: Math.sqrt(energy / count), highRms: Math.sqrt(highEnergy / count), peak }
  }
  const result = { all: stats(0, seconds), idle: stats(1, 2), cruise: stats(5.5, 6.5),
    ignition: stats(7, 7.08), attack: stats(7, 7.4), boost: stats(8, 10), release: stats(11, 11.5) }
  if (result.all.peak >= .98) throw Error('Car mix clips')
  // A small engine gain lift passed the old check even when the dedicated
  // nitro sound was masked. Require a prompt onset and a distinct sustained
  // broadband layer. These are mix regressions, not a substitute for listening.
  if (result.ignition.rms < result.cruise.rms * 1.25) throw Error('Nitro ignition is masked by the engine')
  if (result.boost.rms < result.cruise.rms * 1.35) throw Error('Nitro sustain is masked by the engine')
  if (result.boost.highRms < result.cruise.highRms * 1.5) throw Error('Nitro rush lacks a distinct layer')
  return { result, buffer }
}
