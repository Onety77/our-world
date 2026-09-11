import assert from 'node:assert/strict'
import { flatTrack } from './rally-fixture'
import { createCar } from '../src/world/games/ember-rally/physics'
import { emptyRoad } from '../src/world/games/ember-rally/track'
import { TUNE } from '../src/world/games/ember-rally/tuning'
import { CarWear } from '../src/world/games/ember-rally/wear'
import { completePersonalRun, personalKey, timeAtProgress, usePersonalBest, validPersonalRun } from '../src/world/games/ember-rally/personalBest'
import type { RallyRun } from '../src/world/games/ember-rally/model'

const saved = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
} })
const track = flatTrack(1000)
const key = personalKey(track)
function run(timeMs = 2000): RallyRun {
  const path: number[] = []
  for (let t = 0; t <= timeMs; t += 100) path.push(0, Math.round(track.finishAt * t / timeMs * 100), 0, 0)
  path.push(0, track.finishAt * 100, 0, 0)
  return { v: 4, timeMs, path, strikes: 0, driftMs: 0 }
}
const original = run()
assert(validPersonalRun(original))
assert(completePersonalRun(track, original))
assert(usePersonalBest.getState().offer(track, key, original))
assert(!usePersonalBest.getState().offer(track, key, run(3000)))
assert.equal(usePersonalBest.getState().records[0].run.timeMs, 2000)
original.path[0] = 777
assert.equal(usePersonalBest.getState().records[0].run.path[0], 0, 'saved path must be independent of the recorder')
assert.equal(timeAtProgress(run(), track.finishAt / 2), 1000)
assert.equal(timeAtProgress(run(), track.finishAt + 1), null)
assert(!validPersonalRun({ ...run(), path: [NaN, 0, 0, 0] }))
assert(!usePersonalBest.getState().offer(track, key, { ...run(), path: run().path.slice(4) }))
TUNE.cameraHeight += .1
assert.equal(personalKey(track), key, 'camera settings do not invalidate a driving record')
TUNE.cameraHeight -= .1
TUNE.grip += .1
assert.notEqual(personalKey(track), key)
assert(!usePersonalBest.getState().offer(track, key, run(1000)), 'mid-run tune changes cannot overwrite a fair best')
TUNE.grip -= .1
track.sand[15] = .6
assert.notEqual(personalKey(track), key, 'surface changes invalidate the comparison')
track.sand[15] = 0
assert(saved.size > 0)
JSON.parse([...saved.values()][0])
for (let seed = 1; seed <= 12; seed++) {
  track.seed = seed
  assert(usePersonalBest.getState().offer(track, personalKey(track), run()))
}
assert.equal(usePersonalBest.getState().records.length, 8)
usePersonalBest.getState().forget('rootway')
assert.equal(usePersonalBest.getState().records.length, 0)
console.log('PASS full-run validation, immutable recordings, faster-only replacement, course/tune matching, splits, storage bounds and forgetting.')

const car = createCar(track), road = emptyRoad()
car.vs = 30
const before = JSON.stringify(car)
const wear = new CarWear()
for (let i = 0; i < 1200; i++) wear.update(car, road, 'harmattan', 0, 1 / 60)
assert(wear.surface.x > .7 && wear.surface.y === 0 && wear.surface.z === 0)
assert.equal(JSON.stringify(car), before)
const dusty = wear.surface.x
road.wet = 1; car.rough = true
for (let i = 0; i < 600; i++) wear.update(car, road, 'stormcrown', 1, 1 / 60)
assert(wear.surface.x < dusty && wear.surface.y > .9 && wear.surface.z > .5)
car.hitWall = .4; car.n = -2
wear.update(car, road, 'rootway', 0, .1)
assert(wear.scuffs.y > 0 && wear.scuffs.x === 0, 'scuffs belong to the contacted side')
wear.reset()
assert.deepEqual(wear.surface.toArray(), [0, 0, 0, 0])
assert.deepEqual(wear.scuffs.toArray(), [0, 0])
for (let i = 0; i < 600; i++) wear.update({ ...car, vs: 0, vn: 0 }, road, 'harmattan', 0, 1 / 60)
assert.equal(wear.surface.x, 0, 'parking does not generate dust')
console.log('PASS dust accumulation, rain washing, wetness, mud, side-specific scuffs, fresh-start reset and unchanged physics.')
