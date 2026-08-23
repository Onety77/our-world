import type { SectionDefinition } from '../registry'
import Tree from './Tree'
import { MEADOW_X, MEADOW_Y, MEADOW_Z } from './layout'

export default {
  id: 'tree',
  name: 'The Tree of Thoughts',
  blurb: 'Say what you are thinking. It grows something.',
  order: 0,
  camera: {
    // Back and a little above, aimed at the middle of the tree rather than at
    // the middle of the trunk. Twenty-three metres is the distance at which a
    // fifteen-metre crown fills the frame without running out of the top of
    // it: at nineteen the top was cut off and the bole filled the picture like
    // a chimney, and at twenty-seven it had shrunk into just another tree. Tied to the meadow's own position and height so the framing
    // survives the clearing being moved.
    position: [MEADOW_X, MEADOW_Y + 5.2, MEADOW_Z + 23],
    target: [MEADOW_X, MEADOW_Y + 6.8, MEADOW_Z],
    sway: 1,
  },
  Scene: Tree,
} satisfies SectionDefinition
