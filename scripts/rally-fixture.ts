import type { Track } from '../src/world/games/ember-rally/track'

/** A road with nothing on it, for measuring the car rather than the track. */
export function flatTrack(length = 3000, curv = 0): Track {
  const count = length + 1
  const zeros = () => new Float32Array(count)
  const filled = (value: number) => {
    const a = new Float32Array(count)
    a.fill(value)
    return a
  }
  const x = zeros()
  const z = zeros()
  const heading = zeros()
  // A road of constant curvature, integrated so `roadAt` sees a real bend.
  let h = 0
  for (let i = 1; i < count; i++) {
    h += curv
    heading[i] = h
    x[i] = x[i - 1] + Math.sin(h)
    z[i] = z[i - 1] + Math.cos(h)
  }
  return {
    seed: 0,
    stage: 'rootway',
    length,
    start: 0,
    x,
    y: zeros(),
    z,
    heading,
    curv: filled(curv),
    width: filled(60),
    ceiling: filled(6),
    room: filled(1),
    wet: zeros(),
    sway: zeros(),
    gale: zeros(),
    camber: zeros(),
    sand: zeros(),
    ruts: zeros(),
    loose: 0,
    grade: zeros(),
    bank: zeros(),
    line: zeros(),
    finishAt: length - 1,
    lanterns: [],
    roots: [],
    boulders: [],
    split: null,
    spikes: [],
    puddles: [],
    hearths: [],
    gate: [],
  }
}

