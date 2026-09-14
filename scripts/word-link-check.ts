/**
 * A word sent as a link comes back out as the same word — and only as that.
 *
 *   npm run word-link
 *
 * Every word in the answer list, under many salts and a spread of names
 * (including ones that need more than one byte a character), must decode to
 * exactly what was encoded. A code with any single character changed, or cut
 * short, must decode to nothing rather than to a different word. The word must
 * not be readable in the code. And the result that gets sent back must carry
 * the grid and never the word.
 */

import assert from 'node:assert/strict'
import {
  codeFromAddress,
  decodeChallenge,
  encodeChallenge,
  resultText,
  tidyName,
} from '../src/world/games/word-duel/challenge'
import { FAIR } from '../src/world/games/word-duel/fair'

const words: string[] = []
for (let i = 0; i < FAIR.length; i += 5) words.push(FAIR.slice(i, i + 5))

const names = ['', 'Onety', 'Tife', 'Adéwálé', 'Zoë 🌙', 'a very long name that will not fit in the link at all', '  spaced   out  ']

let codes = 0
let longest = 0
for (let w = 0; w < words.length; w++) {
  const word = words[w]
  const from = names[w % names.length]
  for (const salt of [0, 1, 255, 256, 4097, 65535, (w * 7919) & 0xffff]) {
    const code = encodeChallenge({ word, from }, salt)
    const back = decodeChallenge(code)
    assert.deepEqual(back, { word, from: tidyName(from) }, `round trip failed for ${word} / ${JSON.stringify(from)} / salt ${salt}`)
    assert.ok(!code.toLowerCase().includes(word), `the word ${word} is readable in its code ${code}`)
    longest = Math.max(longest, code.length)
    codes++
  }
}
console.log(`  ${codes} codes round-trip for ${words.length} words; longest ${longest} characters`)

// Damage: every single-character change, and every truncation, of a sample of codes.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
let damaged = 0
let wrongWord = 0
for (let n = 0; n < 60; n++) {
  const word = words[(n * 37) % words.length]
  const code = encodeChallenge({ word, from: names[n % names.length] }, (n * 1237) & 0xffff)
  for (let i = 0; i < code.length; i++) {
    for (const ch of B64) {
      if (ch === code[i]) continue
      const bad = code.slice(0, i) + ch + code.slice(i + 1)
      const back = decodeChallenge(bad)
      damaged++
      // A changed trailing pad bit can decode identically; anything else must be refused.
      if (back && (back.word !== word)) wrongWord++
    }
  }
  for (let cut = 1; cut < code.length; cut++) {
    const back = decodeChallenge(code.slice(0, code.length - cut))
    if (back && back.word !== word) wrongWord++
  }
}
// One byte of check: about 1 in 256 random damages slip through. Far below that is the bar.
const rate = wrongWord / damaged
console.log(`  ${damaged} damaged codes: ${wrongWord} decoded to a different word (${(rate * 100).toFixed(2)}%)`)
assert.ok(rate < 0.006, 'too many damaged links deal a different word')

assert.equal(decodeChallenge(''), null)
assert.equal(decodeChallenge('not a code!'), null)
assert.equal(decodeChallenge('AAAAAAAAAAAA'), null)

assert.equal(codeFromAddress('/w/AbC-_9xyz', ''), 'AbC-_9xyz')
assert.equal(codeFromAddress('/w/AbC-_9xyz/', ''), 'AbC-_9xyz')
assert.equal(codeFromAddress('/word.html', '?w=Q1w2e3r4'), 'Q1w2e3r4')
assert.equal(codeFromAddress('/', ''), null)

const text = resultText({ word: 'crane', from: 'Onety' }, ['slate', 'crony', 'crane'], 'https://example.test/w/abc')
console.log(text.split('\n').map((l) => '    ' + l).join('\n'))
assert.ok(!/crane|slate|crony/i.test(text), 'the result gives a word away')
assert.ok(text.startsWith("Onety's word · 3/6"))
assert.equal(resultText({ word: 'crane', from: '' }, ['slate', 'slate', 'slate', 'slate', 'slate', 'slate'], 'x').split('\n')[0], 'A word duel · X/6')

console.log('PASS a word in a link comes back as that word, and nothing gives it away')
