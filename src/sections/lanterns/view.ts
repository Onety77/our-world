/**
 * Where the open lantern is on screen, in CSS pixels.
 *
 * ---------------------------------------------------------------------------
 * **The one number that lets a photograph in the interface grow out of a light
 * in the world.**
 *
 * The scene projects the open lantern's four corners once a frame and puts the
 * box around them here; the interface reads it in its own animation frame and
 * opens the picture from it. So a memory is not a panel appearing over a world
 * that has stopped — it starts as the thing you were just looking at.
 *
 * A bounding box rather than an exact rectangle, and that is a deliberate
 * loosening. A lantern is turned to face the piece of path you stand on to look
 * at it, which is very nearly but not exactly square to the camera, so its
 * projection is a slightly skewed quadrilateral. The room that stood here
 * turned its panes to *exactly* ninety degrees for this reason and paid for it
 * with a whole-building rotation; a box around the corners costs nothing and is
 * only ever a few pixels out at the corners of something that is about to be
 * replaced by a full-size photograph anyway.
 *
 * Deliberately not React state. It changes every frame for the whole length of
 * the opening, and a re-render per frame of a screen holding a full-resolution
 * photograph is exactly the thing the technical law is about. The same shape as
 * the sections' own slide and as the walk itself: a plain object, written by
 * one owner, read by whoever needs it.
 * ---------------------------------------------------------------------------
 */
export const openPane = {
  /** Centre of the lantern, in CSS pixels from the top left of the canvas. */
  x: 0,
  y: 0,
  /** Half its width and height on screen, in CSS pixels. */
  halfW: 0,
  halfH: 0,
  /** How far through the opening, 0..1. The photograph fades in near the end. */
  at: 0,
  /** False until the scene has projected it at least once. */
  live: false,
}
