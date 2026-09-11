import { runAt, SAMPLE_MS, type RallyRun, type RunSample } from './model'
import { roadAtRoute, type Track } from './track'

/** At a junction, the two recorded offsets belong to different road frames.
 * Interpolate their world positions so a ghost cannot jump across the fork. */
export function runOnTrack(track: Track, run: RallyRun, elapsedMs: number) {
  const out = runAt(run, elapsedMs)
  if (!track.split) return out
  const frame = Math.floor(Math.max(0, elapsedMs) / SAMPLE_MS)
  const a = runAt(run, frame * SAMPLE_MS), b = runAt(run, (frame + 1) * SAMPLE_MS)
  if (a.shortcut === b.shortcut) return out
  const mix = Math.max(0, elapsedMs) / SAMPLE_MS - frame
  return blendRoutePosition(track, a, b, mix, out)
}

export function blendRoutePosition<T extends RunSample>(track: Track, a: RunSample, b: RunSample, mix: number, out: T): T {
  if (!track.split || a.shortcut === b.shortcut) return out
  const ar = roadAtRoute(track, a.s, a.shortcut), br = roadAtRoute(track, b.s, b.shortcut)
  const x = (ar.x - Math.cos(ar.heading) * a.n) * (1 - mix) +
    (br.x - Math.cos(br.heading) * b.n) * mix
  const z = (ar.z + Math.sin(ar.heading) * a.n) * (1 - mix) +
    (br.z + Math.sin(br.heading) * b.n) * mix
  const ah = ar.heading - a.yaw, bh = br.heading - b.yaw
  const heading = ah + Math.atan2(Math.sin(bh - ah), Math.cos(bh - ah)) * mix
  for (let i = 0; i < 4; i++) {
    const r = roadAtRoute(track, out.s, out.shortcut)
    out.s += ((x - r.x) * Math.sin(r.heading) + (z - r.z) * Math.cos(r.heading)) / r.metric
  }
  const r = roadAtRoute(track, out.s, out.shortcut)
  out.n = (x - r.x) * -Math.cos(r.heading) + (z - r.z) * Math.sin(r.heading)
  out.yaw = r.heading - heading
  return out
}
