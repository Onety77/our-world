/**
 * The screen that is not blank.
 *
 * ---------------------------------------------------------------------------
 * React unmounts the whole tree when a render throws, and there was nothing in
 * this app to catch that — so any error anywhere, on either phone, took the
 * entire garden off the screen and left white. Which is exactly what wheel to
 * wheel did on her phone the moment the two of you pressed ready: not a hang,
 * not a slow load, *blank*.
 *
 * A blank screen is the worst possible report, because it is the same shape
 * whatever went wrong. It cannot be told from a crash, a white background, a
 * failed asset or a phone that fell asleep, and there is nothing for either of
 * you to send me except the word "blank".
 *
 * So: catch it, say what broke and where, and give a way back that does not
 * involve closing the tab. The message is deliberately quotable — she can
 * photograph it and that photograph is the bug report.
 *
 * **This does not fix anything.** It is not meant to. It converts an invisible
 * failure into a legible one, which is the difference between a bug that gets
 * fixed and a bug that gets described.
 * ---------------------------------------------------------------------------
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Broken {
  message: string
  where: string
}

export class WhenItBreaks extends Component<
  { children: ReactNode; place?: string },
  { broken: Broken | null }
> {
  state: { broken: Broken | null } = { broken: null }

  static getDerivedStateFromError(error: unknown): { broken: Broken } {
    const message = error instanceof Error ? error.message : String(error)
    return { broken: { message, where: '' } }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    /*
      The first line of the component stack, which is the component that threw.

      The whole stack is forty lines of framework and one line that matters,
      and the one that matters is the first. On a phone there is room for one.
    */
    const where = (info.componentStack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at '))
    this.setState((was) => ({
      broken: was.broken ? { ...was.broken, where: where ?? '' } : was.broken,
    }))
    // Still in the console, for whoever has one open.
    console.error('the garden broke', error, info.componentStack)
  }

  render() {
    const broken = this.state.broken
    if (!broken) return this.props.children

    return (
      <div className="broke" role="alert">
        <p className="broke-kicker">something in here fell over</p>
        <h1>{this.props.place ?? 'The garden'} stopped.</h1>
        <p className="broke-copy">
          This is a bug, not you, and it is not your phone. Send this to me and
          it is a fixable thing rather than a blank screen:
        </p>
        <pre className="broke-what">
          {broken.message || 'no message'}
          {broken.where ? `\n${broken.where}` : ''}
        </pre>
        <div className="broke-ways">
          <button type="button" onClick={() => this.setState({ broken: null })}>
            try that again
          </button>
          {/*
            A full reload rather than routing back, because whatever threw may
            well have left a store half-set, and the second failure would be
            confusing in a way the first was not.
          */}
          <button type="button" className="quiet" onClick={() => window.location.assign('/')}>
            back to the garden
          </button>
        </div>
      </div>
    )
  }
}
