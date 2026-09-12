import type { Track } from './track'

export interface MapPosition { x: number; z: number }
export interface MapFrame {
  track: Track
  position: MapPosition
  heading: number
  yaw: number
  rival: MapPosition | null
  personal: boolean
  delta: number
}

// One mounted HUD, driven by the race frame rather than React renders.
export const rallyMap: { draw: ((frame: MapFrame) => void) | null } = { draw: null }

/** World metres -> right/forward metres; independent of road progress or branch. */
export function mapOffset(point: MapPosition, origin: MapPosition, heading: number) {
  const x = point.x - origin.x, z = point.z - origin.z
  return { x: x * Math.cos(heading) - z * Math.sin(heading),
    y: -(x * Math.sin(heading) + z * Math.cos(heading)) }
}

export function routePoints(x: Float32Array, z: Float32Array): MapPosition[] {
  const points: MapPosition[] = []
  for (let i = 0; i < x.length; i += 2) points.push({ x: x[i], z: z[i] })
  const last = x.length - 1
  if (last >= 0 && (last % 2 !== 0)) points.push({ x: x[last], z: z[last] })
  return points
}

export function createMapPainter(canvas: HTMLCanvasElement, track: Track) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const size = 220, height = 200, ox = 110, oy = 143, scale = .65
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = size * ratio; canvas.height = height * ratio
  const main = routePoints(track.x, track.z)
  const branch = track.split ? routePoints(track.split.x, track.split.z) : null
  let heading: number | null = null, elapsed = 1

  return (frame: MapFrame) => {
    if (frame.track !== track) return
    const dt = Math.min(.1, frame.delta)
    if (heading === null) heading = frame.heading
    heading += Math.atan2(Math.sin(frame.heading - heading), Math.cos(frame.heading - heading)) * (1 - Math.exp(-7 * dt))
    elapsed += dt
    if (elapsed < 1 / 30) return
    elapsed = 0
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, size, height)
    const project = (p: MapPosition) => {
      const local = mapOffset(p, frame.position, heading!)
      return { x: ox + local.x * scale, y: oy + local.y * scale }
    }
    const path = (points: MapPosition[], color: string, width: number) => {
      ctx.beginPath()
      for (let i = 1; i < points.length; i++) {
        const a = project(points[i - 1]), b = project(points[i])
        if (Math.max(a.x, b.x) < -12 || Math.min(a.x, b.x) > size + 12 ||
          Math.max(a.y, b.y) < -12 || Math.min(a.y, b.y) > height + 12) continue
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
    }
    // A dark under-stroke keeps the light readable against both sand and caves.
    path(main, 'rgba(21,24,23,.65)', 7)
    if (branch) path(branch, 'rgba(21,24,23,.65)', 6)
    path(main, '#efe1c1', 2.8)
    if (branch) path(branch, '#92d5ce', 2.2)
    for (const [point, finish] of [[main[0], false], [main.at(-1), true]] as const) {
      if (!point) continue
      const p = project(point)
      ctx.beginPath(); ctx.arc(p.x, p.y, finish ? 4 : 3, 0, Math.PI * 2)
      ctx.fillStyle = finish ? '#f2c983' : '#efe1c1'; ctx.fill()
      if (finish) { ctx.strokeStyle = '#292821'; ctx.lineWidth = 1.5; ctx.stroke() }
    }
    if (frame.rival) {
      const p = project(frame.rival)
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = frame.personal ? '#e8b56b' : '#89cfff'; ctx.fill()
      ctx.strokeStyle = '#202729'; ctx.lineWidth = 1.5; ctx.stroke()
    }
    // Fade the route at the perimeter, without a box or a hard circular crop.
    ctx.globalCompositeOperation = 'destination-in'
    const fade = ctx.createRadialGradient(110, 100, 65, 110, 100, 111)
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, 'transparent')
    ctx.fillStyle = fade; ctx.fillRect(0, 0, size, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(frame.heading + frame.yaw - heading)
    ctx.shadowColor = '#ffcb7d'; ctx.shadowBlur = 9
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 6); ctx.lineTo(0, 2); ctx.lineTo(-6.5, 6); ctx.closePath()
    ctx.fillStyle = '#fff0cf'; ctx.fill(); ctx.shadowBlur = 0
    ctx.strokeStyle = '#473a28'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore()
  }
}
