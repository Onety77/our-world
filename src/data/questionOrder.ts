import type { QuestionRound } from './types'

/** A round remains live until both people have answered it. */
export function isQuestionWaiting(round: QuestionRound): boolean {
  return !round.answered.warm || !round.answered.cool
}

/**
 * Pick what the Tree should be asking.
 *
 * An explicit control-room choice wins only while it is unfinished. Otherwise
 * the oldest unfinished round wins, so a later document can never bury a
 * question that one person has already answered. Once everything is complete,
 * the most recently opened round remains at the roots until another grows.
 */
export function activeQuestion(
  rounds: QuestionRound[],
  requestedId: string | null,
): QuestionRound | null {
  const ordered = rounds.toSorted((a, b) => a.openedAt - b.openedAt)
  const requested = requestedId
    ? ordered.find((round) => round.id === requestedId && isQuestionWaiting(round))
    : undefined

  return requested ?? ordered.find(isQuestionWaiting) ?? ordered.at(-1) ?? null
}
