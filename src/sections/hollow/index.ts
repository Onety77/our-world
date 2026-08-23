import type { SectionDefinition } from '../registry'
import Hollow from './Hollow'

export default {
  id: 'hollow',
  name: 'The Hollow',
  blurb: 'A fire, and something to play. One move each, whenever you are here.',
  order: 2,
  camera: {
    // inside the room, off to one side of the fire and low, so the ceiling
    // closes over the top of frame and the space reads as enclosed
    position: [5.4, 2.3, 5.4],
    target: [0, 1.1, 0],
    // the cave breathes more than the open places — the owner liked the room
    // seeming to move, and a tighter space amplifies the same parallax
    sway: 1.5,
  },
  Scene: Hollow,
} satisfies SectionDefinition
