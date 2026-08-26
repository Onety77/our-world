import { later } from '@/systems/later'
import type { SectionDefinition } from '../registry'

export default {
  id: 'stars',
  name: 'The Stars',
  blurb: 'Your night, her morning, and the space in between.',
  order: 3,
  camera: {
    // low, looking out and slightly up — the horizon with her dawn on it sits
    // in the lower third, the stars fill everything above
    position: [0, 2.2, 9],
    target: [0, 3.6, -18],
    sway: 1.2,
  },
  Scene: later(() => import('./Stars')),
} satisfies SectionDefinition
