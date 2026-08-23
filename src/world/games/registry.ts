/**
 * Every game, discovered from the filesystem at build time. Same contract as
 * places: one folder, one `index.ts`, default-exporting a GameDefinition.
 *
 * An empty registry is a legitimate state — the Hollow says so plainly rather
 * than pretending. See README.md in this folder.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameDefinition, GameMode } from './types'

const modules = import.meta.glob<{ default: GameDefinition<any, any> }>('./*/index.ts', {
  eager: true,
})

const folderOf = (path: string) =>
  path.replace(/^\.\//, '').replace(/\/index\.ts$/, '')

const collected: GameDefinition<any, any>[] = []
const problems: string[] = []
const seen = new Map<string, string>()

for (const [path, mod] of Object.entries(modules)) {
  const folder = folderOf(path)
  const game = mod.default

  if (!game || typeof game.id !== 'string') {
    problems.push(`${path} has no default GameDefinition export.`)
    continue
  }
  if (game.id !== folder) {
    problems.push(`${path}: id "${game.id}" does not match folder "${folder}".`)
    continue
  }
  const clash = seen.get(game.id)
  if (clash) {
    problems.push(`Duplicate game id "${game.id}" in ${clash} and ${path}.`)
    continue
  }
  seen.set(game.id, path)
  collected.push(game)
}

if (problems.length > 0) {
  throw new Error(`Game registry:\n${problems.map((p) => `  · ${p}`).join('\n')}`)
}

export const GAMES: readonly GameDefinition<any, any>[] = collected.sort(
  (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name),
)

export function gamesByMode(mode: GameMode): readonly GameDefinition<any, any>[] {
  return GAMES.filter((g) => g.mode === mode)
}
