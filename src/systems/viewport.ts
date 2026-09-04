/**
 * Where the visible part of the page actually is.
 *
 * ---------------------------------------------------------------------------
 * **A keyboard does two different things depending on whose phone it is, and
 * only one of them can be handled in a stylesheet.**
 *
 * Chrome takes the instruction in the viewport tag — `interactive-widget=
 * resizes-content` — and makes the *layout* viewport shorter. Everything
 * anchored to the top stays where it is, everything anchored to the bottom
 * comes up above the keyboard, and nothing needs to be done.
 *
 * Safari does not support that tag. It leaves the layout viewport at full
 * height, shrinks the *visual* viewport to the part you can still see, and
 * then scrolls the page to bring the focused field into view — dragging every
 * `position: fixed` element up with it. Which is precisely the report: the
 * film slid off the top of the screen while the keyboard was up, and the whole
 * night screen went with it.
 *
 * There is no CSS for the visual viewport. It has to be read and published,
 * which is all this file does: two lengths and a class, on the root element,
 * for the stylesheet to use.
 *
 * `--view-top` is how far down the visible area begins, and `--view-tall` is
 * how much of it there is. A night screen sized to exactly those two numbers
 * is a night screen that cannot be scrolled off, because there is nothing
 * above or below it to scroll to.
 * ---------------------------------------------------------------------------
 */

/**
 * How much has to be missing before it counts as a keyboard.
 *
 * The visual viewport moves for smaller reasons than a keyboard — Safari's
 * address bar collapsing takes about sixty pixels, and a rotation reports a
 * moment of nonsense. A keyboard is never less than about two hundred, so this
 * sits well above the noise and well below the thing.
 */
const ENOUGH = 140

/**
 * Publish where the visible area is, until told to stop.
 *
 * Returns the way to stop, in the shape an effect wants. Safe to call on a
 * browser with no `visualViewport` — the class is never added, the variables
 * are never read, and every layout that uses them falls back to the ordinary
 * one.
 */
export function watchTheView(): () => void {
  if (typeof window === 'undefined') return () => {}
  const view = window.visualViewport
  const root = document.documentElement
  if (!view) return () => {}

  const settle = () => {
    /*
      Rounded, and clamped at zero.

      Both numbers arrive fractional on a device with a scale factor, and a
      fractional `top` on a fixed box is a hairline of the page showing through
      at the edge. `offsetTop` can also read very slightly negative mid-scroll,
      which would push the screen down off its own bottom.
    */
    const top = Math.max(0, Math.round(view.offsetTop))
    const tall = Math.round(view.height)
    const gone = Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop))
    root.style.setProperty('--view-top', `${top}px`)
    root.style.setProperty('--view-tall', `${tall}px`)
    root.classList.toggle('keyboard-up', gone > ENOUGH)
  }

  settle()
  view.addEventListener('resize', settle)
  /*
    `scroll` as well as `resize`, and it is the half that matters on Safari.

    The keyboard opening is a resize; the page then being scrolled to reveal
    the field is a *scroll* of the visual viewport, and that is the event that
    moves everything. Listening only for the resize would follow the keyboard
    and not the pan it causes.
  */
  view.addEventListener('scroll', settle)
  window.addEventListener('orientationchange', settle)

  return () => {
    view.removeEventListener('resize', settle)
    view.removeEventListener('scroll', settle)
    window.removeEventListener('orientationchange', settle)
    root.classList.remove('keyboard-up')
    root.style.removeProperty('--view-top')
    root.style.removeProperty('--view-tall')
  }
}
