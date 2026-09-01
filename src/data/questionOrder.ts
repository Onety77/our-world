import type { QuestionRound } from './types'

/** An untouched question gets one full day at the roots. */
export const QUESTION_UNTOUCHED_LIFE = 24 * 60 * 60 * 1000

export function hasQuestionAnswer(round: QuestionRound): boolean {
  return round.answered.warm || round.answered.cool
}

/** Only a question nobody touched can fade, and only after a full day. */
export function isQuestionExpired(
  round: QuestionRound,
  at = Date.now(),
): boolean {
  return !hasQuestionAnswer(round)
    && round.completedAt === null
    && at >= round.openedAt + QUESTION_UNTOUCHED_LIFE
}

/** One answer protects a round for as many days as the other person needs. */
export function isQuestionWaiting(
  round: QuestionRound,
  at = Date.now(),
): boolean {
  const complete = round.answered.warm && round.answered.cool
  return !complete && !isQuestionExpired(round, at)
}

/** The fade clock exists only while nobody has answered. */
export function questionExpiresAt(round: QuestionRound | null): number | null {
  if (!round || hasQuestionAnswer(round) || round.completedAt !== null) return null
  return round.openedAt + QUESTION_UNTOUCHED_LIFE
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
  at = Date.now(),
): QuestionRound | null {
  const ordered = rounds.toSorted((a, b) => a.openedAt - b.openedAt)
  const requested = requestedId
    ? ordered.find((round) => round.id === requestedId && isQuestionWaiting(round, at))
    : undefined

  return requested
    ?? ordered.find((round) => isQuestionWaiting(round, at))
    ?? ordered.toReversed().find((round) => round.completedAt !== null)
    ?? null
}
