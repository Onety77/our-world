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

for (const name of ['firestore.rules', 'database.rules.json']) {
  const filled = readFileSync(join(root, name), 'utf8')
    .replaceAll('__WARM_EMAIL__', warm)
    .replaceAll('__COOL_EMAIL__', cool)
  writeFileSync(join(OUT, name), filled)
  console.log(`  wrote rules-out/${name}`)
}

console.log(`
  Both filled in with:
    warm  ${warm}
    cool  ${cool}

  Paste rules-out/firestore.rules      into  Firestore Database → Rules
  Paste rules-out/database.rules.json  into  Realtime Database → Rules

  Publish each one. Nothing reads them until you do.
`)
