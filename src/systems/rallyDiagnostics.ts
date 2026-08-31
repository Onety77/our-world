import type { RallyStreamStats } from '@/data/types'

export const RALLY_DIAGNOSTICS_STORAGE_KEY = 'garden:last-rally-link:v1'
const KEY = RALLY_DIAGNOSTICS_STORAGE_KEY

export interface RallySmootherStats {
  held: number
  behind: number
  gap: number
  jitter: number
  dry: number
  frames: number
  dryPercent: number
}

/**
 * Numbers only. No car positions, room ids or route history are retained.
 * This survives reloads, another tab and the installed-app window so the last
 * race can still be inspected from `/dev7731`. A newer race replaces it.
 */
export interface RallyDiagnosticReport {
  version: 1
  stage: string
  startedAt: number
  updatedAt: number
  endedAt: number | null
  direct: RallyStreamStats | null
  legacyReceived: number
  smoother: RallySmootherStats
}

export function keepRallyDiagnostics(report: RallyDiagnosticReport): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(report))
  } catch {
    /* Private mode can refuse storage; the race must remain unaffected. */
  }
}

export function readRallyDiagnostics(): RallyDiagnosticReport | null {
  try {
    // Promote the old, tab-scoped report once so an in-progress rollout does
    // not throw away useful evidence simply because its storage changed.
    const old = sessionStorage.getItem(KEY)
    const raw = localStorage.getItem(KEY) ?? old
    if (!raw) return null
    const report = JSON.parse(raw) as Partial<RallyDiagnosticReport>
    if (report.version !== 1 || typeof report.stage !== 'string') return null
    if (!report.smoother || typeof report.smoother !== 'object') return null
    if (old && !localStorage.getItem(KEY)) localStorage.setItem(KEY, old)
    return report as RallyDiagnosticReport
  } catch {
    return null
  }
}

export function clearRallyDiagnostics(): void {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
