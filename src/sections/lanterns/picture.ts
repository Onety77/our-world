/**
 * Turning a kept photograph into something a lantern can show.
 *
 * Moved here whole from the room that stood on this ground, because none of it
 * was ever about that room: it is about the shape of a frame and the cost of a
 * texture, and both are the same out on the lane.
 */

import { LinearFilter, SRGBColorSpace, Texture } from 'three'
import { GLASS_W, GLASS_H } from './layout'

/** The shape every lantern is cut to. Three by two — see `GLASS_W`. */
export const FRAME_RATIO = GLASS_W / GLASS_H

/**
 * How much of the photograph fits inside the frame, as a scale on its UVs.
 *
 * The picture is filled to the frame and the overflow is trimmed, rather than
 * letterboxed: a lantern with grey bars in it is a lantern showing its own
 * frame. Which axis gets trimmed depends on which way round the photograph is.
 */
export function cropFor(width: number, height: number): [number, number] {
  const source = Math.max(0.05, width) / Math.max(0.05, height)
  return source > FRAME_RATIO ? [FRAME_RATIO / source, 1] : [1, source / FRAME_RATIO]
}

/**
 * The longest edge of a lantern's own copy of a photograph, in pixels.
 *
 * A lantern is about a metre across and is rarely more than a fifth of the
 * screen, so this is already generous. It exists to stop a twelve-megapixel
 * photograph living on the GPU at full size for the sake of a pane you walk
 * past.
 */
const PANE_PX = 720

/**
 * How many decoded photographs to keep.
 *
 * They used to be disposed the moment a lantern left range, so walking back
 * along the lane decoded every photograph again — the same pictures, over and
 * over, and a fresh blur every time you turned around. A path you have already
 * walked should stay looking like itself.
 *
 * Bounded, because "keep everything" is how a long walk eventually runs a phone
 * out of memory. Least recently used goes first.
 */
const KEEP = 26

const held = new Map<string, Texture>()

/**
 * A lantern-sized texture for a photograph, made once and then remembered.
 *
 * The downscale happens on a canvas rather than by letting the GPU sample it
 * small, because a `Texture` holds on to whatever image it was handed — drawing
 * it small does not make it *cost* small.
 */
export async function paneTexture(url: string): Promise<Texture> {
  const had = held.get(url)
  if (had) {
    // Re-inserted, so the map's own order is least-recently-used.
    held.delete(url)
    held.set(url, had)
    return had
  }

  const image = new Image()
  // The mock hands back a blob: URL and the real layer a signed one on another
  // origin; without this the canvas is tainted and WebGL refuses the texture
  // with a security error rather than a broken picture.
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('that photograph did not load'))
    image.src = url
  })

  const longest = Math.max(image.naturalWidth, image.naturalHeight, 1)
  const scale = Math.min(1, PANE_PX / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)

  const texture = new Texture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  held.set(url, texture)

  while (held.size > KEEP) {
    const oldest = held.keys().next().value
    if (oldest === undefined) break
    held.get(oldest)?.dispose()
    held.delete(oldest)
  }
  return texture
}

/** A tiny preview from the document itself — no request, no wait. */
export function blurTexture(blur: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const texture = new Texture(image)
      texture.colorSpace = SRGBColorSpace
      texture.minFilter = LinearFilter
      texture.magFilter = LinearFilter
      texture.needsUpdate = true
      resolve(texture)
    }
    image.onerror = () => reject(new Error('no preview'))
    image.src = blur
  })
}
