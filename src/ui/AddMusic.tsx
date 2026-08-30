/**
 * Putting a song in the garden.
 *
 * ---------------------------------------------------------------------------
 * There was no way to do this. The player, the list, the transport and the
 * two-of-you-in-step syncing have all worked for a long time, and the only way
 * to give any of it something to play was to open the Firebase console, upload
 * a file into `music/` by hand, and then write a document into the `tracks`
 * collection next to it with the title and the length typed in. The storage
 * rule still said so: *"uploaded by hand rather than by the app"*.
 *
 * Which meant the music in here grew about as fast as somebody was willing to
 * do clerical work — and the question "can we find a streaming API" was really
 * this screen not existing.
 *
 * **The length is read here, not sent.** Nothing knows how long an audio file
 * is except an audio element that has loaded it, and the data layer has no
 * business building DOM. So each file is loaded once, silently, purely to ask
 * it that one question, and the answer travels with it.
 *
 * **Titles come from the filenames and are editable before anything goes up.**
 * A file called `01 - Night Changes.mp3` should not become a song called
 * `01 - Night Changes`, and it should not require typing either.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import { useData } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import { useListening } from '@/systems/listening'
import { useSay } from '@/systems/useSay'

/** What the rules accept. Over this, it is refused before the wire. */
const MAX_MB = 25

interface Waiting {
  /** Stable across re-orders and title edits, which the file itself is not. */
  key: string
  file: File
  title: string
  /** Seconds. 0 while it is still being asked. */
  duration: number
  state: 'reading' | 'ready' | 'going' | 'done' | 'refused'
  why: string
}

/**
 * A filename, as a song.
 *
 * Strips the extension, the track number people put on the front, and the
 * underscores that come out of anything that has been through a filesystem.
 * Deliberately conservative: it is a first guess sitting in an editable box,
 * and a guess that mangles a real title is worse than one that leaves a little
 * tidying to do.
 */
function titleFrom(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, '')
    .replace(/_+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** How long it is, asked of the only thing that can answer. */
function lengthOf(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const finish = (seconds: number) => {
      URL.revokeObjectURL(url)
      resolve(seconds)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      /*
        Some files report `Infinity` until they are seeked. A length the player
        would have to lie about is better recorded as not known — the progress
        line already knows how to show nothing. See `Track.duration`.
      */
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0)
    }
    audio.onerror = () => finish(-1)
    audio.src = url
  })
}

function clock(seconds: number): string {
  if (seconds <= 0) return '—'
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function AddMusic() {
  const data = useData()
  const say = useSay()
  const tracks = useListening((s) => s.tracks)
  /*
    Its own subscription, because the player is not on this screen.

    `useListening` is filled by whoever is watching, and the only watcher was
    the player itself — which lives in the corner of the garden and is nowhere
    near the control room. So this listed nothing at all, including the songs
    that were already there, and "what is in there now" was a heading over an
    empty space. Two watchers is fine: each gets its own listener and they both
    write the same values into the same store. Same as `usePublishedTuning`.
  */
  useEffect(() => data.watchTracks((t) => useListening.getState().setTracks(t)), [data])

  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Reading a file is asynchronous and this panel can be closed mid-read.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  function take(files: FileList | null) {
    if (!files || files.length === 0) return
    const tooBig = (file: File) => file.size >= MAX_MB * 1024 * 1024
    const added: Waiting[] = [...files].map((file) => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
      file,
      title: titleFrom(file.name),
      duration: 0,
      state: tooBig(file) ? 'refused' : 'reading',
      why: tooBig(file)
        ? `${(file.size / (1024 * 1024)).toFixed(1)}MB — the garden takes up to ${MAX_MB}MB`
        : '',
    }))
    setWaiting((was) => [...was, ...added])

    for (const one of added) {
      if (one.state === 'refused') continue
      void lengthOf(one.file).then((seconds) => {
        if (!alive.current) return
        setWaiting((was) =>
          was.map((w) => {
            if (w.key !== one.key) return w
            if (seconds < 0) {
              return { ...w, state: 'refused', why: 'this browser cannot read that as audio' }
            }
            return { ...w, duration: seconds, state: 'ready' }
          }),
        )
      })
    }
  }

  const ready = waiting.filter((w) => w.state === 'ready')

  /*
    One at a time, on purpose.

    Four songs at once is four uploads competing for one phone's connection,
    and the only thing that gets faster is how quickly they all fail together.
    In a row, each one lands before the next begins, and a failure stops at the
    file that failed instead of taking the batch with it.
  */
  async function putThemIn() {
    for (const one of ready) {
      setWaiting((was) => was.map((w) => (w.key === one.key ? { ...w, state: 'going' } : w)))
      const landed = await attempt(`${one.title} did not go in`, () =>
        data.addTrack({ title: one.title, file: one.file, duration: one.duration }),
      )
      if (!alive.current) return
      setWaiting((was) =>
        was.map((w) => {
          if (w.key !== one.key) return w
          if (landed) return { ...w, state: 'done', why: '' }
          return { ...w, state: 'ready', why: 'that one did not go in — try again' }
        }),
      )
    }
  }

  return (
    <section>
      <h2>the music</h2>
      <p className="admin-note">
        {say(
          'Songs live in the garden rather than on a device — whatever goes in here {she} has too, and either of you can take any of it out again.',
        )}{' '}
        Up to {MAX_MB}MB each.
      </p>

      {/*
        A drop target that is also a button: on a laptop dragging a folder of
        songs onto it is the obvious thing, and on a phone there is nothing to
        drag, so it has to work as a plain tap as well.
      */}
      <button
        type="button"
        className={`music-drop${over ? ' over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          take(event.dataTransfer.files)
        }}
      >
        <b>choose songs</b>
        <small>or drop them here — as many as you like</small>
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(event) => {
          take(event.target.files)
          // Cleared, or choosing the same file twice in a row does nothing.
          event.target.value = ''
        }}
      />

      {waiting.length > 0 && (
        <ul className="music-waiting">
          {waiting.map((w) => (
            <li key={w.key} className={w.state}>
              <input
                value={w.title}
                aria-label={`name for ${w.file.name}`}
                disabled={w.state === 'going' || w.state === 'done'}
                onChange={(event) =>
                  setWaiting((was) =>
                    was.map((x) => (x.key === w.key ? { ...x, title: event.target.value } : x)),
                  )
                }
              />
              <span className="music-state">
                {w.state === 'reading' && 'reading…'}
                {w.state === 'going' && 'going in…'}
                {w.state === 'done' && 'in the garden'}
                {w.state === 'refused' && w.why}
                {w.state === 'ready' && (w.why || clock(w.duration))}
              </span>
              {w.state !== 'going' && w.state !== 'done' && (
                <button
                  type="button"
                  className="quiet music-drop-one"
                  aria-label={`leave out ${w.title}`}
                  onClick={() => setWaiting((was) => was.filter((x) => x.key !== w.key))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready.length > 0 && (
        <div className="row">
          <button type="button" className="on" onClick={() => void putThemIn()}>
            put {ready.length === 1 ? 'it' : `all ${ready.length}`} in the garden
          </button>
          <button type="button" className="quiet" onClick={() => setWaiting([])}>
            never mind
          </button>
        </div>
      )}

      <h3>what is in there now</h3>
      {tracks.length === 0 ? (
        <p className="admin-note">Nothing yet.</p>
      ) : (
        <ul className="music-have">
          {tracks.map((t) => (
            <li key={t.id}>
              <span className="music-have-title">{t.title}</span>
              <span className="music-have-len">{clock(t.duration)}</span>
              {/*
                No confirmation, and there should not be one. Putting it back
                is choosing the file again, which is now a few seconds rather
                than a trip to a console — see the note in `firestore.rules`
                about a track being furniture rather than something said.
              */}
              <button
                type="button"
                className="quiet"
                aria-label={`take ${t.title} out`}
                onClick={() =>
                  void attempt(`${t.title} would not come out`, () => data.removeTrack(t.id))
                }
              >
                take it out
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
