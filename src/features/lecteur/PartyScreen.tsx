import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { SkipForward, X, Maximize2 } from 'lucide-react'
import EqBars from './EqBars'
import { useJukeboxToken } from './useJukeboxToken'
import { useMarkQueuePlayed } from './useLecteurQueue'
import type { QueueItem } from './useLecteurQueue'
import { useWakeLock } from '../../lib/useWakeLock'
import styles from './LecteurPage.module.css'

// Mode écran « soirée » : overlay plein écran à caster sur la TV. Affichage pur
// (le flux audio reste porté par le lecteur du JukeboxPane, dessous) → pas de
// double son ni de redémarrage en entrant/sortant. Lit la file en temps réel.
export default function PartyScreen({ queueItems, onClose }: {
  queueItems: QueueItem[]
  onClose: () => void
}) {
  const markPlayed = useMarkQueuePlayed()
  const { query } = useJukeboxToken()
  const [qr, setQr] = useState<string | null>(null)
  useWakeLock(true)

  const current = queueItems[0] ?? null
  const upNext  = queueItems.slice(1, 4)
  const requester = current ? (current.added_by_member?.display_name ?? current.guest_name) : null

  // Affiche le lien d'invitation existant. La CRÉATION passe uniquement par
  // « Inviter des amis » : deux voies de création concurrentes se supprimaient
  // le token l'une à l'autre (create() purge d'abord les tokens du foyer),
  // invalidant un QR déjà scanné.
  const token = query.data?.token ?? null
  const url = token ? `${window.location.origin}/soiree/${token}` : null
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQr).catch(() => setQr(null))
  }, [url])

  // Plein écran natif (best-effort : déclenché au montage et via un bouton de secours
  // si le navigateur exige un nouveau geste utilisateur).
  const rootRef = useRef<HTMLDivElement>(null)
  function enterFullscreen() {
    rootRef.current?.requestFullscreen?.().catch(() => { /* refusé/non supporté */ })
  }
  useEffect(() => {
    enterFullscreen()
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* déjà sorti */ }) }
  }, [])

  function close() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* déjà sorti */ })
    onClose()
  }

  return (
    <div ref={rootRef} className={styles.party}>
      <button className={styles.partyClose} onClick={close} aria-label="Quitter le mode écran">
        <X size={24} strokeWidth={2.5} />
      </button>

      <div className={styles.partyMain}>
        {current ? (
          <>
            <EqBars />
            <h2 className={styles.partyTitle}>{current.media_file?.title ?? 'Morceau supprimé'}</h2>
            {requester && <p className={styles.partyBy}>demandé par {requester}</p>}
          </>
        ) : (
          <>
            <span className={styles.partyEmoji} aria-hidden="true">🎉</span>
            <h2 className={styles.partyTitle}>La file est vide</h2>
            <p className={styles.partyBy}>Scannez le QR pour lancer un morceau</p>
          </>
        )}
      </div>

      {upNext.length > 0 && (
        <div className={styles.partyUpNext}>
          <span className={styles.partyUpNextLabel}>À suivre</span>
          <ol className={styles.partyUpNextList}>
            {upNext.map(it => (
              <li key={it.id}>
                <span className={styles.partyUpNextTitle}>{it.media_file?.title ?? '—'}</span>
                {(it.added_by_member?.display_name ?? it.guest_name) && (
                  <span className={styles.partyUpNextBy}> · {it.added_by_member?.display_name ?? it.guest_name}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className={styles.partyFooter}>
        {qr ? (
          <div className={styles.partyJoin}>
            <img src={qr} alt="QR pour rejoindre la soirée" className={styles.partyQr} />
            <span className={styles.partyJoinLabel}>Rejoindre<br />la soirée</span>
          </div>
        ) : (
          <p className={styles.partyNoQr}>
            Pas de lien actif — ouvre « Inviter des amis » dans l'onglet Soirée pour afficher le QR.
          </p>
        )}
        <div className={styles.partyControls}>
          {current && (
            <button
              className={styles.partySkip}
              onClick={() => markPlayed.mutate(current.id)}
              disabled={markPlayed.isPending}
            >
              <SkipForward size={18} strokeWidth={2.5} /> Suivant
            </button>
          )}
          <button className={styles.partyFsBtn} onClick={enterFullscreen} aria-label="Passer en plein écran">
            <Maximize2 size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
