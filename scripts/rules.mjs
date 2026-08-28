/**
 * Writes the security rules out with the two real addresses filled in.
 *
 *   npm run rules
 *
 * Why this exists: the rules have to know which two addresses are allowed, and
 * so does the app. Keeping that fact in two hand-edited files and one env file
 * is three places to get it wrong, and the failure mode is silent — the rules
 * simply deny everything and the garden looks broken for no visible reason.
 *
 * So .env.local is the only place the addresses are written, and this generates
 * the rest. The templates keep placeholders and are safe to commit; the output
 * has real addresses in it and is ignored.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'rules-out')

function envFile() {
  try {
    return readFileSync(join(root, '.env.local'), 'utf8')
  } catch {
    fail('No .env.local. Copy .env.example to .env.local first.')
  }
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

function read(env, key) {
  const line = env.split('\n').find((l) => l.trim().startsWith(`${key}=`))
  const value = line?.slice(line.indexOf('=') + 1).trim() ?? ''
  if (value === '') {
    fail(
      `${key} is empty in .env.local.\n` +
        `  Both addresses have to be filled in — without them the rules would\n` +
        `  either lock you both out or let anyone in, and neither is worth guessing.`,
    )
  }
  return value.toLowerCase()
}

const env = envFile()
const warm = read(env, 'VITE_WARM_EMAIL')
const cool = read(env, 'VITE_COOL_EMAIL')

if (warm === cool) {
  fail('VITE_WARM_EMAIL and VITE_COOL_EMAIL are the same address.')
}

mkdirSync(OUT, { recursive: true })

/**
 * Where each one goes, in the order the console wants them.
 *
 * The order is not arbitrary: Firestore first because everything else in the
 * garden is dead without it, Storage last because it is the one that did not
 * exist until the Glasshouse and is therefore the one that gets forgotten.
 */
const FILES = [
  {
    name: 'firestore.rules',
    where: 'Firestore Database → Rules',
    console: 'Firestore Database → the **Rules** tab along the top',
    what:
      'everything that is kept — the letters, the thoughts, both games, the ' +
      'memories in the glass, and the car settings.',
    fence: 'js',
  },
  {
    name: 'database.rules.json',
    where: 'Realtime Database → Rules',
    console: 'Realtime Database → the **Rules** tab along the top',
    what:
      'presence only — where the two of you are standing right now, and the ' +
      'two live invitations that ride on it.',
    fence: 'json',
  },
  {
    name: 'storage.rules',
    where: 'Storage → Rules',
    console: 'Storage → the **Rules** tab along the top',
    what:
      'the bytes — photographs in the Glasshouse and voice-lights in the ' +
      'Stars. This is the one that gets forgotten.',
    fence: 'js',
  },
]

/**
 * Take the prose out.
 *
 * The templates in the repo root are heavily commented and should stay that
 * way — they are where the reasoning about the security model lives, and
 * somebody changing a rule needs to read why it is the shape it is. What gets
 * pasted into a console is a different artefact with a different job: it is
 * the rule, and nothing else. Four hundred lines of explanation in a text box
 * you are scrolling through at one in the morning is not documentation, it is
 * somewhere for a mistake to hide.
 *
 * So: the repo keeps the argument, `rules-out/` keeps the rule.
 *
 * **Written as a scanner rather than a regular expression**, because the naive
 * version is one string away from being wrong. These files contain
 * `'image/webp'`, `'audio/(webm|mp4|ogg)(;.*)?'` and a handful of other
 * quoted things with slashes and stars in them, and a regex that strips
 * `/* … *\/` without knowing what a string is will happily eat the middle of
 * one and leave rules that still parse and no longer mean what they say. That
 * is the worst possible failure here: not a crash, a quietly wrong door.
 */
function stripComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const c = source[i]
    const next2 = source.slice(i, i + 2)
    if (quote) {
      out += c
      if (c === '\\') {
        out += source[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (next2 === '//') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (next2 === '/*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    out += c
    i += 1
  }
  return (
    out
      // Lines that held only a comment are now blank; drop the whitespace they
      // left behind before collapsing, or they survive as "empty" lines full
      // of spaces and nothing collapses at all.
      .split('\n')
      .map((line) => (line.trim() === '' ? '' : line.replace(/\s+$/, '')))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\{\n\n/g, '{\n')
      .trim() + '\n'
  )
}

/** The RTDB file is JSON, and its comments are `"//"` keys. */
function stripJsonComments(source) {
  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip)
    if (value === null || typeof value !== 'object') return value
    const out = {}
    for (const [key, inner] of Object.entries(value)) {
      if (key.startsWith('//')) continue
      out[key] = strip(inner)
    }
    return out
  }
  return JSON.stringify(strip(JSON.parse(source)), null, 2) + '\n'
}

/**
 * Prove the stripping did not change what the rules *do*.
 *
 * Cheap structural checks, and they exist because the cost of being wrong here
 * is not an error message — it is a door that is open, or a garden that denies
 * both of you and says nothing about why. If any of these trip, nothing is
 * written at all.
 */
function sameRules(name, before, after) {
  const count = (text, needle) => text.split(needle).length - 1
  const brace = (text) => count(text, '{') - count(text, '}')
  const problems = []
  for (const keyword of ['match ', 'allow ', 'function ', 'if ']) {
    if (count(before, keyword) !== count(after, keyword)) {
      problems.push(`${count(before, keyword)} "${keyword.trim()}" became ${count(after, keyword)}`)
    }
  }
  if (brace(after) !== 0) problems.push(`braces do not balance (${brace(after)} unclosed)`)
  for (const address of [warm, cool]) {
    if (count(before, address) !== count(after, address)) {
      problems.push(`an address went missing`)
    }
  }
  if (problems.length > 0) {
    fail(
      `Stripping the comments out of ${name} changed it:\n    ` +
        problems.join('\n    ') +
        '\n\n  Nothing was written. This is a bug in stripComments, not in your rules.',
    )
  }
}

const filled = FILES.map((file) => {
  const full = readFileSync(join(root, file.name), 'utf8')
    .replaceAll('__WARM_EMAIL__', warm)
    .replaceAll('__COOL_EMAIL__', cool)
  const body = file.fence === 'json' ? stripJsonComments(full) : stripComments(full)
  if (file.fence !== 'json') sameRules(file.name, full, body)
  return { ...file, body: body.trimEnd(), lines: body.trim().split('\n').length, was: full.trim().split('\n').length }
})

for (const file of filled) {
  writeFileSync(join(OUT, file.name), file.body + '\n')
  console.log(`  wrote rules-out/${file.name}  (${file.was} lines of template -> ${file.lines} of rule)`)
}

/*
  And all three in one file, in paste order.

  Three files in a folder is three chances to publish two of them, and the
  failure mode of publishing two of them is a garden that works right up
  until the moment somebody hangs a photograph. One document, in order, each
  block labelled with the exact screen it belongs on, is a checklist you can
  hold a thumb against — which is what this actually is at the console.

  **No prose inside the code blocks.** Everything worth saying is said
  *around* them, so the only thing ever being copied is the rule itself. The
  argument for why each rule is shaped the way it is lives in the templates
  in the repo root, which is where somebody changing one will be.
*/
const bundle = [
  '# The three rule files, in the order to paste them',
  '',
  'Generated by `npm run rules` on ' + new Date().toISOString().slice(0, 10) + ', for',
  `**${warm}** (warm) and **${cool}** (cool).`,
  '',
  'All of it is at <https://console.firebase.google.com>, in the garden project.',
  '',
  '| | Go to | Paste | Then |',
  '|---|---|---|---|',
  ...filled.map(
    (file, i) => `| ${i + 1} | **${file.where}** | block ${i + 1} below | press **Publish** |`,
  ),
  '',
  'Each screen has its own **Publish** button, and none of them do anything',
  'until it is pressed. Publishing two of the three is the failure that looks',
  'like the app is broken for no reason — so it is worth going back and',
  'checking all three took.',
  '',
  'Select everything inside a block and replace whatever is already in the',
  'editor. You are not merging with what is there: each of these is complete.',
  '',
  '> Generated, and it has your real addresses in it, so it is gitignored and',
  '> should not be edited by hand — change `.env.local` and run the command',
  '> again. The commented originals are the three files in the repo root.',
  '',
  ...filled.flatMap((file, i) => [
    '---',
    '',
    `## ${i + 1}. ${file.where}`,
    '',
    `**Protects** ${file.what}`,
    '',
    `**Where** Build → ${file.console}`,
    '',
    `\`\`\`${file.fence}`,
    file.body.trimEnd(),
    '```',
    '',
    '→ **Publish**',
    '',
  ]),
  '---',
  '',
  '## Once all three are published',
  '',
  'Back in the app: `npm run dev`, sign in, and check `/dev7731` says',
  '`connected` rather than `local · nothing is saved`. Then leave a thought at the',
  'Tree, a voice-light in the Stars and a photograph in the Glasshouse, and',
  'hard-refresh. Those three between them exercise all three files — Part 4 of',
  '`STEPS.md` has the whole list.',
  '',
].join('\n')

writeFileSync(join(OUT, 'PASTE-ME.md'), bundle)
console.log('  wrote rules-out/PASTE-ME.md')

console.log(`
  Both filled in with:
    warm  ${warm}
    cool  ${cool}

  Open  rules-out/PASTE-ME.md  and work down it. All three, in order,
  Publish on each. Nothing reads any of them until you do.

  (The three files are beside it if you would rather copy them one at a time.)
`)
