/**
 * The one mistake this codebase keeps making, caught before it costs an hour.
 *
 * `npx tsx scripts/shader-check.ts`
 *
 * ---------------------------------------------------------------------------
 * **A backtick inside a shader ends the shader.**
 *
 * Every shader here is written as a `/* glsl *\/`-tagged template so the editor
 * colours it, and every shader is documented the way the rest of the code is:
 * in prose, with the names of things quoted. In Markdown and in JSDoc you quote
 * a name with backticks. Inside a template literal a backtick *closes* it, and
 * everything after is parsed as JavaScript.
 *
 * The failure is uniquely good at hiding. It is never a shader error, because
 * the shader is never compiled — it is a parse error, reported several hundred
 * lines away as a stray comma or an unterminated string, often in a file
 * nobody touched. It has cost real time three times in the Glasshouse and once
 * in the Drowned Mile, always in the same shape, always after writing a comment
 * that read perfectly well.
 *
 * **What it cannot do is look for a backtick inside the shader**, which was the
 * first version of this file and was worse than useless: by definition the
 * template *ends* at the first backtick, so there is never one inside. It found
 * three in `Stars` that were the ordinary ends of ordinary shaders.
 *
 * What it looks for instead is the symptom. GLSL ends on a brace or a
 * semicolon — a whole shader closes `main`, a shared chunk closes its last
 * declaration. Prose ends on a word. So if a template that opened as a shader
 * ends on anything else, it did not end where its author thought it did, and
 * the backtick that ended it is in the last line printed.
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const OPEN = '/* glsl */ `'

function walk(dir: string, into: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, into)
    else if (/\.(ts|tsx)$/.test(path)) into.push(path)
  }
  return into
}

/**
 * Where the template actually ends, which is the whole question.
 *
 * The first backtick that is neither escaped nor inside a `${...}` — the same
 * rule the JavaScript parser uses, because the point is to see the file the way
 * it will be read rather than the way it was meant.
 */
function endOfTemplate(source: string, from: number): number {
  let i = from
  let depth = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '$' && source[i + 1] === '{') {
      depth++
      i += 2
      continue
    }
    if (c === '}' && depth > 0) {
      depth--
      i++
      continue
    }
    if (c === '`' && depth === 0) return i
    i++
  }
  return -1
}

interface Fault {
  file: string
  line: number
  ends: string
}

const files = walk(ROOT)
const faults: Fault[] = []
let shaders = 0
let spliced = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  let at = source.indexOf(OPEN)
  while (at >= 0) {
    shaders++
    const from = at + OPEN.length
    const end = endOfTemplate(source, from)
    const body = source.slice(from, end < 0 ? source.length : end)
    spliced += (body.match(/\$\{/g) ?? []).length

    /*
      GLSL statements end on a brace or a semicolon — a whole shader closes
      `main`, and the shared chunks that are only uniform declarations close
      the last one. Prose ends on a word. So a template that opened as a
      shader and ends on anything but those two closed itself in a comment.
    */
    const tail = body.replace(/\s+$/, '')
    if (!tail.endsWith('}') && !tail.endsWith(';')) {
      faults.push({
        file,
        line: source.slice(0, end < 0 ? source.length : end).split('\n').length,
        ends: tail.split('\n').pop()!.trim().slice(-70),
      })
    }

    at = source.indexOf(OPEN, end < 0 ? source.length : end + 1)
  }
}

console.log('\nShaders')
console.log('─'.repeat(30))
console.log(`  swept           ${shaders} shaders across ${files.length} files`)
console.log(`  spliced         ${spliced} shared chunks and baked constants`)

if (faults.length === 0) {
  console.log('  every one ends  on a brace or a semicolon, so none of them ends early')
  console.log('\n  All of it holds.\n')
} else {
  for (const fault of faults) {
    console.log(`\n  ${fault.file}:${fault.line}`)
    console.log('    This shader ends here, on prose rather than on GLSL — so it ended early.')
    console.log('    Look for a backtick in a comment just above; it closed the string.')
    console.log(`    ends on: …${fault.ends}`)
  }
  console.log(`\n  ${faults.length} to fix.\n`)
  process.exitCode = 1
}
