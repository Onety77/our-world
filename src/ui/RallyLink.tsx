import { useState } from 'react'
import {
  clearRallyDiagnostics,
  readRallyDiagnostics,
} from '@/systems/rallyDiagnostics'

const time = (ms: number) => `${Math.round(ms)} ms`

export function RallyLink() {
  const [report, setReport] = useState(readRallyDiagnostics)

  if (!report) {
    return (
      <section>
        <h2>last live race link</h2>
        <p className="admin-note">
          No measured wheel-to-wheel race on this tab yet. Run one on the deployed
          site, then come back here; positions are never kept, only delivery counts.
        </p>
      </section>
    )
  }

  const direct = report.direct
  const smoother = report.smoother
  const duration = Math.max(0, (report.endedAt ?? report.updatedAt) - report.startedAt)
  const verdict = !direct
    ? 'The race had no dedicated room key and used the compatibility path.'
    : direct.errors > 0
      ? 'The direct stream reported an error. Check that the generated Realtime Database rules are published.'
      : direct.received === 0
        ? 'The direct stream opened, but no opponent frames reached this phone.'
        : direct.maxGap > 350 || smoother.dryPercent > 2
          ? 'The stream is reaching this phone, but its gaps are large enough to drain the visual buffer.'
          : 'The direct delivery looks healthy. Any remaining unevenness belongs to the visual smoothing step.'

  return (
    <section>
      <h2>last live race link</h2>
      <p className="admin-note">
        {report.stage} · {Math.round(duration / 1000)} seconds measured ·{' '}
        {report.endedAt ? 'race closed' : 'latest checkpoint'}
      </p>
      <p className="admin-note"><b>{verdict}</b></p>

      {direct ? (
        <>
          <p className="admin-note">
            outbound <b>{direct.sent}</b> Firebase frames from {direct.queued} changing
            render samples
          </p>
          <p className="admin-note">
            inbound <b>{direct.received}</b> · missed {direct.missed} · duplicate{' '}
            {direct.duplicates} · out of order {direct.outOfOrder} · reconnects {direct.resets}
          </p>
          <p className="admin-note">
            arrival gap <b>{time(direct.meanGap)}</b> average · {time(direct.maxGap)} worst ·{' '}
            {time(direct.jitter)} jitter
          </p>
          <p className="admin-note">
            delivery age {time(direct.age)} latest · {time(direct.maxAge)} worst · errors{' '}
            {direct.errors}
          </p>
        </>
      ) : null}

      <p className="admin-note">
        visual buffer <b>{time(smoother.behind)}</b> behind · {smoother.held} snapshots held ·{' '}
        dry {smoother.dry} of {smoother.frames} frames ({smoother.dryPercent}%)
      </p>
      <p className="admin-note">
        compatibility arrivals {report.legacyReceived}. These remain during the first rollout
        so an older phone can still be seen.
      </p>
      <button
        type="button"
        onClick={() => {
          clearRallyDiagnostics()
          setReport(null)
        }}
      >
        clear this measurement
      </button>
    </section>
  )
}
