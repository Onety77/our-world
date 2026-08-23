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
function mixHex(a: string, b: string, t: number): string {
  scratchA.set(a)
  scratchB.set(b)
  scratchA.lerp(scratchB, t)
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
