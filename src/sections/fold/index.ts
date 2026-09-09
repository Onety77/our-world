import { later } from '@/systems/later'
import type { SectionDefinition } from '../registry'
import { FOLD_X, FOLD_Y, LIP_Z } from './layout'

export default {
  id: 'fold',
  name: 'The Fold',
  blurb: 'What each of you is getting better at, and what lives on it.',
  /*
    Fifth in the row, between the Stars and the Lantern Walk — and this is the
    first place ever *inserted* into the garden rather than appended.

    Two arrays index the row positionally and both had to move with it:
    `PLACES` in `world/hub/layout` and `LANDMARKS` in `world/GardenHub`. The
    note in the Lantern Walk's own definition is what flagged it; the thing it
    warns about is `HUB_STREAM`, which is measured off `ANCHORS[1]` and is
    therefore untouched by an insertion at index four. Nothing else in the
    garden depends on a section's number.
  */
  order: 4,
  camera: {
    /*
      Standing on the near lip of the fold, at eye height, looking down and
      across it.

      **The vector from target to position is deliberately short** — nine
      metres, not sixty. `backOffFor` in `world/SlideCamera` multiplies it by up
      to 1.5 to keep a landscape composition from being cropped on a phone, and
      an aim point out at the far ridge would put a portrait camera fifteen
      metres back off the lip, standing in the meadow behind, looking at a
      hillside on a table. The same lesson the Lantern Walk records.

      What the short vector keeps is the *direction*, and that number was raised
      once against a render: **fifteen degrees below level, not eight and a
      half.** At eight the camera was nearly level with the ground it was
      standing on, the bowl foreshortened away to nothing, and the place read as
      a gentle rise rather than as somewhere with a far side — with the bottom
      third of the frame filled by the grass at your own feet. Fifteen puts the
      floor of the fold at the middle of the frame and the ridge above it, which
      is what makes the distance an animal has walked to legible at all.
    */
    position: [FOLD_X, FOLD_Y + 1.7, LIP_Z + 1],
    target: [FOLD_X, FOLD_Y - 0.7, LIP_Z - 8],
    /*
      A composed place, so a composed amount of turn. The subject is the whole
      fold rather than one thing in it, and there is genuinely something to see
      to either side — which is what the sway is for, and why it is not as tight
      as the river's.
    */
    sway: 1.05,
  },
  Scene: later(() => import('./Fold')),
} satisfies SectionDefinition
