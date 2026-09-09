import { later } from '@/systems/later'
import { groundHeight } from '@/systems/terrain'
import type { SectionDefinition } from '../registry'

const y = groundHeight(240, 0)
export default {
  id: 'clearing',
  name: 'The Clearing',
  blurb: 'Something to learn. Someone to grow with.',
  order: 4,
  camera: { position: [240, y + 3.4, 9], target: [240, y + 1.1, 0], sway: 0.25 },
  Scene: later(() => import('./Clearing')),
} satisfies SectionDefinition
