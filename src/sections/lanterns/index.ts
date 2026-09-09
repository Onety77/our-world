import { later } from '@/systems/later'
import type { SectionDefinition } from '../registry'
import { WALK_X, WALK_Y } from './layout'

export default {
  id: 'lanterns',
  name: 'The Lantern Walk',
  blurb: 'Every picture worth keeping, hung along the way back.',
  /*
    Last in the row, and it stays last.

    Every index here is load-bearing: `world/hub/layout` names its landmarks
    positionally and `HUB_STREAM` is measured off ANCHORS[1]. This was 4 until
    the Fold went in between the Stars and here — the one insertion the garden
    has ever had. See the note in `sections/fold/index.ts` for what had to move
    with it, and what did not.
  */
  order: 5,
  camera: {
    /*
      Standing on the lane, at the head of it, looking down its length.

      This is one of two sections whose camera is *inside* its own subject, and
      it has to be: the place is a walk, and a camera set back to admire the
      shape of the lane would turn it into a model of a path on a table.

      Eye height, aimed very slightly down — at the path nine metres on, because
      the path is where the footprints are and the footprints are the record.

      **The vector from target to position is deliberately short.** SlideCamera
      multiplies it to stand further back on a narrow screen so a composition is
      not cropped; a long vector meant a phone ended up a dozen metres behind
      where you are standing and every photograph was a stamp.
    */
    position: [WALK_X, WALK_Y + 1.62, 2.6],
    target: [WALK_X, WALK_Y + 1.28, -9],
    /*
      A little more turn than a composed place gets, and less than the room that
      stood here took.

      That one needed a wide swing because it had panes on two walls and the
      only way to see either was to look away from the middle. Out here the lane
      is the composition and the lanterns come to you, so this is for looking
      around a place you are walking through rather than for finding the
      subject: the subject is straight ahead.
    */
    sway: 1.1,
  },
  Scene: later(() => import('./LanternWalk')),
} satisfies SectionDefinition
