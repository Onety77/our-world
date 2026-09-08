// Local browser fixtures: never touches the connected data provider.
import { putPicture } from '../src/data/pictures'
import { useMemories } from '../src/systems/memories'

export async function seedMemories() {
  if (new URLSearchParams(location.search).get('mock') !== '1') throw Error('Mock mode required')
  if (useMemories.getState().all.length) return { existing: useMemories.getState().all.length }
  const sources = [
    '/scripts/.memory-photo.jpg',
    '/scripts/.memory-photo.jpg',
    '/scripts/.memory-photo.jpg',
  ]
  const images = await Promise.all(sources.map(async src => {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = src
    await image.decode(); return image
  }))
  const memories = []
  for (let i = 0; i < 14; i++) {
    const image = images[i % images.length]
    const canvas = document.createElement('canvas')
    canvas.width = i % 4 === 0 ? 1000 : 1600
    canvas.height = i % 4 === 0 ? 1400 : 1067
    const context = canvas.getContext('2d')
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height)
    context.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9))
    const blur = document.createElement('canvas'); blur.width = 16; blur.height = 12
    blur.getContext('2d').drawImage(canvas, 0, 0, 16, 12)
    const path = `memories/browser-fixture-${i}.jpg`
    await putPicture(path, blob)
    memories.push({ id: `browser-fixture-${i}`, path, width: canvas.width, height: canvas.height,
      blur: blur.toDataURL('image/jpeg'), tint: ['#687568','#96947b','#74858e'][i % 3], by: i % 2 ? 'warm' : 'cool',
      at: Date.now() - (14 - i) * 86400000 * 20,
      when: ['The long way home', 'A Sunday with nowhere to be', 'Somewhere we promised to return'][i % 3],
      why: ['We stayed until the light went.', 'I still remember how quiet it was here.', 'One of those days I wish we could keep a little longer.'][i % 3] })
  }
  localStorage.setItem('garden:memories:v1', JSON.stringify(memories))
  useMemories.getState().setAll(memories)
  return { seeded: memories.length }
}

export function inspectViewer() {
  const dialog = document.querySelector('.memory-viewer')
  const image = document.querySelector('.memory-original')
  const bounds = image?.getBoundingClientRect()
  return { open: !!dialog, width: bounds?.width, height: bounds?.height,
    sourceWidth: image?.naturalWidth, sourceHeight: image?.naturalHeight,
    viewport: [innerWidth, innerHeight], objectFit: image && getComputedStyle(image).objectFit,
    active: document.activeElement?.getAttribute('aria-label') }
}
