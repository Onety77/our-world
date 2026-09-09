import { useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { useTakenOver } from '@/systems/attention'
import { allPhrases, PATHS, findLesson, type Lesson, type Path } from '@/learning/catalog'
import {
  companionStage,
  emptyLearning,
  practiceDay,
  readDrawing,
  recallDue,
  type Coat,
  type Practice,
} from '@/learning/model'
import { useLearning, greetCompanion } from '@/learning/store'
import { useClearingKeys } from '@/learning/useClearingKeys'
import { LanguagePractice, type PracticeResult } from '@/learning/LanguagePractice'
import { DrawingPractice, DrawingPreview } from '@/learning/DrawingPractice'
import { RhythmPractice } from '@/learning/RhythmPractice'
import { readPending, keepPending, clearPending } from '@/learning/pending'
import './Clearing.css'

type View =
  'home' | 'adopt' | 'path' | 'practice' | 'finished' | 'discoveries' | 'journal' | 'leave'
interface Session {
  id: string
  at: number
  lesson: Lesson
  path: Path
  review: boolean
}

export function ClearingUI() {
  const data = useData(),
    profiles = useWorldSlice((s) => s.profiles),
    them = otherUser(data.me)
  const shown = useSections((s) => s.shown),
    takenOver = useTakenOver()
  const here = shown.entered && SECTIONS[shown.section]?.id === 'clearing'
  const visible = here && !takenOver
  const [view, setView] = useState<View>('home'),
    [path, setPath] = useState(PATHS[0]),
    [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('Miso'),
    [coat, setCoat] = useState<Coat>('honey'),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<Practice | null>(null),
    [pending, setPending] = useState<Practice | null>(null)
  const [note, setNote] = useState(''),
    [sharing, setSharing] = useState(false),
    [shared, setShared] = useState(false),
    [reload, setReload] = useState(0)
  const [greeting, setGreeting] = useState(false)
  const [recoverable, setRecoverable] = useState(false)
  const lock = useRef(false)
  const garden = useLearning((s) => s.garden),
    friend = garden.companions[data.me],
    stage = companionStage(friend)
  const due = recallDue(garden.practices, Date.now()),
    completed = friend?.completed ?? []
  useEffect(() => {
    useLearning.setState({ garden: emptyLearning() })
    setLoadError('')
    const recovered = readPending(data.me)
    if (recovered) {
      setPending(recovered)
      setView('finished')
      setPath(PATHS.find((p) => p.id === recovered.path)!)
      setRecoverable(true)
    }
    return data.watchLearning(
      (garden) => useLearning.setState({ garden }),
      () =>
        setLoadError(
          'Your clearing couldn’t connect. Your saved progress hasn’t been changed. Check your connection and try again.',
        ),
    )
  }, [data, reload])
  useEffect(() => {
    useLearning.setState({ coat })
  }, [coat])
  useEffect(() => {
    useLearning.setState({ view })
  }, [view])
  useEffect(() => {
    if (!here && session && view === 'practice') setView('leave')
  }, [here, session, view])
  function go(next: View) {
    setError('')
    setView(next)
  }
  function back() {
    if (busy) return
    if (view === 'practice') {
      go('leave')
      return
    }
    if (view === 'leave') {
      go('practice')
      return
    }
    if (view === 'home') {
      useSections.getState().leave()
      return
    }
    if (view === 'finished') {
      setSession(null)
      go('path')
      return
    }
    go('home')
  }
  const root = useClearingKeys(visible, view + (session?.id ?? ''), back)
  async function adopt() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await data.nameCompanion(name, coat)
      greetCompanion()
      go('home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your companion couldn’t be saved. Try again.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function start(lesson: Lesson, review = false, selected = path) {
    setPath(selected)
    setSession({ id: crypto.randomUUID(), at: Date.now(), lesson, path: selected, review })
    setSaved(null)
    setPending(null)
    setShared(false)
    setNote('')
    go('practice')
  }
  async function save(practice: Practice) {
    if (lock.current) return
    lock.current = true
    setPending(practice)
    setRecoverable(keepPending(practice))
    setBusy(true)
    setError('')
    setView('finished')
    try {
      await data.keepPractice(practice)
      clearPending(practice)
      setSaved(practice)
      setPending(null)
      greetCompanion()
    } catch {
      setError(
        'This practice hasn’t been saved yet. Keep this page open and try again when your connection is back.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function finish(result: PracticeResult) {
    if (!session) return
    const at = Date.now()
    void save({
      ...result,
      id: session.id,
      by: data.me,
      path: session.path.id,
      lesson: session.lesson.id,
      at,
      day: practiceDay(at, profiles[data.me].timeZone),
      seconds: Math.min(86400, Math.round((at - session.at) / 1000)),
    })
  }
  async function share() {
    if (!saved || sharing) return
    setSharing(true)
    setError('')
    try {
      await data.shareDiscovery(saved, note)
      setShared(true)
    } catch {
      setError('Your discovery hasn’t been shared. Try again when you’re connected.')
    } finally {
      setSharing(false)
    }
  }
  const choose = (selected: Path) => {
    setPath(selected)
    go('path')
  }
  const hello = () => {
    greetCompanion()
    setGreeting(true)
    window.setTimeout(() => setGreeting(false), 4000)
  }
  if (!here) return null
  return (
    <section
      ref={root}
      className={`clearing-ui clearing-${view}`}
      aria-label="The Clearing"
      style={visible ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
    >
      <header className="clearing-top">
        <button data-back onClick={back} disabled={busy}>
          ←{' '}
          {view === 'home'
            ? 'the garden'
            : view === 'practice'
              ? 'pause for a moment'
              : view === 'leave'
                ? 'keep going'
                : 'back'}
        </button>
        <span>
          the clearing <i>✧</i>
        </span>
        <button
          onClick={() => go(view === 'discoveries' ? 'home' : 'discoveries')}
          disabled={busy || view === 'practice' || view === 'leave'}
        >
          our discoveries <span>{garden.discoveries.length || '↗'}</span>
        </button>
      </header>
      <main
        className={`clearing-content ${view === 'home' || view === 'adopt' ? 'clearing-open' : ''}`}
      >
        {loadError ? (
          <div className="clearing-wait">
            <h1>A moment to reconnect.</h1>
            <p role="alert">{loadError}</p>
            <button onClick={() => setReload((n) => n + 1)}>Try connecting again</button>
          </div>
        ) : !garden.loaded ? (
          <div className="clearing-wait" role="status">
            <h1>A little clearing, just ahead.</h1>
            <p>Finding your place…</p>
          </div>
        ) : (
          <>
            {view === 'home' && (
              <>
                <div className="clearing-intro">
                  <p className="clearing-eyebrow">a little further than yesterday</p>
                  <h1>
                    {friend ? (
                      <>
                        Come curious.
                        <br />
                        Leave a little changed.
                      </>
                    ) : (
                      <>
                        Something to learn.
                        <br />
                        Someone to grow with.
                      </>
                    )}
                  </h1>
                  <p>
                    {friend
                      ? 'A few words. A steadier hand. A rhythm that stays with you. Choose what calls to you today.'
                      : 'There’s a small friend waiting in the grass. Bring them along while you find something new in yourself.'}
                  </p>
                </div>
                {!friend ? (
                  <div className="clearing-adopt-invitation">
                    <button data-autofocus className="clearing-primary" onClick={() => go('adopt')}>
                      Meet your companion <span>→</span>
                    </button>
                    <small>A few minutes of practice. A friendship that grows.</small>
                  </div>
                ) : (
                  <>
                    <div className="clearing-paths">
                      <p className="clearing-eyebrow">Where shall we wander?</p>
                      {PATHS.map((p, i) => (
                        <button
                          key={p.id}
                          data-autofocus={i === 0 ? true : undefined}
                          onClick={() => choose(p)}
                          style={{ '--path-colour': p.colour } as React.CSSProperties}
                        >
                          <span className="clearing-path-symbol" aria-hidden>
                            {p.symbol}
                          </span>
                          <span>
                            <strong>{p.title}</strong>
                            <small>{p.subtitle}</small>
                          </span>
                          <em aria-hidden>↗</em>
                        </button>
                      ))}
                    </div>
                    <div className="clearing-home-links">
                      <button onClick={() => go('journal')}>your practice journal ↗</button>
                      {due.length > 0 && (
                        <span>
                          {due.length} {due.length === 1 ? 'phrase is' : 'phrases are'} ready to
                          revisit
                        </span>
                      )}
                    </div>
                  </>
                )}
                <aside className="clearing-companion">
                  <button
                    onClick={hello}
                    aria-label="Greet your companion"
                    className="clearing-pet-space"
                  />
                  <p className="clearing-pet-name">{friend?.name ?? 'A small someone.'}</p>
                  <p role="status">
                    {greeting
                      ? 'A wag, just for you.'
                      : friend
                        ? `${stage.name} · ${stage.days} practice ${stage.days === 1 ? 'day' : 'days'}`
                        : 'Waiting to meet you.'}
                  </p>
                  {friend && (
                    <>
                      <small>
                        {stage.next
                          ? `${stage.next - stage.days} more practice ${stage.next - stage.days === 1 ? 'day' : 'days'} until a little growth.`
                          : 'Thirty days of growing together. Every visit still matters.'}
                      </small>
                      <button
                        onClick={() => {
                          setName(friend.name)
                          setCoat(friend.coat)
                          go('adopt')
                        }}
                      >
                        say hello & change their name
                      </button>
                    </>
                  )}
                </aside>
              </>
            )}
            {view === 'adopt' && (
              <div className="clearing-adoption">
                <p className="clearing-eyebrow">a friend for the small beginnings</p>
                <h1>{friend ? 'Still your little friend.' : 'Hello, little one.'}</h1>
                <p>
                  They grow when you show up and practise. Four days to find their feet, twelve to
                  become an explorer, thirty to become an old friend.
                </p>
                <p>No lost streaks. After time away, a sleepy dog and a warm welcome.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void adopt()
                  }}
                >
                  <label htmlFor="companion-name">What shall we call them?</label>
                  <input
                    data-autofocus
                    id="companion-name"
                    value={name}
                    maxLength={24}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="clearing-coats" aria-label="Coat colour">
                    {(['honey', 'ink', 'cloud'] as const).map((c) => (
                      <button
                        type="button"
                        key={c}
                        aria-pressed={coat === c}
                        onClick={() => setCoat(c)}
                      >
                        <i className={`coat-${c}`} />
                        {c}
                      </button>
                    ))}
                  </div>
                  <button
                    className="clearing-primary"
                    type="submit"
                    disabled={busy || !name.trim()}
                  >
                    {busy ? 'Finding a home…' : friend ? 'Keep their name' : 'Let’s grow together'}{' '}
                    →
                  </button>
                </form>
              </div>
            )}
            {view === 'path' && (
              <div className="clearing-path-detail">
                <p className="clearing-eyebrow">a path through the clearing</p>
                <h1>{path.title}</h1>
                <p className="clearing-lead">{path.subtitle}</p>
                <p className="clearing-note">
                  {path.language
                    ? 'Meet the words, recall their meaning, then bring them back yourself. A first session takes about three to five minutes.'
                    : path.id === 'drawing'
                      ? 'Short studies, a blank sheet, and a moment to notice what changed. Use this page or real paper.'
                      : 'Listen, count, and play two bars. Your timing is measured; you can try as often as you like.'}
                </p>
                {due.some((id) => id.startsWith(path.id)) && (
                  <button
                    className="clearing-review clearing-primary"
                    data-autofocus
                    onClick={() =>
                      start(
                        {
                          id: `${path.id}-review`,
                          title: 'A little remembering',
                          invitation: '',
                          phrases: due
                            .filter((id) => id.startsWith(path.id))
                            .slice(0, 6)
                            .map((id) => allPhrases.find((p) => p.id === id)!)
                            .filter(Boolean),
                        },
                        true,
                      )
                    }
                  >
                    Revisit {Math.min(6, due.filter((id) => id.startsWith(path.id)).length)} waiting
                    phrases →
                  </button>
                )}
                <div className="clearing-lessons">
                  {path.lessons.map((lesson, i) => (
                    <button
                      key={lesson.id}
                      data-autofocus={
                        !completed.includes(lesson.id) &&
                        path.lessons.find((l) => !completed.includes(l.id)) === lesson
                          ? true
                          : undefined
                      }
                      onClick={() => start(lesson)}
                    >
                      <span>
                        {completed.includes(lesson.id) ? '✧' : String(i + 1).padStart(2, '0')}
                      </span>
                      <strong>{lesson.title}</strong>
                      <small>{completed.includes(lesson.id) ? 'visit again' : 'begin here'}</small>
                      <em>→</em>
                    </button>
                  ))}
                </div>
                <a className="clearing-source" href={path.source} target="_blank" rel="noreferrer">
                  Keep exploring · {path.sourceName} ↗
                </a>
                <p className="clearing-small">
                  These are starter studies. Come back to practise, then take them into a real
                  conversation, sketchbook, or instrument.
                </p>
              </div>
            )}
            {(view === 'practice' || view === 'leave') && session && (
              <>
                <div hidden={view === 'leave'} key={session.id}>
                  {session.path.language ? (
                    <LanguagePractice
                      path={session.path}
                      phrases={session.lesson.phrases}
                      review={session.review}
                      onFinish={finish}
                    />
                  ) : session.path.id === 'drawing' ? (
                    <DrawingPractice lesson={session.lesson} onFinish={finish} />
                  ) : (
                    <RhythmPractice
                      lesson={session.lesson}
                      onFinish={finish}
                      paused={view === 'leave' || !visible}
                    />
                  )}
                </div>
                {view === 'leave' && (
                  <div className="clearing-pause">
                    <p className="clearing-eyebrow">there is no hurry</p>
                    <h1>Stay a little longer?</h1>
                    <p>
                      This practice is still in progress. Leaving it now won’t add a practice day.
                    </p>
                    <button
                      data-autofocus
                      className="clearing-primary"
                      onClick={() => go('practice')}
                    >
                      Keep going →
                    </button>
                    <button
                      onClick={() => {
                        setSession(null)
                        go('path')
                      }}
                    >
                      Leave this practice
                    </button>
                  </div>
                )}
              </>
            )}
            {view === 'finished' && (
              <div className="clearing-finished">
                <p className="clearing-eyebrow">a little more than before</p>
                <h1>
                  {saved
                    ? 'You brought something back.'
                    : busy
                      ? 'Keeping this small beginning.'
                      : 'Let’s keep this safe.'}
                </h1>
                {busy && (
                  <>
                    <p role="status">
                      Saving your practice…{' '}
                      {recoverable
                        ? 'A recovery copy is kept on this device.'
                        : 'Keep this page open until it’s kept.'}
                    </p>
                    {recoverable && (
                      <button onClick={() => useSections.getState().leave()}>
                        Return to the garden while it saves →
                      </button>
                    )}
                  </>
                )}
                {pending && !busy && (
                  <button
                    data-autofocus
                    className="clearing-primary"
                    onClick={() => void save(pending)}
                  >
                    Try saving again →
                  </button>
                )}
                {saved && (
                  <>
                    <p>
                      {friend?.name} has a little more of you to grow with. {stage.days}{' '}
                      {stage.days === 1 ? 'day' : 'days'} of practice, so far.
                    </p>
                    <p className="clearing-note">
                      {saved.path === 'drawing'
                        ? 'You made time to look and make something. Your observation is kept with your study.'
                        : saved.path === 'rhythm'
                          ? saved.reflection
                          : `${saved.recall.filter((r) => r.correct).length} of ${saved.recall.length} phrases recalled without a reveal or wrong answer. We’ll bring them back over time.`}
                    </p>
                    {!saved.passed && (
                      <p className="clearing-note">
                        The effort counts. This lesson is still open for another try.
                      </p>
                    )}
                    {saved.drawing && (
                      <DrawingPreview
                        strokes={readDrawing(saved.drawing)}
                        className="clearing-saved-drawing"
                      />
                    )}
                    <div className="clearing-share">
                      <h2>A little something for {profiles[them].name}?</h2>
                      <p>Your answers stay yours. Share a discovery only if you want to.</p>
                      {shared ? (
                        <p role="status">Left in our discoveries. They can try this study too.</p>
                      ) : (
                        <>
                          <label className="clearing-sr" htmlFor="clearing-discovery">
                            Your discovery
                          </label>
                          <textarea
                            id="clearing-discovery"
                            maxLength={600}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="A phrase to try together, a small realisation, a note about your drawing…"
                          />
                          <button
                            onClick={() => void share()}
                            disabled={sharing || note.trim().length < 2}
                          >
                            {sharing ? 'Leaving it here…' : 'Leave this discovery'} ↗
                          </button>
                        </>
                      )}
                    </div>
                    <div className="clearing-finish-actions">
                      <button
                        data-autofocus
                        className="clearing-primary"
                        onClick={() => {
                          setSession(null)
                          go('home')
                        }}
                      >
                        Back to the clearing →
                      </button>
                      <button onClick={() => go('path')}>
                        A little more {path.title.toLowerCase()}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {view === 'discoveries' && (
              <div className="clearing-discoveries">
                <p className="clearing-eyebrow">what we find along the way</p>
                <h1>Two curious minds.</h1>
                <p>A word to try on each other. A sketch. Something that finally clicked.</p>
                {garden.discoveries.length === 0 ? (
                  <p className="clearing-empty">
                    Nothing left here yet. Finish a practice and leave a little discovery for the
                    other person.
                  </p>
                ) : (
                  garden.discoveries.map((d) => (
                    <article key={d.id}>
                      <p className="clearing-eyebrow">
                        {profiles[d.by].name} · {PATHS.find((p) => p.id === d.path)?.title} ·{' '}
                        {new Date(d.at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <h2>{findLesson(d.lesson)?.title ?? 'A little remembering'}</h2>
                      {d.drawing && (
                        <DrawingPreview
                          strokes={readDrawing(d.drawing)}
                          className="clearing-saved-drawing"
                        />
                      )}
                      <p className="clearing-discovery-note">{d.note}</p>
                      {friend && findLesson(d.lesson) && (
                        <button
                          onClick={() =>
                            start(
                              findLesson(d.lesson)!,
                              false,
                              PATHS.find((p) => p.id === d.path)!,
                            )
                          }
                        >
                          Try this study too →
                        </button>
                      )}
                      {d.by === data.me && (
                        <button
                          onClick={() => {
                            void data
                              .removeDiscovery(d.id)
                              .catch(() =>
                                setError('That discovery couldn’t be removed. Try again.'),
                              )
                          }}
                        >
                          Take my discovery back
                        </button>
                      )}
                    </article>
                  ))
                )}
              </div>
            )}
            {view === 'journal' && (
              <div className="clearing-journal">
                <p className="clearing-eyebrow">small things, kept</p>
                <h1>Your practice journal.</h1>
                <p>{stage.days} practice days. No race to catch up with.</p>
                {garden.practices.length === 0 ? (
                  <p className="clearing-empty">Your first practice will begin the story.</p>
                ) : (
                  garden.practices.slice(0, 250).map((p) => (
                    <article key={p.id}>
                      <p className="clearing-eyebrow">
                        {new Date(p.at).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                        })}{' '}
                        · {PATHS.find((path) => path.id === p.path)?.title}
                      </p>
                      <h2>{findLesson(p.lesson)?.title ?? 'A little remembering'}</h2>
                      {p.drawing && (
                        <DrawingPreview
                          strokes={readDrawing(p.drawing)}
                          className="clearing-saved-drawing"
                        />
                      )}
                      <p>{p.reflection}</p>
                      <button
                        onClick={() => {
                          setSaved(p)
                          setPath(PATHS.find((path) => path.id === p.path)!)
                          setNote('')
                          setShared(garden.discoveries.some((d) => d.id === p.id))
                          go('finished')
                        }}
                      >
                        Share a discovery from this practice ↗
                      </button>
                    </article>
                  ))
                )}
                <small>
                  Your most recent 250 practices are shown. Your companion keeps every practice day.
                </small>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="clearing-error" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer className="clearing-footer">
        <span>small practice. lasting company.</span>
        <span>arrows to wander · enter to choose · esc to step back</span>
      </footer>
    </section>
  )
}
