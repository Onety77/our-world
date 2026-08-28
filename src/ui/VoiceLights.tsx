import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import type { VoiceLight } from '@/data/types'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { attempt, attemptValue } from '@/systems/trouble'
import { ambience } from '@/systems/ambience'
import { useVoiceLights, voicePlayback, voicePulse } from '@/systems/voiceLights'
import {
  recordingMime,
  VOICE_LIGHT_SECONDS,
  voiceWaveform,
  whyNoMicrophone,
} from '@/systems/voiceRecording'

interface Review {
  blob: Blob
  url: string
  mime: string
  ext: string
  duration: number
  waveform: number[]
}

function clock(seconds: number): string {
  return `0:${Math.max(0, Math.ceil(seconds)).toString().padStart(2, '0')}`
}

function skyPosition(light: VoiceLight): CSSProperties {
  const mineSide = light.by === 'warm' ? -1 : 1
  const spread = ((light.slot % 4) - 1.5) * 8
  return {
    '--voice-x': `${50 + mineSide * 24 + spread}%`,
    '--voice-y': `${24 + (light.slot % 3) * 12}%`,
    '--voice-delay': `${-(light.slot * 1.7 + (light.by === 'cool' ? 0.8 : 0))}s`,
  } as CSSProperties
}

export function VoiceLights() {
  const data = useData()
  const me = data.me
  const profiles = useWorldSlice((state) => state.profiles)
  const index = useSections((state) => state.index)
  const entered = useSections((state) => state.entered)
  const here = entered && SECTIONS[index]?.id === 'stars'

  const lights = useVoiceLights((state) => state.lights)
  const limit = useVoiceLights((state) => state.limit)
  const selectedId = useVoiceLights((state) => state.selectedId)
  const selected = lights.find((light) => light.id === selectedId) ?? null

  const [open, setOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [targetSlot, setTargetSlot] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [review, setReview] = useState<Review | null>(null)
  const [saving, setSaving] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const beganAt = useRef(0)
  const cancelled = useRef(false)
  const audio = useRef<HTMLAudioElement>(null)
  const playbackFrame = useRef(0)

  useEffect(
    () => data.watchVoiceLights((garden) =>
      useVoiceLights.getState().setGarden(garden.lights, garden.limit)),
    [data],
  )

  const mine = useMemo(
    () => lights.filter((light) => light.by === me).sort((a, b) => a.slot - b.slot),
    [lights, me],
  )
  const theirs = useMemo(
    () => lights.filter((light) => light.by !== me).sort((a, b) => a.slot - b.slot),
    [lights, me],
  )
  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  function quietPlayback() {
    const element = audio.current
    if (element) element.pause()
    cancelAnimationFrame(playbackFrame.current)
    playbackFrame.current = 0
    voicePlayback.id = null
    voicePlayback.playing = false
    voicePlayback.progress = 0
    voicePlayback.amplitude = 0
    setPlaying(false)
    ambience.setMaster(document.hidden ? 0 : 0.85)
    window.dispatchEvent(new CustomEvent('garden:voice-light', { detail: false }))
  }

  async function hear(light: VoiceLight) {
    useVoiceLights.getState().select(light.id)
    if (voicePlayback.id === light.id && voicePlayback.playing) {
      quietPlayback()
      return
    }
    quietPlayback()
    const url = await attemptValue('that light would not open', () => data.voiceLightUrl(light))
    if (!url) return
    setAudioUrl(url)
    const element = audio.current
    if (!element) return
    element.src = url
    element.currentTime = 0
    const started = await attempt('that light could not be heard', () => element.play())
    if (!started) return
    voicePlayback.id = light.id
    voicePlayback.playing = true
    setPlaying(true)
    ambience.setMaster(0.16)
    window.dispatchEvent(new CustomEvent('garden:voice-light', { detail: true }))

    const pulse = () => {
      const duration = element.duration || light.duration || 1
      voicePlayback.progress = Math.min(1, element.currentTime / duration)
      voicePlayback.amplitude = voicePulse(light, voicePlayback.progress)
      playbackFrame.current = requestAnimationFrame(pulse)
    }
    playbackFrame.current = requestAnimationFrame(pulse)
  }

  function releaseMicrophone() {
    for (const track of stream.current?.getTracks() ?? []) track.stop()
    stream.current = null
    recorder.current = null
  }

  function finishRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  async function beginRecording(slot: number) {
    /*
      Ask why before asking whether.

      This used to be one condition and one message — "this browser cannot
      record a voice-light" — which is wrong nearly every time it appears. See
      `whyNoMicrophone`: the usual cause is the page being open on a plain
      http network address rather than localhost, and the browser is perfectly
      capable. A message that blames the wrong thing costs an afternoon.
    */
    const why = whyNoMicrophone()
    const choice = recordingMime()
    if (why !== null || !choice) {
      await attempt('there is no microphone here', async () => {
        throw new Error(why ?? 'Microphone recording is unavailable here.')
      })
      return
    }
    quietPlayback()
    cancelled.current = false
    setTargetSlot(slot)
    setReview(null)
    const allowed = await attemptValue('the microphone did not open', () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      }),
    )
    if (!allowed) return

    stream.current = allowed
    const next = choice.mime
      ? new MediaRecorder(allowed, { mimeType: choice.mime, audioBitsPerSecond: 64_000 })
      : new MediaRecorder(allowed)
    recorder.current = next
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.onstop = async () => {
      const duration = Math.min(VOICE_LIGHT_SECONDS, (performance.now() - beganAt.current) / 1000)
      const mime = next.mimeType || choice.mime || 'audio/webm'
      const blob = new Blob(chunks.current, { type: mime })
      releaseMicrophone()
      setRecording(false)
      if (cancelled.current || blob.size === 0 || duration < 0.7) return
      const waveform = await voiceWaveform(blob)
      setReview({ blob, url: URL.createObjectURL(blob), mime, ext: choice.ext, duration, waveform })
    }
    beganAt.current = performance.now()
    setElapsed(0)
    setRecording(true)
    next.start(250)
  }

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const next = (performance.now() - beganAt.current) / 1000
      setElapsed(next)
      if (next >= VOICE_LIGHT_SECONDS) finishRecording()
    }, 80)
    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => {
    return () => {
      cancelled.current = true
      if (recorder.current?.state === 'recording') recorder.current.stop()
      releaseMicrophone()
      quietPlayback()
    }
  }, [])

  useEffect(() => {
    if (!review) return
    return () => URL.revokeObjectURL(review.url)
  }, [review])

  useEffect(() => {
    if (here) return
    setOpen(false)
    useVoiceLights.getState().select(null)
    quietPlayback()
    if (recording) {
      cancelled.current = true
      finishRecording()
    }
  }, [here])

  async function keepReview() {
    if (!review || targetSlot === null) return
    setSaving(true)
    const kept = await attemptValue('that light did not reach the sky', () =>
      data.leaveVoiceLight({
        slot: targetSlot,
        audio: review.blob,
        mime: review.mime,
        ext: review.ext,
        duration: review.duration,
        waveform: review.waveform,
      }),
    )
    setSaving(false)
    if (!kept) return
    setReview(null)
    setTargetSlot(null)
    useVoiceLights.getState().select(kept.id)
  }

  async function remove(light: VoiceLight) {
    if (light.by !== me) return
    if (!confirm('Let this voice-light go? The recording itself will be deleted.')) return
    quietPlayback()
    const gone = await attempt('that light did not leave', () => data.removeVoiceLight(light.slot))
    if (gone) useVoiceLights.getState().select(null)
  }

  if (!here) return <audio ref={audio} src={audioUrl ?? undefined} onEnded={quietPlayback} />

  return (
    <div className={`voice-lights-ui${open ? ' open' : ''}`}>
      <audio ref={audio} src={audioUrl ?? undefined} onEnded={quietPlayback} />

      {lights.map((light) => (
        <button
          key={light.id}
          type="button"
          className={`voice-sky-touch ${light.by}${selectedId === light.id ? ' selected' : ''}${voicePlayback.id === light.id && playing ? ' sounding' : ''}`}
          data-voice-light={light.id}
          style={skyPosition(light)}
          onClick={() => void hear(light)}
          aria-label={`Hear ${profiles[light.by].name}'s ${clock(light.duration)} voice-light`}
        >
          <span className="voice-comet-tail" aria-hidden="true" />
          <span className="voice-comet-core" aria-hidden="true" />
        </button>
      ))}

      {!open ? (
        <button type="button" className="voice-beacon" onClick={() => setOpen(true)}>
          <span className="voice-beacon-mark" aria-hidden="true" />
          <span>voice-lights</span>
          <small>{mine.length} of {limit} yours</small>
        </button>
      ) : (
        <section className="voice-dock" aria-label="voice-lights">
          <header>
            <div>
              <p>held in the Stars</p>
              <h2>voice-lights</h2>
            </div>
            <button type="button" className="voice-close" onClick={() => {
              if (!recording && !review) setOpen(false)
            }} aria-label="Close voice-lights">×</button>
          </header>

          {recording ? (
            <div className="voice-recording">
              <div className="voice-record-orbit" style={{ '--record-progress': Math.min(1, elapsed / VOICE_LIGHT_SECONDS) } as CSSProperties}>
                <i aria-hidden="true" />
                <strong>{clock(VOICE_LIGHT_SECONDS - elapsed)}</strong>
              </div>
              <p>Only your voice. The light stops by itself.</p>
              <div className="voice-actions">
                <button type="button" onClick={finishRecording}>finish the light</button>
                <button type="button" onClick={() => {
                  cancelled.current = true
                  finishRecording()
                }}>let it go</button>
              </div>
            </div>
          ) : review ? (
            <div className="voice-review">
              <p className="voice-review-time">a {clock(review.duration)} light</p>
              <audio controls src={review.url} aria-label="Preview this voice-light" />
              <div className="voice-wave" aria-hidden="true">
                {review.waveform.map((value, i) => <i key={i} style={{ height: `${18 + value * 72}%` }} />)}
              </div>
              <div className="voice-actions">
                <button type="button" disabled={saving} onClick={() => void keepReview()}>
                  {saving ? 'lifting it…' : 'leave it in the sky'}
                </button>
                <button type="button" disabled={saving} onClick={() => setReview(null)}>record again</button>
              </div>
            </div>
          ) : (
            <>
              {selected && (
                <div className={`voice-listening ${selected.by}`}>
                  <button type="button" className="voice-hear" onClick={() => void hear(selected)}>
                    <span>{voicePlayback.id === selected.id && playing ? 'pause' : 'hear'}</span>
                    <b>{profiles[selected.by].name}</b>
                    <small>{clock(selected.duration)}</small>
                  </button>
                  <div className="voice-wave" aria-hidden="true">
                    {selected.waveform.map((value, i) => <i key={i} style={{ height: `${16 + value * 74}%` }} />)}
                  </div>
                  {selected.by === me && (
                    <button type="button" className="voice-remove" onClick={() => void remove(selected)}>
                      let this light go
                    </button>
                  )}
                </div>
              )}

              <div className="voice-constellations">
                <div>
                  <p>your places</p>
                  <div className="voice-slots">
                    {Array.from({ length: limit }, (_, slot) => {
                      const light = mine.find((item) => item.slot === slot)
                      return (
                        <button
                          type="button"
                          key={slot}
                          className={light ? 'filled' : ''}
                          onClick={() => light ? void hear(light) : void beginRecording(slot)}
                          aria-label={light ? `Hear your voice-light ${slot + 1}` : `Record voice-light ${slot + 1}`}
                        >
                          <i aria-hidden="true" />
                          <span>{light ? clock(light.duration) : 'empty'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <p>{them.name}&rsquo;s places</p>
                  <div className="voice-slots theirs">
                    {Array.from({ length: limit }, (_, slot) => {
                      const light = theirs.find((item) => item.slot === slot)
                      return (
                        <button
                          type="button"
                          key={slot}
                          className={light ? 'filled' : ''}
                          disabled={!light}
                          onClick={() => light && void hear(light)}
                          aria-label={light ? `Hear ${them.name}'s voice-light ${slot + 1}` : `${them.name}'s empty voice-light place ${slot + 1}`}
                        >
                          <i aria-hidden="true" />
                          <span>{light ? clock(light.duration) : 'waiting'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <p className="voice-law">
                {mine.length < limit
                  ? 'A voice stays rare here: twenty-five seconds, and only these places.'
                  : 'Your sky is full. Choose one of your lights to hear or replace it.'}
              </p>
              {mine.length < limit && (
                <button
                  type="button"
                  className="voice-record"
                  onClick={() => void beginRecording(Array.from({ length: limit }, (_, slot) => slot).find((slot) => !mine.some((light) => light.slot === slot)) ?? 0)}
                >
                  leave a voice-light
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
