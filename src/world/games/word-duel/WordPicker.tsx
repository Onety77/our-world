/**
 * Pick a word, get a link.
 *
 * ---------------------------------------------------------------------------
 * The one way to play the word game with somebody who is not in the garden.
 * You lay five stones, and the word becomes a link (see `challenge.ts`) that
 * opens a board for whoever you send it to — no app, no account, nothing of
 * the world. Used twice: from the Hollow, where the name on it is yours, and
 * at the end of that public page, where somebody who just played can send a
 * word back and says who they are.
 *
 * **Any five letters.** A word outside the book is allowed — a name, some
 * slang between friends — and it says so rather than refusing, because the
 * person guessing can always lay the answer itself down. Only their *other*
 * guesses have to be real words.
 *
 * Garden-free, like everything the public page touches: React, `words`,
 * `stones`, `challenge`.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from 'react'
import { LENGTH, isWord, loadWords, wordsReady, type Mark } from './words'
import { Tray, Word, type Strike } from './stones'
import { challengeLink, copyText, encodeChallenge, handOver, tidyName } from './challenge'
import './word-picker.css'

const NAME_KEY = 'word:my-name'

export function WordPicker({
  from,
  askName = false,
  onBack,
  backLabel,
  onStone,
}: {
  /** The name the link carries. Ignored when `askName` is set. */
  from?: string
  /** Ask who is sending it: for the public page, where nobody is signed in. */
  askName?: boolean
  /** Where "back" goes. Without one there is no back — a bare picker page. */
  onBack?(): void
  backLabel?: string
  /** A letter landed — for a sound, where there is one. */
  onStone?(weight: number): void
}) {
  const [ready, setReady] = useState(wordsReady())
  const [typed, setTyped] = useState('')
  const [strike, setStrike] = useState<Strike>({ at: -1, n: 0 })
  const [link, setLink] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    if (ready) return
    let live = true
    void loadWords().then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [ready])

  const sender = askName ? tidyName(name) : tidyName(from ?? '')

  const make = useCallback(() => {
    if (typed.length !== LENGTH) return
    if (askName) {
      try {
        localStorage.setItem(NAME_KEY, tidyName(name))
      } catch {
        /* remembered or not, the link is the same */
      }
    }
    setWord(typed)
    setLink(challengeLink(encodeChallenge({ word: typed, from: sender })))
    setSaid(null)
  }, [typed, askName, name, sender])

  const type = useCallback(
    (letter: string) => {
      if (typed.length >= LENGTH) return
      setTyped(typed + letter)
      setStrike((s) => ({ at: typed.length, n: s.n + 1 }))
      onStone?.(0.35 + (typed.length / (LENGTH - 1)) * 0.5)
    },
    [typed, onStone],
  )
  const rub = useCallback(() => {
    if (typed.length > 0) onStone?.(0.12)
    setTyped((t) => t.slice(0, -1))
  }, [typed, onStone])

  const again = () => {
    setLink(null)
    setTyped('')
    setSaid(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (target instanceof HTMLElement && target.matches('input, textarea')) {
        if (e.key === 'Enter' && !link) {
          e.preventDefault()
          make()
        }
        return
      }
      if (e.key === 'Escape') {
        onBack?.()
        return
      }
      if (link) return
      if (e.key === 'Enter') {
        e.preventDefault()
        make()
      } else if (e.key === 'Backspace') {
        rub()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        type(e.key.toLowerCase())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [link, make, rub, type, onBack])

  if (link) {
    const lit: Mark[] = Array(LENGTH).fill('lit')
    const share = async () => {
      const text = sender
        ? `${sender} left you a word. Six guesses — can you find it?`
        : 'Somebody left you a word. Six guesses — can you find it?'
      const how = await handOver({ title: 'A word for you', text, url: link })
      setSaid(how === 'copied' ? 'Copied — paste it anywhere.' : how === 'failed' ? 'Could not share from here. Copy the link below.' : null)
    }
    const copy = async () => {
      setSaid((await copyText(link)) ? 'Link copied.' : 'Could not copy — press and hold the link instead.')
    }
    return (
      <div className="picker picker-made">
        <p className="picker-kicker">your word is ready</p>
        <Word letters={word.split('')} marks={lit} />
        <p className="picker-note">
          Send this link to anyone. They get six guesses at it — no app, no account.
        </p>
        <button type="button" className="picker-link" onClick={copy} aria-label="copy the link">
          {link.replace(/^https?:\/\//, '')}
        </button>
        <div className="picker-actions">
          <button type="button" className="picker-button picker-main" onClick={share}>
            share the link
          </button>
          <button type="button" className="picker-button" onClick={copy}>
            copy link
          </button>
        </div>
        <p className="picker-said" role="status" aria-live="polite">
          {said ?? ''}
        </p>
        <div className="picker-actions picker-quiet">
          <button type="button" className="picker-button" onClick={again}>
            pick another word
          </button>
          {onBack && (
            <button type="button" className="picker-button" onClick={onBack}>
              {backLabel}
            </button>
          )}
        </div>
      </div>
    )
  }

  const full = typed.length === LENGTH
  const hint = !full
    ? `${LENGTH - typed.length} more ${LENGTH - typed.length === 1 ? 'letter' : 'letters'}`
    : ready && !isWord(typed)
      ? 'not in the word book — that is fine, they can still find it'
      : 'enter makes the link'

  return (
    <div className="picker">
      <p className="picker-kicker">a word for anyone</p>
      <h1 className="picker-title">Pick a word</h1>
      <p className="picker-note">Any five letters. Whoever gets the link has six guesses to find it.</p>
      {askName && (
        <label className="picker-name">
          <span>from</span>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            autoComplete="given-name"
            enterKeyHint="done"
          />
        </label>
      )}
      <div className="picker-stones">
        <Word letters={typed.padEnd(LENGTH, ' ').split('')} marks={null} strike={strike} />
      </div>
      <p className={'picker-hint' + (full && ready && !isWord(typed) ? ' picker-hint-odd' : '')}>{hint}</p>
      <Tray
        marks={{}}
        onType={type}
        onEnter={make}
        onRub={rub}
        canEnter={full}
        canRub={typed.length > 0}
        enterLabel="make the link"
      />
      {onBack && (
        <div className="picker-actions picker-quiet">
          <button type="button" className="picker-button" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      )}
    </div>
  )
}
