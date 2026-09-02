/**
 * When the next round opens, and what that is called.
 *
 * ---------------------------------------------------------------------------
 * A daily game is keyed by the local date, so the whole of "you have to wait
 * until tomorrow" is one string changing. This checks the two things that are
 * easy to get wrong and impossible to notice: that the answer is right in a
 * timezone that is not this machine's, and that it is right on the two nights
 * a year that are not twenty-four hours long.
 *
 *   npm run day
 * ---------------------------------------------------------------------------
 */

import { inWords, localDateKey, untilNextDay } from '../src/systems/time'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const HOUR = 3_600_000
const at = (iso: string) => new Date(iso).getTime()

console.log('\nhow long until tomorrow\n')

{
  // Lagos does not observe daylight saving: every day is exactly 24 hours.
  const zone = 'Africa/Lagos'
  const noon = at('2026-03-10T11:00:00Z') // 12:00 in Lagos
  const left = untilNextDay(zone, noon)
  ok('twelve hours to go at noon in Lagos', Math.abs(left - 12 * HOUR) < 1000,
    `${(left / HOUR).toFixed(3)}h`)

  // And the moment it lands, the key really has moved on.
  ok('and the day has actually changed by then',
    localDateKey(zone, noon + left) !== localDateKey(zone, noon),
    `${localDateKey(zone, noon)} -> ${localDateKey(zone, noon + left)}`)
  ok('but not one second before',
    localDateKey(zone, noon + left - 1000) === localDateKey(zone, noon))
}

{
  /*
    The nights the arithmetic version gets wrong.

    Adding 24 hours to midnight is right for 363 days a year. On the two the
    clocks move, the day is 23 or 25 hours long — and a countdown that is an
    hour out on the night it matters is worse than none.
  */
  const zone = 'Europe/London'
  // 00:00 GMT on the 29th — the clocks go forward at 01:00 that same morning,
  // so this is the day that is only twenty-three hours long.
  const springMidnight = at('2026-03-29T00:00:00Z')
  const spring = untilNextDay(zone, springMidnight)
  ok('the short night is twenty-three hours', Math.abs(spring - 23 * HOUR) < 1000,
    `${(spring / HOUR).toFixed(3)}h`)

  const autumnMidnight = at('2026-10-24T23:00:00Z') // 00:00 BST, clocks go back
  const autumn = untilNextDay(zone, autumnMidnight)
  ok('and the long one is twenty-five', Math.abs(autumn - 25 * HOUR) < 1000,
    `${(autumn / HOUR).toFixed(3)}h`)
}

{
  // Seven timezones apart is the whole point of this world.
  const hers = untilNextDay('Asia/Shanghai', at('2026-05-04T09:00:00Z'))
  const yours = untilNextDay('Africa/Lagos', at('2026-05-04T09:00:00Z'))
  ok('two people in two places get two different answers', hers !== yours,
    `${(hers / HOUR).toFixed(1)}h vs ${(yours / HOUR).toFixed(1)}h`)
  ok('and neither is ever more than a day', hers <= 25 * HOUR && yours <= 25 * HOUR)
}

{
  // A zone nobody has heard of must not take the countdown down with it.
  const junk = untilNextDay('Not/AZone', Date.now())
  ok('nonsense timezone still answers something sane',
    Number.isFinite(junk) && junk >= 0 && junk <= 26 * HOUR, `${junk}`)
}

console.log('\nsaying it\n')

{
  ok('4h 12m', inWords(4 * HOUR + 12 * 60_000) === '4h 12m', inWords(4 * HOUR + 12 * 60_000))
  ok('48m', inWords(48 * 60_000) === '48m', inWords(48 * 60_000))
  ok('1h 0m rather than 60m', inWords(HOUR) === '1h 0m', inWords(HOUR))
  /*
    Never a bare zero. A countdown that reads "0m" for the last minute looks
    like it has stopped, and this one is read by somebody waiting on it.
  */
  ok('the last minute says something, not nothing', inWords(20_000) === 'any moment')
  ok('and so does zero', inWords(0) === 'any moment')
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
