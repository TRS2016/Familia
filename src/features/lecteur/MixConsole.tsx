import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, Disc3, Search, X } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import { signMediaFileUrl } from '../media/MediaPlayer'
import { isLocalAudio, fmtDuration } from './lecteur.utils'
import type { MediaFile } from './useLecteur'
import styles from './MixConsole.module.css'

// ── Table de mixage 2 platines (fichiers audio locaux uniquement) ─────────────
// YouTube/liens = iframe, aucun accès au signal → exclus. EQ 3 bandes + VU via
// Web Audio (BiquadFilter + Analyser). Repli automatique en mode « simple »
// (volume seul, sans EQ ni VU) si le graphe audio ne produit pas de son :
// certains navigateurs rendent le contexte muet sur une source distante mal
// CORS-configurée. Un AudioContext est partagé par les deux platines.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

interface DeckNodes {
  source: MediaElementAudioSourceNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  gain: GainNode
  analyser: AnalyserNode
}

function Deck({ side, track, weight, capable, ctxRef, onSilence, onPick, onClear }: {
  side: 'A' | 'B'
  track: MediaFile | null
  weight: number            // poids du crossfader pour cette platine (0..1)
  capable: boolean          // Web Audio validé (sinon mode simple)
  ctxRef: React.MutableRefObject<AudioContext | null>
  onSilence: () => void     // le graphe ne produit pas de son → repli
  onPick: () => void
  onClear: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const nodesRef = useRef<DeckNodes | null>(null)
  const meterRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number | null>(null)
  const sawSignalRef = useRef(false)
  const silenceCheckedRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.9)
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 })

  const weightRef = useRef(weight)
  const volumeRef = useRef(volume)
  useEffect(() => { weightRef.current = weight }, [weight])
  useEffect(() => { volumeRef.current = volume }, [volume])

  // Gain effectif = volume de la platine × poids du crossfader. Passe par le
  // GainNode en mode Web Audio, sinon directement par l'élément <audio>.
  const applyGain = useCallback(() => {
    const g = clamp01(volumeRef.current * weightRef.current)
    const ctx = ctxRef.current
    if (nodesRef.current && ctx) {
      nodesRef.current.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.015)
    } else if (audioRef.current) {
      audioRef.current.volume = g
    }
  }, [ctxRef])

  useEffect(() => { applyGain() }, [volume, weight, applyGain])

  const applyEq = useCallback(() => {
    const n = nodesRef.current
    if (!n) return
    n.low.gain.value = eq.low
    n.mid.gain.value = eq.mid
    n.high.gain.value = eq.high
  }, [eq])
  useEffect(() => { applyEq() }, [eq, applyEq])

  // Boucle VU : lit l'analyseur et écrit la hauteur directement sur l'élément
  // (pas de setState 60×/s). Détecte aussi l'absence de signal (repli).
  const startMeter = useCallback(() => {
    const n = nodesRef.current
    if (!n) return
    const buf = new Uint8Array(n.analyser.frequencyBinCount)
    const tick = () => {
      n.analyser.getByteFrequencyData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i++) if (buf[i] > peak) peak = buf[i]
      if (peak > 4) sawSignalRef.current = true
      if (meterRef.current) meterRef.current.style.height = `${Math.round((peak / 255) * 100)}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const ensureGraph = useCallback(() => {
    if (!capable || nodesRef.current) return
    const el = audioRef.current
    if (!el) return
    let ctx = ctxRef.current
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) { onSilence(); return }
      ctx = new Ctor()
      ctxRef.current = ctx
    }
    try {
      const source = ctx.createMediaElementSource(el)
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3500
      const gain = ctx.createGain()
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256
      source.connect(low); low.connect(mid); mid.connect(high); high.connect(gain)
      gain.connect(analyser); analyser.connect(ctx.destination)
      nodesRef.current = { source, low, mid, high, gain, analyser }
      el.volume = 1 // le gain node pilote le niveau désormais
      applyEq(); applyGain(); startMeter()
    } catch {
      // createMediaElementSource a échoué → mode simple.
      onSilence()
    }
  }, [capable, ctxRef, onSilence, applyEq, applyGain, startMeter])

  // Charge le morceau (URL signée). crossOrigin requis pour Web Audio.
  useEffect(() => {
    let cancelled = false
    const el = audioRef.current
    if (!el) return
    if (!track?.file_path) { el.removeAttribute('src'); el.load(); setPlaying(false); setPosition(0); setDuration(0); return }
    signMediaFileUrl(track.file_path)
      .then(url => {
        if (cancelled || !el) return
        el.src = url
        el.load()
        setPosition(0); setPlaying(false)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [track])

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }, [])

  async function toggle() {
    const el = audioRef.current
    if (!el || !track) return
    if (playing) { el.pause(); setPlaying(false); return }
    if (capable) { ensureGraph(); try { await ctxRef.current?.resume() } catch { /* ignore */ } }
    try {
      await el.play()
      setPlaying(true)
      // Vérifie une seule fois qu'on entend bien quelque chose.
      if (capable && !silenceCheckedRef.current) {
        silenceCheckedRef.current = true
        window.setTimeout(() => {
          if (!sawSignalRef.current && !el.paused && clamp01(volumeRef.current * weightRef.current) > 0.05) onSilence()
        }, 2600)
      }
    } catch { /* autoplay bloqué */ }
  }

  function cue() {
    const el = audioRef.current
    if (!el) return
    el.currentTime = 0
    setPosition(0)
    if (!playing) { /* reste en pause au point de repère */ }
  }

  function seek(v: number) {
    const el = audioRef.current
    if (!el || !isFinite(el.duration)) return
    el.currentTime = v
    setPosition(v)
  }

  return (
    <div className={styles.deck}>
      <div className={styles.deckHead}>
        <span className={[styles.deckBadge, side === 'A' ? styles.badgeA : styles.badgeB].join(' ')}>{side}</span>
        <div className={styles.deckTitleWrap}>
          {track ? (
            <>
              <span className={styles.deckTitle}>{track.title}</span>
              <span className={styles.deckSub}>{fmtDuration(position)} / {duration > 0 ? fmtDuration(duration) : (track.duration_seconds ? fmtDuration(track.duration_seconds) : '—')}</span>
            </>
          ) : (
            <span className={styles.deckEmpty}>Aucun morceau chargé</span>
          )}
        </div>
        <div className={styles.vu} aria-hidden="true"><span ref={meterRef} className={styles.vuBar} /></div>
      </div>

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="auto"
        onLoadedMetadata={e => setDuration(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />

      <input
        className={styles.seek}
        type="range" min={0} max={duration || 1} step={0.1} value={position}
        onChange={e => seek(Number(e.target.value))}
        disabled={!track}
        aria-label={`Position platine ${side}`}
      />

      <div className={styles.transport}>
        <button className={styles.cueBtn} onClick={cue} disabled={!track} aria-label="Retour au début"><SkipBack size={16} /></button>
        <button className={[styles.playBtn, playing ? styles.playBtnOn : ''].join(' ')} onClick={toggle} disabled={!track} aria-label={playing ? 'Pause' : 'Lecture'}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        {track
          ? <button className={styles.loadBtn} onClick={onClear} aria-label="Décharger">Vider</button>
          : <button className={styles.loadBtn} onClick={onPick}><Disc3 size={15} /> Charger</button>}
        {track && <button className={styles.loadBtn} onClick={onPick} aria-label="Changer de morceau">Changer</button>}
      </div>

      <div className={styles.eqRow}>
        {(['high', 'mid', 'low'] as const).map(band => (
          <label key={band} className={styles.eqBand}>
            <input
              className={styles.eqSlider}
              type="range" min={-12} max={12} step={1} value={eq[band]}
              onChange={e => setEq(q => ({ ...q, [band]: Number(e.target.value) }))}
              disabled={!capable}
              aria-label={`EQ ${band === 'low' ? 'graves' : band === 'mid' ? 'médiums' : 'aigus'} platine ${side}`}
              /* @ts-expect-error orient vertical (non typé) */
              orient="vertical"
            />
            <span className={styles.eqLabel}>{band === 'low' ? 'Grave' : band === 'mid' ? 'Médium' : 'Aigu'}</span>
          </label>
        ))}
        <label className={styles.volCol}>
          <input
            className={styles.volSlider}
            type="range" min={0} max={1} step={0.01} value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            aria-label={`Volume platine ${side}`}
            /* @ts-expect-error orient vertical (non typé) */
            orient="vertical"
          />
          <span className={styles.eqLabel}>Vol</span>
        </label>
      </div>
    </div>
  )
}

export default function MixConsole({ files }: { files: MediaFile[] }) {
  const { showToast } = useToast()
  const localAudio = files.filter(f => isLocalAudio(f))

  const ctxRef = useRef<AudioContext | null>(null)
  const [capable, setCapable] = useState(true)
  const [remountKey, setRemountKey] = useState(0)
  const [xfade, setXfade] = useState(0.5)
  const [trackA, setTrackA] = useState<MediaFile | null>(null)
  const [trackB, setTrackB] = useState<MediaFile | null>(null)
  const [picker, setPicker] = useState<'A' | 'B' | null>(null)
  const [pickSearch, setPickSearch] = useState('')

  // Crossfader équal-power : somme des puissances constante (pas de creux au centre).
  const weightA = Math.cos(xfade * Math.PI / 2)
  const weightB = Math.sin(xfade * Math.PI / 2)

  const silencedRef = useRef(false)
  const handleSilence = useCallback(() => {
    if (silencedRef.current) return
    silencedRef.current = true
    setCapable(false)
    setRemountKey(k => k + 1) // remonte les <audio> (une source Web Audio muette ne se répare pas)
    try { ctxRef.current?.close() } catch { /* ignore */ }
    ctxRef.current = null
    showToast({ type: 'error', message: 'EQ/VU indisponibles sur ce navigateur — mode simple (volume seul) activé.' })
  }, [showToast])

  const pickList = pickSearch.trim()
    ? localAudio.filter(f => f.title.toLowerCase().includes(pickSearch.trim().toLowerCase()))
    : localAudio

  function choose(f: MediaFile) {
    if (picker === 'A') setTrackA(f)
    else if (picker === 'B') setTrackB(f)
    setPicker(null); setPickSearch('')
  }

  if (localAudio.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <span className={styles.emptyEmoji}>🎛️</span>
        <p className={styles.emptyTitle}>Aucun morceau mixable</p>
        <p className={styles.emptyText}>La table de mixage lit les fichiers audio uploadés dans la bibliothèque (pas les liens YouTube). Ajoute des fichiers audio pour commencer.</p>
      </div>
    )
  }

  return (
    <div className={styles.console}>
      <div className={styles.decks}>
        <Deck key={`A-${remountKey}`} side="A" track={trackA} weight={weightA} capable={capable}
          ctxRef={ctxRef} onSilence={handleSilence}
          onPick={() => setPicker('A')} onClear={() => setTrackA(null)} />
        <Deck key={`B-${remountKey}`} side="B" track={trackB} weight={weightB} capable={capable}
          ctxRef={ctxRef} onSilence={handleSilence}
          onPick={() => setPicker('B')} onClear={() => setTrackB(null)} />
      </div>

      <div className={styles.xfadeWrap}>
        <span className={styles.xfadeEnd}>A</span>
        <input
          className={styles.xfade}
          type="range" min={0} max={1} step={0.01} value={xfade}
          onChange={e => setXfade(Number(e.target.value))}
          aria-label="Crossfader A vers B"
        />
        <span className={styles.xfadeEnd}>B</span>
      </div>
      <button className={styles.xfadeCenter} onClick={() => setXfade(0.5)}>Centrer</button>

      {!capable && <p className={styles.simpleNote}>Mode simple : volume et crossfader actifs, égaliseur désactivé.</p>}

      {picker && (
        <SlideUpModal title={`Charger sur la platine ${picker}`} onClose={() => { setPicker(null); setPickSearch('') }}>
          <div className={styles.pickWrap}>
            <div className={styles.pickSearch}>
              <Search size={15} />
              <input
                autoFocus
                value={pickSearch}
                onChange={e => setPickSearch(e.target.value)}
                placeholder="Rechercher un morceau…"
                aria-label="Rechercher un morceau"
              />
              {pickSearch && <button onClick={() => setPickSearch('')} aria-label="Effacer"><X size={15} /></button>}
            </div>
            <ul className={styles.pickList}>
              {pickList.length === 0 ? (
                <li className={styles.pickEmpty}>Aucun morceau trouvé.</li>
              ) : pickList.map(f => (
                <li key={f.id}>
                  <button className={styles.pickRow} onClick={() => choose(f)}>
                    <span className={styles.pickEmoji}>🎵</span>
                    <span className={styles.pickTitle}>{f.title}</span>
                    {f.duration_seconds != null && <span className={styles.pickDur}>{fmtDuration(f.duration_seconds)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </SlideUpModal>
      )}
    </div>
  )
}
