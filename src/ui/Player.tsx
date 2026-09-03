/**
 * The music.
 *
 * **Not a place.** The Grove was going to be a fifth section and that was the
 * wrong shape: music is not somewhere you go, it is something playing while
 * you are somewhere else. A section would have meant leaving the Tree to
 * change a song, and no music at all while you wrote one. So it lives with
 * you, folded away in the corner, everywhere in the garden.
 *
 * Folded, it is the title of what is playing and four small bars keeping time
 * — sound made visible, which is a real thing rather than a rectangle with
 * controls in it. Opened, it grows upward into the list: every track as a line
 * of text on the world, the one playing lit, a beam of light underneath it for
 * how far it has got. No panel, no card, no border, per the design law.
 *
 * The audio itself is one `<audio>` element driven from the anchor in
 * `systems/listening`. It has no `src` until real files are uploaded, and
 * everything else — the list, the transport, the two-device sync — runs on the
 * clock regardless, so the day the files land it simply makes sound.
 */

import { useEffect, useRef } from 'react'
import { gainOf, levelsNow, useVolume } from '@/systems/volume'
import { useData, useWorldSlice } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import {
  clock,
  current,
  inStep,
  positionOf,
  progressOf,
  step,
  useListening,
} from '@/systems/listening'
import type { Listening } from '@/data/types'
import { useDismissOutside } from './useDismissOutside'
import { shortTitle, useWatching } from '@/systems/watching'

/**
 * How many songs the list shows before it starts scrolling.
 *
 * Here only to know whether to draw the fade at the bottom — the height itself
 * is `--player-row` in the stylesheet, because it is a measurement of type and
 * padding and belongs where those are. If one moves, move the other.
 */
const SHOWN = 5

export function Player() {
  const data = useData()
  const me = data.me
  const presence = useWorldSlice((s) => s.presence)
  const profiles = useWorldSlice((s) => s.profiles)

  const tracks = useListening((s) => s.tracks)
  const together = useListening((s) => s.together)
  const apart = useListening((s) => s.apart)
  const open = useListening((s) => s.open)
  const toggleOpen = useListening((s) => s.toggleOpen)
  const close = useListening((s) => s.close)
  const panel = useRef<HTMLDivElement>(null)

  useDismissOutside(open, close, [panel])

  // Re-read as a whole so `current` sees a consistent pair.
  const anchor = useListening(current)
  const silenced = useListening((s) => s.silenced)

  /*
    What this device is actually doing, as opposed to what the anchor says.

    The two differ in exactly one situation: you drove onto a road and the race
    stopped the music here — see `silenced` in `systems/listening`. Everything
    below reads *this* rather than `anchor.playing`, and that includes the bars
    and the ▶, because a player drawing itself as playing while it makes no
    sound is the interface lying about the one thing it exists to report.

    Her copy is untouched. If the two of you are in step, the shared anchor
    still says playing, her phone is still playing it, and the moment you press
    play in here you are back in the same second of the same song as her.
  */
  const sounding = anchor.playing && !silenced

  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  /*
    Both of you here — or a screen already going, which is its own permission.

    Read from presence like everything else that asks this question. The second
    half matters: she can leave in the middle of a film, and a door that locked
    behind you the moment she closed her phone would strand you outside a video
    that is still playing on your own device.
  */
  const watchingLive = useWatching((s) => s.live)
  const watchingTitle = useWatching((s) => s.shared.title)
  const track = tracks.find((t) => t.id === anchor.trackId)

  // --- the feeds ------------------------------------------------------------
  useEffect(() => data.watchTracks((t) => useListening.getState().setTracks(t)), [data])
  useEffect(() => data.watchListening((l) => useListening.getState().setShared(l)), [data])

  /*
    Together is read from presence, and from nothing else.

    Not from a toggle either of you has to remember to set — the whole point is
    that it happens when you are both here, and stops when you are not.
  */
  useEffect(() => {
    const both = presence[me]?.online === true && presence[them.id]?.online === true
    useListening.getState().setTogether(both)
  }, [presence, me, them.id])

  // --- moving the music -----------------------------------------------------
  /**
   * Put the anchor somewhere.
   *
   * Together, this writes to the shared one and reaches her device. Alone it
   * only moves your own. The branch is here rather than in the data layer
   * because the seam should not have an opinion about who is in the room.
   */
  async function move(next: { trackId: string | null; playing: boolean; at: number }) {
    const state = useListening.getState()

    /*
      Your own copy is kept up to date either way.

      Together, the shared anchor is what everything reads — but she will leave
      eventually, and at that moment the garden falls back to `mine`. If that
      had been left where it was an hour ago, the music would lurch back to
      whatever you were playing before she arrived the instant she went to bed.
      Writing both keeps the handover silent.
    */
    state.setMine({ ...next, by: me, since: data.now() })

    /*
      Only when you are actually in step, not merely both here.

      `together` says she is online; `inStep` says the two of you are sharing
      the sound. Writing to the shared anchor while somebody has stepped out
      would reach across and move *her* music from a device that is no longer
      following it — which is the one thing stepping out is supposed to stop.
    */
    if (inStep(state)) {
      await attempt('the music didn’t move', () => data.setListening(next))
    }
  }

  const position = () => positionOf(anchor, data.now())

  /*
    Any of the three deliberate presses ends the road's silence.

    Not leaving the road, and not a timer. "It stopped when I started driving
    and it came back when I asked for it" is one sentence somebody can hold;
    anything cleverer is the music making decisions on your behalf again, which
    is the thing the corner player exists to stop doing.
  */
  const wake = () => useListening.getState().unsilence()

  const playPause = () => {
    // Silenced, the button is a play button whatever the anchor claims —
    // toggling `anchor.playing` here would read the shared truth (playing) and
    // helpfully pause her.
    const next = silenced ? true : !anchor.playing
    wake()
    void move({
      trackId: anchor.trackId ?? tracks[0]?.id ?? null,
      playing: next,
      at: position(),
    })
  }

  const skip = (by: 1 | -1) => {
    wake()
    void move({ trackId: step(tracks, anchor.trackId, by), playing: true, at: 0 })
  }

  const choose = (id: string) => {
    wake()
    void move({
      trackId: id,
      // Tapping a track you are already on restarts it, which is what tapping
      // the thing you are listening to should do.
      playing: true,
      at: 0,
    })
  }

  // --- the sound ------------------------------------------------------------
  const audio = useRef<HTMLAudioElement>(null)

  /*
    Two things want to set this volume, and they multiply rather than fight.

    The music fader is where this device wants music to sit; the duck is a
    voice-light briefly taking the front of the mix. Written as one expression
    with both in it, because the previous version assigned `1` when the duck
    released — which would have silently thrown away the fader every time she
    sent a voice-light.
  */
  const musicLevel = useVolume((s) => s.levels.music)
  const ducked = useRef(false)

  useEffect(() => {
    const el = audio.current
    if (el) el.volume = gainOf(musicLevel) * (ducked.current ? 0.14 : 1)
  }, [musicLevel])

  // A voice-light is deliberately rare and intimate. Let it sit in front of
  // the shared song without changing the shared playback state for her.
  useEffect(() => {
    const duck = (event: Event) => {
      const active = (event as CustomEvent<boolean>).detail === true
      ducked.current = active
      if (audio.current) {
        audio.current.volume = gainOf(levelsNow().music) * (active ? 0.14 : 1)
      }
    }
    window.addEventListener('garden:voice-light', duck)
    return () => window.removeEventListener('garden:voice-light', duck)
  }, [])

  /*
    ==========================================================================
    Telling the phone what is playing.

    A page that plays audio gets a Now Playing card — on the iOS lock screen,
    in Android's shade, on a watch, in a car. Given nothing, the card falls
    back to the name of the thing playing it, so every song in the garden was
    announced to the entire phone as **"the garden"**, with the app icon and no
    artist, which is what it looked like: a two-hour album called the garden.

    Two halves, and both matter.

    `metadata` is what it *says*. Title and artist, and the album is the
    garden, which is true — this is a shared shelf of songs rather than a
    streaming service, and saying so on the lock screen is nicer than leaving
    it blank.

    `setActionHandler` is what its *buttons do*. Without them a browser offers
    the only thing it can do on its own, which is seek ten seconds, and that is
    why the card had ⟲10 and ⟳10 instead of next and previous. Registering the
    two track handlers turns them into the buttons a music player should have,
    and — because they go through `skip`, the same path the corner uses — a
    press on the lock screen moves the song for *both of you*, exactly as if it
    had been pressed in the garden.
    ==========================================================================
  */
  useEffect(() => {
    const media = navigator.mediaSession
    if (!media) return
    if (!track) {
      media.metadata = null
      media.playbackState = 'none'
      return
    }
    media.metadata = new MediaMetadata({
      title: track.title,
      // Empty rather than a guess. A card that says "Unknown artist" is worse
      // than one that says nothing, because it is a sentence nobody wrote.
      artist: track.artist,
      album: 'the garden',
      artwork: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    })
    // The lock screen is a display like any other and gets the same truth: on
    // a road this phone is not playing, whatever the shared anchor believes.
    media.playbackState = sounding ? 'playing' : 'paused'
  }, [track, sounding])

  useEffect(() => {
    const media = navigator.mediaSession
    if (!media) return
    const set = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        media.setActionHandler(action, handler)
      } catch {
        // Not every browser has every action, and asking for one it does not
        // know throws rather than being ignored.
      }
    }
    set('play', () => playPause())
    set('pause', () => playPause())
    set('nexttrack', () => skip(1))
    set('previoustrack', () => skip(-1))
    return () => {
      for (const action of ['play', 'pause', 'nexttrack', 'previoustrack'] as const) {
        set(action, null)
      }
    }
  }, [playPause, skip])

  /*
    The end of a song is not the end of the music.

    It used to simply stop: the element ran out, paused itself, and the anchor
    went on claiming to be playing for ever — so the corner said one thing and
    the silence said another, and the only way out was to press something.

    `ended` rather than watching the clock, because the element is the only
    thing that knows when the file has actually finished — the anchor's idea of
    the position keeps counting past the end of a track whose length nobody
    ever measured, and a `duration` of 0 means *not known* by design.

    Both of you fire this at nearly the same moment when you are in step, and
    both write the same answer: `step` is a pure function of the same track
    list and the same current id, so whichever write lands second is identical
    to the first. The last song stops, and stops honestly — the anchor is told
    it is no longer playing rather than being left claiming it is.
  */
  useEffect(() => {
    const el = audio.current
    if (!el) return
    const onEnded = () => {
      const state = useListening.getState()
      const next = step(state.tracks, anchor.trackId, 1)
      if (next === null || next === anchor.trackId) {
        void move({ trackId: anchor.trackId, playing: false, at: 0 })
        return
      }
      void move({ trackId: next, playing: true, at: 0 })
    }
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  })

  useEffect(() => {
    const el = audio.current
    if (!el) return
    const url = track?.url ?? null

    if (!url) {
      el.removeAttribute('src')
      el.load()
      return
    }
    if (el.getAttribute('src') !== url) {
      el.setAttribute('src', url)
      el.load()
    }
  }, [track])

  /*
    Keep the element on the anchor, but do not poll it at display speed.

    An audio element owns a precise media clock of its own. Checking it sixty
    or a hundred and twenty times a second cannot make it more precise; it only
    wakes the main thread that often. Correct on anchor changes, visibility
    changes, visibility changes and the media element's own low-rate
    `timeupdate`. A half-second drift still gets the same correction, without
    turning a folded player into a render loop.
  */
  useEffect(() => {
    const el = audio.current
    if (!el) return
    const sync = () => {
      if (!el.src) return
      const want = positionOf(anchor, data.now())
      if (Math.abs(el.currentTime - want) > 0.5) el.currentTime = want
      /*
        `sounding`, not `anchor.playing`, and this is the line that actually
        stops the music on a road. The anchor is left alone — hers is still
        playing and yours still remembers where it was — and this device simply
        declines to follow it until somebody presses something. Correcting the
        position above regardless is deliberate: come back after a race and the
        song is where it would have been, not where you left it.
      */
      if (sounding && el.paused) void el.play().catch(() => {})
      if (!sounding && !el.paused) el.pause()
    }
    sync()
    el.addEventListener('timeupdate', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      el.removeEventListener('timeupdate', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [anchor, data, sounding])

  // --- the beam, written straight to the DOM -------------------------------
  const beam = useRef<HTMLSpanElement>(null)
  const elapsed = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = audio.current
    const paint = () => {
      const now = data.now()
      const p = progressOf(anchor, track, now)
      if (beam.current) {
        beam.current.style.transform = `scaleX(${p ?? 0})`
        beam.current.style.opacity = p === null ? '0.18' : '1'
      }
      if (elapsed.current) {
        elapsed.current.textContent = clock(anchor.trackId ? positionOf(anchor, now) : null)
      }
    }
    paint()

    // Browsers emit `timeupdate` at a battery-conscious cadence while real
    // audio is advancing. The slow timer also covers a shared anchor whose
    // file has not reached this device yet. Neither exists while paused.
    const mediaEvents = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'] as const
    for (const name of mediaEvents) el?.addEventListener(name, paint)
    const timer = sounding ? window.setInterval(paint, 500) : null
    return () => {
      if (timer !== null) window.clearInterval(timer)
      for (const name of mediaEvents) el?.removeEventListener(name, paint)
    }
  }, [anchor, track, data])

  const nothing = tracks.length === 0

  return (
    <div ref={panel} className={`player ${open ? 'open' : ''}`}>
      {/* No controls of its own — the anchor drives it. Muted until a real
          file exists, so a missing src can never make a browser complain. */}
      <audio ref={audio} preload="none" />

      {open && (
        <div className="player-list">
          {/*
            The two lights were only ever a *label*, and they should not have
            been.

            While you were both online the garden simply put you in step: she
            pressed play and your phone started playing, wherever you happened
            to be sitting. Being in the same room was doing the deciding, which
            is not a thing a room gets to do — she is on a bus with headphones
            and you are in a lecture, and the honest answer is that her being
            here is a fact and joining her is a choice.

            So it is a button now. Bigger, too: it was the smallest mark in the
            panel and it is the only control in it that reaches another person.
          */}
          {together ? (
            <button
              type="button"
              className={`player-where player-step${apart ? ' apart' : ''}`}
              aria-pressed={!apart}
              onClick={() => useListening.getState().setApart(!apart)}
            >
              <span className="player-both" />
              {apart ? (
                <>on your own · {them.name} is here, listening separately</>
              ) : (
                <>together — {them.name} hears this too</>
              )}
            </button>
          ) : (
            <p className="player-where">on your own · {them.name} isn’t here</p>
          )}

          {/*
            `player-all` turns off the fade at the bottom of the list.

            The fade is how the panel says "there is more down here" without
            spending a word or an arrow on it, so it has to be absent when
            there is not — a fade that lies about five songs being six is worse
            than no fade at all. The height it fades at is `--player-row` in
            the stylesheet, where the type and padding it is measured from live.
          */}
          {nothing ? (
            <p className="player-empty">
              Nothing here to play yet. Whatever either of you adds will show up
              in this list.
            </p>
          ) : (
            <ul className={tracks.length > SHOWN ? '' : 'player-all'}>
              {tracks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={t.id === anchor.trackId ? 'on' : ''}
                    onClick={() => choose(t.id)}
                  >
                    <span className="player-title">{t.title}</span>
                    <span className="player-len">{clock(t.duration || null)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* The screen is the final destination on the opened music shelf. */}
          <button
            type="button"
            className={`player-watch ready${watchingLive ? ' on' : ''}`}
            onClick={() => {
              wake()
              close()
              useWatching.getState().show()
            }}
            aria-label={watchingLive ? 'return to the shared screen' : `open the screen for you and ${them.name}`}
          >
            <span className="player-watch-mark" aria-hidden="true">▷</span>
            <span className="player-watch-words">
              <span className="player-watch-kicker">watch together</span>
              {/*
                Just the invitation, when she is not here.

                It used to add "· ${her name} can join later", which was true
                and cost the whole control its width — the line wrapped on a
                phone and pushed the corner wider than the music above it. It
                was also answering a question nobody asks: a screen you open
                alone is obviously one she can walk into, and the dot beside
                her name in the corner already says whether she is about to.
              */}
              <span className="player-watch-title">
                {/*
                  Cut, not merely ellipsised. `shortTitle` and the note on it
                  in `systems/watching` say why the CSS alone was not enough.
                */}
                {watchingLive
                  ? (shortTitle(watchingTitle) || 'return to the screen')
                  : presence[them.id]?.online === true
                    ? `${them.name} is here · open the night screen`
                    : 'open the night screen'}
              </span>
            </span>
            <span className="player-watch-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      )}

      <div className="player-bar">
        <button
          type="button"
          className="player-fold"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={open ? 'fold the music away' : 'open the music'}
        >
          <Bars playing={sounding} />
          <span className="player-now">
            {track ? track.title : nothing ? 'nothing to play' : 'nothing playing'}
          </span>
        </button>

        <div className="player-move">
          <button type="button" onClick={() => skip(-1)} disabled={nothing} aria-label="back">
            ‹
          </button>
          <button
            type="button"
            className="player-go"
            onClick={playPause}
            disabled={nothing}
            aria-label={sounding ? 'pause' : 'play'}
          >
            {sounding ? '❚❚' : '▶'}
          </button>
          <button type="button" onClick={() => skip(1)} disabled={nothing} aria-label="next">
            ›
          </button>
        </div>
      </div>

      <span className="player-beamline">
        <span className="player-beam" ref={beam} />
      </span>

      <span className="player-elapsed" ref={elapsed} />
    </div>
  )
}

/**
 * Four bars keeping time.
 *
 * The whole of the folded player's ornament, and it is not decoration: it is
 * the one thing that says at a glance whether anything is playing, from across
 * the screen, without reading a word. Animated in CSS so it costs nothing.
 */
function Bars({ playing }: { playing: boolean }) {
  return (
    <span className={`player-bars ${playing ? 'moving' : ''}`} aria-hidden="true">
      <i style={{ '--n': 0 } as React.CSSProperties} />
      <i style={{ '--n': 1 } as React.CSSProperties} />
      <i style={{ '--n': 2 } as React.CSSProperties} />
      <i style={{ '--n': 3 } as React.CSSProperties} />
    </span>
  )
}

/** Exported for the dev panel, which needs to fake her being here. */
export type { Listening }
