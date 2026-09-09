import { useEffect, useMemo, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { usePlaying } from '@/systems/playing'
import { useSections } from '@/systems/sections'
import { gameKey, useDoorman } from '@/systems/locks'
import { readSitting, roundOfKey } from '@/systems/lobby'
import { useSay } from '@/systems/useSay'
import { theRoom } from '@/systems/waiting'
import { GAMES } from '@/world/games/registry'
import { useStandings } from '@/world/games/useRound'
import { TrackArtwork } from './TrackArtwork'
import './HollowLobby.css'

export function HollowLobby() {
  const data = useData(),
    say = useSay(),
    shut = useDoorman()
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const them = otherUser(data.me),
    name = profiles[them].name
  const [selected, setSelected] = useState<string | null>(null)
  const game = GAMES.find((g) => g.id === selected)
  const listed = useMemo(
    () => GAMES.filter((g) => g.mode !== 'live' && !shut(gameKey(g.id))),
    [shut],
  )
  const turns = useStandings(listed)
  const yours = Object.values(turns).filter((s) => s.turn === 'yours').length
  const bothHere = presence[data.me].online && presence[them].online
  useEffect(() => {
    theRoom.waitingForYou = yours
    return () => {
      theRoom.waitingForYou = 0
    }
  }, [yours])
  useEffect(() => {
    if (!selected) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setSelected(null)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [selected])
  const start = (id: string, solo: boolean) => {
    if (!shut(gameKey(id))) usePlaying.getState().open(id, solo)
  }
  const live = () => {
    if (!game?.live || !bothHere || shut(gameKey(game.id))) return
    const waiting = roundOfKey(readSitting(presence[them].racing)?.key ?? '')
    const own = String(data.now())
    const key = waiting && (waiting < own || data.me > them) ? waiting : own
    data.publishPresence({ racing: key })
    usePlaying.getState().openRace(game.id, key)
  }
  const openGame = (id: string) => {
    if (shut(gameKey(id))) return
    if (id === 'ember-rally') start(id, true)
    else setSelected(id)
  }
  return (
    <section className="hollow-hub" aria-label="The Hollow games">
      <nav className="hollow-top">
        <button onClick={() => (selected ? setSelected(null) : useSections.getState().leave())}>
          ← {selected ? 'All games' : 'The garden'}
        </button>
        <span>THE HOLLOW</span>
        <span className={`hollow-presence ${presence[them].online ? 'online' : ''}`}>
          <i />
          {presence[them].online ? `${name} is here` : 'Play at your own pace'}
        </span>
      </nav>
      <div className="hollow-content">
        {game ? (
          <>
            <header className="hollow-heading">
              <span className="hollow-eyebrow">YOUR NEXT GAME</span>
              <h1>{game.name}</h1>
              <p>{say(game.blurb)}</p>
            </header>
            <div className="hollow-modes" aria-label={`Ways to play ${game.name}`}>
              {game.mode !== 'live' && (
                <>
                  <button onClick={() => start(game.id, false)}>
                    <span className="hollow-mode-icon">↗</span>
                    <small>TAKE TURNS</small>
                    <strong>{game.id === 'word-duel' ? 'Daily duel' : `Challenge ${name}`}</strong>
                    <p>
                      {game.invite
                        ? say(game.invite.tip)
                        : `Leave a challenge for ${name} to play later.`}
                    </p>
                    <span className="hollow-mode-action">
                      {turns[game.id]?.turn === 'yours'
                        ? 'Continue your game'
                        : 'Start a challenge'}{' '}
                      →
                    </span>
                  </button>
                  <button onClick={() => start(game.id, true)}>
                    <span className="hollow-mode-icon">◎</span>
                    <small>SOLO</small>
                    <strong>Practice</strong>
                    <p>
                      {game.id === 'word-duel'
                        ? 'Find a word from the word list. Six guesses, with no waiting.'
                        : say(game.alone ?? 'Play on your own.')}
                    </p>
                    <span className="hollow-mode-action">Play solo →</span>
                  </button>
                </>
              )}
              {game.live && (
                <button disabled={!bothHere} onClick={live}>
                  <span className="hollow-mode-icon">◉</span>
                  <small>TOGETHER, LIVE</small>
                  <strong>{game.id === 'word-duel' ? 'Beat the clock' : 'Play together'}</strong>
                  <p>{say(game.live.tip)}. Both players get ready before the game begins.</p>
                  <span className="hollow-mode-action">
                    {bothHere ? `Play with ${name} →` : `Available when ${name} is online`}
                  </span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <header className="hollow-heading">
              <span className="hollow-eyebrow">A LITTLE FRIENDLY COMPETITION</span>
              <h1>Stay for a game.</h1>
              <p>A quick word duel, a road worth racing, or something to play together.</p>
            </header>
            <div className="hollow-library">
              {[...GAMES]
                .sort((a, b) => Number(b.id === 'ember-rally') - Number(a.id === 'ember-rally'))
                .map((g) => {
                  const locked = shut(gameKey(g.id)),
                    turn = turns[g.id]
                  return (
                    <button
                      key={g.id}
                      className={`hollow-game-tile ${g.id}`}
                      disabled={locked}
                      onClick={() => openGame(g.id)}
                      onPointerEnter={() => {
                        g.Component.warm()
                        g.Stage?.warm()
                      }}
                      onFocus={() => g.Component.warm()}
                    >
                      <span className="hollow-tile-art">
                        {g.id === 'ember-rally' ? (
                          <TrackArtwork stage="rootway" />
                        ) : (
                          <span className="hollow-emblem">{g.Emblem && <g.Emblem />}</span>
                        )}
                        <span className="hollow-tile-category">
                          {g.id === 'ember-rally'
                            ? 'RACING'
                            : g.id === 'word-duel'
                              ? 'WORD GAME'
                              : 'PARTY GAME'}
                        </span>
                      </span>
                      <span className="hollow-tile-body">
                        <strong>{g.name}</strong>
                        <span className="hollow-tile-description">
                          {g.id === 'ember-rally'
                            ? 'Four worlds. Your car. Find your next favourite corner.'
                            : say(g.blurb)}
                        </span>
                        <span className="hollow-tile-meta">
                          {g.id === 'ember-rally'
                            ? 'Solo · challenges · live racing'
                            : g.mode === 'live'
                              ? '2 players · play together'
                              : 'Solo · daily duel · live'}
                        </span>
                        <span className="hollow-tile-enter">
                          {locked
                            ? 'Temporarily unavailable'
                            : turn?.turn === 'yours'
                              ? 'Your turn is waiting'
                              : g.id === 'ember-rally'
                                ? 'Choose a track'
                                : 'Choose how to play'}{' '}
                          <b aria-hidden="true">↗</b>
                        </span>
                      </span>
                    </button>
                  )
                })}
            </div>
            <section className="hollow-activity" aria-label="Your shared games">
              <div>
                <span className="hollow-eyebrow">BETWEEN THE TWO OF YOU</span>
                <h2>Your shared games</h2>
              </div>
              <div>
                {listed.map((g) => {
                  const status = turns[g.id]
                  return (
                    <button key={g.id} onClick={() => start(g.id, false)}>
                      <strong>{g.name}</strong>
                      <span>
                        {!status
                          ? 'Checking today’s game…'
                          : status.done
                            ? 'Your game is complete'
                            : status.turn === 'yours'
                              ? 'Your turn · continue'
                              : status.turn === 'hers'
                                ? `Waiting for ${name}`
                                : status.turn === 'both'
                                  ? 'Ready to continue'
                                  : 'Start today’s challenge'}
                      </span>
                      <b aria-hidden="true">→</b>
                    </button>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  )
}
