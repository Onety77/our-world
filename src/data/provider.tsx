import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { DATA_BACKEND, missingLightEmails } from '@/config'
import { createLocalDataLayer, type LocalDataLayer } from './local'
/*
  Types only, and that is the entire point of this line.

  ---------------------------------------------------------------------------
  `import type` is erased at build time, so naming the shape of the Firebase
  layer here costs nothing. Naming the *functions* cost 224 kilobytes, zipped —
  a third of everything the garden downloaded, handed to every visitor before
  the first blade of grass, **including the ones running on the local mock who
  will never make a single request.**

  The backend is chosen by `DATA_BACKEND` and defaults to 'local'. Only
  `RealProvider` has ever needed any of this, and it fetches it below, inside
  the effect it already had, behind the 'connecting' state it was already
  showing. So on the mock the SDK is not downloaded at all, and on the real
  backend it arrives during a moment the interface had already set aside for
  waiting.
  ---------------------------------------------------------------------------
*/
import type { FirebaseDataLayer } from './firebase'
import type { DataLayer, UserId, WorldState } from './types'

const ME_KEY = 'garden:me'

/**
 * Which light this device is.
 *
 * On the local mock: remembered here, switchable from the dev panel. On the
 * real backend it is not a choice at all — the address you signed in with
 * decides, and this is never consulted.
 */
export function whoAmI(): UserId {
  try {
    return localStorage.getItem(ME_KEY) === 'cool' ? 'cool' : 'warm'
  } catch {
    return 'warm'
  }
}

export function becomeUser(id: UserId) {
  try {
    localStorage.setItem(ME_KEY, id)
  } catch {
    /* ignore */
  }
  location.reload()
}

const DataContext = createContext<DataLayer | null>(null)

/** What the provider is doing, for whoever is waiting at the door. */
export type ConnectionState =
  | { status: 'local' }
  | { status: 'connecting' }
  | { status: 'signed-out' }
  | { status: 'ready' }
  | { status: 'refused'; error: Error }

const ConnectionContext = createContext<ConnectionState>({ status: 'local' })

export function useConnection(): ConnectionState {
  return useContext(ConnectionContext)
}

export function DataProvider({
  children,
  door,
}: {
  children: ReactNode
  /**
   * Shown instead of the garden when there is nobody signed in, or when the
   * connection is refused. Passed in rather than imported so this file stays
   * free of anything that renders.
   */
  door: (state: ConnectionState) => ReactNode
}) {
  if (DATA_BACKEND === 'local') return <LocalProvider>{children}</LocalProvider>
  return (
    <RealProvider door={door}>{children}</RealProvider>
  )
}

function LocalProvider({ children }: { children: ReactNode }) {
  const layer = useMemo<DataLayer>(() => createLocalDataLayer(whoAmI()), [])
  return (
    <ConnectionContext.Provider value={{ status: 'local' }}>
      <DataContext.Provider value={layer}>{children}</DataContext.Provider>
    </ConnectionContext.Provider>
  )
}

function RealProvider({
  children,
  door,
}: {
  children: ReactNode
  door: (state: ConnectionState) => ReactNode
}) {
  const [layer, setLayer] = useState<FirebaseDataLayer | null>(null)
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'connecting',
  })

  useEffect(() => {
    // Without both addresses nobody can be told apart, and the first person to
    // sign in would silently become Warm. Say so instead.
    const missing = missingLightEmails()
    if (missing.length > 0) {
      setConnection({
        status: 'refused',
        error: new Error(
          `The garden cannot tell the two of you apart. Missing:\n` +
            missing.map((k) => `  · ${k}`).join('\n'),
        ),
      })
      return
    }

    let current: FirebaseDataLayer | null = null
    let live = true
    let stop: (() => void) | null = null

    /*
      Fetch the SDK, then start watching.

      Asynchronous where it used to be immediate, which changes one thing worth
      naming: the cleanup can now run *before* the import resolves — a strict
      double-mount in development does exactly that, every time. Hence `live`
      guarding the subscription itself and not only the state it sets, and
      hence `stop` being reachable from the cleanup whether or not it exists
      yet. Without both, development leaves a second auth listener running
      against the real project and the garden gets every change twice.
    */
    void import('./firebase').then(({ createFirebaseDataLayer, ensureWorldExists, watchSignIn }) => {
      if (!live) return
      stop = watchSignIn((user) => {
        current?.dispose()
        current = null
        setLayer(null)

        if (!user) {
          if (live) setConnection({ status: 'signed-out' })
          return
        }

        try {
          const next = createFirebaseDataLayer(user)
          current = next
          // Seed the world on the very first run. Deliberately not awaited: the
          // listeners are already live, so whatever it writes arrives the normal
          // way and the garden doesn't wait on a round trip to open.
          void ensureWorldExists(next.me).catch(() => {})
          if (live) {
            setLayer(next)
            setConnection({ status: 'ready' })
          }
        } catch (error) {
          if (live) {
            setConnection({ status: 'refused', error: error as Error })
          }
        }
      })
      // The listener may have been torn down while the import was in flight.
      if (!live) {
        stop()
        stop = null
      }
    })

    return () => {
      live = false
      stop?.()
      current?.dispose()
    }
  }, [])

  if (!layer) {
    return (
      <ConnectionContext.Provider value={connection}>
        {door(connection)}
      </ConnectionContext.Provider>
    )
  }

  return (
    <ConnectionContext.Provider value={connection}>
      <DataContext.Provider value={layer}>{children}</DataContext.Provider>
    </ConnectionContext.Provider>
  )
}

export function useData(): DataLayer {
  const layer = useContext(DataContext)
  if (!layer) throw new Error('useData must be used inside <DataProvider>')
  return layer
}

/** The whole world. Re-renders on any change. */
export function useWorld(): WorldState {
  const layer = useData()
  return useSyncExternalStore(
    (cb) => layer.subscribe(() => cb()),
    () => layer.snapshot(),
    () => layer.snapshot(),
  )
}

/**
 * Narrow slice of the world, so a component that only cares about, say, the pot
 * does not re-render when someone moves. `select` must return a stable value.
 */
export function useWorldSlice<T>(select: (s: WorldState) => T): T {
  const layer = useData()
  return useSyncExternalStore(
    (cb) => layer.subscribe(() => cb()),
    () => select(layer.snapshot()),
    () => select(layer.snapshot()),
  )
}

/** Local-only escape hatch for the dev panel. Returns null on a real backend. */
export function useLocalLayer(): LocalDataLayer | null {
  const layer = useData()
  return DATA_BACKEND === 'local' ? (layer as LocalDataLayer) : null
}
