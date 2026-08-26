import { later } from '@/systems/later'
import type { SectionDefinition } from '../registry'
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

      Eye height, aimed very slightly down — at the *floor* eight metres on,
      because the floor is where the colour is.

      **The vector from target to position is deliberately short.** SlideCamera
      multiplies it to stand further back on a narrow screen, so that a
      composition is not cropped; a long vector meant a phone ended up twelve
      metres behind where you are standing and every photograph was a stamp.
      Eleven metres becomes about eight on a phone instead of twelve and a
      half, which is most of the difference between looking at a corridor and
      looking at a picture.
    */
    position: [GLASS_X, GLASS_Y + 1.6, 2.6],
    target: [GLASS_X, GLASS_Y + 1.2, -8.4],
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
  Scene: later(() => import('./Glasshouse')),
} satisfies SectionDefinition
