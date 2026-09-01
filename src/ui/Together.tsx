/**
 * Watching something together.
 *
 * ---------------------------------------------------------------------------
 * **Not a sixth place.** The garden's places are somewhere you go, and this is
 * not: it is the two of you sitting in front of the same screen, which is a
 * thing that happens *while* you are somewhere. So it lives where the music
 * lives — folded into the corner, reachable from the media control, over
 * whatever you were already looking at. Same argument as `ui/Whisper`, and the
 * same corner.
 *
 * **The one hard rule in this file: the stage is never unmounted.** A YouTube
 * iframe that leaves the document stops playing and forgets where it was, and
 * the entire point of tucking the screen away is that the video keeps going
 * while you walk around the garden. So the tree below does not change shape
 * between full and tucked — one element hosts the player for the whole life of
 * the session, and all that moves is the class on the root. Anything that
 * conditionally renders around `.together-stage` will silently break this, and
 * the way it breaks is that the video restarts.
 *
 * **The conversation under it is the same conversation.** There is one thread
 * between these two people and it is in the Stars; a second chat that only
 * existed while a video was on would be a place for things to get lost. What
 * you say here is said in the sky, and is there tomorrow.
 *
 * How the two devices stay on the same second is `systems/watching`. What talks
 * to YouTube is `systems/youtube`. This file is the room.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import type { Message, Queued } from '@/data/types'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { useListening } from '@/systems/listening'
import { useTalking } from '@/systems/talking'
import {
  advance,
  clock,
  correction,
  positionOf,
  queueItem,
  useWatching,
  videoIdIn,
} from '@/systems/watching'
import {
  ENDED,
  canSearch,
  makeScreen,
  search,
  titleOf,
  type Found,
  type Screen,
} from '@/systems/youtube'
import { Ink } from './Ink'
import { gainOf, useVolume } from '@/systems/volume'

/** How often the two screens are compared. See `DRIFT` for why not per frame. */
const CHECK_MS = 900

export function Together() {
  const data = useData()
  const me = data.me
  const profiles = useWorldSlice((s) => s.profiles)
  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  const shared = useWatching((s) => s.shared)
  const open = useWatching((s) => s.open)
  const live = useWatching((s) => s.live)
  const tab = useWatching((s) => s.tab)
  const setTab = useWatching((s) => s.setTab)
  const tuck = useWatching((s) => s.tuck)

  const messages = useTalking((s) => s.messages)
  const musicLevel = useVolume((s) => s.levels.music)

  const stage = useRef<HTMLDivElement>(null)
  const screen = useRef<Screen | null>(null)
  /** True while this device is applying the shared truth, so it ignores itself. */
  const applying = useRef(false)
  const [trouble, setTrouble] = useState('')
  const [joined, setJoined] = useState(true)
  /** Where the picture is, for the beam. Not state — it moves twice a second. */
  const [where, setWhere] = useState(0)
  const [span, setSpan] = useState(0)

  // --- the feed -------------------------------------------------------------
  useEffect(
    () => data.watchWatching((w) => useWatching.getState().setShared(w)),
    [data],
  )

  /*
    A video and a song are two things in one pair of ears.

    The corner player is stopped rather than ducked, exactly as a road stops it
    — see `silenced` in `systems/listening`. It does not come back by itself
    afterwards either: the next deliberate press starts it, and that is one rule
    rather than two.
  */
  useEffect(() => {
    if (live) useListening.getState().silence()
  }, [live])

  // --- the screen -----------------------------------------------------------
  useEffect(() => {
    if (!live || !stage.current) return
    let alive = true
    let made: Screen | null = null

    /*
      A node React does not own, because YouTube destroys the one it is given.

      `YT.Player` does not fill an element — it *replaces* it with an iframe. Hand
      it a node React rendered and two things break: the ref points at something
      detached from the document, and React later tries to remove a child that is
      no longer its child. So a plain div is made here, appended into the element
      React does own, and handed over to be consumed. React never looks inside.
    */
    const host = document.createElement('div')
    stage.current.append(host)

    const anchor = useWatching.getState().shared
    void makeScreen(
      host,
      { videoId: anchor.videoId, at: positionOf(anchor, data.now()), playing: anchor.playing },
      (state: number) => {
        if (state === ENDED && !applying.current) void onEnded()
      },
      (why) => setTrouble(why),
    )
      .then((built) => {
        if (!alive) {
          built.stop()
          return
        }
        made = built
        screen.current = built
        setTrouble('')
      })
      .catch((why: unknown) => {
        if (alive) setTrouble(why instanceof Error ? why.message : String(why))
      })

    return () => {
      alive = false
      made?.stop()
      screen.current = null
      // Whatever is left of it — the div, or the iframe it became.
      stage.current?.replaceChildren()
    }
    // Built once for the life of a session. Rebuilding it on any other change
    // is the thing the note at the top of this file is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  /* The garden's music fader owns this too — it is music, whatever it is. */
  useEffect(() => {
    screen.current?.loud(gainOf(musicLevel))
  }, [musicLevel])

  /*
    ---------------------------------------------------------------------------
    Keeping the two of you on the same second.

    Everything the shared anchor says is applied *to* this device; nothing this
    device notices is written back. That one-way rule is what stops the two
    phones talking each other into a loop — a correction here would look like a
    move over there, which would arrive as a correction here, forever.

    Deliberate moves are the exception, and they are the buttons below.
    ---------------------------------------------------------------------------
  */
  useEffect(() => {
    if (!live) return
    let stop = 0
    const sync = () => {
      const player = screen.current
      if (!player) return
      const anchor = useWatching.getState().shared
      if (anchor.videoId === null) return

      const want = positionOf(anchor, data.now())
      const at = player.where()
      setWhere(at)
      setSpan(player.length())

      /*
        Nothing is corrected while the picture is not really running.

        An advert is the case this exists for, and your question is what found
        it: a pre-roll on one device and not the other means one of you is
        watching thirty seconds of something else while the shared clock keeps
        counting. The main video's time is meaningless during it, so a
        correction computed from it is a seek to a nonsense position — and the
        other device, seeing that write, follows it there.

        A duration of zero is the honest signal for "there is no main video
        playing yet", and it covers the other cases that look the same: metadata
        still loading, and a stall on a bad connection. When the advert ends the
        gap is large, and the ordinary seek puts you back beside her.
      */
      if (player.length() <= 0) return

      applying.current = true
      const gap = at - want
      const { do: how, rate } = correction(gap)
      if (how === 'seek') player.seek(want)
      player.rate(how === 'drift' ? rate : 1)

      const state = player.state()
      const shouldPlay = anchor.playing
      if (shouldPlay && state !== 1) player.play()
      if (!shouldPlay && state === 1) player.pause()
      /*
        A browser that will not start on its own.

        Autoplay with sound is refused until this device has been touched, so a
        screen she started can sit here paused with no explanation. Asking again
        every second would not help; saying so, once, does.
      */
      setJoined(!shouldPlay || state === 1 || state === 3)
      window.setTimeout(() => {
        applying.current = false
      }, 60)
    }
    sync()
    stop = window.setInterval(sync, CHECK_MS)
    return () => window.clearInterval(stop)
  }, [live, data])

  /** Put a whole new truth on the wire. Every deliberate move goes through here. */
  const move = (next: {
    videoId: string | null
    title: string
    playing: boolean
    at: number
    queue: Queued[]
  }) => {
    void attempt('that didn’t reach her screen', () => data.setWatching(next))
  }

  const put = (videoId: string, title: string, at = 0, playing = true) =>
    move({ videoId, title, playing, at, queue: shared.queue })

  async function onEnded() {
    const { next, rest } = advance(useWatching.getState().shared.queue)
    if (next) move({ videoId: next.videoId, title: next.title, playing: true, at: 0, queue: rest })
    else move({ ...useWatching.getState().shared, playing: false, at: 0 })
  }

  const playPause = () => {
    const player = screen.current
    const at = player ? player.where() : positionOf(shared, data.now())
    move({ ...shared, playing: !shared.playing, at })
    setJoined(true)
  }

  const skip = () => void onEnded()

  const goTo = (seconds: number) => {
    screen.current?.seek(seconds)
    move({ ...shared, at: Math.max(0, seconds) })
  }

  // --- what is on --------------------------------------------------------
  const shown = shared.playing ? Math.max(where, 0) : shared.at
  const through = span > 0 ? Math.max(0, Math.min(1, shown / span)) : 0

  if (!live) return null

  return (
    <div className={`together ${open ? 'full' : 'tucked'}`}>
      {open && <div className="together-hush" aria-hidden="true" />}

      {/*
        The screen itself, and the only element in here that matters.

        It is outside every conditional on purpose: React must never be given a
        reason to take it out of the document, because YouTube stops the moment
        it does. Everything else in this file may come and go.
      */}
      <div className="together-screen">
        <div ref={stage} className="together-stage" />
        {!open && (
          <button
            type="button"
            className="together-open"
            onClick={() => useWatching.getState().show()}
            aria-label="back to the full screen"
          >
            <span aria-hidden="true">⤢</span>
          </button>
        )}
        {trouble !== '' && <p className="together-trouble">{trouble}</p>}
        {open && !joined && (
          <button type="button" className="together-join" onClick={playPause}>
            tap to watch with {them.name}
          </button>
        )}
      </div>

      {open && (
        <div className="together-room">
          <Transport
            playing={shared.playing}
            through={through}
            shown={shown}
            span={span}
            hasNext={shared.queue.length > 0}
            movedBy={shared.by === me ? 'you' : them.name}
            title={shared.title}
            onPlayPause={playPause}
            onSkip={skip}
            onSeek={goTo}
            onTuck={tuck}
          />

          <div className="together-tabs" role="tablist" aria-label="beside the screen">
            {(['talk', 'queue'] as const).map((which) => (
              <button
                key={which}
                type="button"
                role="tab"
                aria-selected={tab === which}
                className={`together-tab${tab === which ? ' on' : ''}`}
                onClick={() => setTab(which)}
              >
                {which === 'talk' ? 'talk' : `up next${shared.queue.length > 0 ? ` · ${shared.queue.length}` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'talk' ? (
            <Talk messages={messages} theirName={them.name} />
          ) : (
            <Queue
              queue={shared.queue}
              theirName={them.name}
              nothingOn={shared.videoId === null}
              onPlayNow={(videoId, title) => put(videoId, title)}
              onQueue={(item) => move({ ...shared, queue: [...shared.queue, item] })}
              onDrop={(id) => move({ ...shared, queue: shared.queue.filter((q) => q.id !== id) })}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The controls, which are a line of light and three marks.
 *
 * No rounded rectangle, no filled bar, no chrome — the beam under the corner
 * player already says "how far through this is" in this world's language, and a
 * second visual language for the same fact would be two answers to one question.
 */
function Transport({
  playing,
  through,
  shown,
  span,
  hasNext,
  movedBy,
  title,
  onPlayPause,
  onSkip,
  onSeek,
  onTuck,
}: {
  playing: boolean
  through: number
  shown: number
  span: number
  hasNext: boolean
  movedBy: string
  title: string
  onPlayPause(): void
  onSkip(): void
  onSeek(seconds: number): void
  onTuck(): void
}) {
  const beam = useRef<HTMLDivElement>(null)

  const scrubTo = (clientX: number) => {
    const box = beam.current?.getBoundingClientRect()
    if (!box || box.width === 0 || span <= 0) return
    onSeek(((clientX - box.left) / box.width) * span)
  }

  return (
    <div className="together-transport">
      <p className="together-now">
        <span className="together-title">{title || 'nothing on'}</span>
        {/*
          Who moved it last, and it earns its place.

          The one thing that is genuinely strange about a shared screen is a
          video pausing when you did not pause it. One word removes the whole
          confusion, and it is the difference between "this is broken" and "she
          is saying something".
        */}
        <span className="together-by">{playing ? 'playing' : 'paused'} · {movedBy}</span>
      </p>

      <div
        ref={beam}
        className="together-beamline"
        role="slider"
        tabIndex={0}
        aria-label="how far through"
        aria-valuemin={0}
        aria-valuemax={Math.round(span)}
        aria-valuenow={Math.round(shown)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrubTo(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return
          scrubTo(event.clientX)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, shown - 5))
          if (event.key === 'ArrowRight') onSeek(shown + 5)
        }}
      >
        <span className="together-beam" style={{ transform: `scaleX(${through})` }} />
      </div>

      <div className="together-moves">
        <span className="together-clock">{clock(shown)}{span > 0 ? ` / ${clock(span)}` : ''}</span>
        <button type="button" className="together-go" onClick={onPlayPause}
          aria-label={playing ? 'pause for both of us' : 'play for both of us'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="together-next" onClick={onSkip} disabled={!hasNext}
          aria-label="next in the queue">
          ›
        </button>
        <button type="button" className="together-tuck" onClick={onTuck}>
          fold away
        </button>
      </div>
    </div>
  )
}

/** The conversation, which is the same conversation. */
function Talk({ messages, theirName }: { messages: Message[]; theirName: string }) {
  const data = useData()
  const me = data.me
  const [draft, setDraft] = useState('')
  const foot = useRef<HTMLDivElement>(null)
  const recent = useMemo(() => messages.slice(-40), [messages])

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [recent.length])

  async function say() {
    const text = draft.trim()
    if (text === '') return
    const outgoing = {
      id: `said-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
    }
    useTalking.getState().queue({ ...outgoing, by: me, body: text })
    setDraft('')
    ambience.said(true)
    const sent = await attempt('that didn’t send', () =>
      data.sendMessage(text, undefined, outgoing),
    )
    if (!sent) useTalking.getState().fail(outgoing.id)
  }

  return (
    <div className="together-talk">
      <div className="together-said">
        {recent.length === 0 ? (
          <p className="together-none">Nothing said yet. Say something while it plays.</p>
        ) : (
          recent.map((m) => (
            <p key={m.id} className={`together-line ${m.by === me ? 'mine' : 'hers'}`}>
              {m.body}
            </p>
          ))
        )}
        <div ref={foot} />
      </div>
      <div className="together-write">
        <Ink
          className="ink together-field"
          value={draft}
          onChange={setDraft}
          placeholder={`to ${theirName}`}
          label={`say something to ${theirName}`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void say()
            }
          }}
        />
        <button
          type="button"
          className="together-send"
          disabled={draft.trim() === ''}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void say()}
        >
          send
        </button>
      </div>
    </div>
  )
}

/** What is lined up, and the one field that finds more. */
function Queue({
  queue,
  theirName,
  nothingOn,
  onPlayNow,
  onQueue,
  onDrop,
}: {
  queue: Queued[]
  theirName: string
  nothingOn: boolean
  onPlayNow(videoId: string, title: string): void
  onQueue(item: Queued): void
  onDrop(id: string): void
}) {
  const data = useData()
  const hunt = useWatching((s) => s.hunt)
  const setHunt = useWatching((s) => s.setHunt)
  const [found, setFound] = useState<Found[]>([])
  const [looking, setLooking] = useState(false)
  const [trouble, setTrouble] = useState('')

  const pasted = videoIdIn(hunt)

  async function look() {
    if (pasted !== null) {
      /*
        A link is not a search — nothing has to be asked of anybody, and this
        works with no API key at all.

        The name is looked up anyway, because a queue that reads
        `https://youtu.be/dQw4w9WgXcQ` is a queue nobody can read. oEmbed is
        public and free; if it does not answer, the id is still better than the
        whole URL and the video still plays either way.
      */
      const said = hunt.trim()
      setHunt('')
      setFound([])
      const name = (await titleOf(pasted)) || pasted
      if (nothingOn) onPlayNow(pasted, name)
      else onQueue(queueItem(data.me, { videoId: pasted, title: name }))
      void said
      return
    }
    if (hunt.trim() === '') return
    setLooking(true)
    setTrouble('')
    try {
      setFound(await search(hunt.trim()))
    } catch (why) {
      setTrouble(why instanceof Error ? why.message : String(why))
      setFound([])
    } finally {
      setLooking(false)
    }
  }

  const take = (video: Found) => {
    if (nothingOn) onPlayNow(video.videoId, video.title)
    else onQueue(queueItem(data.me, { videoId: video.videoId, title: video.title }))
    setFound([])
    setHunt('')
  }

  return (
    <div className="together-queue">
      <div className="together-hunt">
        <Ink
          className="ink together-field"
          value={hunt}
          onChange={setHunt}
          placeholder={canSearch ? 'a link, or something to look for' : 'paste a YouTube link'}
          label="find something to watch"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void look()
            }
          }}
        />
        <button
          type="button"
          className="together-find"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void look()}
          disabled={hunt.trim() === '' || looking}
        >
          {pasted !== null ? (nothingOn ? 'play' : 'add') : looking ? '…' : 'find'}
        </button>
      </div>

      {trouble !== '' && <p className="together-trouble flat">{trouble}</p>}
      {!canSearch && pasted === null && hunt.trim() !== '' && (
        <p className="together-trouble flat">
          Searching is off — no YouTube key on this build. A pasted link still works.
        </p>
      )}

      {found.length > 0 && (
        <ul className="together-found">
          {found.map((video) => (
            <li key={video.videoId}>
              <button type="button" onClick={() => take(video)}>
                {video.thumb !== '' && <img src={video.thumb} alt="" loading="lazy" />}
                <span className="together-found-words">
                  <span className="together-found-title">{video.title}</span>
                  <span className="together-found-who">{video.channel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {found.length === 0 && (
        queue.length === 0 ? (
          <p className="together-none">
            Nothing lined up. Whatever either of you adds plays next.
          </p>
        ) : (
          <ol className="together-lined">
            {queue.map((item) => (
              <li key={item.id}>
                <span className="together-lined-title">{item.title || item.videoId}</span>
                <span className="together-lined-who">
                  {item.by === data.me ? 'you' : theirName}
                </span>
                <button
                  type="button"
                  className="together-drop"
                  onClick={() => onDrop(item.id)}
                  aria-label={`take ${item.title || 'this'} out of the queue`}
                >
                  take out
                </button>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  )
}
