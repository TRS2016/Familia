import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Upload, Link as LinkIcon, X,
  ListMusic, Search, Moon, Star, PartyPopper, Repeat, Repeat1, Volume2, Sliders,
} from 'lucide-react'
import { useToast } from '../../components/useToast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer, { mediaFileUrlKey, signMediaFileUrl } from '../media/MediaPlayer'
import {
  useMediaFiles, useAddMediaFile, useDeleteMediaFile, useUploadMediaFile,
  useToggleFavorite, useLecteurPlaylists, detectKind, bumpPlayCount,
} from './useLecteur'
import type { MediaFile, MediaFileKind } from './useLecteur'
import { useLecteurRealtime } from './useLecteurRealtime'
import { useLecteurQueue, useAddToQueue, usePendingRequests } from './useLecteurQueue'
import { KIND_META, probeDuration, youtubeThumb } from './lecteur.utils'
import { useSleepTimer } from './useSleepTimer'
import { useMediaSession } from './useMediaSession'
import { useDjLock } from './useDjLock'
import DjPlayer, { type DjSettings } from './DjPlayer'
import EqBars from './EqBars'
import FileRow from './FileRow'
import JukeboxPane from './JukeboxPane'
import PartyScreen from './PartyScreen'
import MixConsole from './MixConsole'
import PlaylistsPane from './PlaylistsPane'
import YouTubeSearchModal from './YouTubeSearchModal'
import AddUrlModal from './AddUrlModal'
import AddPlaylistModal from './AddPlaylistModal'
import AddSmartPlaylistModal from './AddSmartPlaylistModal'
import ImportYtPlaylistModal from './ImportYtPlaylistModal'
import AddToPlaylistModal from './AddToPlaylistModal'
import EditFileModal from './EditFileModal'
import styles from './LecteurPage.module.css'

export default function LecteurPage() {
  useLecteurRealtime()
  const { data: files = [], isLoading } = useMediaFiles()
  const { data: playlists = [] }        = useLecteurPlaylists()
  const addFile    = useAddMediaFile()
  const deleteFile = useDeleteMediaFile()
  const uploadFile = useUploadMediaFile()
  const toggleFav  = useToggleFavorite()
  const { data: queueItems = [] } = useLecteurQueue()
  const { data: pendingRequests = [] } = usePendingRequests()
  const addToQueue = useAddToQueue()

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
    staleTime: 60 * 60 * 1000,
  })

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState<'bibliothèque' | 'listes' | 'soirée' | 'mix'>('bibliothèque')

  // ── Filters ──
  const [filterKind,     setFilterKind]     = useState<MediaFileKind | null>(null)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterTag,      setFilterTag]      = useState<string | null>(null)
  const [filterTitle,    setFilterTitle]    = useState('')
  const [filterFavorite, setFilterFavorite] = useState(false)
  const [sortBy,         setSortBy]         = useState<'recent' | 'az' | 'duration'>('recent')

  // Tous les tags existants, triés par fréquence décroissante
  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of files) for (const t of (f.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [files])

  // ── Queue + player ──
  const [queue,      setQueue]      = useState<MediaFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  // Force le remount du lecteur pour rejouer la même piste (répétition « tout »
  // sur une file d'un seul morceau : l'index ne change pas).
  const [replayNonce, setReplayNonce] = useState(0)
  const playingFile = queue[queueIndex] ?? null
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1
  const isAudioTrack = playingFile ? detectKind(playingFile) === 'audio' : false

  // Compteur d'écoutes : déclenché par une lecture réellement engagée (3 s), une
  // seule fois par piste. Compter au montage inflatait le total à chaque
  // aller-retour d'onglet ou remontage du composant.
  const countedRef = useRef<Set<string>>(new Set())
  function countPlay(id: string, currentTime: number) {
    if (currentTime < 3 || countedRef.current.has(id)) return
    countedRef.current.add(id)
    bumpPlayCount(id)
  }

  // ── Mode DJ (soirée) : exclusif avec la file perso ──
  // L'état vit ici (et pas dans JukeboxPane) pour empêcher deux flux audio
  // simultanés : activer le DJ coupe la file perso, et inversement.
  const [djMode, setDjMode] = useState(false)
  const { showToast } = useToast()
  // Verrou serveur : un seul appareil joue la file. Sans lui, deux téléphones
  // sur l'onglet Soirée produisaient deux flux et des morceaux sautés.
  useDjLock(djMode, () => {
    setDjMode(false)
    showToast({ type: 'error', message: 'Un autre appareil est déjà DJ pour cette soirée.' })
  })
  function toggleDj(on: boolean) {
    if (on) stop()
    setDjMode(on)
  }

  // Réglages du lecteur DJ : ils vivent ici parce que le lecteur est monté hors
  // des onglets (JukeboxPane ne porte plus que les commandes).
  const [djSettings, setDjSettings] = useState<DjSettings>({
    volume: 1, crossfade: false, crossfadeSec: 6, autoFill: false, fillPlaylistId: null,
  })

  // Mode écran « soirée » plein écran : overlay au-dessus du lecteur DJ (qui
  // porte l'audio). L'ouvrir active le DJ pour qu'un son soit joué sur cet appareil.
  const [partyScreen, setPartyScreen] = useState(false)
  function openPartyScreen() {
    stop()
    setDjMode(true)
    setPartyScreen(true)
  }

  // ── Contrôles de lecture ──
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [speed, setSpeed]           = useState(1)
  const [showSleepModal, setShowSleepModal]   = useState(false)
  const [customSleepMin, setCustomSleepMin]   = useState('')
  const sleep = useSleepTimer(() => stop())
  // stop() est déclaré plus bas et appelle sleep.clear() : la réf casse le cycle.
  const sleepRef = useRef(sleep)
  useEffect(() => { sleepRef.current = sleep })
  // Volume (audio uniquement) : slider du dock × facteur de fondu du minuteur.
  // Persisté par appareil pour retrouver son réglage entre les sessions.
  const VOLUME_STORAGE_KEY = 'familia-lecteur-volume'
  const [userVolume, setUserVolume] = useState(() => {
    const v = Number(localStorage.getItem(VOLUME_STORAGE_KEY))
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1
  })
  useEffect(() => {
    try { localStorage.setItem(VOLUME_STORAGE_KEY, String(userVolume)) } catch { /* quota */ }
  }, [userVolume])

  // Volume transmis au lecteur :
  //  - audio : slider du dock × fondu (le slider est le seul contrôle de volume) ;
  //  - vidéo / YouTube : uniquement pendant le fondu de sortie, pour ne pas écraser
  //    le volume natif réglé par l'utilisateur le reste du temps.
  const playerVolume = isAudioTrack
    ? userVolume * sleep.fadeFactor
    : (sleep.fadeFactor < 1 ? sleep.fadeFactor : undefined)
  // Progression du mini-lecteur (audio/vidéo) : le scrubber complet défile hors
  // écran, le dock collant garde un repère de position. Clé par piste pour
  // retomber à 0 au changement sans effet (set-state-in-effect).
  const [dockProgress, setDockProgress] = useState<{ id: string; pct: number }>({ id: '', pct: 0 })

  const SPEEDS = [1, 1.25, 1.5, 2, 0.75]
  function cycleSpeed() { setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]) }
  function cycleRepeat() { setRepeatMode(m => m === 'off' ? 'all' : m === 'all' ? 'one' : 'off') }

  function startCustomSleep() {
    const m = Math.round(Number(customSleepMin))
    if (!Number.isFinite(m) || m <= 0) return
    sleep.set(Math.min(m, 600))
    setCustomSleepMin('')
    setShowSleepModal(false)
  }

  // Précharge l'URL signée de la piste suivante pour lisser l'auto-advance.
  const queryClient = useQueryClient()
  useEffect(() => {
    const nextPath = queue[queueIndex + 1]?.file_path
    if (!nextPath) return
    queryClient.prefetchQuery({
      queryKey: mediaFileUrlKey(nextPath),
      queryFn: () => signMediaFileUrl(nextPath),
      staleTime: 90 * 60 * 1000,
    })
  }, [queue, queueIndex, queryClient])

  useMediaSession({
    file: playingFile,
    index: queueIndex,
    total: queue.length,
    onPrev: hasPrev ? () => setQueueIndex(i => Math.max(0, i - 1)) : null,
    onNext: hasNext ? () => setQueueIndex(i => i + 1) : null,
    onStop: () => stop(),
  })

  // Raccourcis clavier (desktop) : ←/→ = piste précédente/suivante. On ignore
  // la frappe dans un champ de saisie. (Espace play/pause viendra avec le contrôle
  // direct de l'élément média.)
  useEffect(() => {
    if (!playingFile) return
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && hasPrev)  { e.preventDefault(); setQueueIndex(i => Math.max(0, i - 1)) }
      else if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); setQueueIndex(i => i + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playingFile, hasPrev, hasNext])

  function playFiles(fileList: MediaFile[], startIndex = 0) {
    if (fileList.length === 0) return
    setDjMode(false) // la file perso prend la main sur le mode DJ
    setQueue(fileList)
    setQueueIndex(Math.max(0, Math.min(startIndex, fileList.length - 1)))
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function stop() {
    setQueue([])
    setQueueIndex(0)
    sleepRef.current.clear()
  }

  // « Lire ensuite » : insère le morceau juste après la piste en cours (file
  // perso). File vide → démarre la lecture directement.
  function playNext(file: MediaFile) {
    if (queue.length === 0) { playFiles([file], 0); return }
    setDjMode(false)
    setQueue(q => {
      const next = [...q]
      next.splice(queueIndex + 1, 0, file)
      return next
    })
  }

  // Fin de piste : applique répétition / file d'attente / minuteur « fin de piste ».
  function handleTrackEnded() {
    if (sleep.endOfTrack) { stop(); return }
    if (hasNext) setQueueIndex(i => i + 1)
    else if (repeatMode === 'all') {
      // File à plusieurs pistes : on revient au début. File d'une seule piste :
      // l'index ne change pas, on force un remount pour relancer la lecture.
      if (queue.length > 1) setQueueIndex(0)
      else setReplayNonce(n => n + 1)
    }
  }

  // ── Modal state ──
  const [editingFile,          setEditingFile]          = useState<MediaFile | null>(null)
  const [showUrlModal,         setShowUrlModal]         = useState(false)
  const [showYtSearch,         setShowYtSearch]         = useState(false)
  const [selectedPlaylistId,   setSelectedPlaylistId]   = useState<string | null>(null)
  const [showAddPlaylist,      setShowAddPlaylist]      = useState(false)
  const [showAddSmart,         setShowAddSmart]         = useState(false)
  const [showImportYt,         setShowImportYt]         = useState(false)
  const [addToPlaylistFileId,  setAddToPlaylistFileId]  = useState<string | null>(null)

  // ── Derived ──
  const favoriteCount = files.filter(f => f.is_favorite).length
  const filtered = useMemo(() => {
    const result = files.filter(f => {
      if (filterFavorite && !f.is_favorite)                                            return false
      if (filterKind     && detectKind(f) !== filterKind)                              return false
      if (filterMemberId && f.member_id   !== filterMemberId)                          return false
      if (filterTag      && !(f.tags ?? []).includes(filterTag))                       return false
      if (filterTitle    && !f.title.toLowerCase().includes(filterTitle.toLowerCase())) return false
      return true
    })
    // `files` arrive déjà triés par created_at desc → « recent » = ordre naturel.
    if (sortBy === 'az') return [...result].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    if (sortBy === 'duration') return [...result].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
    return result
  }, [files, filterFavorite, filterKind, filterMemberId, filterTag, filterTitle, sortBy])

  // ── Handlers ──
  async function handleUpload(file: File) {
    const [result, duration] = await Promise.all([uploadFile.mutateAsync(file), probeDuration(file)])
    const name = file.name.replace(/\.[^.]+$/, '')
    try {
      await addFile.mutateAsync({
        title: name, file_path: result.path, mime_type: result.mimeType, duration_seconds: duration,
      })
    } catch {
      // L'insert en base a échoué après l'upload : on retire l'objet du bucket
      // pour ne pas laisser de fichier orphelin (le toast d'erreur vient du hook).
      await supabase.storage.from('family-media').remove([result.path]).catch(() => { /* best effort */ })
    }
  }

  // ── Glisser-déposer un fichier sur la page (desktop) ──
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)
  const hasFiles = (e: React.DragEvent) => e.dataTransfer?.types?.includes('Files')
  function onPageDragEnter(e: React.DragEvent) { if (!hasFiles(e)) return; dragDepth.current++; setIsDragging(true) }
  function onPageDragLeave() { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false) }
  function onPageDragOver(e: React.DragEvent) { if (hasFiles(e)) e.preventDefault() }
  function onPageDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) handleUpload(file)
  }

  return (
    <div
      className={styles.page}
      onDragEnter={onPageDragEnter}
      onDragOver={onPageDragOver}
      onDragLeave={onPageDragLeave}
      onDrop={onPageDrop}
    >
      {isDragging && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropCard}>
            <Upload size={28} strokeWidth={2} />
            <p>Déposez un fichier audio ou vidéo</p>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Lecteur</h1>
        {activeTab === 'bibliothèque' && (
          <div className={styles.headerRight}>
            {members.length > 1 && (
              <div className={styles.headerMembers}>
                <button
                  className={[styles.headerMemberPill, !filterMemberId ? styles.headerMemberPillActive : ''].join(' ')}
                  onClick={() => setFilterMemberId(null)}
                >
                  Tous
                </button>
                {members.map((m, i) => {
                  const active = filterMemberId === m.id
                  const color  = memberColor(i)
                  return (
                    <button
                      key={m.id}
                      className={[styles.headerMemberPill, active ? styles.headerMemberPillActive : ''].join(' ')}
                      style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                      onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
                    >
                      {m.display_name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className={styles.headerActions}>
              <button className={styles.urlBtn} onClick={() => setShowYtSearch(true)}>
                <Search size={13} strokeWidth={2} /> Rechercher
              </button>
              <button className={styles.urlBtn} onClick={() => setShowUrlModal(true)}>
                <LinkIcon size={13} strokeWidth={2} /> URL
              </button>
              <button
                className={styles.uploadBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploadFile.isPending || addFile.isPending}
              >
                <Upload size={13} strokeWidth={2} />
                {uploadFile.isPending ? 'Upload…' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      {/* ── Sticky mini-player (now-playing bar + contrôles) ─────────
          L'embed média est rendu SOUS le dock (et non dedans) : une vidéo
          en lecture ne fait plus grandir le header collant ni recouvrir la
          liste au défilement. Le bandeau compact reste toujours visible. */}
      {playingFile && (
        <>
        <div className={styles.playerDock}>
          <div className={styles.nowPlaying}>
            <div className={styles.nowPlayingArt}>
              {youtubeThumb(playingFile.external_url)
                ? <img className={styles.nowPlayingArtImg} src={youtubeThumb(playingFile.external_url)!} alt="" />
                : <span className={styles.nowPlayingArtEmoji} aria-hidden="true">{KIND_META[detectKind(playingFile)].emoji}</span>}
              <span className={styles.nowPlayingArtEq}><EqBars small /></span>
            </div>
            <div className={styles.nowPlayingInfo}>
              <span className={styles.nowPlayingTitle}>{playingFile.title}</span>
              <span className={styles.nowPlayingSub}>
                {KIND_META[detectKind(playingFile)].label}
                {playingFile.member && ` · ${playingFile.member.display_name}`}
                {queue.length > 1 && ` · ${queueIndex + 1}/${queue.length}`}
              </span>
            </div>
            <div className={styles.nowPlayingNav}>
              <button
                className={styles.nowPlayingNavBtn}
                onClick={() => setQueueIndex(i => i - 1)}
                disabled={!hasPrev}
                aria-label="Précédent"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <button
                className={styles.nowPlayingNavBtn}
                onClick={() => setQueueIndex(i => i + 1)}
                disabled={!hasNext}
                aria-label="Suivant"
              >
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
              <button className={styles.nowPlayingStopBtn} onClick={stop} aria-label="Fermer">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Contrôles : répétition · vitesse · minuteur */}
          <div className={styles.dockControls}>
            <button
              className={[styles.dockCtrlBtn, repeatMode !== 'off' ? styles.dockCtrlActive : ''].join(' ')}
              onClick={cycleRepeat}
              aria-label={`Répétition : ${repeatMode === 'off' ? 'désactivée' : repeatMode === 'all' ? 'toute la liste' : 'le titre'}`}
              title="Répétition"
            >
              {repeatMode === 'one'
                ? <Repeat1 size={16} strokeWidth={2.5} />
                : <Repeat size={16} strokeWidth={2.5} />}
            </button>

            {playingFile.file_path && (
              <button
                className={[styles.dockCtrlBtn, speed !== 1 ? styles.dockCtrlActive : ''].join(' ')}
                onClick={cycleSpeed}
                aria-label={`Vitesse de lecture : ${speed}×`}
                title="Vitesse de lecture"
              >
                <span className={styles.dockSpeedLabel}>{speed}×</span>
              </button>
            )}

            <button
              className={[styles.dockCtrlBtn, sleep.active ? styles.dockCtrlActive : ''].join(' ')}
              onClick={() => setShowSleepModal(true)}
              aria-label="Minuteur de sommeil"
              title="Minuteur de sommeil"
            >
              <Moon size={15} strokeWidth={2.5} />
              {sleep.active && (
                <span className={styles.dockSleepLabel}>{sleep.endOfTrack ? 'fin' : `${sleep.minutesLeft}′`}</span>
              )}
            </button>

            {isAudioTrack && (
              <div className={styles.dockVolume}>
                <Volume2 size={15} strokeWidth={2.5} aria-hidden="true" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(userVolume * 100)}
                  onChange={e => setUserVolume(Number(e.target.value) / 100)}
                  className={styles.dockVolumeSlider}
                  aria-label="Volume"
                />
              </div>
            )}
          </div>

          {/* Repère de progression du mini-lecteur (audio/vidéo). Le scrubber
              complet reste dans l'embed plus bas. */}
          {playingFile.file_path && (
            <div className={styles.dockProgress} aria-hidden="true">
              <div
                className={styles.dockProgressFill}
                style={{ width: `${dockProgress.id === playingFile.id ? dockProgress.pct : 0}%` }}
              />
            </div>
          )}
        </div>
          <div className={[styles.playerWrap, styles.dockPlayer].join(' ')}>
            <MediaPlayer
              key={`${playingFile.id}:${replayNonce}`}
              filePath={playingFile.file_path}
              externalUrl={playingFile.external_url}
              mimeType={playingFile.mime_type}
              title={playingFile.title}
              autoPlay
              loop={repeatMode === 'one' && !sleep.endOfTrack}
              playbackRate={speed}
              resumeKey={playingFile.id}
              onEnded={handleTrackEnded}
              onProgress={(c, d) => {
                setDockProgress({ id: playingFile.id, pct: d > 0 ? (c / d) * 100 : 0 })
                countPlay(playingFile.id, c)
              }}
              volume={playerVolume}
            />
          </div>
        </>
      )}

      {/* ── Lecteur DJ : hors des onglets, sinon changer d'onglet démontait
          le lecteur (musique coupée, morceau repris au début au retour). ── */}
      {djMode && (
        <DjPlayer
          current={queueItems[0] ?? null}
          next={queueItems[1] ?? null}
          settings={djSettings}
        />
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className={styles.tabRow} role="tablist" aria-label="Vues du lecteur">
        <button
          role="tab"
          id="lecteur-tab-bibliothèque"
          aria-selected={activeTab === 'bibliothèque'}
          aria-controls="lecteur-panel-bibliothèque"
          className={[styles.tab, activeTab === 'bibliothèque' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('bibliothèque')}
        >
          Bibliothèque
        </button>
        <button
          role="tab"
          id="lecteur-tab-listes"
          aria-selected={activeTab === 'listes'}
          aria-controls="lecteur-panel-listes"
          className={[styles.tab, activeTab === 'listes' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('listes')}
        >
          <ListMusic size={13} strokeWidth={2} />
          Listes
          {playlists.length > 0 && <span className={styles.tabBadge}>{playlists.length}</span>}
        </button>
        <button
          role="tab"
          id="lecteur-tab-soirée"
          aria-selected={activeTab === 'soirée'}
          aria-controls="lecteur-panel-soirée"
          className={[styles.tab, activeTab === 'soirée' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('soirée')}
        >
          <PartyPopper size={13} strokeWidth={2} />
          Soirée
          {queueItems.length > 0 && <span className={styles.tabBadge}>{queueItems.length}</span>}
          {pendingRequests.length > 0 && (
            <span className={styles.tabBadgeAlert} title={`${pendingRequests.length} demande(s) en attente de validation`}>
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          role="tab"
          id="lecteur-tab-mix"
          aria-selected={activeTab === 'mix'}
          aria-controls="lecteur-panel-mix"
          className={[styles.tab, activeTab === 'mix' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('mix')}
        >
          <Sliders size={13} strokeWidth={2} />
          Mix
        </button>
      </div>

      {/* ── Bibliothèque tab ─────────────────────────────────────── */}
      {activeTab === 'bibliothèque' && (
        <div role="tabpanel" id="lecteur-panel-bibliothèque" aria-labelledby="lecteur-tab-bibliothèque">
          {/* Type filters */}
          <div className={styles.filterRow}>
            <button
              className={[styles.filterPill, !filterKind ? styles.filterPillActive : ''].join(' ')}
              onClick={() => setFilterKind(null)}
            >
              Tous · {files.length}
            </button>
            {(['audio', 'vidéo', 'lien'] as MediaFileKind[]).map(k => {
              const count = files.filter(f => detectKind(f) === k).length
              if (count === 0) return null
              return (
                <button
                  key={k}
                  className={[styles.filterPill, filterKind === k ? styles.filterPillActive : ''].join(' ')}
                  onClick={() => setFilterKind(fk => fk === k ? null : k)}
                >
                  {KIND_META[k].emoji} {KIND_META[k].label}s · {count}
                </button>
              )
            })}
            {favoriteCount > 0 && (
              <button
                className={[styles.filterPill, filterFavorite ? styles.filterPillActive : ''].join(' ')}
                onClick={() => setFilterFavorite(v => !v)}
                aria-pressed={filterFavorite}
              >
                <Star size={11} strokeWidth={2.5} fill={filterFavorite ? 'currentColor' : 'none'} /> Favoris · {favoriteCount}
              </button>
            )}
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className={styles.filterRow}>
              {filterTag && (
                <button
                  className={[styles.filterPill, styles.filterPillClear].join(' ')}
                  onClick={() => setFilterTag(null)}
                >
                  <X size={11} strokeWidth={2.5} /> Tag
                </button>
              )}
              {allTags.map(t => (
                <button
                  key={t}
                  className={[styles.tagFilterPill, filterTag === t ? styles.tagFilterPillActive : ''].join(' ')}
                  onClick={() => setFilterTag(cur => cur === t ? null : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          {files.length > 3 && (
            <div className={styles.searchWrap}>
              <Search size={14} strokeWidth={2} className={styles.searchIcon} />
              <input
                type="search"
                className={styles.searchInput}
                value={filterTitle}
                onChange={e => setFilterTitle(e.target.value)}
                placeholder="Rechercher dans la bibliothèque…"
                aria-label="Rechercher dans la bibliothèque"
              />
              {filterTitle && (
                <button className={styles.searchClear} onClick={() => setFilterTitle('')} aria-label="Effacer">
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}

          {/* Sort */}
          {files.length > 1 && (
            <div className={styles.sortRow}>
              <label className={styles.sortLabel} htmlFor="lecteur-sort">Trier</label>
              <select
                id="lecteur-sort"
                className={styles.sortSelect}
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="recent">Récents</option>
                <option value="az">A → Z</option>
                <option value="duration">Durée</option>
              </select>
            </div>
          )}

          {/* List */}
          {isLoading ? (
            <div className={styles.spinnerWrap}><Spinner size={32} /></div>
          ) : files.length === 0 ? (
            <EmptyState
              emoji="🎵"
              title="Bibliothèque vide"
              description="Uploadez un fichier audio/vidéo ou ajoutez un lien YouTube/Spotify."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="Aucun résultat"
              description="Aucun média ne correspond à ces filtres."
              action={{
                label: 'Réinitialiser les filtres',
                onClick: () => {
                  setFilterKind(null); setFilterMemberId(null); setFilterTag(null)
                  setFilterTitle(''); setFilterFavorite(false)
                },
              }}
            />
          ) : (
            <ul className={[styles.list, styles.libraryGrid].join(' ')}>
              {filtered.map((file, i) => (
                <FileRow
                  key={file.id}
                  file={file}
                  isPlaying={playingFile?.id === file.id}
                  onPlay={() => playFiles(filtered, i)}
                  onDelete={() => {
                    if (playingFile?.id === file.id) stop()
                    deleteFile.mutate({ id: file.id, filePath: file.file_path })
                  }}
                  onEdit={() => setEditingFile(file)}
                  onAddToPlaylist={() => setAddToPlaylistFileId(file.id)}
                  onToggleFavorite={() => toggleFav.mutate({ id: file.id, value: !file.is_favorite })}
                  onQueue={() => addToQueue.mutate(file.id)}
                  onPlayNext={() => playNext(file)}
                  manualPlaylists={playlists.filter(p => p.type === 'manual')}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Listes tab ───────────────────────────────────────────── */}
      {activeTab === 'listes' && (
        <div role="tabpanel" id="lecteur-panel-listes" aria-labelledby="lecteur-tab-listes">
        <PlaylistsPane
          playlists={playlists}
          allFiles={files}
          selectedId={selectedPlaylistId}
          onSelect={setSelectedPlaylistId}
          onBack={() => setSelectedPlaylistId(null)}
          onNewManual={() => setShowAddPlaylist(true)}
          onNewSmart={() => setShowAddSmart(true)}
          onImportYt={() => setShowImportYt(true)}
          onPlay={playFiles}
          playingFileId={playingFile?.id ?? null}
        />
        </div>
      )}

      {/* ── Soirée (jukebox partagé) ─────────────────────────────── */}
      {activeTab === 'soirée' && (
        <div role="tabpanel" id="lecteur-panel-soirée" aria-labelledby="lecteur-tab-soirée">
        <JukeboxPane
          queueItems={queueItems}
          onGoToLibrary={() => setActiveTab('bibliothèque')}
          djMode={djMode}
          onToggleDj={toggleDj}
          onOpenScreen={openPartyScreen}
          settings={djSettings}
          onSettings={patch => setDjSettings(s => ({ ...s, ...patch }))}
        />
        </div>
      )}

      {activeTab === 'mix' && (
        <div role="tabpanel" id="lecteur-panel-mix" aria-labelledby="lecteur-tab-mix">
          <MixConsole files={files} />
        </div>
      )}

      {partyScreen && (
        <PartyScreen queueItems={queueItems} onClose={() => setPartyScreen(false)} />
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showUrlModal && <AddUrlModal onClose={() => setShowUrlModal(false)} />}

      {showYtSearch && (
        <YouTubeSearchModal
          onClose={() => setShowYtSearch(false)}
          onAdd={(r) => addFile.mutate({ title: r.title, external_url: `https://youtu.be/${r.videoId}` })}
        />
      )}

      {showAddPlaylist && <AddPlaylistModal onClose={() => setShowAddPlaylist(false)} />}

      {showImportYt && <ImportYtPlaylistModal onClose={() => setShowImportYt(false)} />}

      {showAddSmart && (
        <AddSmartPlaylistModal files={files} members={members} onClose={() => setShowAddSmart(false)} />
      )}

      {addToPlaylistFileId && (
        <AddToPlaylistModal
          mediaFileId={addToPlaylistFileId}
          playlists={playlists.filter(p => p.type === 'manual')}
          onClose={() => setAddToPlaylistFileId(null)}
        />
      )}

      {editingFile && (
        <EditFileModal file={editingFile} onClose={() => setEditingFile(null)} />
      )}

      {showSleepModal && (
        <SlideUpModal title="Minuteur de sommeil" onClose={() => setShowSleepModal(false)}>
          <div className={styles.sleepBody}>
            {sleep.active && (
              <div className={styles.sleepActiveRow}>
                <p className={styles.sleepActiveLabel}>
                  {sleep.endOfTrack
                    ? 'La lecture s’arrêtera à la fin de la piste.'
                    : `Arrêt dans ${sleep.minutesLeft} min.`}
                </p>
                {!sleep.endOfTrack && (
                  <button className={styles.sleepExtendBtn} onClick={sleep.extend}>+5 min</button>
                )}
              </div>
            )}
            <div className={styles.sleepGrid}>
              {[15, 30, 45, 60].map(min => (
                <button
                  key={min}
                  className={styles.sleepOption}
                  onClick={() => { sleep.set(min); setShowSleepModal(false) }}
                >
                  {min} min
                </button>
              ))}
              <button
                className={styles.sleepOption}
                onClick={() => { sleep.set(null, true); setShowSleepModal(false) }}
              >
                Fin de la piste
              </button>
              {sleep.active && (
                <button
                  className={[styles.sleepOption, styles.sleepCancel].join(' ')}
                  onClick={() => { sleep.clear(); setShowSleepModal(false) }}
                >
                  Annuler
                </button>
              )}
            </div>
            <form
              className={styles.sleepCustomRow}
              onSubmit={e => { e.preventDefault(); startCustomSleep() }}
            >
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="600"
                className={styles.sleepCustomInput}
                value={customSleepMin}
                onChange={e => setCustomSleepMin(e.target.value)}
                placeholder="Durée libre (min)"
                aria-label="Durée personnalisée en minutes"
              />
              <button type="submit" className={styles.sleepCustomBtn} disabled={!customSleepMin}>
                Lancer
              </button>
            </form>
          </div>
        </SlideUpModal>
      )}

    </div>
  )
}
