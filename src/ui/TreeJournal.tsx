import { useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { stillSealed } from '@/data/types'
import { useReading } from '@/systems/reading'
import { findThoughts, thoughtUnread, type ThoughtFilter } from '@/systems/thoughts'
import { usePaperDialog } from './usePaperDialog'
import { useBackCloses } from '@/systems/backstop'
import './TreeJournal.css'

export function TreeJournal() {
  const data = useData()
  const letters = useWorldSlice(s => s.letters)
  const profiles = useWorldSlice(s => s.profiles)
  const browsing = useReading(s => s.browsing)
  const reading = useReading(s => s.openLetterId !== null)
  const close = useReading(s => s.closeBrowse)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ThoughtFilter>('all')
  const [limit, setLimit] = useState(20)
  const scroll = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)
  const [now, setNow] = useState(() => data.now())
  const active = browsing && !reading
  useBackCloses(browsing, close, 15)
  const root = usePaperDialog(active, close, '#tree-journal-title')
  useEffect(() => {
    if (!active) return
    setNow(data.now())
    const timer = setInterval(() => setNow(data.now()), 1000)
    return () => clearInterval(timer)
  }, [active, data])
  useEffect(() => {
    setLimit(20); scrollTop.current = 0
    scroll.current?.scrollTo({ top: 0 })
  }, [query, filter])
  useEffect(() => {
    if (active && scroll.current) scroll.current.scrollTop = scrollTop.current
  }, [active])
  if (!active) return null
  const found = findThoughts(letters, data.me, now, filter, query)
  const total = letters.filter(l => l.placeId === 'tree').length
  return <div className="reader tree-journal" ref={root} role="dialog" aria-modal="true" aria-labelledby="tree-journal-title" tabIndex={-1}>
    <div className="sheet"><div className="sheet-scroll" ref={scroll} onScroll={event => { scrollTop.current = event.currentTarget.scrollTop }}><div className="sheet-body">
      <p className="addressed">every thought leaves a flower</p>
      <h1 id="tree-journal-title" tabIndex={-1}>What the tree remembers</h1>
      <p className="tree-journal-intro">{total ? `${total} ${total === 1 ? 'thought, growing' : 'thoughts, growing'} between you.` : 'The first words you plant will be waiting here.'}</p>
      <label className="thought-search">Find a thought<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="a word you remember…" /></label>
      <div className="thought-filters" role="group" aria-label="Which thoughts">
        {(['all', 'unread', 'mine', 'sealed'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{({ all: 'all thoughts', unread: 'unread', mine: 'from you', sealed: 'for a day' })[value]}</button>)}
      </div>
      <p className="thought-results" role="status">{found.length ? `${found.length} ${found.length === 1 ? 'thought' : 'thoughts'}` : query ? 'No thoughts match those words.' : filter === 'unread' ? 'Nothing unread. You can revisit the older flowers.' : 'No thoughts here yet.'}</p>
      <div className="thought-leaves">
        {found.slice(0, limit).map(letter => {
          const sealed = stillSealed(letter, data.me, now)
          return <button className={`thought-leaf ${letter.by}`} key={letter.id} onClick={() => useReading.getState().open(letter.id)}>
            <span className="thought-leaf-meta">{letter.by === data.me ? 'you' : profiles[letter.by].name}<time dateTime={new Date(letter.at).toISOString()}>{new Date(letter.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time>{thoughtUnread(letter, data.me, now) && <em>unread</em>}</span>
            <span className="thought-leaf-words">{sealed ? `Keeping its words until ${new Date(letter.openAt!).toLocaleDateString()}` : letter.body || 'A sealed thought, ready to open'}</span>
          </button>
        })}
      </div>
      {found.length > limit && <button className="thought-more" onClick={() => setLimit(n => n + 20)}>earlier thoughts ↓</button>}
    </div></div></div>
    <button className="put-back" onClick={close}>back to the tree</button>
  </div>
}
