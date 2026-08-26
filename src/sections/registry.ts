/**
 * Every place, discovered from the filesystem.
 *
 * Same contract as the games registry: one folder, one `index.ts`, default
 * exporting a SectionDefinition. Adding a place is making a folder — nothing
 * to wire up, no list to join.
 *
 * Order matters here in a way it doesn't for games: these are laid out left to
 * right and swiped between, so `order` is the position in the row.
 */

import type { Later } from '@/systems/later'

export interface SectionCamera {
  /** Where the camera sits, relative to the section's own anchor. */
  position: [number, number, number]
  /** What it looks at, relative to the same anchor. */
  target: [number, number, number]
  /** How far the pointer may push it, in metres. Bigger = more parallax. */
  sway?: number
}

export interface SectionDefinition {
  /** Must match the folder name. Ends up in saved state and in the URL. */
  id: string
  name: string
  /** One line, shown under the name. */
  blurb: string
  /** Position in the row, left to right. Must be unique. */
  order: number
  camera: SectionCamera
  /**
   * Everything in this place, fetched when it is wanted.
   *
   * The rest of this definition is a handful of strings and a camera, and it
   * stays eager because the row of places has to be drawn before you have
   * chosen one — you swipe between names, and a name you have to download is a
   * name that is not there. The *world* behind each name is the heavy half, and
   * only ever one of them is on screen.
   *
   * See `later`. It carries its own `warm()`, and the rule is to call that on
   * the first hint rather than on the press: `World` warms every place once the
   * garden has settled, and `SlideCamera` warms whichever one a slide is headed
   * for. By the time you arrive it is already here.
   */
  Scene: Later
}

const modules = import.meta.glob<{ default: SectionDefinition }>('./*/index.ts', {
  eager: true,
})

const folderOf = (path: string) =>
  path.replace(/^\.\//, '').replace(/\/index\.ts$/, '')

const collected: SectionDefinition[] = []
const problems: string[] = []
const seenId = new Map<string, string>()
const seenOrder = new Map<number, string>()

for (const [path, mod] of Object.entries(modules)) {
  const folder = folderOf(path)
  const section = mod.default

  if (!section || typeof section.id !== 'string') {
    problems.push(`${path} has no default SectionDefinition export.`)
    continue
  }
  if (section.id !== folder) {
    problems.push(`${path}: id "${section.id}" does not match folder "${folder}".`)
    continue
  }
  const idClash = seenId.get(section.id)
  if (idClash) {
    problems.push(`Duplicate section id "${section.id}" in ${idClash} and ${path}.`)
    continue
  }
  const orderClash = seenOrder.get(section.order)
  if (orderClash) {
    problems.push(
      `Two sections both want order ${section.order}: ${orderClash} and ${path}.`,
    )
    continue
  }
  seenId.set(section.id, path)
  seenOrder.set(section.order, path)
  collected.push(section)
}

if (problems.length > 0) {
  throw new Error(`Section registry:\n${problems.map((p) => `  · ${p}`).join('\n')}`)
}

if (collected.length === 0) {
  throw new Error('Section registry: no sections found in src/sections/*/index.ts')
}

export const SECTIONS: readonly SectionDefinition[] = collected.sort(
  (a, b) => a.order - b.order,
)

export function sectionIndexById(id: string): number {
  const i = SECTIONS.findIndex((s) => s.id === id)
  return i === -1 ? 0 : i
}
