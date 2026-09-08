import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Vector3 } from 'three'
import type { Memory } from '@/data/types'
import { postPieces } from './lanternGeometry'

/** Each new photograph extends the strand of warm lights over the walk. */
export function MemoryLights({ memories }: { memories: Memory[] }) {
  const { cable, lights } = useMemo(() => {
    const wires: number[] = [], bulbs: number[] = [], colours: number[] = []
    const anchors = memories.slice(0, 600).map((memory, i) => {
      const point = new Vector3()
      postPieces(i, memory.width, memory.height, (x,y,z) => point.set(x,y,z))
      return point
    })
    const colour = new Color()
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i]
      const point = (t: number) => new Vector3().lerpVectors(a, b, t).add(new Vector3(0, -Math.sin(Math.PI * t) * 0.24, 0))
      for (let j = 0; j < 16; j++) {
        const from = point(j / 16), to = point((j + 1) / 16)
        wires.push(...from.toArray(), ...to.toArray())
        if (j % 2 === 1) {
          const bulb = point(j / 16); bulb.y -= 0.025
          bulbs.push(...bulb.toArray())
          colour.set(j % 4 === 1 ? '#ffe7af' : '#ffcf80')
          colours.push(colour.r, colour.g, colour.b)
        }
      }
    }
    const cable = new BufferGeometry(), lights = new BufferGeometry()
    cable.setAttribute('position', new Float32BufferAttribute(wires, 3))
    lights.setAttribute('position', new Float32BufferAttribute(bulbs, 3))
    lights.setAttribute('color', new Float32BufferAttribute(colours, 3))
    return { cable, lights }
  }, [memories])
  const glow = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(32,32,0,32,32,32)
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(.16, '#fff')
    gradient.addColorStop(.32, '#ffffff9a'); gradient.addColorStop(1, '#ffffff00')
    context.fillStyle = gradient; context.fillRect(0,0,64,64)
    return new CanvasTexture(canvas)
  }, [])
  useEffect(() => () => { cable.dispose(); lights.dispose() }, [cable, lights])
  useEffect(() => () => glow.dispose(), [glow])
  if (memories.length < 2) return null
  return <>
    <lineSegments geometry={cable}><lineBasicMaterial color="#51483b" transparent opacity={0.68} /></lineSegments>
    <points geometry={lights}><pointsMaterial map={glow} vertexColors size={0.19} transparent opacity={0.88}
      depthWrite={false} blending={AdditiveBlending} toneMapped={false} /></points>
  </>
}
