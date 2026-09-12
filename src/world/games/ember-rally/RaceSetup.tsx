import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { usePlaying } from '@/systems/playing'
import { roadKey, useDoorman } from '@/systems/locks'
import { raceKey, readSitting, stageOfKey } from '@/systems/lobby'
import { TrackArtwork } from '@/ui/TrackArtwork'
import { useChoiceKeys } from '@/ui/useChoiceKeys'
import { ROAD_INFO, ROAD_ORDER } from './courseInfo'
import { moveRun, timeLabel, type RallyMove, type StageId } from './model'
import type { Track } from './track'
import { useBest } from './best'
import { personalKey, usePersonalBest } from './personalBest'
import './RaceSetup.css'

type Mode = 'solo' | 'challenge' | 'live'
function RouteMap({ track }: { track: Track }) {
  const route = useMemo(() => {
    const points: [number, number][] = []
    for (let i = 0; i < track.x.length; i += 8) points.push([track.x[i], track.z[i]])
    points.push([track.x.at(-1)!, track.z.at(-1)!])
    const branch: [number, number][] = []
    if (track.split) {
      for (let i = 0; i < track.split.x.length; i += 8) branch.push([track.split.x[i], track.split.z[i]])
      branch.push([track.split.x.at(-1)!, track.split.z.at(-1)!])
    }
    const all = [...points, ...branch]
    const xs = all.map((p) => p[0]),
      zs = all.map((p) => p[1])
    const minX = Math.min(...xs),
      minZ = Math.min(...zs)
    const dx = Math.max(...xs) - minX,
      dz = Math.max(...zs) - minZ
    const scale = Math.min(160 / Math.max(1, dx), 110 / Math.max(1, dz))
    const project = ([x, z]: [number, number]) => [
      20 + (160 - dx * scale) / 2 + (x - minX) * scale,
      15 + (110 - dz * scale) / 2 + (z - minZ) * scale,
    ]
    const mapped = points.map(project)
    return {
      path: mapped.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      branch: branch.map(project).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      first: mapped[0],
      last: mapped.at(-1)!,
    }
  }, [track])
  return (
    <svg
      viewBox="0 0 200 140"
      role="img"
      aria-label={`Route map for ${ROAD_INFO[track.stage].name}`}
    >
      <path
        d={route.path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={route.first[0]} cy={route.first[1]} r="4" fill="currentColor" />
      {route.branch && <path d={route.branch} fill="none" stroke="#92d5ce" strokeWidth="2" strokeLinecap="round" />}
      <circle
        cx={route.last[0]}
        cy={route.last[1]}
        r="4"
        fill="#151c21"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

export function RaceSetup({
  stage,
  track,
  solo,
  mine,
  theirs,
  theirName,
  onSelect,
  onStart,
  onLeave,
  onReplay,
}: {
  stage: StageId
  track: Track
  solo: boolean
  mine: RallyMove[]
  theirs: RallyMove[]
  theirName: string
  onSelect(stage: StageId): void
  onStart(kind: 'qualifying' | 'chase'): void
  onLeave(): void
  onReplay?(): void
}) {
  const data = useData(),
    shut = useDoorman()
  const presence = useWorldSlice((s) => s.presence),
    them = otherUser(data.me)
  const [mode, setMode] = useState<Mode>(solo ? 'solo' : 'challenge')
  const [controls, setControls] = useState(false)
  const controlsToggle = useRef<HTMLButtonElement>(null)
  const choices = useChoiceKeys({
    screen: 'race-setup',
    initial: '.race-track-tabs .selected',
    onBack: () => {
      if (controls) {
        setControls(false)
        controlsToggle.current?.focus()
      } else onLeave()
    },
  })
  const summary = useBest((s) => s.bests[stage])
  const records = usePersonalBest(s => s.records)
  const context = personalKey(track)
  const best = records.find(r => r.key === context)?.run ??
    (summary?.context === context ? summary : undefined)
  const info = ROAD_INFO[stage]
  const theirLine = moveRun(theirs, 'qualifying', stage),
    myLine = moveRun(mine, 'qualifying', stage)
  const bothHere = presence[data.me].online && presence[them].online
  const room = readSitting(presence[them].racing)?.key
  const roomStage = room ? stageOfKey(room, '') : ''
  const joining = mode === 'live' && room && ROAD_ORDER.includes(roomStage as StageId) ? room : null
  const locked = shut(roadKey(stage))
  useEffect(() => {
    if (joining) onSelect(roomStage as StageId)
  }, [joining, roomStage, onSelect])
  const chooseMode = (next: Mode) => {
    setMode(next)
    if (next !== 'live' && (next === 'solo') !== solo)
      usePlaying.getState().open('ember-rally', next === 'solo')
  }
  const begin = () => {
    if (locked) return
    if (mode === 'live') {
      if (!bothHere) return
      // An explicit join keeps the existing room, even when device clocks differ.
      const key = joining ?? raceKey(data.now(), stage)
      data.publishPresence({ racing: key })
      usePlaying.getState().openRace('ember-rally', key)
    } else onStart(mode === 'solo' || theirLine ? 'chase' : 'qualifying')
  }
  return (
    <section
      ref={choices}
      className="race-setup"
      style={{ '--road-accent': info.accent } as React.CSSProperties}
      aria-label="Set up your race"
      aria-describedby="race-keys"
    >
      <nav className="race-setup-top" data-choice-row="navigation">
        <button onClick={onLeave}>← All games</button>
        <span>
          the hollow <i>·</i> ember rally
        </span>
        <button
          ref={controlsToggle}
          onClick={() => setControls((v) => !v)}
          aria-expanded={controls}
          aria-controls="race-controls"
        >
          Driving controls {controls ? '−' : '+'}
        </button>
      </nav>
      <p className="hollow-key-hint" id="race-keys">
        ← → roads <span>↑ ↓ choices</span> Enter continue <span>Esc back</span>
      </p>
      <header className="race-setup-heading">
        <div>
          <span className="race-eyebrow">somewhere beyond the firelight</span>
          <h1>Choose your road.</h1>
        </div>
        <p>
          Four different worlds.
          <br />
          One car that’s yours to master.
        </p>
      </header>
      {controls && (
        <section
          id="race-controls"
          className="race-controls-guide"
          data-choice-row="controls"
          aria-label="Driving controls"
        >
          <div>
            <strong>Keyboard</strong>
            <p>
              W / ↑ accelerate · S / ↓ brake · A D / ← → steer
              <br />
              Space handbrake · Shift ember boost · Escape pause
            </p>
          </div>
          <div>
            <strong>Touch</strong>
            <p>
              Use the steering, brake, handbrake, and ember controls shown on the road. Acceleration
              is automatic.
            </p>
          </div>
          <button
            onClick={() => {
              setControls(false)
              controlsToggle.current?.focus()
            }}
            aria-label="Close driving controls"
          >
            ×
          </button>
        </section>
      )}
      <div className="race-setup-layout">
        <div className="race-track-side">
          <div
            className="race-track-tabs"
            data-choice-row="tracks"
            role="group"
            aria-label="Choose a track"
          >
            {ROAD_ORDER.map((road, i) => (
              <button
                key={road}
                aria-pressed={stage === road}
                data-choice-preview
                data-choice-next="modes"
                disabled={Boolean(joining && stage !== road)}
                onClick={() => onSelect(road)}
                className={stage === road ? 'selected' : ''}
              >
                <span>0{i + 1}</span>
                {ROAD_INFO[road].name.replace('The ', '')}
                {shut(roadKey(road)) && <small>Unavailable</small>}
              </button>
            ))}
          </div>
          <div className="race-track-hero" key={stage}>
            <TrackArtwork stage={stage} />
            <div className="race-track-caption">
              <span>{info.landscape}</span>
              <h2>{info.name}</h2>
              <p>{info.character}</p>
            </div>
            <div className="race-route">
              <RouteMap track={track} />
              <span>{((track.length - track.start) / 1000).toFixed(1)} km · point to point</span>
            </div>
          </div>
          <div className="race-track-details">
            <p>{info.description}</p>
            <div>
              <span>your best</span>
              <strong>{best ? timeLabel(best.timeMs) : 'Your first run awaits'}</strong>
            </div>
          </div>
          <p className="race-track-tip">
            <span>a word for the road</span>
            {info.tip}
          </p>
        </div>
        <aside className="race-options">
          <span className="race-eyebrow">your kind of evening</span>
          <h2>How are we playing?</h2>
          <div
            className="race-mode-list"
            data-choice-row="modes"
            data-choice-axis="vertical"
            role="group"
            aria-label="Race mode"
          >
            {(
              [
                ['solo', 'Solo run', 'Chase your best run, or meet the road’s spirit.'],
                [
                  'challenge',
                  'Time challenge',
                  `Leave a recorded run for ${theirName}, or chase theirs.`,
                ],
                [
                  'live',
                  'Race together',
                  `Side by side with ${theirName}. Both drivers start together.`,
                ],
              ] as const
            ).map(([value, title, description]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                data-choice-preview
                data-choice-next="start"
                onClick={() => chooseMode(value)}
                className={mode === value ? 'selected' : ''}
              >
                <i aria-hidden="true" />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="race-session-note" role="status">
            {mode === 'live'
              ? joining
                ? `${theirName} is waiting on ${ROAD_INFO[stage].name}. Join the room, then both say ready.`
                : bothHere
                  ? `${theirName} is online. You’ll both get ready before the start.`
                  : `Live racing is available when ${theirName} is online. Solo runs and time challenges are ready now.`
              : mode === 'challenge'
                ? theirLine
                  ? `${theirName}’s recorded run: ${timeLabel(theirLine.timeMs)} to beat.`
                  : myLine
                    ? `Your recorded run: ${timeLabel(myLine.timeMs)}. Set another time for ${theirName} to chase.`
                    : `${theirName} can race your recording later. You don’t need to be online together.`
                : 'Your best line returns as a golden ghost. Until then, the road’s spirit keeps you company.'}
          </div>
          <div className="race-start-panel" data-choice-row="start">
            <button
              className="race-launch"
              disabled={locked || (mode === 'live' && !bothHere)}
              onClick={begin}
            >
              {locked
                ? 'Track unavailable'
                : mode === 'live'
                  ? joining
                    ? 'Join race room'
                    : 'Open race room'
                  : mode === 'challenge'
                    ? theirLine
                      ? 'Chase their time'
                      : 'Set a time'
                    : 'Start driving'}
              <span aria-hidden="true">→</span>
            </button>
            <span className="race-launch-note">
              {mode === 'live'
                ? 'The race starts after both drivers are ready.'
                : `${info.name} · ${mode === 'solo' ? 'Solo run' : 'Time challenge'}`}
            </span>
          </div>
          {mode === 'challenge' && onReplay && (
            <div data-choice-row="replay">
              <button className="race-watch-runs" onClick={onReplay}>
                Watch both recorded runs →
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
