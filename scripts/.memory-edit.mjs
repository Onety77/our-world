import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, fn) { const text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n'); writeFileSync(path, fn(text)) }
if (readFileSync('src/ui/Memories.tsx', 'utf8').includes('export function OpenMemory()')) edit('src/ui/Memories.tsx', text => {
  const start = text.indexOf('export function OpenMemory() {')
  const end = text.indexOf('/** Both, mounted together', start)
  if(start < 0 || end < 0) throw Error('viewer markers')
  return (text.slice(0,start) + 'export const OpenMemory = MemoryViewer\n\n' + text.slice(end))
    .replace("import { useData, useWorldSlice }", "import { useData }")
    .replace("import { otherUser } from '@/data/types'\n", '')
    .replace("import { memoryById, useMemories }", "import { useMemories }")
    .replace("import { openPane } from '@/sections/lanterns/view'\n", '')
    .replace("import { useSay as useWords } from '@/systems/useSay'\n", '')
    .replace("import { useMenuKeys } from './useMenuKeys'", "import { MemoryViewer } from './MemoryViewer'")
})
if (!readFileSync('src/sections/lanterns/LanternWalk.tsx', 'utf8').includes('const requests =')) edit('src/sections/lanterns/LanternWalk.tsx', text => {
  const start = text.indexOf('  useEffect(() => {\n    let gone = false', text.indexOf('const [urls, setUrls]'))
  const end = text.indexOf('  // --- picking', start)
  if(start<0 || end<0)throw Error('loader markers')
  return text.slice(0,start) + `  const requests = useRef(new Map<string, Promise<string>>())
  useEffect(() => {
    let gone = false
    // Resolving one photograph must not cancel its neighbours. Share in-flight
    // work across movement, prioritise the nearest, and decode before revealing.
    const queue = [...near].sort((a, b) =>
      Math.abs(sFor(a.index) - walkAt()) - Math.abs(sFor(b.index) - walkAt()))
    const worker = async () => {
      while (!gone && queue.length) {
        const entry = queue.shift()!
        const { memory } = entry
        let request = requests.current.get(memory.id)
        if (!request) {
          request = (async () => {
            try {
              const url = await data.pictureUrl(memory, 'lane')
              await paneTexture(url)
              return url
            } catch {
              const url = await data.pictureUrl(memory)
              await paneTexture(url)
              return url
            }
          })()
          requests.current.set(memory.id, request)
        }
        try {
          const url = await request
          if (!gone) setUrls(was => was[memory.id] === url ? was : { ...was, [memory.id]: url })
        } catch {
          requests.current.delete(memory.id)
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { gone = true }
  }, [near, data])

` + text.slice(end)
})
edit('src/sections/lanterns/Lanterns.tsx', text => {
  const start = text.indexOf('    for (let i = 0; i < many; i++) {', text.indexOf('export function Posts'))
  const end = text.indexOf("    geo.setAttribute('iAt'", start)
  if(start<0||end<0)throw Error('post markers')
  text = text.slice(0,start) + `    for (let i = 0; i < many; i++) {
      postPieces(i, memories[i]?.width ?? 0, memories[i]?.height ?? 0, piece)
    }

` + text.slice(end)
  const at = text.indexOf('const NEAR_FRAG')
  return text.slice(0,at) + text.slice(at)
    .replace('smoothstep(0.86, 0.94, inner)', 'smoothstep(0.96, 0.98, inner)')
    .replace('smoothstep(0.86, 0.92, inner)', 'smoothstep(0.96, 0.98, inner)')
    .replace('vec3 col = mix(mix(uTint, shot, 0.88), shot, uSharp);', 'vec3 col = mix(mix(uTint, shot, 0.25), shot, uSharp);')
    .replace('col *= 0.72 + 0.62 * night;', 'col *= mix(0.9, 1.0, uSharp);')
    .replace('col += uTint * middle * (0.06 + 0.18 * night);', 'col += uTint * middle * 0.035 * night * (1.0 - uSharp);')
    .replace('col = mix(col, uFogColor, fog);', 'col = mix(col, uFogColor, fog * 0.45);')
    .replace('    #include <tonemapping_fragment>\n', '')
})
edit('src/sections/lanterns/LanternWalk.tsx', text => {
  const start=text.indexOf('  const whichLantern =')
  const end=text.indexOf('  /*',start)
  if(start<0||end<0)throw Error('pick markers')
  return text.slice(0,start)+`  const picker = useMemo(() => new Raycaster(), [])
  const inverse = useMemo(() => new Matrix4(), [])
  const pointer = useMemo(() => new Vector2(), [])
  const whichLantern = (cx: number, cy: number): number | null => {
    if (!carrying.current || openId) return null
    carrying.current.updateWorldMatrix(true, false)
    inverse.copy(carrying.current.matrixWorld).invert()
    pointer.set(cx / size.width * 2 - 1, 1 - cy / size.height * 2)
    picker.setFromCamera(pointer, camera)
    picker.ray.applyMatrix4(inverse)
    const here = walkAt() / SPACING
    return pickMemory(picker.ray, memories, Math.floor(here - 12), Math.ceil(here + 12))
  }

`+text.slice(end)
})
