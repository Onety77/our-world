/** The dedicated wheel-to-wheel transport, without Firebase or a browser. */
import {
  RallyStreamMeter,
  openLocalRallyStream,
  rallyRoomKey,
  readRallyFrame,
  writeRallyFrame,
} from '../src/data/rallyStream'
import type { RallyStreamInput } from '../src/data/types'

let failed = 0
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
}

const motion: RallyStreamInput = {
  car: '1250,238401,-3141,255',
  clock: 91_234,
  speed: 42.127,
  lateral: -3.456,
  yawRate: 0.7124,
  steering: -0.1844,
}

console.log('\nA live room is a legal, collision-safe database path\n')
const room = rallyRoomKey('1788123456789.moonbreak')
check('the dot is escaped', room.includes('.'), false)
check('a dot and a literal underscore stay different', rallyRoomKey('a.b') === rallyRoomKey('a_b'), false)
check('all forbidden Firebase key characters are escaped', /[.#$\/\[\]]/.test(rallyRoomKey('a.#$/[]')), false)

console.log('\nA compact motion packet survives the wire\n')
const raw = writeRallyFrame(motion, 17, 1_788_123_456_789)
const frame = readRallyFrame(raw)
check('the packet stays compact', JSON.stringify(raw).length < 150, true)
check('its sequence returns', frame?.sequence, 17)
check('its recorder car is unchanged', frame?.car, motion.car)
check('its race clock returns', frame?.clock, motion.clock)
check('forward velocity is quantised to centimetres per second', frame?.speed, 42.13)
check('lateral velocity returns', frame?.lateral, -3.46)
check('yaw rate returns', frame?.yawRate, 0.712)
check('steering returns', frame?.steering, -0.184)

console.log('\nRemote input is refused before it reaches the road\n')
check('nothing', readRallyFrame(null), null)
check('another version', readRallyFrame({ ...raw, v: 2 }), null)
check('an extra-long car', readRallyFrame({ ...raw, c: '1'.repeat(65) }), null)
check('a negative sequence', readRallyFrame({ ...raw, q: -1 }), null)
check('an impossible speed', readRallyFrame({ ...raw, f: 10_001 }), null)
check('a NaN', readRallyFrame({ ...raw, y: Number.NaN }), null)

console.log('\nThe meter exposes loss, jitter and bad ordering\n')
let now = 10_000
const meter = new RallyStreamMeter(() => now, now)
const received = (sequence: number, sentAt: number, arrival: number) => {
  now = arrival
  const next = readRallyFrame(writeRallyFrame(motion, sequence, sentAt))!
  return meter.noteReceived(next, arrival)
}
check('first frame is useful', received(0, 9_950, 10_000), true)
check('a gap is useful', received(2, 10_020, 10_070), true)
check('and records one missing frame', meter.snapshot().missed, 1)
check('the exact repeat is ignored', received(2, 10_020, 10_075), false)
check('an older packet is ignored', received(1, 10_000, 10_080), false)
check('duplicates are visible', meter.snapshot().duplicates, 1)
check('bad ordering is visible', meter.snapshot().outOfOrder, 1)
check('the arrival gap is measured', meter.snapshot().meanGap, 70)
check('delivery age is measured', meter.snapshot().age, 50)

console.log('\nA reloaded sender may restart its sequence\n')
check('newer send time proves this is a reconnect', received(0, 10_090, 10_140), true)
check('the reset is counted', meter.snapshot().resets, 1)

console.log('\nTwo data-layer clients share only their named room\n')
let warmSaw = 0
let coolSaw = 0
const warmLink = openLocalRallyStream('warm', 'same.race', () => warmSaw++)
const coolLink = openLocalRallyStream('cool', 'same.race', () => coolSaw++)
const elsewhere = openLocalRallyStream('cool', 'other.race', () => {
  failed++
  console.log('  FAIL  another room received this race')
})
warmLink.send(motion)
coolLink.send({ ...motion, car: '0,100,0,0' })
check('warm receives cool directly', warmSaw, 1)
check('cool receives warm directly', coolSaw, 1)
check('the sender records an actual flush', warmLink.stats().sent, 1)
check('the receiver records an actual arrival', coolLink.stats().received, 1)
check('neither client receives its own frame', warmLink.stats().received, 1)
warmLink.close()
coolLink.close()
elsewhere.close()

if (failed) {
  console.error(`\n${failed} rally stream check${failed === 1 ? '' : 's'} failed\n`)
  process.exit(1)
}
console.log('\nAll rally stream checks passed.\n')
