import { later } from '@/systems/later'
import type { SectionDefinition } from '../registry'
import { channelXAt } from './layout'

export default {
  id: 'river',
  name: 'The Wellspring',
  blurb: 'Everything the two of you have really put by, running.',
  order: 1,
  camera: {
    /*
      Down in the valley, a couple of metres above the water, looking up it
      toward the spring. Surveyed from up on the bank the river was a distant
      ribbon; from here it comes toward you and fills the bottom of the frame,
      which is the only view where the water is the subject — and it stands
      over the channel's own middle, which bends, so the camera asks the
      layout where the water is rather than assuming x = 0.
    */
    position: [channelXAt(19), -0.6, 19],
    target: [channelXAt(-34), -4.0, -34],
    sway: 0.8,
  },
  Scene: later(() => import('./River')),
} satisfies SectionDefinition
