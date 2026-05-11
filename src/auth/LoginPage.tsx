import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

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
    return <p>✉️ Lien envoyé à {email}, vérifie ta boîte mail.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Familia</h1>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={status === 'loading'}
        />
      </div>
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Envoi...' : 'Recevoir le lien'}
      </button>
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
    </form>
  )
}
