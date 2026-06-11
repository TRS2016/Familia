import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import SlideUpModal from '../../components/SlideUpModal'
import { useJukeboxToken } from './useJukeboxToken'
import styles from './LecteurPage.module.css'

// Lien / QR pour inviter des non-membres à demander des morceaux.
export default function InviteModal({ onClose }: { onClose: () => void }) {
  const { query, create, revoke } = useJukeboxToken()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [purgeGuests, setPurgeGuests] = useState(false)
  // Instant d'ouverture de la modale : suffit pour un compte à rebours en heures.
  const [openedAt] = useState(() => Date.now())

  const token = query.data?.token ?? null
  const url = token ? `${window.location.origin}/soiree/${token}` : null

  const expiresAt = query.data?.expires_at ?? null
  const hoursLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - openedAt) / 3_600_000))
    : null

  // Crée un lien s'il n'en existe pas encore d'actif.
  useEffect(() => {
    if (!query.isLoading && !token && !create.isPending && !create.isSuccess) create.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isLoading, token])

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 260, margin: 1 }).then(setQr).catch(() => setQr(null))
  }, [url])

  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  async function share() {
    if (url && 'share' in navigator) { try { await navigator.share({ title: 'Demande ta musique 🎉', url }) } catch { /* annulé */ } }
  }

  return (
    <SlideUpModal title="Inviter à la soirée" onClose={onClose}>
      <div className={styles.inviteBody}>
        <p className={styles.inviteHint}>
          Tes invités scannent le QR (ou ouvrent le lien) et ajoutent des morceaux <strong>sans compte</strong>.
        </p>
        {!url ? (
          <p className={styles.jukeboxHint}>Création du lien…</p>
        ) : (
          <>
            {qr && <img src={qr} alt="QR code du lien de soirée" className={styles.inviteQr} />}
            <div className={styles.inviteUrl}>{url}</div>
            {hoursLeft != null && (
              <p className={styles.inviteExpiry}>
                {hoursLeft >= 2 ? `Le lien expire dans ~${hoursLeft} h.` : 'Le lien expire dans moins de 2 h.'}
              </p>
            )}
            <button className={styles.submitBtn} onClick={copy}>{copied ? 'Lien copié ✓' : 'Copier le lien'}</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className={styles.inviteShare} onClick={share}>Partager…</button>
            )}
            <label className={styles.invitePurgeRow}>
              <input
                type="checkbox"
                checked={purgeGuests}
                onChange={e => setPurgeGuests(e.target.checked)}
              />
              En fermant, supprimer de la bibliothèque les morceaux ajoutés par les invités (tag #soirée)
            </label>
            <button
              className={styles.inviteRevoke}
              onClick={() => { revoke.mutate({ purgeGuestTracks: purgeGuests }); onClose() }}
            >
              Fermer la soirée (désactiver le lien)
            </button>
          </>
        )}
      </div>
    </SlideUpModal>
  )
}
