/**
 * A film off your own disk, and the two of you watching it at the same second.
 *
 * ---------------------------------------------------------------------------
 * **Nothing here is uploaded, streamed, or sent anywhere.** The file stays on
 * the machine it is already on. What crosses between the two of you is what
 * has always crossed — the anchor in `systems/watching`: which film, where in
 * it, playing or not, and who moved it last. Four numbers and a string, the
 * same ones a YouTube video uses.
 *
 * That is the whole idea, and it is why this is a small file rather than a
 * large one. The hard part — keeping two people on the same second across a
 * bad connection — was solved for the shared screen and does not care what is
 * playing. `Screen` in `systems/youtube` is an interface; a `<video>` element
 * satisfies it more easily than an iframe does.
 *
 * The alternatives were both worse for the two people this is for:
 *
 * **Uploading it unlisted to YouTube.** Content ID scans every upload whatever
 * its visibility, so a commercial film is matched and blocked — often days
 * later, in the middle of an evening — and it is the account you sign into
 * everything with that takes the strike. Hours of upload for that.
 *
 * **Putting it in cloud storage.** It works and it is expensive in the way
 * that matters here: the file goes up once and then comes *down twice*, so a
 * three-gigabyte film costs nine gigabytes of somebody's data to watch, on two
 * connections in Kano and Lagos, for a file that was already sitting on the
 * disk.
 *
 * So: both of you already have it, and only the clock is shared.
 *
 * **The one thing this cannot do for you is make sure you have the same file.**
 * A film downloaded twice from two places is two different files — different
 * lengths, different intros, different everything — and 1:42:10 on one is not
 * 1:42:10 on the other. That is what `fingerprint` is for, and when it says no
 * the answer is to say so plainly and offer the nudge, not to refuse.
 * ---------------------------------------------------------------------------
 */

import { BUFFERING, ENDED, PAUSED, PLAYING, type Screen } from './youtube'

// ---------------------------------------------------------------------------
// Which film, as a string the anchor can carry
// ---------------------------------------------------------------------------

/**
 * The mark that tells a film from a video.
 *
 * The anchor has one field for "what is on" and it is a string, so this rides
 * in it rather than beside it — no second field, nothing to add to the wire,
 * nothing to migrate, and a queue can hold both kinds at once. A YouTube id is
 * exactly eleven characters of `[\w-]` (see `ID` in `systems/watching`), so a
 * value carrying a colon cannot be mistaken for one in either direction.
 */
const MARK = 'film:'

export function filmId(print: string): string {
  return MARK + print
}

export function isFilm(videoId: string | null | undefined): boolean {
  return typeof videoId === 'string' && videoId.startsWith(MARK)
}

/** The fingerprint inside a film id, or null if that is not what this is. */
export function printIn(videoId: string | null | undefined): string | null {
  return isFilm(videoId) ? (videoId as string).slice(MARK.length) : null
}

// ---------------------------------------------------------------------------
// Is this the same file?
// ---------------------------------------------------------------------------

/** A megabyte. Three of them are read, wherever the film is. */
const SLICE = 1024 * 1024

/**
 * A hash that is deliberately not a cryptographic one.
 *
 * ---------------------------------------------------------------------------
 * The obvious choice is `crypto.subtle.digest`, and it is the wrong one here
 * for a reason this repository has already paid for once: **`crypto.subtle` is
 * `[SecureContext]`**, so it is `undefined` on any plain-http origin that is
 * not localhost. The dev server is bound to the LAN so the garden can be
 * opened on a phone, a phone reaches it at `http://192.168.x.x`, and that is
 * not a secure context. `data/ids.ts` exists entirely because of the same trap
 * with `crypto.randomUUID`, and the failure was silent both times.
 *
 * Nothing here needs to resist an adversary. The question is "are these two
 * files the same file", asked of two people who are both trying to answer yes.
 * FNV-1a over three megabytes, twice with different seeds, is sixty-four bits
 * of answer — and it is carried alongside the exact byte count, which is by
 * itself enough to separate almost any two encodes of the same film.
 * ---------------------------------------------------------------------------
 */
function mix(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')

/**
 * Three slices, not the whole film.
 *
 * Reading four gigabytes to answer a yes/no question would take long enough
 * that somebody would go and do something else, and it buys nothing. The
 * middle slice is the one that earns its place: two rips of the same film
 * often share a great deal of their opening — the same container defaults, the
 * same leading black — and differ everywhere it matters.
 */
async function slices(file: File): Promise<Uint8Array> {
  if (file.size <= SLICE * 3) {
    return new Uint8Array(await file.arrayBuffer())
  }
  const middle = Math.floor(file.size / 2 - SLICE / 2)
  const parts = await Promise.all([
    file.slice(0, SLICE).arrayBuffer(),
    file.slice(middle, middle + SLICE).arrayBuffer(),
    file.slice(file.size - SLICE).arrayBuffer(),
  ])
  const all = new Uint8Array(SLICE * 3)
  parts.forEach((part, i) => all.set(new Uint8Array(part), SLICE * i))
  return all
}

/**
 * What these bytes are, in a string short enough to put in a document.
 *
 * The size leads, in base 36, because it is the part a person can sanity-check
 * against their own file and the part that is *never* equal for two different
 * encodes. The hash settles the rest.
 */
export async function fingerprint(file: File): Promise<string> {
  const bytes = await slices(file)
  return `${file.size.toString(36)}-${hex(mix(bytes, 0x811c9dc5))}${hex(mix(bytes, 0x27d4eb2f))}`
}

/** The shape `fingerprint` makes: a base-36 size, a dash, sixty-four bits of hash. */
const PRINT = /^[0-9a-z]+-[0-9a-f]{16}$/

/**
 * The byte count inside a fingerprint, for saying *how* two files differ.
 *
 * The whole string is checked rather than the part being read, because base 36
 * has no invalid letters: `parseInt('nonsense', 36)` is a perfectly good
 * number, and without this a fingerprint that was never one would be reported
 * as a film of some absurd size rather than as nothing known.
 */
export function sizeIn(print: string): number {
  if (!PRINT.test(print)) return 0
  const size = Number.parseInt(print.split('-')[0] ?? '', 36)
  return Number.isFinite(size) ? size : 0
}

// ---------------------------------------------------------------------------
// Will it open at all?
// ---------------------------------------------------------------------------

/**
 * Containers no browser will open, and the sentence to say about each.
 *
 * ---------------------------------------------------------------------------
 * **This is the difference between a two-minute fix and a ruined evening.** A
 * browser handed a file it cannot decode shows a black rectangle and says
 * nothing, and a black rectangle is indistinguishable from a bug in this app,
 * a bad download, or a broken sync. Naming the reason turns it into an errand.
 *
 * The common case by far is a film in a Matroska container — most of what gets
 * downloaded is — and it is also the cheapest to fix, because the video and
 * audio inside are usually fine and only the wrapper is wrong. Repacking is
 * seconds and loses nothing:
 *
 *     ffmpeg -i film.mkv -c copy film.mp4
 *
 * The message says the shape of the fix rather than that command, because only
 * one of the two people this is for would want to be handed a command line.
 * ---------------------------------------------------------------------------
 */
const HOPELESS: Record<string, string> = {
  mkv: 'an .mkv',
  avi: 'an .avi',
  wmv: 'a .wmv',
  flv: 'a .flv',
  vob: 'a .vob',
  mpg: 'an .mpg',
  mpeg: 'an .mpeg',
  rmvb: 'an .rmvb',
  divx: 'a .divx',
  ogm: 'an .ogm',
  ts: 'a .ts',
  m2ts: 'an .m2ts',
}

/** The extension, lowercased, with no dot. Empty when there is not one. */
export function endsIn(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Why this file will not open, in a sentence, or null if it should be fine.
 *
 * Asked *before* the file is put on, so the trouble lands on the person who
 * chose it rather than on both of you a moment later.
 */
export function whyItWontOpen(file: File): string | null {
  const kind = HOPELESS[endsIn(file.name)]
  if (!kind) return null
  return `That is ${kind}, and a browser cannot open one. It needs to be an .mp4 — converting it does not lose any quality and usually takes about a minute.`
}

/** What a `MediaError` actually means, in words worth reading. */
function whyItStopped(code: number | undefined): string {
  if (code === 4) {
    return 'This file’s video or sound is not something a browser can play — most often that is HEVC (x265) video or AC3 sound. An .mp4 with H.264 video and AAC sound plays everywhere.'
  }
  if (code === 3) return 'This file will not decode. It may have finished downloading badly.'
  if (code === 2) return 'The file stopped being readable. If it is on a drive, check it is still plugged in.'
  return 'This file would not play.'
}

// ---------------------------------------------------------------------------
// What has been picked, on this device
// ---------------------------------------------------------------------------

export interface Film {
  /** The fingerprint of these bytes — not necessarily the anchor's. */
  print: string
  /** The name it was cleaned up into. */
  title: string
  /** What the file was actually called, for saying which one is loaded. */
  name: string
  size: number
  /** Seconds. Zero when the browser would not say, which means it will not play. */
  span: number
  /** Null when it opened; a sentence when it did not. */
  why: string | null
  url: string
}

/**
 * A filename, as something a person would call it.
 *
 * `The.Client.1996.720p.BluRay.x264-GROUP.mp4` is what the file is called and
 * is not what the film is called. This does not try to be clever about it —
 * cleverness here means guessing wrong about a title that genuinely contains
 * a number — it only undoes the two things every release name does: separators
 * that are not spaces, and an extension.
 */
export function titleFromName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return stem.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim() || name
}

/**
 * What this device can play, by the fingerprint the *anchor* is carrying.
 *
 * Keyed on the anchor's print rather than the file's on purpose. When the two
 * of you have different rips of the same film, hers is a perfectly good answer
 * to "what should be on this screen" even though its bytes are not his — so
 * the map is from *the film that is on* to *the copy this machine has of it*,
 * and the two are allowed to disagree. What they disagree by is the offset,
 * which lives with the rest of the per-device viewing settings.
 */
const held = new Map<string, Film>()

export function holdFilm(anchorPrint: string, film: Film): void {
  const already = held.get(anchorPrint)
  if (already && already.url !== film.url) URL.revokeObjectURL(already.url)
  held.set(anchorPrint, film)
}

export function filmFor(anchorPrint: string | null): Film | null {
  if (anchorPrint === null) return null
  return held.get(anchorPrint) ?? null
}

/** Let go of every file, and of the memory each one is holding open. */
export function forgetFilms(): void {
  for (const film of held.values()) URL.revokeObjectURL(film.url)
  held.clear()
}

/**
 * Open a picked file far enough to know whether it is any good.
 *
 * ---------------------------------------------------------------------------
 * Deliberately more than a fingerprint. Putting a film on is a thing that
 * reaches *her* screen, so everything that can be found out about it has to be
 * found out first: that the container is one a browser opens, that it decodes,
 * and how long it is. A film that fails after it has been put on has failed in
 * front of two people instead of one.
 *
 * The length is the other half of the mismatch question. Two files with
 * different fingerprints and the same running time are almost always the same
 * film encoded twice; two files with different running times are not the same
 * thing at all, and that is a much stronger statement than either fact alone.
 * ---------------------------------------------------------------------------
 */
export async function readFilm(file: File): Promise<Film> {
  const [print, refused] = [await fingerprint(file), whyItWontOpen(file)]
  const film: Film = {
    print,
    title: titleFromName(file.name),
    name: file.name,
    size: file.size,
    span: 0,
    why: refused,
    url: '',
  }
  /*
    No URL for a file that is not going to be played.

    An object URL holds its file open until it is revoked, and a refused one is
    never held anywhere — `holdFilm` is only reached once `why` is null — so
    creating it before the container check leaked one per rejected file, which
    on the evening somebody is working out which of their four rips will open
    is four films pinned in memory for nothing.
  */
  if (refused !== null) return film
  const url = URL.createObjectURL(file)
  film.url = url

  film.span = await new Promise<number>((settle) => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.muted = true
    /*
      Torn down whichever way it goes, and only once. A probe left behind holds
      the whole file open, and a film is not a small thing to hold open.
    */
    let done = false
    const finish = (span: number, why: string | null) => {
      if (done) return
      done = true
      film.why = why
      probe.removeAttribute('src')
      probe.load()
      window.clearTimeout(patience)
      settle(span)
    }
    probe.onloadedmetadata = () =>
      finish(Number.isFinite(probe.duration) ? probe.duration : 0, null)
    probe.onerror = () => finish(0, whyItStopped(probe.error?.code))
    /*
      A file that neither opens nor errors is a real state — a container the
      browser half-recognises, or a truncated download — and without this it
      would sit on "checking" for ever.
    */
    const patience = window.setTimeout(
      () => finish(0, 'This file did not open. It may not have finished downloading.'),
      12_000,
    )
    probe.src = url
  })

  /*
    And nothing is held open for a file that would not decode either.

    The probe answers with a reason instead of a length, and the caller returns
    on that reason without ever handing the film to `holdFilm` — so this is the
    last place that can let go of it.
  */
  if (film.why !== null) {
    URL.revokeObjectURL(url)
    film.url = ''
  }

  return film
}

// ---------------------------------------------------------------------------
// Two different rips of the same film
// ---------------------------------------------------------------------------

const OFFSET_KEY = 'garden:film-offset:v1'

/**
 * How far this device's copy runs ahead of the one the anchor is counting in.
 *
 * ---------------------------------------------------------------------------
 * **This is the feature that makes the whole thing usable, and it exists
 * because of one sentence: you will download the film separately.**
 *
 * Two people who each fetch "the same film" from wherever they fetch things
 * end up with two encodes that are not the same length. One has a distributor
 * card at the front, one starts on black for four seconds, one is the
 * theatrical cut. They are the same film and 1:42:10 is not the same moment in
 * both, and no amount of clock synchronising can fix that — it is not a
 * clock problem, it is a *different film file* problem.
 *
 * So the shared anchor stays in one timeline — whoever put it on — and each
 * device keeps its own translation into its own copy. Nudge until her laugh
 * lands where yours does, and it stays nudged: it is per film and per device,
 * kept beside the other facts about your own screen rather than sent, for the
 * same reason the volume faders and the tucked pane's position are.
 *
 * Zero for a matching file, and then every line of arithmetic below it is the
 * identity it always was.
 * ---------------------------------------------------------------------------
 */
function offsets(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function savedOffset(print: string | null): number {
  if (print === null) return 0
  const held = offsets()[print]
  return Number.isFinite(held) ? (held as number) : 0
}

export function putOffset(print: string, seconds: number): void {
  const next = { ...offsets() }
  if (seconds === 0) delete next[print]
  else next[print] = seconds
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(next))
  } catch {
    /* It still holds for tonight. */
  }
}

/** `+4s` / `−1m 20s`, for a control whose whole job is to be read at a glance. */
export function offsetWords(seconds: number): string {
  if (seconds === 0) return 'lined up'
  const sign = seconds < 0 ? '−' : '+'
  const whole = Math.round(Math.abs(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return m > 0 ? `${sign}${m}m ${s}s` : `${sign}${s}s`
}

// ---------------------------------------------------------------------------
// The screen itself
// ---------------------------------------------------------------------------

/**
 * A `Screen` over a plain `<video>` element.
 *
 * ---------------------------------------------------------------------------
 * Every method here means the same thing it means in `systems/youtube`,
 * including the parts that look arbitrary, because the sync loop reads them
 * and does not know which kind of screen it has:
 *
 * - **`length()` returns 0 until the film is open.** The loop uses exactly
 *   that to know when not to correct — see the long note beside it about
 *   adverts. `video.duration` is `NaN` before metadata, and `NaN` would sail
 *   straight through a `<= 0` test.
 * - **`state()` speaks YouTube's numbers**, because that is the vocabulary the
 *   loop and the press-detection are written in.
 * - **`show()` takes an id, not a file.** Which film is on is shared; which
 *   copy of it this machine has is not. So the id is looked up in `held`, and
 *   a miss is not an error — it is the ordinary state of the other person's
 *   device before they have chosen their copy.
 * ---------------------------------------------------------------------------
 */
export async function makeFilmScreen(
  host: HTMLElement,
  first: { videoId: string | null; at: number; playing: boolean },
  onState: (state: number) => void,
  onTrouble: (why: string) => void,
): Promise<Screen> {
  const video = document.createElement('video')
  video.className = 'film-picture'
  video.playsInline = true
  video.preload = 'auto'
  video.controls = false
  /*
    Silent until told otherwise, and the telling is not optional.

    The garden's music fader owns this and reaches it through `loud`. Starting
    at zero rather than one means a film cannot be briefly louder than the room
    — but it also means a film whose volume is never set plays in silence,
    which is exactly what happened: `loud` had a single caller, an effect on
    the fader, and that effect first runs while this screen is still being
    built asynchronously, so the call went nowhere. YouTube survived the same
    gap by defaulting to full volume.

    `ui/Together` now applies the fader in the same breath as the captions,
    where the screen is known to exist. If that line is ever removed, this line
    is what makes the film silent, and the two belong together.
  */
  video.volume = 0
  host.append(video)

  /** What is loaded, so the same film is not reloaded onto itself. */
  let showing: string | null = null
  /** Held until metadata arrives, because seeking before that does nothing. */
  let waiting: { at: number; playing: boolean } | null = null
  let gone = false

  const tell = (state: number) => {
    if (!gone) onState(state)
  }

  video.addEventListener('playing', () => tell(PLAYING))
  video.addEventListener('pause', () => {
    // A film reaching its end pauses on the way. That is the end, not a press.
    if (!video.ended) tell(PAUSED)
  })
  video.addEventListener('ended', () => tell(ENDED))
  video.addEventListener('waiting', () => tell(BUFFERING))
  video.addEventListener('error', () => {
    if (gone) return
    onTrouble(whyItStopped(video.error?.code))
  })
  video.addEventListener('loadedmetadata', () => {
    if (!waiting) return
    const { at, playing } = waiting
    waiting = null
    if (at > 0) video.currentTime = at
    if (playing) void video.play().catch(() => {
      /* Refused until this device has been touched; `joined` says so on screen. */
    })
  })

  const apply = (videoId: string, at: number, playing: boolean) => {
    const film = filmFor(printIn(videoId))
    if (!film) {
      // Not trouble. The other person simply has not chosen their copy yet,
      // and the screen has a whole invitation for that case.
      showing = null
      video.removeAttribute('src')
      video.load()
      return
    }
    if (film.why !== null) {
      onTrouble(film.why)
      return
    }
    if (showing === videoId && video.src === film.url) {
      if (at > 0) video.currentTime = at
      if (playing) void video.play().catch(() => {})
      else video.pause()
      return
    }
    showing = videoId
    waiting = { at, playing }
    video.src = film.url
    video.load()
  }

  if (first.videoId !== null) apply(first.videoId, Math.max(0, first.at), first.playing)

  return {
    show(videoId, at, playing) {
      apply(videoId, Math.max(0, at), playing)
    },
    play() {
      if (waiting) {
        waiting.playing = true
        return
      }
      void video.play().catch(() => {})
    },
    pause() {
      if (waiting) {
        waiting.playing = false
        return
      }
      video.pause()
    },
    seek(seconds) {
      const at = Math.max(0, seconds)
      if (waiting) {
        waiting.at = at
        return
      }
      video.currentTime = at
    },
    where: () => (Number.isFinite(video.currentTime) ? video.currentTime : 0),
    // Zero, never NaN — the sync loop tests `<= 0` and NaN passes every test.
    length: () => (Number.isFinite(video.duration) ? video.duration : 0),
    state() {
      if (video.error) return -1
      if (video.ended) return ENDED
      if (showing === null) return -1
      if (video.seeking || video.readyState < 3) return BUFFERING
      return video.paused ? PAUSED : PLAYING
    },
    rate(rate) {
      // The drift correction nudges by a few per cent; a `<video>` takes that
      // far more gracefully than an iframe does, with no pitch artefacts.
      video.playbackRate = Math.max(0.25, Math.min(4, rate))
    },
    loud(volume) {
      video.volume = Math.max(0, Math.min(1, volume))
    },
    captions() {
      /*
        Nothing yet, and it says nothing rather than pretending.

        An `.mp4` almost never carries a subtitle track a browser will show,
        and the real answer — a separate `.srt` chosen alongside the film,
        converted to WebVTT and attached as a `<track>` — is a feature of its
        own rather than a line here. Until then the control is hidden for a
        film rather than offered and ignored; see `Transport` in `ui/Together`.
      */
    },
    stop() {
      gone = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    },
  }
}
