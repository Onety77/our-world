/**
 * Word Duel, as one object: five stones with a word half worked out on them.
 *
 * The board of this game is a row of pebbles, so this is a row of pebbles —
 * the same gradient, the same lopsided radii, the same small rotation. It is
 * not a picture *of* the game, it is a piece of it, which is the difference
 * between an icon and an emblem.
 *
 * **Two of them are lit, one warm and one cool**, and that is the whole game
 * in one detail: a word each. Everywhere else in the garden warm and cool mean
 * the two of you, so a row with one of each on it says "this is a thing for
 * two people" without a line of copy.
 *
 * The shapes are written down rather than generated. `pebble()` in `WordDuel`
 * derives a stone's radii from its letter and position so the same letter is
 * always the same shape; five hard-coded ones here keep this identical on both
 * phones and every time it is drawn, which matters because it sits in a row
 * you swipe back and forth through.
 */

/** Five stones: the radii, the lean, and what is on them. */
const STONES: { radius: string; lean: number; letter?: string; lit?: 'warm' | 'cool' }[] = [
  { radius: '46% 54% 51% 49% / 52% 47% 53% 48%', lean: -3.5, letter: 'W', lit: 'warm' },
  { radius: '58% 42% 47% 53% / 44% 56% 44% 56%', lean: 2 },
  { radius: '43% 57% 56% 44% / 55% 43% 57% 45%', lean: -1.5, letter: 'R', lit: 'cool' },
  { radius: '55% 45% 42% 58% / 48% 54% 46% 52%', lean: 3 },
  { radius: '49% 51% 58% 42% / 43% 55% 45% 57%', lean: -2 },
]

export default function WordDuelEmblem() {
  return (
    <span className="emblem emblem-stones" aria-hidden="true">
      {STONES.map((stone, i) => (
        <i
          key={i}
          className={stone.lit ? `lit ${stone.lit}` : undefined}
          style={{ borderRadius: stone.radius, rotate: `${stone.lean}deg` }}
        >
          {stone.letter}
        </i>
      ))}
    </span>
  )
}
