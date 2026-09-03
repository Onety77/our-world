/**
 * Who the control room opens for.
 *
 * ---------------------------------------------------------------------------
 * `/dev7731` was hidden and nothing else, and hidden is not the same as shut.
 * Both people sign in to this garden; either address landing on that path got
 * the whole room — the car published under the other one mid-corner, the doors
 * on the wall, the sky pinned to an hour she is not living in.
 *
 * So there are two things to keep true, and neither shows on any screen:
 *
 *   1. On the real backend, Warm opens it and Cool does not. `me` there comes
 *      from the address on the account, so this is a real boundary.
 *   2. On the local mock, both do — deliberately. `me` is a localStorage key
 *      there with a dropdown pointed at it, so a gate would stop nobody and
 *      would strand whoever used "look at it as Cool", the switch back being
 *      inside the room. See `systems/dev`.
 *
 * `DATA_BACKEND` is settled once, at module load, from the environment. That
 * makes it exactly the kind of thing a checker cannot ask twice in one
 * process — hence a child per backend, which is the only honest way to see
 * both answers.
 *
 * And one source check on top, because the boundary is only worth as much as
 * its one call site: a later tidy-up that renders the control room straight
 * from `atTheDoor()` again would put everything back, compile cleanly, and
 * look right.
 *
 *   npm run door
 * ---------------------------------------------------------------------------
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(import.meta.url)

/*
  Child mode. Imports the module under one backend and reports what it says.

  Nothing is asserted here — a child that decides things is a child whose
  failures have to be read out of an exit code. It answers, the parent judges.
*/
if (process.env.DOOR_BACKEND) {
  const { mayOpenTheDoor } = await import('../src/systems/dev.ts')
  process.stdout.write(
    JSON.stringify({
      warm: mayOpenTheDoor('warm'),
      cool: mayOpenTheDoor('cool'),
    }),
  )
  process.exit(0)
}

const faults: string[] = []
const check = (ok: boolean, what: string, saw: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok ? '' : ' — ' + saw}`)
  if (!ok) faults.push(what)
}

/*
  Through npx, and not `node --import tsx`, because tsx is not a dependency of
  this project — every check in package.json fetches it on the spot. Spawning
  node directly looked tidier and could not resolve the loader at all.
*/
function ask(backend: 'firebase' | 'local'): { warm: boolean; cool: boolean } {
  const out = execSync(`npx --yes tsx "${HERE}"`, {
    env: { ...process.env, DOOR_BACKEND: backend, VITE_DATA_BACKEND: backend },
    encoding: 'utf8',
  })
  return JSON.parse(out.trim())
}

console.log('the real backend')
const real = ask('firebase')
check(real.warm === true, 'warm opens the control room', `got ${real.warm}`)
check(real.cool === false, 'cool does not', `got ${real.cool}`)

console.log('the local mock')
const mock = ask('local')
check(mock.warm === true, 'warm opens it', `got ${mock.warm}`)
check(
  mock.cool === true,
  'and so does cool, so the way back is never locked away',
  `got ${mock.cool}`,
)

console.log('the one call site')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
check(
  app.includes('mayOpenTheDoor'),
  'App asks who it is, not only where it is',
  'App.tsx never calls mayOpenTheDoor',
)
check(
  !/atTheDoor\(\)\s*\?/.test(app),
  'and nothing renders the room from the address alone',
  'App.tsx branches straight off atTheDoor()',
)

console.log(faults.length === 0 ? '\nthe door holds' : `\n${faults.length} wrong`)
process.exit(faults.length === 0 ? 0 : 1)
