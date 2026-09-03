/**
 * Her weather, her city, and every way either service can be unhelpful.
 *
 * -----------------------------------------------------------------------------
 * The rule this whole feature is built on is that **the garden opens whether or
 * not any of it works**. It is decoration on a place two people meet in, and
 * there is no version of it that is allowed to be the reason the place will not
 * load — so most of what is checked here is what happens when the answer is
 * missing, malformed, or nonsense.
 *
 * The rest is the mapping, which is the part with judgement in it: raw
 * millimetres and metres of visibility are useless numbers to draw with, and
 * getting the curve wrong means a garden that looks dry on almost every day it
 * is actually raining.
 *
 *   npm run sky
 * -----------------------------------------------------------------------------
 */

import {
  clearSky,
  hazeOf,
  rainOf,
  readSky,
  skyUrl,
  windOf,
  type Sky,
} from '../src/systems/sky'
import { paletteAt, underSky } from '../src/systems/palette'
import { placeUrl, readPlace } from '../src/systems/places'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const sky = (over: Partial<Sky>): Sky => ({ ...clearSky(), known: true, ...over })

console.log('\nturning millimetres into weather\n')

{
  ok('dry is dry', rainOf(0) === 0)
  /*
    The curve, and why there is one. Nine tenths of the rain that falls
    anywhere falls at under two millimetres an hour — so on a linear mapping
    the garden would look almost dry on almost every day it was raining, which
    is the opposite of the point.
  */
  ok('a drizzle is already visibly wet', rainOf(0.3) > 0.25, rainOf(0.3).toFixed(2))
  ok('and proper rain is most of the way up', rainOf(2) > 0.65, rainOf(2).toFixed(2))
  ok('a downpour tops out rather than running away', rainOf(40) === 1)
  ok('nonsense is dry', rainOf(Number.NaN) === 0 && rainOf(-5) === 0)

  ok('a clear day has no haze', hazeOf(20_000) === 0 && hazeOf(60_000) === 0)
  /*
    Harmattan lands here. The dust that fills the sky over Kano for two months
    reports as low visibility and nothing else — no cloud, no precipitation —
    so it and a foggy Shanghai morning arrive as the same number, which is
    right: from inside a garden they look the same.
  */
  ok('harmattan haze reads as haze', hazeOf(3000) > 0.5, hazeOf(3000).toFixed(2))
  ok('thick fog reads as thick', hazeOf(200) > 0.85, hazeOf(200).toFixed(2))
  ok('nonsense is clear air', hazeOf(Number.NaN) === 0 && hazeOf(-1) === 0)

  ok('still is still', windOf(0) === 0)
  ok('a breeze is a breeze', windOf(12) > 0.2 && windOf(12) < 0.4, windOf(12).toFixed(2))
  ok('a gale tops out', windOf(200) === 1)
}

console.log('\nreading what the service said\n')

{
  const good = readSky({
    current: { cloud_cover: 80, precipitation: 1.2, visibility: 6000, wind_speed_10m: 18 },
  })
  ok('a real answer is known', good.known)
  ok('and carries all four', good.cloud > 0.7 && good.rain > 0 && good.haze > 0 && good.wind > 0,
    JSON.stringify(good))

  /*
    Every one of these has to return a *garden*, not an exception. A weather
    service having a bad afternoon is not a reason the place will not open.
  */
  for (const [what, payload] of [
    ['nothing at all', null],
    ['a string', 'sorry'],
    ['an empty object', {}],
    ['no current block', { hourly: {} }],
    ['a current block of rubbish', { current: 'nope' }],
    ['fields of the wrong type', { current: { cloud_cover: 'lots', precipitation: null } }],
    ['an error body', { error: true, reason: 'bad latitude' }],
  ] as const) {
    let threw = false
    let out: Sky = clearSky()
    try { out = readSky(payload) } catch { threw = true }
    ok(`${what} does not throw`, !threw)
    ok(`  ...and gives a garden`, Number.isFinite(out.cloud) && Number.isFinite(out.rain))
  }

  ok('a missing visibility is treated as clear, not as fog',
    readSky({ current: { cloud_cover: 10 } }).haze === 0)
  ok('and cloud cover is a percentage, not a fraction',
    Math.abs(readSky({ current: { cloud_cover: 100 } }).cloud - 1) < 1e-9)
}

console.log('\nthe query\n')

{
  const url = skyUrl(12.0022, 8.5919)
  ok('it goes to open-meteo', url.startsWith('https://api.open-meteo.com/'), url)
  /*
    No key in the URL, and that is the whole reason this service was chosen:
    nothing to keep secret means no proxy in `functions/`, nothing to leak from
    a browser, and one fewer thing that can be down.
  */
  ok('and carries no key of any kind', !/key|token|appid/i.test(url), url)
  for (const field of ['cloud_cover', 'precipitation', 'visibility', 'wind_speed_10m']) {
    ok(`it asks for ${field}`, url.includes(field), url)
  }
  ok('coordinates are rounded, so the cache can actually hit',
    url.includes('12.002') && url.includes('8.592'), url)
}

console.log('\nwhat the weather does to the light\n')

{
  const noon = paletteAt(13)
  ok('an unknown sky changes nothing at all',
    underSky(noon, clearSky()) === noon)

  const overcast = underSky(noon, sky({ cloud: 1 }))
  ok('overcast takes the sun down', overcast.sunIntensity < noon.sunIntensity,
    `${noon.sunIntensity.toFixed(2)} to ${overcast.sunIntensity.toFixed(2)}`)
  /*
    ...and fills the shadows in, which is the half people forget. Overcast is
    not "darker", it is *flatter* — the sun stops being a direction and becomes
    a bright grey ceiling. A version that only dimmed would look like dusk.
  */
  ok('and brings the ambient up to fill the shadows',
    overcast.ambientIntensity > noon.ambientIntensity,
    `${noon.ambientIntensity.toFixed(2)} to ${overcast.ambientIntensity.toFixed(2)}`)
  ok('but never puts the lights out — it is still a place to sit in',
    overcast.sunIntensity > noon.sunIntensity * 0.35,
    overcast.sunIntensity.toFixed(2))

  const wet = underSky(noon, sky({ rain: 1 }))
  ok('rain darkens the ground', wet.ground !== noon.ground)
  ok('and greys the sky even with no cloud reported',
    wet.sunIntensity < noon.sunIntensity,
    'rain out of a clear sky is a service being wrong about one of them')

  const foggy = underSky(noon, sky({ haze: 1 }))
  ok('haze closes the distance', foggy.fogFar < noon.fogFar,
    `${noon.fogFar.toFixed(0)}m to ${foggy.fogFar.toFixed(0)}m`)
  ok('but never past the trees', foggy.fogFar > 20, foggy.fogFar.toFixed(0))

  const blowy = underSky(noon, sky({ wind: 1 }))
  ok('wind adds to the hour rather than replacing it',
    blowy.wind > noon.wind, `${noon.wind.toFixed(2)} to ${blowy.wind.toFixed(2)}`)

  /*
    Overcast at four in the morning must not look like overcast at noon. The
    grey is the hour's *own* sky, not a fixed colour, which is what keeps a
    cloudy dawn pink and a cloudy midnight black.
  */
  const dawnGrey = underSky(paletteAt(5.5), sky({ cloud: 1 }))
  const noonGrey = underSky(paletteAt(13), sky({ cloud: 1 }))
  ok('a cloudy dawn does not look like a cloudy noon',
    dawnGrey.skyTop !== noonGrey.skyTop,
    `${dawnGrey.skyTop} against ${noonGrey.skyTop}`)

  /* And nothing it produces may be a broken colour or a NaN. */
  for (const [name, p] of [['overcast', overcast], ['wet', wet], ['foggy', foggy]] as const) {
    const colours = [p.skyTop, p.skyBottom, p.sunColor, p.ambientColor, p.fogColor,
      p.grassBase, p.grassTip, p.ground]
    ok(`${name} produces real colours`, colours.every((c) => /^#[0-9a-f]{6}$/i.test(c)),
      colours.join(' '))
    ok(`${name} produces real numbers`,
      [p.sunIntensity, p.ambientIntensity, p.fogNear, p.fogFar, p.wind, p.cloud]
        .every((n) => Number.isFinite(n)))
  }
}

console.log('')
console.log('finding a place by name')
console.log('')

{
  /*
    The real shape, taken from an actual answer for "Kano". The timezone is
    the part that makes this worth doing rather than merely tidy: typing a
    city sets the clock, the distance and the weather together, so none of the
    three can end up disagreeing with the other two.
  */
  const kano = readPlace({
    results: [{
      name: 'Kano', latitude: 12.00012, longitude: 8.51672,
      country: 'Nigeria', timezone: 'Africa/Lagos', population: 4_910_000,
    }],
  })
  ok('a city resolves', kano !== null)
  ok('to the right place', Math.abs((kano?.lat ?? 0) - 12) < 0.1, JSON.stringify(kano))
  ok('and brings its timezone', kano?.timeZone === 'Africa/Lagos', kano?.timeZone)
  /*
    The country is in the label because the first answer is not always the one
    you meant — "Kano" is a city of five million in Nigeria and a hamlet in
    Osaka. Showing what was found is what lets somebody notice.
  */
  ok('and says which one it found', kano?.label === 'Kano, Nigeria', kano?.label)

  ok('nothing found is null', readPlace({ results: [] }) === null)
  ok('no results key is null', readPlace({}) === null)
  ok('nothing at all is null', readPlace(null) === null)
  ok('a string is null', readPlace('sorry') === null)
  ok('results of rubbish is null', readPlace({ results: ['x'] }) === null)
  ok('a result with no coordinates is null',
    readPlace({ results: [{ name: 'Nowhere', country: 'X' }] }) === null)
  ok('a result with impossible coordinates is null',
    readPlace({ results: [{ name: 'X', latitude: 900, longitude: 0 }] }) === null)
  ok('and a NaN is null',
    readPlace({ results: [{ name: 'X', latitude: Number.NaN, longitude: 0 }] }) === null)
  ok('a place with no timezone still resolves',
    readPlace({ results: [{ name: 'X', latitude: 1, longitude: 2 }] })?.timeZone === '')

  const url = placeUrl(' Kano ')
  ok('the query is trimmed and escaped', url.includes('name=Kano'), url)
  // Same reason as the weather: nothing to keep secret means nothing to leak.
  ok('and carries no key either', !/key|token|appid/i.test(url), url)
  ok('a name with a space survives', placeUrl('New York').includes('New%20York'))
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
