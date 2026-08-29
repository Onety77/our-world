/**
 * Nothing in the garden should say "she" to the person it means.
 *
 * ---------------------------------------------------------------------------
 * Half the copy in here talks about the other person, and all of it was
 * written from one side. On her screen the whole world called her "she" while
 * addressing her as "you" — a small thing, and the kind that makes a place
 * feel built for somebody else. It was.
 *
 * `systems/them` fixes any one sentence. This is what stops the next one being
 * written the old way: it reads every source file and complains about a bare
 * feminine pronoun left anywhere a person could read it. The tokens — {she},
 * {her}, {their}, {hers} — pass, because those are already the fixed form.
 *
 * It is a text scan, not a parser, so it looks only where a person could be
 * reading: inside string literals, and inside JSX text. That matters more than
 * it sounds. "hers" is a variable in a dozen files and a CSS class in a dozen
 * more, and a checker that shouts about those is a checker nobody runs twice.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'src'

/*
  Things that look like prose and are not. Matched against the whole line.

  `hers` is a `Turn` value and a class name in half the garden — `className="hers"`,
  `all.includes('hers')` — and renaming those would be churn for nothing, since
  nobody reads a class name.
*/
const ALLOWED = [
  /className=/,
  /'hers'|"hers"/,
  /aria-hidden/,
  // The pronoun machinery itself, which has to spell the words out.
  /systems\/them\.ts|systems\/useSay\.ts/,
]

const BARE = /(?<![\w{])(She|she|Her|her|hers|Hers)(?![\w}])/

/*
  Blank out what a reader never sees, keeping the line numbering intact.

  `[ \t]*` rather than `\s*` at the start of a line, because `\s` matches a
  newline: `/^\s*\/\/.*$/` swallows every blank line above a comment along with
  it, and the file quietly gets shorter. The reported line numbers then land
  thirty-odd lines above the sentence they name, which is worse than useless —
  it sends you to a line that looks innocent.
*/
function stripped(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/^[ \t]*import .*$/gm, '')
}

/*
  Only the parts a person reads.

  A quoted thing with no space in it is an identifier wearing quotes, never a
  sentence. Requiring one space is what separates the copy from the code
  without having to know which is which.
*/
const READABLE = [
  /'([^'\n]*\s[^'\n]*)'/g,
  /"([^"\n]*\s[^"\n]*)"/g,
  /`([^`]*\s[^`]*)`/g,
  />([^<>{}]*\s[^<>{}]*)</g,
]

/*
  JSX text with something interpolated in the middle of it.

  The rules above want the text between the tags to be clean, and a line like
  `{them}&rsquo;s three minutes are hers to turn.` is not — so it slipped
  through, which is how this one was nearly missed. Taking the braces and the
  tags out first leaves a run of ordinary words; if what is left reads like
  English and not like code, it is copy.
*/
const WORDS_ONLY = /^[A-Za-z0-9 ,.'’—·:;?!&-]*$/

function asJsxText(line) {
  const bare = line.replace(/{[^{}]*}/g, ' ').replace(/<[^<>]*>/g, ' ')
  if (!WORDS_ONLY.test(bare)) return null
  return bare.trim().split(/s+/).length >= 3 ? bare : null
}

function readable(line) {
  const out = []
  for (const rule of READABLE) {
    rule.lastIndex = 0
    let hit
    while ((hit = rule.exec(line)) !== null) out.push(hit[1])
  }
  const jsx = asJsxText(line)
  if (jsx !== null) out.push(jsx)
  return out
}

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* files(full)
    else if (/\.tsx?$/.test(entry.name)) yield full
  }
}

const found = []
for (const file of files(ROOT)) {
  // One spelling of a path, so the rules above need not know about Windows.
  const named = file.split(path.sep).join('/')
  if (ALLOWED.some((rule) => rule.test(named))) continue
  stripped(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      if (!BARE.test(line)) return
      if (ALLOWED.some((rule) => rule.test(line))) return
      if (!readable(line).some((text) => BARE.test(text))) return
      found.push({ file, line: i + 1, text: line.trim().slice(0, 96) })
    })
}

if (found.length === 0) {
  console.log('\n  the garden speaks to both of you\n')
  process.exit(0)
}

console.log(`\n${found.length} sentence(s) still written from one side:\n`)
for (const f of found) console.log(`  ${f.file}:${f.line}\n    ${f.text}\n`)
console.log(`  Tokenise them — {she} {her} {their} {hers}, capitalised at the start of a
  sentence — and put the string through \`say\` (or \`useSay\`) where it is read.
`)
process.exit(1)
