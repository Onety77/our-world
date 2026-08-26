/**
 * How far under the water the Moonbreak currently is.
 *
 * ---------------------------------------------------------------------------
 * A plain object, written once a frame by the race and read by everything that
 * has to look different below the surface: the sky, the water itself, the
 * glass tube, and everything swimming past it.
 *
 * **Not React state.** It changes every frame for the whole length of a dive,
 * and a re-render per frame of a scene already drawing a kilometre of causeway
 * is precisely the thing the technical law exists to prevent. Same shape as
 * the aisle in the Glasshouse and the slide in SlideCamera: one owner writes
 * it, whoever needs it reads it, and nothing is subscribed to anything.
 *
 * **And it lives in its own file** rather than beside the thing that writes it
 * or the things that read it, which is the whole reason this module exists.
 * The race draws the Moonbreak's world; the Moonbreak's world mounts the
 * Drowned Mile; the Drowned Mile needs the depth. Put the depth in any one of
 * those three and two of them import each other in a circle — which ES modules
 * will happily let you do right up until the day somebody reads it during
 * module initialisation instead of inside a frame, and then it is `undefined`
 * in a shader once, on one browser, at startup. Four lines in a file of their
 * own is a cheaper answer than remembering that.
 * ---------------------------------------------------------------------------
 */
import { Color } from 'three'

export const deep = {
  /** 0 above the water, 1 well under it. Eased — see the drive in `Race`. */
  at: 0,
  /** How far down the road the car has got, so the water knows where to put things. */
  s: 0,
  /*
    And the fog, copied out of the shared light block once a frame.

    -------------------------------------------------------------------------
    **Anything drawn in the Drowned Mile that does not fog is a hole in the
    water.** The glass, the shoals and the silt are the only things in either
    road that do not go through the shared rock or car material, so they are
    the only things that do not get the fog for free — and the first version
    of the tube proved exactly what that costs: nine hundred metres of it
    stayed the same brightness all the way to the vanishing point, which read
    as a lit plastic pipe rather than as a tunnel disappearing into green.

    So the numbers come along here. Not because a shader could not be given
    its own fog, but because there must be exactly *one* set: the whole point
    of the light block is that the car and the road can never be lit by two
    different ideas of lit, and a tube fogged to its own taste is that same
    bug in a nicer coat.
    -------------------------------------------------------------------------
  */
  fog: new Color('#07242c'),
  near: 15,
  far: 95,
}
