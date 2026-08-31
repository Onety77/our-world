import type { RallyStreamStats } from '@/data/types'

const KEY = 'garden:last-rally-link:v1'

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
 * This survives the navigation from the Hollow to `/dev7731`, and no longer.
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
    sessionStorage.setItem(KEY, JSON.stringify(report))
  } catch {
    /* Private mode can refuse storage; the race must remain unaffected. */
  }
}

export function readRallyDiagnostics(): RallyDiagnosticReport | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const report = JSON.parse(raw) as Partial<RallyDiagnosticReport>
    if (report.version !== 1 || typeof report.stage !== 'string') return null
    if (!report.smoother || typeof report.smoother !== 'object') return null
    return report as RallyDiagnosticReport
  } catch {
    return null
  }
}

export function clearRallyDiagnostics(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
