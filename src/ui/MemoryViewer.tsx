import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { useMemories } from '@/systems/memories'
import { useTrouble } from '@/systems/trouble'
import { useSay } from '@/systems/useSay'
import './MemoryViewer.css'

/** The original photograph gets the viewport; the walk waits behind it. */
export function MemoryViewer() {
  const data = useData()
  const words = useSay()
  const all = useMemories(s => s.all)
  const id = useMemories(s => s.openId)
  const open = useMemories(s => s.open)
  const memories = useMemo(() => all.filter(m => !m.removed), [all])
  const index = memories.findIndex(m => m.id === id)
  const memory = memories[index]
  const them = useWorldSlice(s => s.presence[otherUser(data.me)])
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [back, setBack] = useState(false)
  const [immersive, setImmersive] = useState(true)
  const [removing, setRemoving] = useState(false)
  const [writing, setWriting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const picture = loaded?.id === id ? loaded.url : null
  const mine = memory?.by === data.me

  useEffect(() => {
    if (!id) return
    setBack(false); setImmersive(true); setRemoving(false); setWriting(null)
  }, [id])

  useEffect(() => {
    if (!memory) return
    let cancelled = false
    setFailed(false)
    const load = async () => {
      try {
        const url = await data.pictureUrl(memory)
        const image = new Image()
        image.src = url
        await image.decode()
        if (!cancelled) setLoaded({ id: memory.id, url })
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [data, memory?.id, memory?.path, retry])

  useEffect(() => {
    if (!id) return
    data.publishPresence({ looking: id })
    return () => data.publishPresence({ looking: '' })
  }, [data, id])

  const showing = Boolean(memory)
  useEffect(() => {
    if (!showing) return
    returnFocus.current = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const previous = document.body.style.overflow
    const root = document.getElementById('root')
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      if (root) root.inert = wasInert
      returnFocus.current?.focus({ preventScroll: true })
    }
  }, [showing])

  useEffect(() => {
    if (!showing) return
    const key = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); open(null)
      } else if (!editing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault(); event.stopImmediatePropagation()
        const next = index + (event.key === 'ArrowLeft' ? -1 : 1)
        if (memories[next]) open(memories[next].id)
      } else if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, [tabindex="0"]') ?? [])
          .filter(el => el.getClientRects().length > 0)
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [showing, index, memories, open])

  if (!memory) return null
  const fail = (error: unknown) => useTrouble.getState().say(error instanceof Error ? error.message : 'That could not be saved. Please try again.')
  const save = async () => {
    setBusy(true)
    try { await data.sayWhatIRemember(memory.id, (writing ?? '').trim()); setWriting(null) }
    catch (error) { fail(error) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await data.removeMemory(memory.id); open(null) }
    catch (error) { fail(error) }
    finally { setBusy(false) }
  }
  return createPortal(
    <div ref={dialog} className={`memory-viewer${immersive ? ' immersive' : ''}`} role="dialog" aria-modal="true"
      aria-label="Memory photograph" style={{ '--memory-tint': memory.tint } as React.CSSProperties}
      onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <header className="memory-viewer-header">
        <div><span className="memory-eyebrow">THE LANTERN WALK</span><span className="memory-number">{index + 1} / {memories.length}</span></div>
        <button ref={closeButton} className="memory-close" onClick={() => open(null)} aria-label="Close photograph">×</button>
      </header>
      <main className="memory-stage"
        onPointerDown={event => {
          if (!event.isPrimary || back || (event.target as HTMLElement).closest('button, textarea')) return
          swipe.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerCancel={() => { swipe.current = null }}
        onPointerUp={event => {
          const start = swipe.current; swipe.current = null
          if (!start) return
          const dx = event.clientX - start.x, dy = event.clientY - start.y
          if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.6) return
          const next = memories[index + (dx < 0 ? 1 : -1)]
          if (next) open(next.id)
        }}>
        {back ? <section className="memory-letter" aria-label="On the back of this photograph">
          <span className="memory-eyebrow">ON THE OTHER SIDE</span>
          {writing !== null ? <>
            <textarea autoFocus value={writing} onChange={e => setWriting(e.target.value)} maxLength={600} rows={5}
              aria-label="What I remember" placeholder="What this was, from where you were…" />
            <div className="memory-letter-actions"><button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Keep these words'}</button>
              <button disabled={busy} onClick={() => setWriting(null)}>Cancel</button></div>
          </> : <>
            <p>{memory.theirs?.body ?? (mine ? words('Nothing on this side yet. {She} can leave what {she} remembers.') : 'What do you remember about this moment?')}</p>
            {!mine && (!memory.theirs || memory.theirs.by === data.me) &&
              <button onClick={() => setWriting(memory.theirs?.body ?? '')}>{memory.theirs ? 'Edit your words' : 'Leave a few words'}</button>}
          </>}
        </section> : <div className="memory-photo" onDoubleClick={() => setImmersive(v => !v)}>
          {!picture && memory.blur && <img className="memory-placeholder" src={memory.blur} alt="" aria-hidden="true" />}
          {picture && <img className="memory-original" src={picture} alt={memory.why || memory.when || 'A photograph kept along the Lantern Walk'} draggable={false} />}
          {!picture && <div className="memory-loading" role="status">{failed ? <><p>This photograph could not load.</p><button onClick={() => setRetry(v => v + 1)}>Try again</button></> : 'Loading photograph…'}</div>}
        </div>}
        {!back && <>
          <button className="memory-nav previous" aria-label="Previous photograph" disabled={index <= 0} onClick={() => open(memories[index - 1].id)}>‹</button>
          <button className="memory-nav next" aria-label="Next photograph" disabled={index >= memories.length - 1} onClick={() => open(memories[index + 1].id)}>›</button>
        </>}
      </main>
      <footer className="memory-viewer-footer">
        <div className="memory-caption">{memory.when && <span className="memory-date">{memory.when}</span>}
          {memory.why && <p>{memory.why}</p>}
          {them.online && them.looking === memory.id && <span className="memory-together">You are both here, looking at this.</span>}</div>
        <div className="memory-actions">
          <button onClick={() => { setBack(v => !v); setRemoving(false) }}>{back ? 'Back to the photograph' : 'Turn it over'}</button>
          {!back && <button onClick={() => setImmersive(v => !v)}>Hide the words</button>}
          {mine && <button className="memory-remove" onClick={() => setRemoving(true)}>Remove</button>}
        </div>
        {removing && <div className="memory-confirm" role="alert"><p>Remove this photograph and its words? This cannot be undone.</p>
          <button disabled={busy} onClick={() => setRemoving(false)}>Keep it</button><button disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove photograph'}</button></div>}
      </footer>
      {immersive && <button className="memory-show-words" onClick={() => setImmersive(false)}>Show the words</button>}
    </div>, document.body,
  )
}
