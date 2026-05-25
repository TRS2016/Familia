import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Copy, Check } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useAuth } from '../auth/useAuth'
import { QK } from '../lib/query-keys'
import { useMember } from '../auth/useMember'
import type { Member } from '../auth/useMember'
import { useNotificationToggle } from '../auth/useNotificationToggle'
import { useToast } from '../components/Toast'
import { MEMBER_PALETTE } from '../lib/constants'
import { useTheme } from '../lib/useTheme'
import type { Theme } from '../lib/useTheme'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { session } = useAuth()
  const { data: member } = useMember()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { theme, setTheme } = useTheme()
  const { enabled: notifEnabled, toggle: toggleNotif, isPending: notifPending } = useNotificationToggle()

  // ── Display name ──────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(member?.display_name ?? '')
  const [nameSaving, setNameSaving] = useState(false)

  useEffect(() => {
    if (member?.display_name) setDisplayName(member.display_name)
  }, [member?.display_name])

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed || trimmed === member?.display_name || !member) return
    setNameSaving(true)
    const { error } = await supabase
      .from('members')
      .update({ display_name: trimmed })
      .eq('id', member.id)
    setNameSaving(false)
    if (error) {
      showToast({ type: 'error', message: 'Impossible de mettre à jour le prénom.' })
      return
    }
    queryClient.setQueryData<Member>(QK.member(session!.user.id), old =>
      old ? { ...old, display_name: trimmed } : old!
    )
    queryClient.invalidateQueries({ queryKey: QK.membersList })
    showToast({ type: 'success', message: 'Prénom mis à jour !' })
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed) return
    setEmailSending(true)
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    setEmailSending(false)
    if (error) {
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'e-mail.' })
      return
    }
    setEmailSent(true)
    setNewEmail('')
  }

  // ── Household members ─────────────────────────────────────────────────────
  const { data: householdMembers = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, display_name')
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  // ── iCal subscription ────────────────────────────────────────────────────
  const calSecret = import.meta.env.VITE_CAL_SECRET as string | undefined
  const icalUrl = calSecret
    ? `${window.location.origin}/api/ical?token=${calSecret}`
    : null
  const [copied, setCopied] = useState(false)

  function handleCopyUrl() {
    if (!icalUrl) return
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDeleteAccount() {
    if (!member) return
    setDeleting(true)
    const { error } = await supabase.from('members').delete().eq('id', member.id)
    if (error) {
      setDeleting(false)
      showToast({ type: 'error', message: 'Impossible de supprimer le compte.' })
      return
    }
    await supabase.auth.signOut()
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Réglages</h1>
        {/* spacer to keep title centered */}
        <div style={{ width: 22 }} />
      </header>

      {/* ── Profil ───────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Mon profil</h2>
        <form onSubmit={handleNameSubmit} className={styles.fieldGroup}>
          <div className={styles.field}>
            <label htmlFor="s-displayname" className={styles.fieldLabel}>
              Prénom affiché
            </label>
            <input
              id="s-displayname"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className={styles.input}
              placeholder="Sophie"
              required
            />
          </div>
          <button
            type="submit"
            className={styles.btn}
            disabled={
              nameSaving ||
              !displayName.trim() ||
              displayName.trim() === member?.display_name
            }
          >
            {nameSaving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </form>
      </section>

      {/* ── Email ────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Adresse e-mail</h2>
        <p className={styles.currentValue}>{session?.user.email}</p>
        {emailSent ? (
          <p className={styles.successMsg}>
            ✓ Lien de confirmation envoyé aux deux adresses. Clique sur le lien reçu pour valider.
          </p>
        ) : (
          <form onSubmit={handleEmailSubmit} className={styles.fieldGroup}>
            <div className={styles.field}>
              <label htmlFor="s-email" className={styles.fieldLabel}>
                Nouvel e-mail
              </label>
              <input
                id="s-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className={styles.input}
                placeholder="nouveau@exemple.com"
                required
              />
            </div>
            <button
              type="submit"
              className={styles.btn}
              disabled={emailSending || !newEmail.trim()}
            >
              {emailSending ? 'Envoi…' : 'Envoyer le lien de confirmation'}
            </button>
          </form>
        )}
      </section>

      {/* ── Membres du foyer ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Membres du foyer</h2>
        <ul className={styles.membersList}>
          {householdMembers.map((m, i) => (
            <li key={m.id} className={styles.memberRow}>
              <div
                className={styles.avatar}
                style={{ background: MEMBER_PALETTE[i % MEMBER_PALETTE.length] }}
              >
                {m.display_name.trim().slice(0, 2).toUpperCase()}
              </div>
              <span className={styles.memberName}>
                {m.display_name}
                {m.id === member?.id && (
                  <span className={styles.memberYou}> · vous</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Apparence ────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Apparence</h2>
        <div className={styles.themePills}>
          {(['system', 'light', 'dark'] as Theme[]).map(t => (
            <button
              key={t}
              className={[styles.themePill, theme === t ? styles.themePillActive : ''].join(' ')}
              onClick={() => setTheme(t)}
            >
              {{ system: '⚙ Système', light: '☀ Clair', dark: '🌙 Sombre' }[t]}
            </button>
          ))}
        </div>
      </section>

      {/* ── Abonnement calendrier ────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Abonnement calendrier</h2>
        {icalUrl ? (
          <>
            <p className={styles.helpText}>
              Abonne Google Calendar, Apple Calendar ou Outlook à ce calendrier pour voir les événements familiaux dans ton app habituelle.
            </p>
            <div className={styles.icalBox}>
              <span className={styles.icalUrl}>{icalUrl}</span>
              <button className={styles.btnCopy} onClick={handleCopyUrl} aria-label="Copier l'URL">
                {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={2.5} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <p className={styles.helpText}>
              Dans Google Calendar : + → "À partir d'une URL" → coller l'URL.
            </p>
          </>
        ) : (
          <p className={styles.helpText}>
            Ajoute <code>VITE_CAL_SECRET</code> et <code>SUPABASE_SERVICE_ROLE_KEY</code> dans les variables d'environnement Vercel pour activer cette fonctionnalité.
          </p>
        )}
      </section>

      {/* ── Notifications ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Notifications</h2>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Activer les notifications</span>
          <button
            className={[styles.toggle, notifEnabled ? styles.toggleOn : ''].join(' ')}
            onClick={toggleNotif}
            disabled={notifPending}
            role="switch"
            aria-checked={notifEnabled}
            aria-label="Activer les notifications"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
        <p className={styles.helpText}>
          Recevez une notification quand un autre membre vous prévient d'un ajout important (course, événement, dépense). À activer sur chaque appareil.
        </p>
      </section>

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Compte</h2>
        {!showDeleteConfirm ? (
          <button
            className={styles.btnDanger}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Supprimer mon compte
          </button>
        ) : (
          <>
            <p className={styles.confirmText}>
              Ton profil sera retiré du foyer. Cette action est irréversible.
            </p>
            <div className={styles.confirmBtns}>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                className={styles.btnDangerSolid}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </>
        )}
      </section>

    </div>
  )
}
