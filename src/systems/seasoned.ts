/**
 * How much of itself the Hollow has earned.
 *
 * ---------------------------------------------------------------------------
 * Every other place in this garden keeps what happens in it. The Tree grows a
 * thought each time either of you writes one; the Wellspring rises; the Stars
 * gain a light; the Glasshouse gains a pane and the vines at its old end
 * thicken. **The Hollow was the only room that never changed.** You could play
 * a hundred rounds by that fire and come back to exactly the cave you first
 * walked into, which quietly says that none of it counted.
 *
 * So ember veins spread through its rock, very slowly, as the two of you spend
 * time in it.
 *
 * **It is not a score and it must never become one.** Two rules keep it honest:
 *
 * It is *slow*. Half lit is somewhere north of fifty finished rounds, which at
 * one a day is most of a season. If you can watch it move in an evening you
 * will start playing to move it, and then it is a progress bar with rocks
 * drawn on it.
 *
 * And it only ever goes **up**. Pollen is a shared pool that gets spent, so
 * reading it directly would dim the cave the day you bought something with it
 * — a room punishing you for using the thing it gave you. The high-water mark
 * is kept here, on the device, and the two are combined: whichever is larger
 * wins. Earning brightens it; spending cannot darken it.
 *
 * The device mark is a floor rather than the truth, so a new phone starts from
 * whatever the pot currently holds and climbs from there. It can be behind. It
 * cannot be wrong in the direction that matters.
 * ---------------------------------------------------------------------------
 */

const KEY = 'garden:seasoned:v1'

/**
 * How much pollen the two of you have ever had at once.
 *
 * Reads and re-writes the mark in one call, because every caller wants the
 * combined figure and none of them wants to remember to record it.
 */
export function everEarned(pollenNow: number): number {
  let mark = 0
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw === null ? 0 : Number(raw)
    if (Number.isFinite(parsed)) mark = parsed
  } catch {
    /* a private window. The cave is simply as lit as the pot is full. */
  }
  const best = Math.max(mark, pollenNow)
  if (best > mark) {
    try {
      localStorage.setItem(KEY, String(best))
    } catch {
      /* ignore */
    }
  }
  return best
}

/**
 * How far the veins have spread, 0 to 1.
 *
 * The curve matters as much as the number. Linear would put most of the change
 * in the first fortnight and none of it thereafter, which is the wrong way
 * round for something meant to reward a year. This starts almost imperceptibly
 * and never quite arrives: at ten rounds it is a hint you would not swear to,
 * at fifty it is unmistakably a different room, and it still has somewhere to
 * go after two hundred.
 */
export function seasonedBy(pollenNow: number): number {
  const ever = everEarned(pollenNow)
  // Five pollen a settled round — see useSettlement — so this is in rounds.
  const rounds = ever / 5
  return 1 - Math.exp(-rounds / 70)
}
