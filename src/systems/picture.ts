/**
 * Everything that happens to a photograph between the picker and the seam.
 *
 * ---------------------------------------------------------------------------
 * **Why this is above the data layer and not inside it.**
 *
 * All of it is browser work — a canvas, a decode, an encode — and it is
 * identical whether the picture is going into IndexedDB or into a bucket. Put
 * it inside either implementation and the other one either duplicates it or
 * quietly does something slightly different, and "slightly different" here
 * means one of the two of you gets pictures that are the wrong way up.
 *
 * **What this deliberately throws away.**
 *
 * A photograph off a phone carries where it was taken, to about five metres,
 * along with the device, the lens and the second. None of that is wanted here
 * and some of it is genuinely unsafe to keep — so nothing is ever uploaded as
 * it came off the camera. Redrawing the image through a canvas and re-encoding
 * it drops *every* metadata block there is, because a canvas has no idea any
 * of it existed. That is not a side effect being relied on by accident; it is
 * the reason the redraw happens even when the picture is already small enough.
 *
 * The one piece of metadata that must survive is the orientation flag, and it
 * survives by being *applied* rather than kept: `createImageBitmap` is asked
 * to bake it in, so the pixels come out the way up the picture actually is and
 * the flag is no longer needed by anybody.
 * ---------------------------------------------------------------------------
 */

/**
 * Longest edge of the copy that gets stored, in pixels.
 *
 * ---------------------------------------------------------------------------
 * **Two thousand five hundred and sixty, and it was sixteen hundred.**
 *
 * Sixteen hundred is enough to *show* a picture and not enough to have kept
 * one. It is barely above a phone screen at three times density, it has no
 * room left for the crop the frame takes, and it would not print at postcard
 * size. This is the only data in the garden that cannot be made again, so the
 * copy that survives should be worth surviving.
 *
 * 2560 is 2.5× the pixels for about 2.5× the bytes — call it half a megabyte
 * with the encoder below. A thousand memories is under a gigabyte, which is
 * inside the free tier and would still be inside it at ten times the price.
 * It prints at eight by ten, it is sharper than any screen either of you will
 * own for a decade, and it is not so large that a phone on a bad connection
 * gives up on it.
 *
 * It is deliberately *not* the original. A modern phone photograph is four to
 * twelve megabytes of detail nobody will ever look at, and storing it would be
 * paying rent on the parts of an image that only a sensor can see.
 * ---------------------------------------------------------------------------
 */
const LONGEST = 2560

/**
 * Encoder quality.
 *
 * 0.82 rather than 0.9. Above about 0.85 the file grows fast and the pictures
 * do not — and at 2560 across, an artefact is a quarter the size on screen
 * that it was at 1600.
 */
const QUALITY = 0.82

/**
 * WebP where it exists, JPEG where it does not.
 *
 * The single largest quality-per-byte decision available here: at matched
 * visual quality WebP is roughly a quarter to a third smaller than JPEG, so
 * this is how the picture gets *bigger* and the file gets *smaller* at the
 * same time. Supported by every browser either of you could be holding —
 * Safari since 14, everything else for years — and the check is a real encode
 * rather than a version sniff, because a browser that lies about `toBlob`
 * silently hands back a PNG three times the size.
 */
const ENCODER = (() => {
  if (typeof document === 'undefined') return { type: 'image/jpeg', ext: 'jpg' }
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const webp = probe.toDataURL('image/webp').startsWith('data:image/webp')
    return webp
      ? { type: 'image/webp', ext: 'webp' }
      : { type: 'image/jpeg', ext: 'jpg' }
  } catch {
    return { type: 'image/jpeg', ext: 'jpg' }
  }
})()

/** What the stored file is, so the seam can name and label it correctly. */
export const PICTURE_TYPE = ENCODER.type
export const PICTURE_EXT = ENCODER.ext

/** The tiny inline preview is this many pixels on its longest edge. */
const BLUR = 16

/** Anything bigger than this is refused before it is decoded. */
export const TOO_BIG = 40 * 1024 * 1024

export interface Prepared {
  /** The copy that gets stored. Freshly encoded, WebP where the browser has it. */
  display: Blob
  /** What it actually turned out to be — see the fallback in toBlob. */
  type: string
  ext: string
  width: number
  height: number
  /** '#rrggbb' — what the pane is when it is too far away to be worth loading. */
  tint: string
  /** A data: URI of a sixteen-pixel version. A few hundred bytes. */
  blur: string
}

/** Something went wrong with a picture, in words a person can act on. */
export class PictureTrouble extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PictureTrouble'
  }
}

/**
 * Decode whatever the picker handed over.
 *
 * `createImageBitmap` rather than an `<img>` and a data URL, for three
 * reasons: it can be told to apply the orientation flag, it decodes off the
 * main thread, and it fails *loudly* on a format the browser cannot read
 * instead of firing an error event that is easy to forget to listen for.
 *
 * The format that will actually turn up is **HEIC**, because that is what an
 * iPhone stores by default. Safari on iOS decodes it and this works. Chrome on
 * a desktop does not, and there is nothing this can do about that — so it says
 * so, by name, rather than failing with "could not load image", which would
 * send somebody hunting through their photo library for a corrupt file that is
 * perfectly fine.
 */
async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Some older browsers reject the options object rather than ignoring it.
    try {
      return await createImageBitmap(file)
    } catch {
      const heic = /hei[cf]/i.test(file.type) || file.type === ''
      throw new PictureTrouble(
        heic
          ? 'This browser cannot open HEIC pictures — the format iPhones use by ' +
            'default. It will work from the phone itself, or from a JPEG or PNG here.'
          : 'That file could not be opened as a picture.',
      )
    }
  }
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d', { willReadFrequently: false })
  if (!ctx) throw new PictureTrouble('This browser would not give us a canvas to work on.')
  return [canvas, ctx]
}

/**
 * Encode a canvas, and never wait forever for it.
 *
 * ---------------------------------------------------------------------------
 * **`toBlob` settles in a callback, so a browser that never calls it hangs the
 * whole thing with no error anywhere.** That is exactly what was happening
 * intermittently under software rendering: the picker returned, the screen came
 * up, and it sat on "getting it ready" indefinitely — no exception, no console
 * line, nothing to report. For the one action in this world that cannot be
 * retried by reloading, a silent hang is the worst possible failure.
 *
 * So every encode races a clock. If WebP does not answer, it falls back to
 * JPEG, which every canvas in existence can produce; if *that* does not answer,
 * it gives up with a sentence somebody can act on. The picture is worse in the
 * fallback and it exists, which is the right way round.
 * ---------------------------------------------------------------------------
 */
function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  within: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (blob: Blob | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(blob)
    }
    const timer = window.setTimeout(() => finish(null), within)
    try {
      canvas.toBlob((blob) => finish(blob), type, quality)
    } catch {
      finish(null)
    }
  })
}

async function toBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<{ blob: Blob; type: string; ext: string }> {
  const first = await encode(canvas, ENCODER.type, quality, 8_000)
  if (first) return { blob: first, type: ENCODER.type, ext: ENCODER.ext }

  if (ENCODER.type !== 'image/jpeg') {
    const fallback = await encode(canvas, 'image/jpeg', quality, 8_000)
    // Reported rather than assumed: the seam labels the object with this, and
    // the Storage rules check the label. A fallback stored as WebP would be
    // refused by the bucket, or served as the wrong type forever.
    if (fallback) return { blob: fallback, type: 'image/jpeg', ext: 'jpg' }
  }

  throw new PictureTrouble(
    'This browser would not finish saving that picture. Trying it again, or ' +
      'from your phone, usually works.',
  )
}

/** Two hex digits, always two. */
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/**
 * The colour a whole photograph is, from the sixteen-pixel version.
 *
 * Averaged in *linear* light rather than straight over the sRGB bytes. A flat
 * mean of encoded values is the classic way to turn a picture of a sunset into
 * mud: sRGB is a curve, and averaging along it pulls everything toward the
 * middle. This is the difference between a wall of coloured glass and a wall
 * of grey-brown glass, and it is four lines.
 */
function averageOf(pixels: Uint8ClampedArray): string {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < pixels.length; i += 4) {
    // Nearly transparent pixels are not a colour anybody meant.
    if (pixels[i + 3] < 8) continue
    r += Math.pow(pixels[i] / 255, 2.2)
    g += Math.pow(pixels[i + 1] / 255, 2.2)
    b += Math.pow(pixels[i + 2] / 255, 2.2)
    n++
  }
  if (n === 0) return '#4a4a4a'
  const back = (v: number) => Math.pow(v / n, 1 / 2.2) * 255
  return `#${hex(back(r))}${hex(back(g))}${hex(back(b))}`
}

/**
 * Take what the picker gave us and make the three things a memory is stored as.
 *
 * Nothing here touches the network and nothing here touches the seam. Throws
 * `PictureTrouble` with a sentence worth showing a person.
 */
export async function prepare(file: Blob): Promise<Prepared> {
  if (file.size > TOO_BIG) {
    throw new PictureTrouble(
      'That picture is enormous — over forty megabytes. Something smaller, or a ' +
        'photograph rather than a scan.',
    )
  }

  const source = await decode(file)
  try {
    if (source.width < 2 || source.height < 2) {
      throw new PictureTrouble('That picture has no size to it.')
    }

    /*
      Never scaled *up*. A small picture stays small and the pane is cut to it —
      blowing a 400-pixel photograph up to sixteen hundred would store four
      times the bytes for exactly the same picture, slightly softer.
    */
    const shrink = Math.min(1, LONGEST / Math.max(source.width, source.height))
    const width = Math.round(source.width * shrink)
    const height = Math.round(source.height * shrink)

    const [big, ctx] = canvasOf(width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    const encoded = await toBlob(big, QUALITY)

    // The sixteen-pixel version, drawn off the already-shrunk one so the
    // browser does the second reduction from something it has just drawn.
    const bw = width >= height ? BLUR : Math.max(1, Math.round((width / height) * BLUR))
    const bh = width >= height ? Math.max(1, Math.round((height / width) * BLUR)) : BLUR
    const [small, sctx] = canvasOf(bw, bh)
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(big, 0, 0, bw, bh)

    const tint = averageOf(sctx.getImageData(0, 0, bw, bh).data)
    // Quality 0.7 on a sixteen-pixel image is a few hundred bytes and there is
    // nothing in it fine enough to lose.
    /*
      The same encoder as the display copy, and this is not a preference.

      This was hardcoded to JPEG on the reasoning that sixteen pixels is
      sixteen pixels and universality beats forty bytes — which is a fine
      argument and was hiding a hang. `toDataURL` is *synchronous*: a browser
      that cannot produce the type asked for does not throw, it simply takes as
      long as it takes, and in one headless Chromium a JPEG encode measured
      here never came back at all while WebP finished in 223 milliseconds. The
      whole "leave a memory" flow sat on "getting it ready" forever, with no
      error to report, because of the *preview*.

      `ENCODER` is chosen by actually encoding a pixel, so this asks for the
      one format this browser has already proved it can write — and anything
      that can write a format can read it back into an `<img>`.
    */
    const blur = small.toDataURL(ENCODER.type, 0.7)

    big.width = 0
    big.height = 0
    small.width = 0
    small.height = 0

    return {
      display: encoded.blob,
      type: encoded.type,
      ext: encoded.ext,
      width,
      height,
      tint,
      blur,
    }
  } finally {
    source.close()
  }
}

/**
 * Open the device's picker and hand back one file.
 *
 * An input element made, used and dropped, rather than one living in the
 * document: a hidden `<input type="file">` that persists remembers its last
 * selection, so choosing the same picture twice in a row fires no change event
 * at all and looks exactly like a broken button.
 *
 * Resolves to null when nothing was chosen. There is no reliable "cancelled"
 * event across browsers, so a cancel simply never resolves the promise and the
 * element is collected — which is fine, because the caller treats "no file
 * yet" and "changed their mind" the same way.
 */
export function pickPicture(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    // `image/*` and not a list of extensions: an iPhone offers the photo
    // library for this and a file browser for a list, and the photo library is
    // the entire point.
    input.accept = 'image/*'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.append(input)

    const done = (file: File | null) => {
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true })
    // Supported where it is supported, ignored where it is not. Without it a
    // cancelled picker leaves a promise hanging forever, which is harmless but
    // means the invitation stays in its waiting state.
    input.addEventListener('cancel', () => done(null), { once: true })
    input.click()
  })
}
