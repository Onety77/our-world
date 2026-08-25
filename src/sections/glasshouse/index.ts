import type { SectionDefinition } from '../registry'
import Glasshouse from './Glasshouse'
import { GLASS_X, GLASS_Y } from './layout'

export default {
  id: 'glasshouse',
  name: 'The Glasshouse',
  blurb: 'Every picture worth keeping, and the light it throws.',
  /*
    Last in the row, and appended rather than inserted.

    Every other index in the garden is load-bearing: `world/hub/layout` names
    its landmarks positionally and `HUB_STREAM` is measured off ANCHORS[1].
    Slotting a fifth place into the middle would move the Wellspring's water
    away from the Wellspring, silently.
  */
  order: 4,
  camera: {
    /*
      Standing in the aisle, not looking at the building from outside.

      This is the only section whose camera is *inside* its own subject, and it
      has to be: the whole place is a corridor of light you travel down, and a
      camera set back to admire the architecture would turn it into a model of
      a glasshouse on a table.

      Eye height, a little back from the middle of the frame so the pane you
      are standing at is ahead of you rather than beside you, and aimed very
      slightly down — at the *floor* about eight metres on, because the floor
      is where the colour is.
    */
    position: [GLASS_X, GLASS_Y + 1.62, 5.6],
    target: [GLASS_X, GLASS_Y + 1.15, -7],
    /*
      More turn than a normal place gets.

      `SlideCamera` holds sections to a third of the garden's swing so a
      composed frame does not swing off its subject. In here there is no single
      subject — there are panes on both walls and light on the floor between
      them — and being able to look around is most of what makes it a building
      rather than a picture of one.
    */
    sway: 1.5,
  },
  Scene: Glasshouse,
} satisfies SectionDefinition
