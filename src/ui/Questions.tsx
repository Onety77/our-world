import { useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser, type QuestionRound } from '@/data/types'
import { attempt } from '@/systems/trouble'
import { useQuestions } from '@/systems/questions'
import { ambience } from '@/systems/ambience'

/** The question sheets are the same paper as thoughts, so they use the same nib. */
function soundOfWriting(before: string, after: string) {
  const grew = after.length - before.length
  if (grew === 1) ambience.nib(/[a-z0-9]/i.test(after.at(-1) ?? '') ? 0.62 : 0.34)
  else if (grew > 1) ambience.nib(0.85)
  else if (grew < 0) ambience.nib(0.35, true)
}

function Answered({ round }: { round: QuestionRound }) {
  const profiles = useWorldSlice((state) => state.profiles)
  return (
    <div className="question-answers">
      {(['warm', 'cool'] as const).map((who) => (
        <section key={who} className={`question-answer question-answer-${who}`}>
          <p className="addressed">{profiles[who].name}</p>
          <p className="ink">{round.answers[who]?.body ?? 'still under the bark'}</p>
        </section>
      ))}
    </div>
  )
}

function RoundSheet({ round }: { round: QuestionRound }) {
  const data = useData()
  const close = useQuestions((state) => state.close)
  const history = useWorldSlice((state) => state.questions.history)
  const [body, setBody] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const mine = round.answered[data.me]
  const both = round.answered.warm && round.answered.cool
  const them = useWorldSlice((state) => state.profiles[otherUser(data.me)].name)

  useEffect(() => {
    if (!mine) field.current?.focus()
  }, [mine, round.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const at = history.findIndex((item) => item.id === round.id)
  const go = (offset: number) => {
    const next = history[at + offset]
    if (next) useQuestions.getState().openArchive(next.id)
  }

  const answer = async () => {
    if (body.trim() === '') return
    const saved = await attempt('your answer did not settle under the bark', () =>
      data.answerQuestion(round.id, body),
    )
    if (saved) {
      ambience.cue('seal', 0.72)
      setBody('')
    }
  }

  return (
    <div className="reader question-reader">
      <div className="sheet question-sheet">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">the Tree is asking</p>
            <h2 className="question-prompt">{round.prompt}</h2>

            {both ? (
              <Answered round={round} />
            ) : mine ? (
              <div className="question-waiting">
                <span className="question-seal" aria-hidden="true" />
                <p>Your answer is under the bark.</p>
                <small>It opens when {them} has answered too.</small>
              </div>
            ) : (
              <textarea
                ref={field}
                className="ink question-writing"
                value={body}
                onChange={(event) => {
                  soundOfWriting(body, event.target.value)
                  setBody(event.target.value)
                }}
                placeholder="leave your answer here…"
                maxLength={8000}
                aria-label="your sealed answer"
              />
            )}
          </div>
        </div>
      </div>

      <div className="sheet-actions question-actions">
        {!mine && !both ? (
          <button type="button" className="put-back" onClick={() => void answer()} disabled={!body.trim()}>
            seal my answer
          </button>
        ) : null}
        {both && at > 0 ? (
          <button type="button" className="put-back quiet" onClick={() => go(-1)}>← older</button>
        ) : null}
        {both && at >= 0 && at < history.length - 1 ? (
          <button type="button" className="put-back quiet" onClick={() => go(1)}>newer →</button>
        ) : null}
        <button type="button" className="put-back quiet" onClick={close}>back to the tree</button>
      </div>
    </div>
  )
}

function PlantQuestion() {
  const data = useData()
  const close = useQuestions((state) => state.close)
  const seeds = useWorldSlice((state) => state.questions.availableSeeds)
  const [prompt, setPrompt] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => field.current?.focus(), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const plant = async () => {
    const saved = await attempt('that question did not take root', () =>
      data.plantQuestion(prompt),
    )
    if (saved) {
      ambience.cue('root', 0.7)
      close()
    }
  }

  return (
    <div className="reader composing question-reader">
      <div className="sheet question-sheet question-planting">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">a question for some unknown day</p>
            <textarea
              ref={field}
              className="ink question-writing"
              value={prompt}
              onChange={(event) => {
                soundOfWriting(prompt, event.target.value)
                setPrompt(event.target.value)
              }}
              placeholder="What would you like the Tree to ask both of you?"
              maxLength={600}
              aria-label="question to plant"
            />
            <p className="question-private">
              It will rest under the roots, enter the questions later, and carry no name.
              Neither of you will be told who planted it.
            </p>
          </div>
        </div>
      </div>
      <div className="sheet-actions">
        <button type="button" className="put-back" onClick={() => void plant()} disabled={!prompt.trim() || seeds < 1}>
          plant it · {seeds} {seeds === 1 ? 'seed' : 'seeds'}
        </button>
        <button type="button" className="put-back quiet" onClick={close}>not now</button>
      </div>
    </div>
  )
}

export function Questions() {
  const view = useQuestions((state) => state.view)
  const questions = useWorldSlice((state) => state.questions)
  if (!view) return null
  if (view.kind === 'plant') return <PlantQuestion />
  const round = view.kind === 'current'
    ? questions.current
    : questions.history.find((item) => item.id === view.roundId) ?? null
  if (!round) return null
  return <RoundSheet key={round.id} round={round} />
}

export function QuestionSeedNotice() {
  const notice = useQuestions((state) => state.seedNotice)
  const clear = useQuestions((state) => state.clearNotice)
  useEffect(() => {
    if (notice === 0) return
    const timer = window.setTimeout(clear, 5200)
    return () => window.clearTimeout(timer)
  }, [notice, clear])
  if (notice === 0) return null
  return (
    <div className="question-earned" role="status">
      <span aria-hidden="true">✦</span>
      <p><b>a question seed came with the saving</b><small>plant it at the Tree whenever you like</small></p>
    </div>
  )
}
