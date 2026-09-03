/**
 * The garden's colour, as a function of the hour.
 *
 * Held to the art direction: no saturated greens anywhere. Moss, sage, ochre,
 * dust and deep teal in shadow; warm cream in light. Saturated green is exactly
 * what makes rendered nature look like a screensaver.
 *
 * Keyframes are interpolated in linear space and wrap across midnight, so the
 * sky is continuous at 23:59.
 */

import { Color } from 'three'

import type { Sky } from './sky'

export interface SkyPalette {
  hour: number
  skyTop: string
  skyBottom: string
  sunColor: string
  sunIntensity: number
  ambientColor: string
  ambientIntensity: number
  fogColor: string
  fogNear: number
  fogFar: number
  grassBase: string
  grassTip: string
  ground: string
  /** How hard the wind blows at this hour. Dawn is still; afternoon is not. */
  wind: number
  /**
   * How much of her sky is covered, 0..1.
   *
   * Nought on every keyframe — the hours do not know about weather — and
   * written by `underSky` afterwards. It is on the palette rather than passed
   * around separately because the palette is the one thing every part of this
   * world already reads, which is exactly why adding the hour swap needed no
   * teaching. Anything that wants to know whether it is overcast can now ask
   * the same object it already asks about the light.
   */
  cloud: number
}

const KEYFRAMES: SkyPalette[] = [
  {
    hour: 0,
    skyTop: '#070d16',
    skyBottom: '#131e29',
    sunColor: '#8fa9cf',
    sunIntensity: 0.22,
    ambientColor: '#26384a',
    ambientIntensity: 0.72,
    fogColor: '#0e1720',
    fogNear: 12,
    fogFar: 96,
    grassBase: '#1e2a2a',
    grassTip: '#44584c',
    ground: '#1d2827',
    wind: 0.35,
    cloud: 0,
  },
  {
    hour: 5.4,
    skyTop: '#2a3550',
    skyBottom: '#8a7383',
    sunColor: '#c98a86',
    sunIntensity: 0.45,
    ambientColor: '#4a4a60',
    ambientIntensity: 0.62,
    fogColor: '#5c5665',
    fogNear: 10,
    fogFar: 104,
    grassBase: '#222c2c',
    grassTip: '#4e5546',
    ground: '#232a28',
    wind: 0.25,
    cloud: 0,
  },
  {
    hour: 6.8,
    skyTop: '#5a7a9e',
    skyBottom: '#e0a678',
    sunColor: '#ffb076',
    sunIntensity: 1.15,
    ambientColor: '#7d8494',
    ambientIntensity: 0.75,
    fogColor: '#c1a68f',
    fogNear: 10,
    fogFar: 120,
    grassBase: '#38402f',
    grassTip: '#7d8560',
    ground: '#3c4234',
    wind: 0.4,
    cloud: 0,
  },
  {
    hour: 10,
    skyTop: '#6ba2da',
    skyBottom: '#dbe6dc',
    sunColor: '#fff2d8',
    sunIntensity: 1.5,
    ambientColor: '#9fae9f',
    ambientIntensity: 0.98,
    fogColor: '#d3ddd2',
    fogNear: 16,
    fogFar: 150,
    grassBase: '#4d6440',
    grassTip: '#b4c16d',
    ground: '#5b6a45',
    wind: 0.7,
    cloud: 0,
  },
  {
    hour: 13.5,
    skyTop: '#74ade2',
    skyBottom: '#e3ecdf',
    sunColor: '#fffaef',
    sunIntensity: 1.62,
    ambientColor: '#a9b6a6',
    ambientIntensity: 1.05,
    fogColor: '#dae4d8',
    fogNear: 18,
    fogFar: 160,
    grassBase: '#54703f',
    grassTip: '#c2cd73',
    ground: '#647448',
    wind: 1.0,
    cloud: 0,
  },
  {
    hour: 16.6,
    skyTop: '#79a0c2',
    skyBottom: '#e5d5b2',
    sunColor: '#ffe2b0',
    sunIntensity: 1.35,
    ambientColor: '#a49c88',
    ambientIntensity: 0.8,
    fogColor: '#d2c6a8',
    fogNear: 14,
    fogFar: 140,
    grassBase: '#54603c',
    grassTip: '#c4b571',
    ground: '#4e4e39',
    wind: 0.85,
    cloud: 0,
  },
  {
    hour: 18.6,
    skyTop: '#3b4468',
    skyBottom: '#dd8f60',
    sunColor: '#ff8f52',
    sunIntensity: 0.95,
    ambientColor: '#6a5f6d',
    ambientIntensity: 0.7,
    fogColor: '#a4816d',
    fogNear: 10,
    fogFar: 112,
    grassBase: '#2f3128',
    grassTip: '#7c6a4c',
    ground: '#33332a',
    wind: 0.5,
    cloud: 0,
  },
  {
    hour: 20.4,
    skyTop: '#141f34',
    skyBottom: '#3a4257',
    sunColor: '#9db4d6',
    sunIntensity: 0.35,
    ambientColor: '#3a4a5e',
    ambientIntensity: 0.76,
    fogColor: '#293347',
    fogNear: 12,
    fogFar: 100,
    grassBase: '#232f2e',
    grassTip: '#4e6055',
    ground: '#25302e',
    wind: 0.4,
    cloud: 0,
  },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const scratchA = new Color()
const scratchB = new Color()

/**
 * three's ColorManagement is on by default, so `set()` already takes an sRGB hex
 * into the linear working space and `getHexString()` takes it back out. Blending
 * happens in linear, which is why dusk crossfades without going muddy — and why
 * calling convertSRGBToLinear() here as well would be a double conversion.
 */
/**
 * A colour with the colour taken out of it, and turned down.
 *
 * This is what overcast actually *is*, and getting it wrong is what made the
 * first attempt at rain come out brighter than a clear day: the sky was mixed
 * toward its own `skyBottom`, which at two in the afternoon is the pale
 * horizon — so a downpour bleached the world instead of darkening it.
 *
 * Cloud does two things to light and both are here. It removes the *hue* — a
 * sky with a lid on it is grey, not blue — and it removes some of the value,
 * because the lid is between you and the sun. Derived from the hour's own
 * colour rather than a fixed grey, so an overcast midnight stays black and an
 * overcast dawn stays faintly pink.
 */
function dulled(hex: string, colourOut: number, darker: number): string {
  scratchA.set(hex)
  const flat = (scratchA.r + scratchA.g + scratchA.b) / 3
  scratchB.setRGB(flat, flat, flat)
  scratchA.lerp(scratchB, colourOut).multiplyScalar(1 - darker)
  return `#${scratchA.getHexString()}`
}

function mixHex(a: string, b: string, t: number): string {
  scratchA.set(a)
  scratchB.set(b)
  /*
    Clamped, and it had to be.

    `Color.lerp` extrapolates: hand it 1.08 and it goes *past* the colour you
    asked for, into whatever lies beyond. The weather layer builds its mixes by
    adding two readings together — rain and cloud both darken the grass — and
    they sum past one on the worst day of the year, which is exactly the day
    nobody would be looking at a screenshot.
  */
  scratchA.lerp(scratchB, Math.max(0, Math.min(1, t)))
  return `#${scratchA.getHexString()}`
}

/** Palette for any hour, wrapping across midnight. */
export function paletteAt(hour: number): SkyPalette {
  const h = ((hour % 24) + 24) % 24

  let i = KEYFRAMES.length - 1
  for (let k = 0; k < KEYFRAMES.length; k++) {
    if (KEYFRAMES[k].hour <= h) i = k
    else break
  }
  const a = KEYFRAMES[i]
  const b = KEYFRAMES[(i + 1) % KEYFRAMES.length]

  // span may wrap past midnight (20.4 → 24 → 0)
  const span = b.hour > a.hour ? b.hour - a.hour : 24 - a.hour + b.hour
  const into = h >= a.hour ? h - a.hour : 24 - a.hour + h
  const raw = span === 0 ? 0 : into / span
  const t = raw * raw * (3 - 2 * raw)

  return {
    hour: h,
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, t),
    sunColor: mixHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    ambientColor: mixHex(a.ambientColor, b.ambientColor, t),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    fogColor: mixHex(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    grassBase: mixHex(a.grassBase, b.grassBase, t),
    grassTip: mixHex(a.grassTip, b.grassTip, t),
    ground: mixHex(a.ground, b.ground, t),
    wind: lerp(a.wind, b.wind, t),
    cloud: 0,
  }
}

/**
 * The hour's palette, with her weather laid over it.
 *
 * =============================================================================
 * **One funnel, and this is why the funnel was worth having.** Everything in
 * this world already reads a `SkyPalette` — the sky dome, the fog, the grass
 * colour and its wind, the clouds, the light. So weather does not need wiring
 * into any of them: it is applied here, once, and arrives everywhere at the
 * same time. That is the same property that made swapping to her clock free.
 *
 * Four moves, and each is what the weather actually does to light:
 *
 *   **Cloud flattens.** Overcast is not darker so much as *lower contrast*: the
 *   sun stops being a direction and becomes a bright grey ceiling, so the sun's
 *   intensity falls, the ambient rises to fill in the shadows it was casting,
 *   and every colour slides toward the grey of the sky itself.
 *
 *   **Rain darkens and desaturates**, on top of the cloud that comes with it.
 *   Wet grass is darker than dry grass, which is most of why a rainy meadow
 *   reads as rainy even with nothing falling.
 *
 *   **Haze closes the distance.** The one weather that acts on space rather
 *   than on colour: the fog comes in and the far plane comes with it. This is
 *   also the harmattan, which is why the Kano end of this garden will
 *   occasionally go the colour of the road.
 *
 *   **Wind moves the grass**, which already has a knob for it and needed
 *   nothing at all.
 *
 * Nothing here is allowed to reach the extremes: a garden under solid overcast
 * still has to be a place you want to sit in, so cloud takes about half the
 * sun rather than all of it, and the fog never closes past the trees. This is
 * weather as *mood*, not as simulation.
 * =============================================================================
 */
export function underSky(base: SkyPalette, sky: Sky): SkyPalette {
  if (!sky.known) return base

  const cloud = Math.max(0, Math.min(1, sky.cloud))
  const rain = Math.max(0, Math.min(1, sky.rain))
  const haze = Math.max(0, Math.min(1, sky.haze))
  // Rain is always overcast, whatever the cloud reading says. It cannot rain
  // out of a clear sky, and a service that says so is wrong about one of them.
  const grey = Math.max(cloud, rain)

  /*
    The lid, derived from this hour's own sky.

    Colour comes out in proportion to the cover, and value comes down — more
    for rain than for cloud, because a rainy afternoon genuinely is darker than
    an overcast one and that difference is most of how you tell them apart with
    nothing falling.
  */
  const lid = dulled(base.skyBottom, grey * 0.85, grey * 0.3 + rain * 0.22)
  const lidTop = dulled(base.skyTop, grey * 0.9, grey * 0.18 + rain * 0.2)

  return {
    ...base,
    cloud: grey,
    // The blue goes first, and then some of the light.
    skyTop: mixHex(base.skyTop, lidTop, grey),
    skyBottom: mixHex(base.skyBottom, lid, grey * 0.85),
    /*
      The sun stops being a *direction* — that is what overcast means — and the
      shadows it was casting fill in behind it. Cloud raises the ambient
      because a bright lid is a huge soft light; rain takes some of that back,
      because a rainy sky is a dark lid.
    */
    sunIntensity: base.sunIntensity * (1 - grey * 0.6) * (1 - rain * 0.3),
    sunColor: mixHex(base.sunColor, lid, grey * 0.6),
    ambientIntensity: base.ambientIntensity * (1 + cloud * 0.22 - rain * 0.3),
    ambientColor: mixHex(base.ambientColor, lid, grey * 0.5),
    // Wet ground is dark ground, and this is most of why a rainy meadow reads
    // as rainy with nothing falling out of the sky.
    /*
      And the ground, which is most of what you are looking at.

      The first attempt moved the sky convincingly and left the meadow bright
      green underneath it, which read as a nice day photographed through a grey
      filter. Wet grass is *much* darker than dry grass and noticeably less
      yellow — the tips lose their bleached look first, which is why the tip
      loses more colour than the base does.
    */
    grassBase: mixHex(base.grassBase, dulled(base.grassBase, 0.34, 0.52), rain * 0.9 + grey * 0.3),
    grassTip: mixHex(base.grassTip, dulled(base.grassTip, 0.55, 0.46), rain * 0.9 + grey * 0.38),
    ground: mixHex(base.ground, dulled(base.ground, 0.3, 0.5), rain * 0.9 + grey * 0.25),
    // Haze is the one weather that acts on distance rather than on colour.
    fogColor: mixHex(base.fogColor, lid, grey * 0.6 + haze * 0.3),
    fogNear: base.fogNear * (1 - haze * 0.55),
    fogFar: base.fogFar * (1 - haze * 0.62) * (1 - rain * 0.25),
    /*
      Wind adds to the hour's own rather than replacing it, because the hour's
      wind is a *character* — dawn is still, afternoon is not — and a calm day
      should still be calmer at six in the morning than at three.
    */
    wind: Math.min(1.6, base.wind + sky.wind * 0.9),
  }
}

/** The two people's light colours. Warm and cool, and nothing else uses these. */
export const LIGHT_COLORS = {
  warm: '#f0a94b',
  cool: '#9fb6e8',
} as const

/**
 * Flower heads. Dusty and washed out on purpose — nothing primary, nothing
 * that reads as a UI colour. Weighted toward the muted end: the two brightest
 * appear once each, so cream flowers stay an accent instead of speckling the
 * whole meadow white.
 */
export const FLOWER_COLORS = [
  '#c6a7ad',
  '#c6a7ad',
  '#b6bda8',
  '#b6bda8',
  '#c2ac8c',
  '#a99ab2',
  '#a99ab2',
  '#8f9a86',
  '#d8ccb2',
  '#e0d8c6',
] as const
