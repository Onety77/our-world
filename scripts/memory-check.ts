import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Ray, Vector3 } from 'three'
import { GLASS_W, hangingFor, paneSize } from '../src/sections/lanterns/layout'
import { pickMemory, postPieces } from '../src/sections/lanterns/lanternGeometry'

function check(name: string, test: () => void) { test(); console.log(`PASS ${name}`) }
const memories = Array.from({ length: 14 }, (_, i) => ({ width: i % 2 ? 1600 : 1000, height: i % 2 ? 1067 : 1400 }))
check('portraits, landscapes and panoramas keep their proportions', () => {
  for (const [w,h] of [[1600,1067], [1000,1400], [4000,600], [600,4000], [800,800]]) {
    const size = paneSize(w,h)
    assert(Math.abs(size.w / size.h - w/h) < 1e-9)
    assert(size.w <= GLASS_W && size.h <= 1.80001)
  }
})
check('the visible photograph is selectable across its actual surface', () => {
  for (let i=0;i<memories.length;i++) {
    const hung = hangingFor(i), size = paneSize(memories[i].width, memories[i].height)
    const normal = new Vector3(Math.sin(hung.yaw),0,Math.cos(hung.yaw))
    for (const [x,y] of [[0,0],[-.4,.4],[.4,-.4]]) {
      const target = new Vector3(hung.x + Math.cos(hung.yaw)*size.w*x, hung.y+size.h*y, hung.z-Math.sin(hung.yaw)*size.w*x)
      const ray = new Ray(target.clone().addScaledVector(normal,2),normal.clone().negate())
      assert.equal(pickMemory(ray,memories,i,i),i)
    }
  }
})
check('a foreground post blocks a photograph behind it', () => {
  let checked = 0
  for (let front=1;front<memories.length;front++) {
    let post = new Vector3()
    postPieces(front,memories[front].width,memories[front].height,(x,y,z,_sx,sy) => {
      if(sy>1)post=new Vector3(x,y,z)
    })
    for(let back=0;back<front;back++) {
      const hung = hangingFor(back)
      const target = new Vector3(hung.x,hung.y,hung.z)
      // Cross the foreground upright exactly at photograph height.
      post.y = hung.y
      const direction = target.clone().sub(post).normalize()
      const ray = new Ray(post.clone().addScaledVector(direction,-1),direction)
      const selected=pickMemory(ray,memories,back,front)
      assert.notEqual(selected,back,`selected ${back} through post ${front}`)
      checked++
    }
  }
  assert(checked>50)
})
check('empty space and points behind the eye select nothing', () => {
  const hung=hangingFor(5)
  const normal=new Vector3(Math.sin(hung.yaw),0,Math.cos(hung.yaw))
  assert.equal(pickMemory(new Ray(new Vector3(hung.x,hung.y+6,hung.z),new Vector3(0,1,0)),memories),null)
  assert.equal(pickMemory(new Ray(new Vector3(hung.x,hung.y,hung.z).addScaledVector(normal,2),normal),memories,5,5),null)
})

// Exercise the actual cloud adapter method with a local storage URL resolver.
// No credentials, network requests, or writes to the connected garden.
const adapter = readFileSync(new URL('../src/data/firebase.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const start = adapter.indexOf('    pictureUrl(memory, size) {')
const end = adapter.indexOf('\n    },', start) + 6
assert(start >= 0 && end > start)
const pictures = new Map<string, Promise<string>>()
const calls: string[] = []
let failNext = false
const cloud = runInNewContext(`({${adapter.slice(start, end)}})`, {
  pictures, store: {}, storageRef: (_store: unknown, path: string) => path,
  getDownloadURL: async (path: string) => {
    calls.push(path)
    if (failNext) { failNext = false; throw Error('temporary outage') }
    return `https://fixture.invalid/${path}`
  },
})
const memory = { path: 'original.jpg', lanePath: 'lane.jpg' }
assert.equal(await cloud.pictureUrl(memory, 'lane'), 'https://fixture.invalid/lane.jpg')
assert.equal(await cloud.pictureUrl(memory), 'https://fixture.invalid/original.jpg')
await cloud.pictureUrl(memory, 'lane'); await cloud.pictureUrl(memory)
assert.deepEqual(calls, ['lane.jpg', 'original.jpg'])
console.log('PASS cloud previews and full photographs have independent cache entries')
failNext = true
await assert.rejects(cloud.pictureUrl({ path: 'retry.jpg' }))
assert.equal(await cloud.pictureUrl({ path: 'retry.jpg' }), 'https://fixture.invalid/retry.jpg')
console.log('PASS a failed cloud photograph can be requested again')
