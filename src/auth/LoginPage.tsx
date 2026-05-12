import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import styles from './LoginPage.module.css'

type Status = 'idle' | 'loading' | 'sent' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.logo}>
            <h1 className={styles.logoTitle}>Familia</h1>
          </div>
          <div className={styles.sentCard}>
            <span className={styles.sentEmoji}>✉️</span>
            <h2 className={styles.sentTitle}>Lien envoyé !</h2>
            <p className={styles.sentBody}>
              Vérifie ta boîte mail pour{' '}
              <span className={styles.sentEmail}>{email}</span>
              {' '}et clique sur le lien pour te connecter.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.logo}>
          <h1 className={styles.logoTitle}>Familia</h1>
          <p className={styles.logoSub}>Votre espace famille</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.card}>
          <div>
            <label htmlFor="email" className={styles.fieldLabel}>
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom@exemple.com"
              required
              disabled={status === 'loading'}
              className={styles.input}
              autoFocus
            />
          </div>

          {errorMsg && <p className={styles.error}>{errorMsg}</p>}

          <button type="submit" disabled={status === 'loading'} className={styles.btn}>
            {status === 'loading' ? 'Envoi…' : 'Recevoir le lien'}
          </button>

          <p className={styles.hint}>
            Tu recevras un lien de connexion par e-mail, sans mot de passe.
          </p>
        </form>
      </div>
    </div>
  )
}
