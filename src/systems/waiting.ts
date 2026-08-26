/**
 * How many games are waiting on you, for the room to know.
 *
 * ---------------------------------------------------------------------------
 * The Hollow says this in words already — "2 for you", on the way in — and that
 * stays, because a number is the only thing that can tell you *how many*. What
 * it cannot do is make the room feel any different, and a cave with a turn
 * waiting in it should.
 *
 * So the fire throws a few more embers. Not a badge, not a colour change,
 * nothing that could be mistaken for an alert: just a room that is a little
 * more awake than the last time you looked at it.
 *
 * **Written rather than watched, and that is the whole reason this file
 * exists.** The obvious way round is for the cave to ask which games are
 * waiting — but asking means \`useStandings\`, and \`useStandings\` opens a live
 * listener per game. The Hollow's own way in already has all three of them
 * open. A three-dimensional room subscribing a second time to the same three
 * rounds, so it can decide how many sparks to draw, is a real cost on somebody
 * else's phone bill for a decorative one.
 *
 * The interface knows; the room only needs telling. Same shape as \`deep\` in the
 * racer and \`openPane\` in the Glasshouse: a plain object, one owner writing,
 * whoever needs it reading, and nothing subscribed to anything.
 * ---------------------------------------------------------------------------
 */

export const theRoom = {
  /** How many rounds are on your move. 0 when it is all quiet. */
  waitingForYou: 0,
}
