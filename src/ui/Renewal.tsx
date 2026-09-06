/**
 * One line, when there is a newer garden waiting.
 *
 * Same idiom as `Trouble` — on the world, with a lift shadow, no panel and
 * nothing to dismiss. Two differences, and both are the point:
 *
 * **It does not clear itself.** A failure that goes away is fine, because the
 * thing to do about it is try again and you already can. This is an offer, and
 * an offer that vanishes after five seconds is one somebody has to catch.
 *
 * **It is the only text in the garden you can touch that is not part of the
 * world.** So it says as little as possible and asks for one tap. It is
 * deliberately not in a corner: every corner is spoken for (see `.corner` in
 * `PLAN.md`), and this belongs to none of them — it is about the garden
 * itself rather than anything in it, it appears a few times a year, and
 * putting it in a corner would mean one of the four had to move for something
 * that is usually not there.
 */

import { useRenewal } from '@/systems/renewal'

export function Renewal() {
  const ready = useRenewal((s) => s.ready)
  const take = useRenewal((s) => s.take)

  if (!ready) return null

  return (
    <div className="renewal" role="status" aria-live="polite">
      <span>the garden has grown a little. </span>
      <button type="button" onClick={take}>
        come through
      </button>
    </div>
  )
}
