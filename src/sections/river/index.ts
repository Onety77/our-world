import type { SectionDefinition } from '../registry'
import River from './River'

export default {
  id: 'river',
  name: 'The Wellspring',
  blurb: 'Everything the two of you have really put by, running.',
  order: 1,
  camera: {
    /*
      Down in the valley, a couple of metres above the water, looking
      downstream. Surveyed from up on the bank the river was a distant ribbon;
      from here it runs away from you and fills the bottom of the frame, which
      is the only view where the water is the subject.
    */
    position: [0, -0.6, 19],
    target: [0, -4.0, -34],
    sway: 0.8,
  },
  Scene: River,
} satisfies SectionDefinition
