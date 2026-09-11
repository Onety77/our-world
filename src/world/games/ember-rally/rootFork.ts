import type { RootSplit, Track } from './track'

// One authored piece, shared by both roads. The surrounding Rootway can still
// change with the seed without stretching or folding either branch.
export const ROOT_FORK = { from: 384, to: 1024 }
const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }

export function layRootFork(track: Track): RootSplit {
  const { from, to } = ROOT_FORK
  const length = to - from, count = length + 1
  const h = track.heading[from], ox = track.x[from], oy = track.y[from], oz = track.z[from]
  const sh = Math.sin(h), ch = Math.cos(h)
  const shape = (u: number) => {
    const t = Math.max(0, Math.min(1, (u - .1) / .8))
    return 112 * Math.sin(Math.PI * t) ** 4
  }
  const samples = 4096
  const distances = new Float64Array(samples + 1)
  let forward = 500
  for (let iteration = 0; iteration < 20; iteration++) {
    for (let i = 1; i <= samples; i++) distances[i] = distances[i - 1] +
      Math.hypot(shape(i / samples) - shape((i - 1) / samples), forward / samples)
    forward *= length / distances[samples]
  }
  const arrays = () => new Float32Array(count)
  const split: RootSplit = {
    from, to, shortcut: { from, to }, commitAt: from + 90,
    separateAt: from + 160, rejoinAt: to - 40, portalN: 1.65,
    mainLength: length, shortcutLength: 0, hardAt: from + 290, veryHardAt: from + 355,
    x: arrays(), y: arrays(), z: arrays(), heading: arrays(), curv: arrays(),
    width: arrays(), ceiling: arrays(), room: arrays(), wet: arrays(), grade: arrays(),
    bank: arrays(), line: arrays(), metric: arrays(),
  }
  let cursor = 1
  for (let i = 0; i < count; i++) {
    while (cursor < samples && distances[cursor] < i) cursor++
    const u = (cursor - 1 + (i - distances[cursor - 1]) /
      (distances[cursor] - distances[cursor - 1])) / samples
    const x = shape(u), z = forward * u
    // Two linked bends in the cut: enough to require a lift and a precise
    // change of direction, with straight sightlines before and after them.
    const bend = Math.max(0, 1 - Math.abs((u - .5) / .19))
    const cutX = 15 * Math.sin((u - .31) / .38 * Math.PI * 2) * ease(bend)
    const s = from + i
    track.x[s] = ox + ch * x + sh * z
    track.y[s] = oy
    track.z[s] = oz - sh * x + ch * z
    const junction = 1 - ease(Math.min(i - 75, length - i - 75) / 100)
    track.width[s] = 4.4 + junction * 1.2
    track.ceiling[s] = 6.8
    track.room[s] = .15
    track.wet[s] = .12
    track.bank[s] = track.grade[s] = track.camber[s] = 0
    track.line[s] = 0
    split.x[i] = ox + ch * cutX + sh * z
    split.y[i] = oy
    split.z[i] = oz - sh * cutX + ch * z
    split.width[i] = 2.45 + junction * 3.15
    split.ceiling[i] = 3.7 + junction * 3.1
    split.room[i] = .15
    split.wet[i] = .12 + (1 - junction) * .2
    split.line[i] = 2 * (1 - ease((i - 70) / 60))
  }
  // Translate the remainder as a rigid body. The new piece leaves on exactly
  // the heading it entered; no later corner changes shape.
  const dx = track.x[to] - (ox + sh * length), dz = track.z[to] - (oz + ch * length)
  for (let s = to + 1; s < track.x.length; s++) { track.x[s] += dx; track.z[s] += dz }
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), b = Math.min(length, i + 1)
    track.heading[from + i] = h + Math.atan2(
      (track.x[from + b] - track.x[from + a]) * ch - (track.z[from + b] - track.z[from + a]) * sh,
      (track.x[from + b] - track.x[from + a]) * sh + (track.z[from + b] - track.z[from + a]) * ch)
    split.heading[i] = h + Math.atan2(
      (split.x[b] - split.x[a]) * ch - (split.z[b] - split.z[a]) * sh,
      (split.x[b] - split.x[a]) * sh + (split.z[b] - split.z[a]) * ch)
    split.metric[i] = Math.hypot(split.x[b] - split.x[a], split.z[b] - split.z[a]) / (b - a)
    if (i) split.shortcutLength += Math.hypot(split.x[i] - split.x[i - 1], split.z[i] - split.z[i - 1])
  }
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), b = Math.min(length, i + 1)
    track.curv[from + i] = -(track.heading[from + b] - track.heading[from + a]) / (b - a)
    split.curv[i] = -(split.heading[b] - split.heading[a]) / ((b - a) * split.metric[i])
  }
  // The decision window follows the actual opening, rather than an invisible
  // trigger placed before the driver can see the fork.
  for (let i = 80; i < length / 2; i++) {
    const gap = Math.hypot(track.x[from + i] - split.x[i], track.z[from + i] - split.z[i])
    if (gap > track.width[from + i] + split.width[i]) {
      split.commitAt = from + i
      split.separateAt = from + i + 24
      break
    }
  }
  return split
}

export function dressRootFork(track: Track) {
  const split = track.split
  if (!split) return
  const inPiece = (s: number) => s >= split.from - 16 && s <= split.to + 16
  const inMouth = (s: number) => inPiece(s) && (s < split.separateAt + 20 || s > split.to - 190)
  track.boulders = track.boulders.filter(p => !inPiece(p.s))
  track.roots = track.roots.filter(p => !inMouth(p.s))
  track.spikes = track.spikes.filter(p => !inMouth(p.s))
  track.lanterns = track.lanterns.filter(p => !inPiece(p.s))
  // Familiar amber lamps continue around the longer road. Cold mineral light
  // picks out the cut's outer wall and its braking points, without hiding it.
  for (let s = split.from - 12; s <= split.to + 12; s += 26) {
    const i = Math.round(s)
    track.lanterns.push({ s, n: -track.width[i] - .55, y: .65, size: .9, warm: 1 })
  }
  for (const d of [66, 102, 140, 198, 247, 284, 330, 377, 430, 487, 536]) {
    track.lanterns.push({ s: split.from + d, shortcut: true,
      n: split.width[d] + .45, y: .9, size: d < 150 ? 1.25 : .9, warm: .08 })
  }
  track.lanterns.sort((a, b) => a.s - b.s)
}
