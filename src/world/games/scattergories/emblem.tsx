/**
 * Scattergories, as one object: the letter die, and two hands writing.
 *
 * Word Duel is its stones because its board is stones. Ember Rally is its
 * headlamps because that is the whole picture of the race. This is the die,
 * because the die is the only thing in the game that everybody at the table
 * looks at — and two pencil marks either side of it, one warm and one cool,
 * because the entire game is that you are both answering the same sheet at
 * once and hoping you did not think of the same thing.
 *
 * Loose letters drift around it, faint, as if they had been shaken out.
 */

/** Where the stray letters sit, and how faint each is. */
const LOOSE = [
  { at: [8, 26], size: 0.66, dim: 0.5, ch: 'M' },
  { at: [88, 18], size: 0.54, dim: 0.38, ch: 'T' },
  { at: [20, 76], size: 0.48, dim: 0.32, ch: 'K' },
  { at: [78, 72], size: 0.62, dim: 0.46, ch: 'B' },
  { at: [50, 8], size: 0.46, dim: 0.28, ch: 'R' },
  { at: [64, 90], size: 0.44, dim: 0.26, ch: 'O' },
]

export default function ScattergoriesEmblem() {
  return (
    <span className="emblem emblem-die" aria-hidden="true">
      {LOOSE.map((letter, i) => (
        <i
          key={i}
          className="loose"
          style={{
            left: `${letter.at[0]}%`,
            top: `${letter.at[1]}%`,
            fontSize: `${letter.size}rem`,
            opacity: letter.dim,
          }}
        >
          {letter.ch}
        </i>
      ))}

      {/* the two of you, writing at the same moment */}
      <i className="stroke warm" />
      <i className="stroke cool" />

      {/* and the die between you, with one face lit */}
      <i className="face">S</i>
    </span>
  )
}
