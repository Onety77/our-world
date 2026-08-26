/**
 * The Tree's own questions.
 *
 * Deliberately finite, edited writing rather than generated filler. A question
 * can return after the whole bank has been walked, but not before. Questions
 * either person plants are folded into this pool later and carry no author in
 * the round that is eventually opened.
 */
export const QUESTION_PROMPTS = [
  'What felt unexpectedly gentle today?',
  'What is something small I do that makes you feel chosen?',
  'Which ordinary day with me would you happily live again?',
  'What have you wanted to tell me, but never found the right doorway into?',
  'What part of our future feels clearest to you right now?',
  'When did you last feel especially close to me?',
  'What is one thing you hope we never become too busy for?',
  'What place would you like us to discover slowly together?',
  'What did you notice about me before you knew it mattered?',
  'What kind of home would make your shoulders drop when you enter it?',
  'What memory of us still makes you smile before you mean to?',
  'What do you think we understand about each other that nobody else quite does?',
  'What would make this season of our lives feel well lived?',
  'Which version of yourself do you feel safest being with me?',
  'What is one promise you would rather show than say?',
  'What do you wish I could see through your eyes for one minute?',
  'What is a tiny adventure we could actually make happen soon?',
  'What song feels closest to us lately, and why?',
  'What are you quietly proud of me for?',
  'What do you want more room for between us?',
  'What was the best part of your day that nobody else would think to ask about?',
  'What makes distance feel smaller for you?',
  'What should we celebrate more often?',
  'What is something about you that is still changing?',
  'Which conversation between us changed something for you?',
  'What would our perfect unplanned afternoon look like?',
  'What do you hope I remember when you are having a difficult day?',
  'What is one thing we are already doing better than we realize?',
  'What would you put into a time capsule for the two of us?',
  'What kind of silence with me feels good?',
  'What are you learning about love from us?',
  'What do you want us to be brave enough to try?',
  'Which detail from the first days of us do you never want to lose?',
  'What does being cared for look like to you this week?',
  'What is one question you wish people asked you more often?',
  'What do you imagine we will laugh about years from now?',
  'Where do you feel most like yourself?',
  'What is something beautiful you saw recently and wished I could see too?',
  'What would make tomorrow feel lighter?',
  'What is a habit you would love for us to grow together?',
  'When have I made you feel understood without saying much?',
  'What is one thing you want to protect in our relationship?',
  'What would you like our next reunion to feel like?',
  'What do you think our younger selves would be surprised to know about us?',
  'What is one ordinary thing you look forward to doing beside me?',
  'What have you changed your mind about lately?',
  'What do you want to remember about who we are right now?',
  'What kind of encouragement reaches you best?',
  'What is a dream you have not said out loud often enough?',
  'Which of our differences has taught you something good?',
  'What is something we could make easier for each other?',
  'What does a peaceful life together look like in one scene?',
  'What is one thing about today you want to leave behind?',
  'What part of loving me feels most natural to you?',
  'What are you looking forward to that has nothing to do with achievement?',
  'What would you like us to photograph the next time we are together?',
  'What is a kindness you received that stayed with you?',
  'What is one thing you want me to ask you about again?',
  'What does “enough” look like to you lately?',
  'Which part of our story feels like it could only have happened to us?',
  'What are you carrying today that I can help make lighter?',
  'What would make you feel especially loved this month?',
  'What is one thing you hope our future home sounds like?',
  'What do you think we will be grateful we started now?',
  'What is a side of you you want us to make more space for?',
  'If we could keep one hour from this year forever, which would it be?',
  'What do you want us to save toward after the current dream?',
  'What is something about us that feels quietly rare?',
  'What are you hopeful about today?',
  'What should the two of us never stop being curious about?',
  'What is one way I can meet you better where you are?',
  'What would you want written beneath a photograph of us ten years from now?',
] as const

export const QUESTION_DAY = 86_400_000

/** Stable, small hash used for ordering—not security and never presented as it. */
export function questionHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
