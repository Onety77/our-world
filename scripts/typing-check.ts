/**
 * "She is writing" — every way it can lie, and that it does not.
 *
 * -----------------------------------------------------------------------------
 * This is four lines of arithmetic and one boolean on the wire, and it is still
 * worth a harness, because every bug a typing indicator can have is a *timing*
 * bug and none of them can be seen by reading the code:
 *
 *   · it sticks on forever when a phone drops out mid-sentence
 *   · it flickers because one refresh was lost
 *   · it says somebody is typing after their message has already arrived
 *   · it writes once per keystroke and nobody notices until the bill
 *   · it tells you about yourself
 *
 * The first is the one that matters. It is the classic, every chat app has
 * shipped it, and the reason it happens is that the fix people reach for — a
 * clear-on-exit write — is unavailable in exactly the case that causes it.
 *
 *   npm run typing
 * -----------------------------------------------------------------------------
 */

import {
  FRESH_FOR,
  REFRESH,
  isTyping,
  makeReporter,
  otherThan,
  shouldReport,
  writingLine,
} from '../src/systems/typing'
import type { Presence } from '../src/data/types'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const her = (over: Partial<Presence>): Presence => ({
  id: 'cool',
  online: true,
  placeId: 'stars',
  position: [0, 0, 0],
  heading: 0,
  lastSeen: 0,
  ...over,
})

console.log('\nreading it\n')

{
  const now = 1_000_000
  ok('a report from a moment ago is believed', isTyping(her({ typing: now - 900 }), now))
  ok('and one from four seconds ago still is', isTyping(her({ typing: now - 4000 }), now))
  /*
    THE ONE THAT MATTERS.

    A phone in a tunnel, a tab closed mid-sentence, a browser killed by the OS
    — in all three the last thing sent was "I am typing" and nothing will ever
    follow it. A boolean stays true and the other person watches "she is
    writing…" for the rest of the evening. The whole reason this is a timestamp
    is so that no write is needed to end it.
  */
  ok(
    'a phone that vanished mid-sentence stops claiming to be typing',
    !isTyping(her({ typing: now - FRESH_FOR - 1 }), now),
    `${FRESH_FOR}ms window`,
  )
  ok('somebody offline is never typing', !isTyping(her({ typing: now, online: false }), now))
  ok('and neither is somebody who never was', !isTyping(her({}), now))
  ok('nor a zero, which is how a clear is sent', !isTyping(her({ typing: 0 }), now))
  ok('nor nonsense', !isTyping(her({ typing: Number.NaN }), now))
  ok('nobody at all is not typing', !isTyping(undefined, now))

  /*
    Two devices seven timezones apart share a *server* clock, but not a perfect
    one. A stamp a second in the future is skew, not a message from tomorrow —
    it has to be believed, or the indicator never comes on for whichever of the
    two of you is running slightly behind.
  */
  ok('a stamp slightly in the future is clock skew, and is believed',
    isTyping(her({ typing: now + 900 }), now))
  ok('but not one from next week', !isTyping(her({ typing: now + 999_000 }), now))
}

console.log('\nsending it\n')

{
  ok(`the window is more than twice the refresh — ${FRESH_FOR}ms to ${REFRESH}ms`,
    FRESH_FOR > REFRESH * 2,
    'otherwise one lost write makes it flicker')

  ok('a report is refused before the interval is up', shouldReport(1000, 1000 + REFRESH - 1) === null)
  ok('and allowed once it is', shouldReport(1000, 1000 + REFRESH) === 1000 + REFRESH)
}

console.log('\ntyping a message\n')

{
  const post = makeReporter()
  let clock = 500_000

  // The first keystroke must go straight out. A three-second wait would mean
  // short messages land before the news that they were being written.
  const first = post.onDraft('h', clock)
  ok('the first keystroke reports immediately', first === clock, String(first))

  // ...and then the next forty do not.
  let writes = 0
  for (let i = 0; i < 40; i++) {
    clock += 60
    if (post.onDraft('hello there how are you'.slice(0, i + 2), clock) !== null) writes++
  }
  ok('but the next forty keystrokes send nothing', writes === 0, `${writes} writes`)

  // Still writing a while later: one refresh, not a flood.
  clock += REFRESH
  ok('a refresh goes out once the interval has passed', post.onDraft('hello there', clock) === clock)

  /*
    And sending must stop it *at once*.

    If this waited for the clock, the indicator would outlive the message it
    was announcing — she reads what you said and is still told you are writing,
    which reads as a second message that never comes.
  */
  const cleared = post.onDraft('', clock + 10)
  ok('emptying the draft clears it immediately', cleared === 0, String(cleared))
  ok('and clearing twice does not send twice', post.onDraft('', clock + 20) === null)

  // Closing the composer on a half-written draft has to clear it too.
  const again = makeReporter()
  again.onDraft('half a thought', clock)
  ok('closing the composer mid-draft clears it', again.stop() === 0)
  ok('and closing it twice does not send twice', again.stop() === null)
  ok('closing one that was never writing sends nothing', makeReporter().stop() === null)

  /*
    Whitespace is not writing. Otherwise leaning on the space bar, or a draft
    left as a single newline, reports forever — and the reporter would never
    reach its "stopped" branch because the draft is technically non-empty.
  */
  const spaces = makeReporter()
  ok('spaces alone are not writing', spaces.onDraft('   \n ', clock) === null)
}

console.log('\nand it is about her, not you\n')

{
  ok('warm watches cool', otherThan('warm') === 'cool')
  ok('cool watches warm', otherThan('cool') === 'warm')
  /*
    The line is built from a name passed in, so there is no pronoun in it and
    nothing for `npm run pronouns` to find. Checked here because the temptation
    when writing this feature is a hard-coded "she is typing…".
  */
  ok('the line uses whatever name it is given', writingLine('Tife') === 'Tife is writing')
  ok('and carries no pronoun of its own', !/\b(she|her|his|him|their)\b/i.test(writingLine('Tife')))
  ok('and no ellipsis, because the garden does not use them',
    !writingLine('Tife').includes('...') && !writingLine('Tife').includes('…'))
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
