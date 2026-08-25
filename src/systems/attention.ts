/**
 * Whether something has taken the screen.
 *
 * **Why this exists.** The garden's ambient text — the name of the place, the
 * marks along the bottom, the two of you and the distance between you, the
 * invitation to do the thing this place is for — was rendered unconditionally,
 * by four separate components, none of which had any idea whether anything
 * else was on screen. So opening a game drew the board *straight through* the
 * row of games behind it and the clocks in the corner, and the same was true
 * of every letter and every form.
 *
 * The fix is not four `if` statements. It is one question, asked in one place,
 * that every new full-screen thing joins automatically — otherwise the next
 * overlay anyone adds reintroduces exactly this bug and nobody notices until
 * it is in a screenshot.
 *
 * **What stays.** The music, because it plays *through* everything and is the
 * one thing you want to reach without leaving what you are doing. And the
 * trouble line, because a failure must always be able to say so.
 */

import { usePlaying } from './playing'
import { useReading } from './reading'
import { usePot } from './pot'
import { useProfileSheet } from './profileSheet'
import { useArrival } from './arrival'

/**
 * True while anything is filling the screen.
 *
 * Each of these is a thing you are *in*, not a thing you can see past: a game
 * being played, a thought being read or written, money being put by, your own
 * profile open. Anything added later that covers the world belongs here.
 *
 * **The corner conversation is deliberately not on this list.** It was, for
 * about a day, and it was the wrong fix for a real problem: it had been put in
 * the bottom left, on top of the name of the place and the way into it, and
 * making the place card *disappear* is not how you resolve two things wanting
 * one corner — you move one of them. It lives with the music now. Typing into
 * it is safe without any of this, because `ui/Places` already ignores keys
 * while a text field has focus and ignores taps aimed at a control.
 */
export function useTakenOver(): boolean {
  // The way in counts. It covers the whole world, and the world's gestures are
  // bound to `window` — so without this, a tap meant for the door reaches the
  // meadow behind it.
  const shut = useArrival((s) => s.shut)
  const playing = usePlaying((s) => s.gameId !== null)
  const reading = useReading((s) => s.openLetterId !== null)
  const composing = useReading((s) => s.composing)
  const pot = usePot((s) => s.open)
  const profile = useProfileSheet((s) => s.open)
  return shut || playing || reading || composing || pot || profile
}

/**
 * The same question, outside React.
 *
 * For window listeners. A listener registered in an effect closes over the
 * value it saw when it was bound, and the whole point of this is to be right
 * at the moment an event arrives — which is often the moment the value
 * changed.
 */
export function takenOverNow(): boolean {
  return (
    useArrival.getState().shut ||
    usePlaying.getState().gameId !== null ||
    useReading.getState().openLetterId !== null ||
    useReading.getState().composing ||
    usePot.getState().open ||
    useProfileSheet.getState().open
  )
}
