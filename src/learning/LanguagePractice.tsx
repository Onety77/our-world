import { useEffect, useMemo, useState } from 'react'
import { allPhrases, type Path, type Phrase } from './catalog'
import { normalizeAnswer, type Recall } from './model'

export interface PracticeResult {
  score: number
  passed: boolean
  recall: Recall[]
  drawing: string
  reflection: string
}
const fold = (value: string) =>
  normalizeAnswer(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/…/g, '')

function Listen({ phrase, language }: { phrase: Phrase; language: string }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice>()
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const update = () =>
      setVoice(
        speechSynthesis
          .getVoices()
          .find((v) => v.lang.toLowerCase().startsWith(language.slice(0, 2))),
      )
    update()
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', update)
      speechSynthesis.cancel()
    }
  }, [language])
  function listen() {
    if (!voice) return
    speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(phrase.text.replace('…', ''))
    speech.voice = voice
    speech.lang = language
    speech.rate = 0.8
    speech.onend = () => setSpeaking(false)
    speech.onerror = () => setSpeaking(false)
    setSpeaking(true)
    speechSynthesis.speak(speech)
  }
  return (
    <div className="clearing-listen">
      <button type="button" disabled={!voice} onClick={listen}>
        {speaking ? 'Listen again' : 'Listen to the phrase'} <span aria-hidden>♫</span>
      </button>
      <small>
        {voice
          ? 'Device voice · listen, then say it yourself.'
          : 'No matching voice on this device. Use the path’s learning resource alongside these words.'}
      </small>
    </div>
  )
}

export function LanguagePractice({
  path,
  phrases,
  review,
  onFinish,
}: {
  path: Path
  phrases: Phrase[]
  review: boolean
  onFinish(result: PracticeResult): void
}) {
  const [step, setStep] = useState(0),
    [phase, setPhase] = useState<'learn' | 'meaning' | 'remember'>(review ? 'meaning' : 'learn')
  const [answer, setAnswer] = useState(''),
    [feedback, setFeedback] = useState<string | null>(null),
    [correct, setCorrect] = useState(false)
  const [attempted, setAttempted] = useState(false),
    [missed, setMissed] = useState(false),
    [recall, setRecall] = useState<Recall[]>([])
  const phrase = phrases[step]
  const options = useMemo(() => {
    const distractors = allPhrases.filter(
      (p) => p.id.startsWith(path.id) && p.meaning !== phrase.meaning,
    )
    const choices = [phrase, ...distractors.slice(0, 2)]
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[choices[i], choices[j]] = [choices[j], choices[i]]
    }
    return choices
  }, [phrase, path.id])
  function next() {
    setAnswer('')
    setFeedback(null)
    setCorrect(false)
    setAttempted(false)
    if (phase === 'learn') {
      setPhase('meaning')
      return
    }
    if (phase === 'meaning') {
      setPhase('remember')
      return
    }
    const results = [...recall, { card: phrase.id, correct: !missed }]
    if (step + 1 === phrases.length) {
      const score = Math.round((100 * results.filter((r) => r.correct).length) / results.length)
      onFinish({
        score,
        passed: score >= 67,
        recall: results,
        drawing: '',
        reflection: 'Remembered phrases from their meanings.',
      })
    } else {
      setRecall(results)
      setStep(step + 1)
      setMissed(false)
      setPhase(review ? 'meaning' : 'learn')
    }
  }
  function check(value: string, meaning = false) {
    const accepted = meaning
      ? value === phrase.meaning
      : [phrase.text, phrase.reading].filter(Boolean).some((p) => fold(p) === fold(value))
    setAttempted(true)
    setCorrect(accepted)
    if (!accepted) setMissed(true)
    setFeedback(
      accepted
        ? meaning
          ? 'Yes. Now bring the words back yourself.'
          : `That’s it: ${phrase.text}${phrase.reading ? ` · ${phrase.reading}` : ''}`
        : meaning
          ? 'Not quite. Think about the situation and try again.'
          : `Keep the whole phrase in mind. It begins “${(phrase.reading || phrase.text).slice(0, 3)}…”. Try again, or reveal it.`,
    )
  }
  return (
    <div className="clearing-activity" key={phrase.id}>
      <p className="clearing-eyebrow">
        {review ? 'A little remembering' : 'Words to take with you'} · {step + 1} of{' '}
        {phrases.length}
      </p>
      {phase === 'learn' ? (
        <>
          <p className="clearing-situation">{phrase.situation}</p>
          <h2 className="clearing-phrase" lang={path.language}>
            {phrase.text}
          </h2>
          {phrase.reading && <p className="clearing-reading">{phrase.reading}</p>}
          <p className="clearing-translation">{phrase.meaning}</p>
          <p className="clearing-note">{phrase.note}</p>
          <div data-choice-row="listen">
            <Listen phrase={phrase} language={path.language!} />
          </div>
          <div data-choice-row="continue">
            <button className="clearing-primary" onClick={next}>
              Let me try remembering <span>→</span>
            </button>
          </div>
        </>
      ) : phase === 'meaning' ? (
        <>
          <p className="clearing-situation">What does this mean?</p>
          <h2 className="clearing-phrase" lang={path.language}>
            {phrase.text}
          </h2>
          {phrase.reading && <p className="clearing-reading">{phrase.reading}</p>}
          <div className="clearing-answers" data-choice-row="answers" data-choice-axis="vertical">
            {options.map((p) => (
              <button key={p.id} disabled={correct} onClick={() => check(p.meaning, true)}>
                {p.meaning}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="clearing-situation">How would you say…</p>
          <h2>{phrase.meaning}</h2>
          <p className="clearing-note">
            {phrase.situation}{' '}
            {path.id === 'mandarin'
              ? 'Chinese characters or pinyin both work. Tone marks are welcome, but optional here.'
              : 'Accents are shown in the answer; you can type without them here.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!correct) check(answer)
              else next()
            }}
          >
            <label className="clearing-sr" htmlFor="clearing-answer">
              Your answer
            </label>
            <input
              id="clearing-answer"
              value={answer}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={
                path.id === 'mandarin' ? 'Type the words or pinyin…' : 'Bring the words back…'
              }
            />
            {/[Ɗɗ]/.test(phrase.text) && !correct && (
              <button type="button" onClick={() => setAnswer((value) => value + 'ɗ')}>
                Insert ɗ
              </button>
            )}
            <div data-choice-row="check">
              <button type="submit" disabled={!answer.trim() || correct}>
                Check my words →
              </button>
              {!correct && (
                <button
                  type="button"
                  onClick={() => {
                    setMissed(true)
                    setAttempted(true)
                    setCorrect(true)
                    setFeedback(
                      `Say it aloud once: ${phrase.text}${phrase.reading ? ` · ${phrase.reading}` : ''}. We’ll bring this one back for practice.`,
                    )
                  }}
                >
                  Reveal the phrase
                </button>
              )}
            </div>
          </form>
        </>
      )}
      <p className={`clearing-feedback ${correct ? 'is-correct' : ''}`} role="status">
        {feedback}
      </p>
      {phase !== 'learn' && attempted && correct && (
        <div data-choice-row="next">
          <button className="clearing-primary" onClick={next}>
            {phase === 'meaning'
              ? 'Bring back the words'
              : step + 1 === phrases.length
                ? 'Keep this practice'
                : 'Next phrase'}{' '}
            →
          </button>
        </div>
      )}
    </div>
  )
}
