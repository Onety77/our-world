/**
 * The way in.
 *
 * This is the first thing she will ever see of the garden, and it is a login
 * form, which is the least garden-like object there is. So it is built like
 * everything else here: text on the world's own dark ground, no card, no box,
 * no product name. Two fields and a sentence.
 *
 * It does not offer to make an account. There are two people here forever, and
 * both accounts are made once, by hand, in the console.
 */

import { useEffect, useRef, useState } from 'react'
/*
  Fetched when the button is pressed, not when the door is drawn.

  The door is the first thing this app renders on the real backend, and it is a
  headline, two fields and a button — it has no business waiting on an
  authentication library. By the time anyone has typed an address and a
  password the code has long since arrived; and if it has not, this is already
  an await inside a submit handler that was always going to take a moment.

  See the note on the same subject in `data/provider`.
*/
const signIn = (...args: Parameters<typeof import('@/data/firebase').signIn>) =>
  import('@/data/firebase').then((m) => m.signIn(...args))
import type { ConnectionState } from '@/data/provider'

/**
 * Firebase's own messages are written for developers ("auth/invalid-credential")
 * and would land badly on someone who has just been handed a link by someone
 * they love. These are the same facts in a voice that belongs here.
 */
function saySoftly(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That doesn’t look like an address.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'That pair doesn’t open it. Try again?'
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a minute and it’ll let you back in.'
    case 'auth/network-request-failed':
      return 'Can’t reach the garden from here. Check the connection.'
    case 'auth/user-disabled':
      return 'That account has been turned off.'
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      // Not her fault and not a wrong password — the project has no
      // email/password sign-in switched on. Saying "that pair doesn't open it"
      // here would send someone hunting for a typo that isn't there.
      return 'The garden isn’t finished being set up. (Sign-in isn’t switched on yet.)'
    default:
      return 'Something went wrong on the way in.'
  }
}

export function Door({ state }: { state: ConnectionState }) {
  if (state.status === 'connecting') {
    return (
      <div className="door">
        <p className="door-waiting">opening…</p>
      </div>
    )
  }

  if (state.status === 'refused') {
    return (
      <div className="door">
        <h1>The garden won’t open.</h1>
        <pre className="door-fault">{state.error.message}</pre>
        <p className="door-note">
          This is configuration, not you. It’s in <code>.env.local</code>.
        </p>
      </div>
    )
  }

  return <SignIn />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
  }, [])

  const ready = email.trim() !== '' && password !== '' && !busy

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setTrouble(null)
    try {
      await signIn(email, password)
      // Nothing else to do — the provider is watching sign-in and will swap the
      // door for the garden on its own.
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : ''
      setTrouble(saySoftly(code))
      setBusy(false)
    }
  }

  return (
    <div className="door">
      <h1>There’s a garden here.</h1>
      <p className="door-note">It’s yours and mine. Come in.</p>

      <form className="door-form" onSubmit={(e) => void go(e)}>
        <label>
          <span>your address</span>
          <input
            ref={first}
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          <span>the word</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="touch" type="submit" disabled={!ready}>
          {busy ? 'going in…' : 'go in'}
        </button>

        {/* Announced, so it isn't only a colour change for anyone using a
            screen reader — and this is the one screen where being stuck and
            not knowing why would matter most. */}
        <p className="door-trouble" role="status" aria-live="polite">
          {trouble ?? ''}
        </p>
      </form>
    </div>
  )
}
