/**
 * YouTube, kept behind one door.
 *
 * ---------------------------------------------------------------------------
 * Two things live here and nothing else does: the player, and the search. Both
 * are somebody else's service, and the point of putting them together in one
 * file is that everything about *them* — a script that has to be on the page, a
 * global callback, an API key that may not exist, a shape of JSON that is not
 * ours — stops here and does not leak into the garden.
 *
 * **The player is deliberately not a React component.** A YouTube iframe that
 * unmounts stops playing, and the whole point of the tucked pane is that the
 * video keeps going while you walk around the garden. So it is created once,
 * imperatively, into an element that is never thrown away, and React only ever
 * moves and resizes the box around it.
 *
 * **The search needs a key and may not have one.** `VITE_YOUTUBE_API_KEY` is a
 * browser credential for YouTube's Data API. Without it, searching is off and
 * says so — but pasting a link still works, because a link needs nobody's
 * permission. That asymmetry is on purpose: a missing key should cost you the
 * convenience, not the feature.
 * ---------------------------------------------------------------------------
 */

/** What a search comes back with. Ours, not YouTube's shape. */
export interface Found {
  videoId: string
  title: string
  channel: string
  /** The small still. Empty when the response had none. */
  thumb: string
}

/**
 * The states a screen reports.
 *
 * YouTube's numbers, and they are now a vocabulary rather than an
 * implementation detail: `systems/film` is a second `Screen` over a plain
 * `<video>` element, and the sync loop that reads these does not know which of
 * the two it is holding. So they are named here and spoken by both.
 *
 * `BUFFERING` was previously only a bare 3 at the one place that tests for it
 * — `setJoined`, where "we asked it to play and it is loading" must not read
 * as "this device refused to play". A second implementation has to be able to
 * say that, so it needs a name.
 */
export const PLAYING = 1
export const PAUSED = 2
export const ENDED = 0
export const BUFFERING = 3

interface YTPlayer {
  loadVideoById(id: string, start?: number): void
  cueVideoById(id: string, start?: number): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setPlaybackRate(rate: number): void
  setVolume(volume: number): void
  /** Caption-module methods exist on the iframe player but are not stable API. */
  getOption?(module: string, option: string): unknown
  setOption?(module: string, option: string, value: unknown): void
  loadModule?(module: string): void
  unloadModule?(module: string): void
  destroy(): void
}

interface YT {
  Player: new (
    host: HTMLElement | string,
    options: {
      videoId?: string
      host?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?(event: { target: YTPlayer }): void
        onStateChange?(event: { data: number; target: YTPlayer }): void
        onError?(event: { data: number }): void
        onApiChange?(event: { target: YTPlayer }): void
      }
    },
  ) => YTPlayer
}

type Host = typeof globalThis & {
  YT?: YT
  onYouTubeIframeAPIReady?: () => void
}

let loading: Promise<YT> | null = null

/**
 * Put YouTube's script on the page, once.
 *
 * It announces itself through a global callback rather than a promise, and it
 * can only be asked for once per page — so this holds the one promise and hands
 * the same one to everybody. The callback is chained rather than replaced in
 * case anything else ever wants it.
 */
function loadApi(): Promise<YT> {
  const host = globalThis as Host
  if (host.YT?.Player) return Promise.resolve(host.YT)
  if (loading) return loading

  loading = new Promise<YT>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady
    host.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (host.YT?.Player) resolve(host.YT)
      else reject(new Error('YouTube loaded without a player'))
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => reject(new Error('YouTube’s player could not be reached'))
    document.head.append(tag)
  })
  return loading
}

export interface Screen {
  /** Put a video on, at a position, playing or not. */
  show(videoId: string, at: number, playing: boolean): void
  play(): void
  pause(): void
  seek(seconds: number): void
  /** Where the picture actually is, right now. */
  where(): number
  /** How long the whole thing is, or 0 before that is known. */
  length(): number
  state(): number
  /** 1 is normal. Used only to close a small gap; see `correction`. */
  rate(rate: number): void
  loud(volume: number): void
  /** Captions are a local viewing preference, never shared with the other screen. */
  captions(showing: boolean): void
  stop(): void
}

/**
 * Build the screen inside `host`.
 *
 * `onState` fires for YouTube's own transitions — the ones that were *not*
 * asked for are the interesting ones, because they are the video ending, or a
 * phone's own controls being used.
 */
export async function makeScreen(
  host: HTMLElement,
  /*
    What it should be showing the moment it exists.

    Not optional, and not left until afterwards. A player built empty asks
    YouTube for `/embed/` with no id, which is a real request that really fails
    — error 2, "that link isn't a video" — and the message lands on screen a
    beat before the video that was always going to replace it. Handing it the
    video at construction means the first thing it ever does is the right thing.
  */
  first: { videoId: string | null; at: number; playing: boolean },
  onState: (state: number) => void,
  onTrouble: (why: string) => void,
): Promise<Screen> {
  const YT = await loadApi()
  let ready = false
  let captionsWanted = false
  let lastCaptionTrack: Record<string, unknown> | null = null
  /** Held until the player says it is ready, then applied in one go. */
  let waiting: { videoId: string; at: number; playing: boolean } | null = null

  /*
    ------------------------------------------------------------------------
    **The host is `www.youtube.com`, and it must stay that way.**

    The obvious "privacy improvement" here is `youtube-nocookie.com`, and it
    would be a mistake: no cookie means no session, no session means YouTube
    has no idea either of you pays it, and a Premium account would be served
    ads inside a garden built for two people. The embed is not tracking anybody
    on our behalf — it is how it recognises its own subscriber.

    Whether that cookie survives at all is the browser's decision, not ours:
    Safari severs third-party cookies by default, and an installed web app on
    iOS keeps its own storage jar, so a login in Safari does not reach it. The
    most this file can do is not make it *impossible*, which is this line.
    ------------------------------------------------------------------------
  */
  const player: YTPlayer = new YT.Player(host, {
    ...(first.videoId !== null ? { videoId: first.videoId } : {}),
    playerVars: {
      start: Math.max(0, Math.floor(first.at)),
      autoplay: first.playing ? 1 : 0,
      // No related videos from other channels at the end, no YouTube branding
      // beyond what is required, and our own controls — the garden's, not
      // theirs. `playsinline` is what stops iOS taking the video fullscreen
      // and putting its own player over the whole conversation.
      rel: 0,
      modestbranding: 1,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
      fs: 0,
      // YouTube otherwise restores the viewer's own "captions on" preference.
      // Zero is only the first line of defence; `captions()` reapplies the
      // choice after the caption module and each new video have loaded.
      cc_load_policy: 0,
      iv_load_policy: 3,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        ready = true
        applyCaptionPreference()
        if (first.videoId !== null && waiting === null) {
          // Whatever it was built with is now however long ago; the sync loop
          // will place it exactly, but starting from the right second beats
          // starting from zero and being seeked.
          if (first.playing) player.playVideo()
        }
        if (waiting) {
          const { videoId, at, playing } = waiting
          waiting = null
          apply(videoId, at, playing)
        }
      },
      onApiChange: () => applyCaptionPreference(),
      onStateChange: (event) => onState(event.data),
      onError: (event) => {
        /*
          YouTube's four refusals, in words.

          They are not interchangeable and the difference is the whole
          usefulness of the message: two of them mean *this video* cannot be
          embedded anywhere and there is nothing to try again, which is
          something you want to be told before you paste it a second time.
        */
        const why =
          event.data === 2 ? 'that link isn’t a video'
          : event.data === 5 ? 'this one won’t play in an embedded screen'
          : event.data === 100 ? 'that video is gone, or private'
          : 'the owner of that video doesn’t allow it to be played here'
        onTrouble(why)
      },
    },
  })

  function apply(videoId: string, at: number, playing: boolean) {
    if (playing) player.loadVideoById(videoId, at)
    else player.cueVideoById(videoId, at)
  }

  /*
    YouTube hides its native CC switch with `controls: 0`, and its currently
    documented caption options only cover size and reload. The iframe still
    exposes its long-standing caption track module, so this bridge uses it
    defensively: every call is optional and guarded, and failure never affects
    playback. `onApiChange` is important because a new video's caption module
    arrives after the video itself.
  */
  function applyCaptionPreference() {
    if (!ready || !player.setOption) return
    try {
      if (!captionsWanted) {
        const current = player.getOption?.('captions', 'track')
        if (current && typeof current === 'object' && Object.keys(current).length > 0) {
          lastCaptionTrack = current as Record<string, unknown>
        }
        player.setOption('captions', 'track', {})
        return
      }

      const listed = player.getOption?.('captions', 'tracklist')
      const tracks = Array.isArray(listed)
        ? listed.filter((track): track is Record<string, unknown> => Boolean(track) && typeof track === 'object')
        : []
      const preferred = lastCaptionTrack
        ?? tracks.find((track) => track.languageCode === 'en')
        ?? tracks[0]
      if (preferred) player.setOption('captions', 'track', preferred)
    } catch {
      /* An iframe version without the private track option simply ignores CC. */
    }
  }

  function chooseCaptions(showing: boolean) {
    captionsWanted = showing
    if (!ready) return
    try {
      if (showing) player.loadModule?.('captions')
      applyCaptionPreference()
      if (!showing) player.unloadModule?.('captions')
    } catch {
      /* Captions are optional; no caption failure is allowed to stop the film. */
    }
  }

  const safe = <T,>(read: () => T, fallback: T): T => {
    // The iframe answers nothing between being torn down and being gone, and
    // between being made and being ready. Neither is worth an exception.
    try {
      return ready ? read() : fallback
    } catch {
      return fallback
    }
  }

  return {
    show(videoId, at, playing) {
      if (!ready) {
        waiting = { videoId, at, playing }
        return
      }
      apply(videoId, at, playing)
    },
    play() {
      if (ready) player.playVideo()
      else if (waiting) waiting.playing = true
    },
    pause() {
      if (ready) player.pauseVideo()
      else if (waiting) waiting.playing = false
    },
    seek(seconds) {
      if (ready) player.seekTo(Math.max(0, seconds), true)
      else if (waiting) waiting.at = Math.max(0, seconds)
    },
    where: () => safe(() => player.getCurrentTime(), 0),
    length: () => safe(() => player.getDuration(), 0),
    state: () => safe(() => player.getPlayerState(), -1),
    rate: (rate) => {
      if (ready) safe(() => player.setPlaybackRate(rate), undefined)
    },
    loud: (volume) => {
      if (ready) safe(() => player.setVolume(Math.round(volume * 100)), undefined)
    },
    captions: chooseCaptions,
    stop() {
      ready = false
      try {
        player.destroy()
      } catch {
        /* already gone */
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Looking things up
// ---------------------------------------------------------------------------

/**
 * The key, or null.
 *
 * Read here rather than in `config` because this is the only thing that wants
 * it, and because it is genuinely optional — everything in `config` is required
 * and fails loudly by name, which is right for the things the garden cannot
 * open without and wrong for this.
 */
export const SEARCH_KEY: string | null =
  (import.meta.env?.VITE_YOUTUBE_API_KEY as string | undefined)?.trim() || null

export const canSearch = SEARCH_KEY !== null

/**
 * Ask YouTube for videos matching some words.
 *
 * Throws with something a person can read. The caller shows it; nothing here
 * decides how a failure looks.
 */
export async function search(words: string, signal?: AbortSignal): Promise<Found[]> {
  if (SEARCH_KEY === null) {
    throw new Error('Searching needs a YouTube key. Paste a link instead.')
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  // Embeddable only. Offering something that cannot play in the screen it is
  // being searched from is offering a dead end.
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('videoSyndicated', 'true')
  url.searchParams.set('safeSearch', 'moderate')
  url.searchParams.set('maxResults', '14')
  url.searchParams.set('q', words)
  url.searchParams.set('key', SEARCH_KEY)

  const answer = await fetch(url, { signal })
  if (!answer.ok) {
    /*
      The one failure worth naming, because it is the one that will happen.

      A free Data API key has a daily quota and a search costs a hundred units
      of it. Running out looks exactly like every other refusal unless somebody
      says so, and "try again tomorrow" is a very different instruction from
      "your key is wrong".
    */
    if (answer.status === 403) {
      throw new Error('YouTube turned the search down — the key’s daily quota is likely spent.')
    }
    throw new Error(`YouTube couldn’t search just now (${answer.status}).`)
  }
  const body = (await answer.json()) as {
    items?: { id?: { videoId?: string }; snippet?: Record<string, unknown> }[]
  }
  return (body.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId
    if (typeof videoId !== 'string' || videoId === '') return []
    const snippet = item.snippet ?? {}
    const thumbs = (snippet.thumbnails ?? {}) as Record<string, { url?: string }>
    return [{
      videoId,
      // YouTube sends titles HTML-escaped, and they are put in the DOM as text
      // — so `&amp;` would sit there visibly in a song name.
      title: unescape(String(snippet.title ?? '')),
      channel: unescape(String(snippet.channelTitle ?? '')),
      thumb: thumbs.medium?.url ?? thumbs.default?.url ?? '',
    }]
  })
}

/**
 * What a video is called, without an API key.
 *
 * ---------------------------------------------------------------------------
 * oEmbed is a public endpoint and asks for nothing — no key, no quota, no
 * account. It exists so that any page can render a link to a video sensibly,
 * and that is exactly what is wanted here: somebody pastes a link, and the
 * queue should say *Daisies* rather than the URL they pasted.
 *
 * Best effort on purpose. A title is a nicety and a queue that failed to accept
 * a video because its name could not be looked up would be a much worse thing
 * than one that occasionally shows eleven characters.
 * ---------------------------------------------------------------------------
 */
export async function titleOf(videoId: string): Promise<string> {
  try {
    const url = new URL('https://www.youtube.com/oembed')
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)
    url.searchParams.set('format', 'json')
    const answer = await fetch(url)
    if (!answer.ok) return ''
    const body = (await answer.json()) as { title?: unknown }
    return typeof body.title === 'string' ? body.title : ''
  } catch {
    return ''
  }
}

function unescape(text: string): string {
  const box = document.createElement('textarea')
  box.innerHTML = text
  return box.value
}
