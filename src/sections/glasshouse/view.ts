/**
 * Where the open pane is on screen, in CSS pixels.
 *
 * ---------------------------------------------------------------------------
 * **The one number that lets a DOM photograph sit exactly on a 3D pane.**
 *
 * The Glasshouse turns the pane face-on when you open it, so its projection is
 * an axis-aligned rectangle — and this is that rectangle, written by the scene
 * once a frame and read by the interface in its own animation frame.
 *
 * Deliberately not React state. It changes every frame for the whole length of
 * the turn, and a re-render per frame of a screen holding a full-resolution
 * photograph is exactly the thing the technical law is about. The same shape
 * as the sections' own slide and as the aisle itself: a plain object, written
 * by one owner, read by whoever needs it.
 * ---------------------------------------------------------------------------
 */
export const openPane = {
  /** Centre of the pane, in CSS pixels from the top left of the canvas. */
  x: 0,
  y: 0,
  /** Half its width and height on screen, in CSS pixels. */
  halfW: 0,
  halfH: 0,
  /** How far through the turn, 0..1. The photograph fades in near the end. */
  at: 0,
  /** False until the scene has projected it at least once. */
  live: false,
}
