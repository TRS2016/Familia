import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, History, PartyPopper, Play, Plus, Share2, X } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import MediaPlayer, { canAutoAdvance } from '../media/MediaPlayer'
import EqBars from './EqBars'
import InviteModal from './InviteModal'
import {
  useClearQueue, useLecteurPlayedHistory, useMarkQueuePlayed, useMoveQueueItem, useRemoveFromQueue,
} from './useLecteurQueue'
import type { QueueItem } from './useLecteurQueue'
import styles from './LecteurPage.module.css'

// File d'attente partagée de soirée. Le mode DJ (lecture sur cet appareil) est
// remonté dans LecteurPage pour garantir l'exclusivité avec la file perso.
export default function JukeboxPane({ queueItems, onGoToLibrary, djMode, onToggleDj }: {
  queueItems: QueueItem[]
  onGoToLibrary: () => void
  djMode: boolean
  onToggleDj: (on: boolean) => void
}) {
  const markPlayed = useMarkQueuePlayed()
  const removeItem = useRemoveFromQueue()
  const clearQueue = useClearQueue()
  const moveItem   = useMoveQueueItem()
  const { data: played = [] } = useLecteurPlayedHistory()
  const [showInvite, setShowInvite] = useState(false)
  const [showPlayed, setShowPlayed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const current = queueItems[0] ?? null
  const upNext  = queueItems.slice(1)

  // Durée totale restante (en cours + à suivre) + heure de fin estimée.
  // Les liens/embeds sans durée connue sont exclus → « ≈ au moins ».
  const totalSec    = queueItems.reduce((s, it) => s + (it.media_file?.duration_seconds ?? 0), 0)
  const someMissing = queueItems.some(it => !it.media_file?.duration_seconds)
  const endsAt      = totalSec > 0 ? new Date(now + totalSec * 1000) : null
  const totalsLabel = endsAt
    ? `${someMissing ? '≈ au moins ' : '≈ '}${Math.round(totalSec / 60)} min · fin ~ ${endsAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : null

  const inviteBtn = (
    <button className={styles.inviteBtn} onClick={() => setShowInvite(true)}>
      <Share2 size={14} strokeWidth={2.5} /> Inviter des amis (lien / QR)
    </button>
  )
  const inviteModal = showInvite && <InviteModal onClose={() => setShowInvite(false)} />

  const playedSection = played.length > 0 && (
    <>
      <button
        className={styles.jukeboxPlayedToggle}
        onClick={() => setShowPlayed(v => !v)}
        aria-expanded={showPlayed}
      >
        {showPlayed ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
        <History size={13} strokeWidth={2.5} /> Joué ce soir · {played.length}
      </button>
      {showPlayed && (
        <ul className={styles.jukeboxList}>
          {played.map(item => (
            <li key={item.id} className={[styles.jukeboxItem, styles.jukeboxItemPlayed].join(' ')}>
              <div className={styles.jukeboxItemBody}>
                <div className={styles.jukeboxItemTitle}>{item.media_file?.title ?? 'Morceau supprimé'}</div>
                {(item.added_by_member?.display_name ?? item.guest_name) && (
                  <div className={styles.jukeboxItemBy}>{item.added_by_member?.display_name ?? item.guest_name}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  if (!current) {
    return (
      <div className={styles.jukeboxEmpty}>
        <EmptyState
          emoji="🎉"
          title="La file est vide"
          description="Chacun ajoute ses morceaux depuis la Bibliothèque (bouton « + file ») ou via le lien d'invitation. Ils s'enchaînent ici."
        />
        {inviteBtn}
        <button className={styles.newListBtn} onClick={onGoToLibrary}>
          <Plus size={13} strokeWidth={2.5} /> Ajouter depuis la bibliothèque
        </button>
        {playedSection}
        {inviteModal}
      </div>
    )
  }

  return (
    <div className={styles.jukebox}>
      <div className={styles.jukeboxTopBar}>{inviteBtn}</div>
      {/* En cours */}
      <div className={styles.jukeboxNow}>
        <div className={styles.jukeboxNowHead}>
          <span className={styles.jukeboxNowLabel}>
            {djMode ? <EqBars small /> : <PartyPopper size={13} strokeWidth={2.5} />}
            {djMode ? ' En cours' : ' Prochain morceau'}
          </span>
          <button
            className={[styles.djToggle, djMode ? styles.djToggleOn : ''].join(' ')}
            onClick={() => onToggleDj(!djMode)}
            aria-pressed={djMode}
          >
            <Play size={12} strokeWidth={2.5} fill="currentColor" />
            {djMode ? 'Lecture sur cet appareil' : 'Lire ici (je suis le DJ)'}
          </button>
        </div>

        <div className={styles.jukeboxNowTitle}>{current.media_file?.title ?? 'Morceau supprimé'}</div>
        {(current.added_by_member?.display_name ?? current.guest_name) && (
          <div className={styles.jukeboxNowBy}>demandé par {current.added_by_member?.display_name ?? current.guest_name}</div>
        )}

        {djMode && current.media_file && (
          <div className={styles.playerWrap}>
            <MediaPlayer
              key={current.id}
              filePath={current.media_file.file_path}
              externalUrl={current.media_file.external_url}
              mimeType={current.media_file.mime_type}
              title={current.media_file.title}
              autoPlay
              onEnded={() => markPlayed.mutate(current.id)}
            />
          </div>
        )}
        {djMode && current.media_file
          && !canAutoAdvance(current.media_file.file_path, current.media_file.external_url, current.media_file.mime_type) && (
          <p className={styles.jukeboxHint}>
            Ce format (Spotify / lien) ne s'enchaîne pas tout seul — utilise « Passer au suivant » quand il se termine.
          </p>
        )}
        {djMode && (
          <button
            className={styles.skipBtn}
            onClick={() => markPlayed.mutate(current.id)}
            disabled={markPlayed.isPending}
          >
            Passer au suivant →
          </button>
        )}
      </div>

      {totalsLabel && <p className={styles.jukeboxTotals}>{totalsLabel}</p>}

      {/* À suivre */}
      <div className={styles.jukeboxUpNextHead}>
        <span>À suivre{upNext.length > 0 ? ` · ${upNext.length}` : ''}</span>
        <button className={styles.clearQueueBtn} onClick={() => clearQueue.mutate()} disabled={clearQueue.isPending}>Vider la file</button>
      </div>
      {upNext.length === 0 ? (
        <p className={styles.jukeboxHint}>Ajoutez des morceaux depuis la Bibliothèque pour remplir la file.</p>
      ) : (
        <ul className={styles.jukeboxList}>
          {upNext.map((item, i) => {
            const title = item.media_file?.title ?? 'Morceau supprimé'
            // Index dans queueItems (upNext démarre à 1).
            const idx = i + 1
            return (
              <li key={item.id} className={styles.jukeboxItem}>
                <span className={styles.jukeboxPos}>{i + 1}</span>
                <div className={styles.jukeboxItemBody}>
                  <div className={styles.jukeboxItemTitle}>{title}</div>
                  {(item.added_by_member?.display_name ?? item.guest_name) && (
                    <div className={styles.jukeboxItemBy}>{item.added_by_member?.display_name ?? item.guest_name}</div>
                  )}
                </div>
                {/* Monter en position 1 quand le DJ joue déplacerait la piste en
                    cours de lecture : on bloque ce cran-là seulement. */}
                <button
                  className={styles.jukeboxMoveBtn}
                  onClick={() => moveItem.mutate({ a: item, b: queueItems[idx - 1] })}
                  disabled={moveItem.isPending || (i === 0 && djMode)}
                  aria-label={`Monter ${title}`}
                >
                  <ChevronUp size={15} strokeWidth={2.5} />
                </button>
                <button
                  className={styles.jukeboxMoveBtn}
                  onClick={() => moveItem.mutate({ a: item, b: queueItems[idx + 1] })}
                  disabled={moveItem.isPending || i === upNext.length - 1}
                  aria-label={`Descendre ${title}`}
                >
                  <ChevronDown size={15} strokeWidth={2.5} />
                </button>
                <button
                  className={styles.jukeboxRemove}
                  onClick={() => removeItem.mutate(item.id)}
                  disabled={removeItem.isPending}
                  aria-label={`Retirer ${title} de la file`}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {playedSection}
      {inviteModal}
    </div>
  )
}
