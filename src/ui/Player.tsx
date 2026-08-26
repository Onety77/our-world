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
import { useData, useWorldSlice } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import {
  clock,
  current,
  positionOf,
  progressOf,
  step,
  useListening,
} from '@/systems/listening'
import type { Listening } from '@/data/types'

export function Player() {
  const data = useData()
  const me = data.me
  const presence = useWorldSlice((s) => s.presence)
  const profiles = useWorldSlice((s) => s.profiles)

  const tracks = useListening((s) => s.tracks)
  const together = useListening((s) => s.together)
  const open = useListening((s) => s.open)
  const toggleOpen = useListening((s) => s.toggleOpen)

  // Re-read as a whole so `current` sees a consistent pair.
  const anchor = useListening(current)

  const them = profiles[me === 'warm' ? 'cool' : 'warm']
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

    if (state.together) {
      await attempt('the music didn’t move', () => data.setListening(next))
    }
  }

  const position = () => positionOf(anchor, data.now())

  const playPause = () =>
    void move({
      trackId: anchor.trackId ?? tracks[0]?.id ?? null,
      playing: !anchor.playing,
      at: position(),
    })

  const skip = (by: 1 | -1) =>
    void move({ trackId: step(tracks, anchor.trackId, by), playing: true, at: 0 })

  const choose = (id: string) =>
    void move({
      trackId: id,
      // Tapping a track you are already on restarts it, which is what tapping
      // the thing you are listening to should do.
      playing: true,
      at: 0,
    })

  // --- the sound ------------------------------------------------------------
  const audio = useRef<HTMLAudioElement>(null)

  // A voice-light is deliberately rare and intimate. Let it sit in front of
  // the shared song without changing the shared playback state for her.
  useEffect(() => {
    const duck = (event: Event) => {
      const active = (event as CustomEvent<boolean>).detail === true
      if (audio.current) audio.current.volume = active ? 0.14 : 1
    }
    window.addEventListener('garden:voice-light', duck)
    return () => window.removeEventListener('garden:voice-light', duck)
  }, [])

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
    Keep the element on the anchor.

    Corrected rather than driven: the anchor is the truth and the element is
    chasing it. Seeking only when it has drifted more than half a second stops
    a stream of tiny corrections turning the audio into a stutter, which is
    what happens if you set currentTime every tick.
  */
  useEffect(() => {
    const el = audio.current
    if (!el) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!el.src) return
      const want = positionOf(anchor, data.now())
      if (Math.abs(el.currentTime - want) > 0.5) el.currentTime = want
      if (anchor.playing && el.paused) void el.play().catch(() => {})
      if (!anchor.playing && !el.paused) el.pause()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchor, data])

  // --- the beam, written straight to the DOM -------------------------------
  const beam = useRef<HTMLSpanElement>(null)
  const elapsed = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
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
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchor, track, data])

  const nothing = tracks.length === 0

  return (
    <div className={`player ${open ? 'open' : ''}`}>
      {/* No controls of its own — the anchor drives it. Muted until a real
          file exists, so a missing src can never make a browser complain. */}
      <audio ref={audio} preload="none" />

      {open && (
        <div className="player-list">
          <p className="player-where">
            {together ? (
              <>
                <span className="player-both" />
                together — {them.name} hears this too
              </>
            ) : (
              `on your own · ${them.name} isn’t here`
            )}
          </p>

          {nothing ? (
            <p className="player-empty">
              Nothing here to play yet. Whatever either of you adds will show up
              in this list.
            </p>
          ) : (
            <ul>
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
          <Bars playing={anchor.playing} />
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
            aria-label={anchor.playing ? 'pause' : 'play'}
          >
            {anchor.playing ? '❚❚' : '▶'}
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
