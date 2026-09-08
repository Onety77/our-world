/**
 * Is `systems/colour` the same as three's `Color`?
 *
 * ---------------------------------------------------------------------------
 * The palette stopped importing three so that three hundred and seventy-three
 * kilobytes of renderer would stop being parsed in front of the sign-in screen.
 * That is only a good trade if the colours are *identical* — a colour pipeline
 * that is nearly right shifts every sky, every grass, every fog in the world by
 * a shade nobody can quite name, and it does it everywhere at once.
 *
 * So this compares the two directly, on the operations the palette actually
 * performs, across the whole hue circle and every colour the garden ships. One
 * digit of difference is a failure.
 *
 *   npm run colour
 * ---------------------------------------------------------------------------
 */

import { Color } from 'three'
import { Tone } from '../src/systems/colour'
import { FLOWER_COLORS, LIGHT_COLORS } from '../src/systems/palette'

let checked = 0
const faults: string[] = []

function same(what: string, mine: string, theirs: string) {
  checked++
  if (mine !== theirs) faults.push(`${what}: ${mine} vs three's ${theirs}`)
}

/** Every colour the world actually uses, plus a sweep of the hue circle. */
function everyColour(): string[] {
  const out = [
    '#000000', '#ffffff', '#010101', '#fefefe', '#7f7f7f', '#080808',
    ...Object.values(LIGHT_COLORS),
    ...FLOWER_COLORS,
  ]
  // The hue circle at a few values, which is where a bad transfer curve shows.
  for (let h = 0; h < 360; h += 7) {
    for (const v of [0.12, 0.4, 0.75, 1]) {
      const c = new Color().setHSL(h / 360, 0.7, v * 0.5)
      out.push(`#${c.getHexString()}`)
    }
  }
  return out
}

const colours = everyColour()

// --- set, then straight back out --------------------------------------------
for (const hex of colours) {
  same(`round trip ${hex}`, new Tone().set(hex).getHexString(), new Color(hex).getHexString())
}

// --- lerp, at every mix ------------------------------------------------------
for (let i = 0; i < colours.length; i++) {
  const a = colours[i]
  const b = colours[(i * 7 + 3) % colours.length]
  for (const t of [0, 0.07, 0.25, 0.5, 0.63, 0.9, 1]) {
    const mine = new Tone().set(a).lerp(new Tone().set(b), t).getHexString()
    const theirs = new Color(a).lerp(new Color(b), t).getHexString()
    same(`lerp ${a}->${b} @${t}`, mine, theirs)
  }
}

// --- what `dulled` does: mean, setRGB, lerp, multiplyScalar ------------------
for (const hex of colours) {
  for (const [out, dark] of [[0.3, 0.1], [0.8, 0.45], [1, 0], [0, 0.6]]) {
    const a = new Tone().set(hex)
    const flat = (a.r + a.g + a.b) / 3
    const mine = a.lerp(new Tone().setRGB(flat, flat, flat), out).multiplyScalar(1 - dark).getHexString()

    const t = new Color(hex)
    const tFlat = (t.r + t.g + t.b) / 3
    const theirs = t
      .lerp(new Color().setRGB(tFlat, tFlat, tFlat), out)
      .multiplyScalar(1 - dark)
      .getHexString()
    same(`dulled ${hex} ${out}/${dark}`, mine, theirs)
  }
}

console.log(`\n  colour, without three\n`)
console.log(`  compared      ${checked} operations against three's own Color`)
if (faults.length > 0) {
  console.log('\n' + faults.slice(0, 12).map((f) => '  ✗ ' + f).join('\n'))
  console.log(`\n  ${faults.length} differ. The palette cannot use this.\n`)
  process.exit(1)
}
console.log(`  every one     identical, to the digit\n`)
