/**
 * Somebody left you a word.
 *
 * ---------------------------------------------------------------------------
 * The whole of the shared-word page. The link carries the word and who sent
 * it (`challenge.ts`); this lays out the same stones the garden's word game
 * uses and gives six guesses.
 *
 *   - **Your board survives a refresh.** Guesses are kept on this device under
 *     the link's code, so reloading, or coming back tomorrow, is the same game
 *     — and closing the tab after a bad guess does not buy a fresh six.
 *   - **The answer is always a legal guess**, even when it is not in the word
 *     book. The sender may pick any five letters; every *other* guess still has
 *     to be a real word, or the game is just trying letters.
 *   - **At the end, two things:** send back how you did — the grid, never the
 *     word — and send a word of your own, which makes this page its own way in.
 *
 * Nothing is sent anywhere. There is no server that knows this game happened.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LENGTH,
  TRIES,
  finished,
  isWord,
  letterState,
  loadWords,
  solved,
  wordsReady,
} from '@/world/games/word-duel/words'
import { Board, Tray, type Strike } from '@/world/games/word-duel/stones'
import {
  challengeLink,
  codeFromAddress,
  decodeChallenge,
  handOver,
  resultText,
} from '@/world/games/word-duel/challenge'
import { WordPicker } from '@/world/games/word-duel/WordPicker'

function keyFor(code: string) {
  return `word:played:${code}`
}

function readGuesses(code: string | null): string[] {
  if (!code) return []
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(code)) ?? '[]')
    return Array.isArray(raw)
      ? raw.filter((g): g is string => typeof g === 'string' && /^[a-z]{5}$/.test(g)).slice(0, TRIES)
      : []
  } catch {
    return []
  }
}

export function WordChallenge() {
  const code = useMemo(() => codeFromAddress(location.pathname, location.search), [])
  const challenge = useMemo(() => (code ? decodeChallenge(code) : null), [code])
  const answer = challenge?.word ?? ''

  const [picking, setPicking] = useState(!code)
  const [ready, setReady] = useState(wordsReady())
  const [guesses, setGuesses] = useState(() => readGuesses(challenge ? code : null))
  const [typed, setTyped] = useState('')
  const [strike, setStrike] = useState<Strike>({ at: -1, n: 0 })
  const [complaint, setComplaint] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    if (ready) return
    let live = true
    void loadWords().then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [ready])

  useEffect(() => {
    document.title = challenge
      ? challenge.from
        ? `A word from ${challenge.from}`
        : 'A word for you'
      : picking
        ? 'Pick a word'
        : 'A word for you'
  }, [challenge, picking])

  const done = challenge !== null && finished(guesses, answer)
  const won = challenge !== null && solved(guesses, answer)
  const playing = challenge !== null && !done && !picking

  const commit = useCallback(() => {
    if (!challenge || typed.length !== LENGTH || done) return
    if (!ready) {
      setComplaint('Still opening the word book — one moment.')
      return
    }
    if (typed !== answer && !isWord(typed)) {
      setComplaint('That one is not in the book.')
      return
    }
    if (guesses.includes(typed)) {
      setComplaint('You have already tried that one.')
      return
    }
    const next = [...guesses, typed]
    setGuesses(next)
    setTyped('')
    setComplaint(null)
    try {
      if (code) localStorage.setItem(keyFor(code), JSON.stringify(next))
    } catch {
      /* private browsing: the game still plays, it just will not survive a reload */
    }
  }, [challenge, typed, done, ready, answer, guesses, code])

  const type = useCallback(
    (letter: string) => {
      if (typed.length >= LENGTH) return
      setComplaint(null)
      setTyped(typed + letter)
      setStrike((s) => ({ at: typed.length, n: s.n + 1 }))
    },
    [typed],
  )
  const rub = useCallback(() => {
    setComplaint(null)
    setTyped((t) => t.slice(0, -1))
  }, [])

  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') commit()
      else if (e.key === 'Backspace') rub()
      else if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, commit, rub, type])

  const tray = useMemo(() => (challenge ? letterState(guesses, answer) : {}), [challenge, guesses, answer])

  if (picking) {
    return (
      <main className="wc wc-picking">
        {/* With no board behind it — a bare /w/ — there is nowhere to go back to. */}
        <WordPicker
          askName
          onBack={challenge ? () => setPicking(false) : undefined}
          backLabel="back to my board"
        />
      </main>
    )
  }

  if (!challenge) {
    return (
      <main className="wc wc-broken">
        <div className="wc-head">
          <p className="wc-kicker">a word duel</p>
          <h1 className="wc-title">This link has lost its word</h1>
          <p className="wc-note">
            It may have been cut short when it was copied. Ask whoever sent it for the whole link again.
          </p>
        </div>
        <div className="wc-actions">
          <button type="button" className="wc-button wc-main" onClick={() => setPicking(true)}>
            pick a word of your own
          </button>
        </div>
      </main>
    )
  }

  const who = challenge.from || 'Somebody'
  const share = async () => {
    const how = await handOver({
      title: `${who}'s word`,
      // Their link, so whoever sees the grid can try the same word.
      text: resultText(challenge, guesses, code ? challengeLink(code) : location.href),
    })
    setSaid(how === 'copied' ? 'Copied — paste it back to them.' : how === 'failed' ? 'Could not share from here.' : null)
  }

  return (
    <main className="wc">
      <header className="wc-head">
        <p className="wc-kicker">a word duel</p>
        <h1 className="wc-title">
          {!done
            ? `${who} left you a word`
            : won
              ? guesses.length === 1
                ? 'First try.'
                : `Got it in ${guesses.length}.`
              : 'Not this time.'}
        </h1>
        <p className="wc-note">
          {!done
            ? guesses.length === 0
              ? 'Six guesses. A lit stone is in the right place; a warm one is in the word, somewhere else.'
              : `${TRIES - guesses.length} ${TRIES - guesses.length === 1 ? 'guess' : 'guesses'} left.`
            : won
              ? `You found ${who === 'Somebody' ? 'the' : `${who}'s`} word.`
              : <>The word was <b>{answer.toUpperCase()}</b>.</>}
        </p>
      </header>

      <div className="wc-board">
        <Board guesses={guesses} answer={answer} typed={done ? '' : typed} strike={strike} />
      </div>

      <footer className="wc-foot">
        {playing ? (
          <>
            <p className="wc-say" role="status" aria-live="polite">
              {complaint ?? ''}
            </p>
            <Tray
              marks={tray}
              onType={type}
              onEnter={commit}
              onRub={rub}
              canEnter={typed.length === LENGTH}
              canRub={typed.length > 0}
              enterLabel="lay this word down"
            />
          </>
        ) : (
          <>
            <div className="wc-actions">
              <button type="button" className="wc-button wc-main" onClick={share}>
                send back how you did
              </button>
              <button type="button" className="wc-button" onClick={() => setPicking(true)}>
                send a word back
              </button>
            </div>
            <p className="wc-say" role="status" aria-live="polite">
              {said ?? ''}
            </p>
          </>
        )}
      </footer>
    </main>
  )
}
