import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
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
import { useChoiceKeys } from './useChoiceKeys'
import './HollowLobby.css'

// Keep your place when a game temporarily takes over the world.
const useHollowMenu = create<{ selected: string | null; lastGame: string }>(() => ({
  selected: null,
  lastGame: 'ember-rally',
}))

export function HollowLobby() {
  const data = useData(),
    say = useSay(),
    shut = useDoorman()
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const them = otherUser(data.me),
    name = profiles[them].name
  const { selected, lastGame } = useHollowMenu()
  const setSelected = (selected: string | null) => useHollowMenu.setState({ selected })
  const back = () => {
    if (selected) setSelected(null)
    else {
      useHollowMenu.setState({ selected: null, lastGame: 'ember-rally' })
      useSections.getState().leave()
    }
  }
  const choices = useChoiceKeys({
    screen: selected ?? 'library',
    initial: selected ? '.hollow-modes button:not(:disabled)' : `.hollow-game-tile.${lastGame}`,
    onBack: back,
  })
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
    useHollowMenu.setState({ lastGame: id })
    if (id === 'ember-rally') start(id, true)
    else setSelected(id)
  }
  return (
    <section
      ref={choices}
      className="hollow-hub"
      aria-label="The Hollow games"
      aria-describedby="hollow-keys"
    >
      <nav className="hollow-top" data-choice-row="navigation">
        <button onClick={back}>← {selected ? 'All games' : 'The garden'}</button>
        <span>the hollow</span>
        <span className={`hollow-presence ${presence[them].online ? 'online' : ''}`}>
          <i />
          {presence[them].online ? `${name} is here` : 'Play at your own pace'}
        </span>
      </nav>
      <p className="hollow-key-hint" id="hollow-keys">
        ← → choose <span>↑ ↓ wander</span> Enter play <span>Esc back</span>
      </p>
      <div className="hollow-content">
        {game ? (
          <>
            <header className="hollow-heading">
              <span className="hollow-eyebrow">a little time to play</span>
              <h1>{game.name}</h1>
              <p>{say(game.blurb)}</p>
            </header>
            <div
              className="hollow-modes"
              data-choice-row="modes"
              aria-label={`Ways to play ${game.name}`}
            >
              {game.mode !== 'live' && (
                <>
                  <button onClick={() => start(game.id, false)}>
                    <span className="hollow-mode-icon">↗</span>
                    <small>take turns</small>
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
                    <small>on your own</small>
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
                  <small>here, together</small>
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
              <span className="hollow-eyebrow">where the evening wanders</span>
              <h1>Stay for a game.</h1>
              <p>A quick word duel, a road worth racing, or something to play together.</p>
            </header>
            <div className="hollow-library" data-choice-row="games">
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
                            ? 'a road through the dark'
                            : g.id === 'word-duel'
                              ? 'a little wordplay'
                              : 'see where your mind goes'}
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
                <span className="hollow-eyebrow">between the two of you</span>
                <h2>Your shared games</h2>
              </div>
              <div data-choice-row="shared" data-choice-axis="vertical">
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
