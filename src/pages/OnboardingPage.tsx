import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useAuth } from '../auth/useAuth'
import { useMember } from '../auth/useMember'
import type { Member } from '../auth/useMember'
import LoadingPage from '../components/LoadingPage'
import styles from './OnboardingPage.module.css'

export default function OnboardingPage() {
  const { session } = useAuth()
  const { data: member, isLoading } = useMember()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: household } = useQuery({
    queryKey: ['household-name', HOUSEHOLD_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('households')
        .select('name')
        .eq('id', HOUSEHOLD_ID)
        .single()
      if (error) throw error
      return data as { name: string }
    },
  })

  // Skip onboarding if member already exists (e.g. direct URL visit).
  useEffect(() => {
    if (!isLoading && member) navigate('/', { replace: true })
  }, [member, isLoading, navigate])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!session) return
    setSubmitting(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('members')
      .insert({
        user_id: session.user.id,
        household_id: HOUSEHOLD_ID,
        display_name: displayName.trim(),
        email: session.user.email ?? null,
      })
      .select()
      .single()

    if (error) {
      setErrorMsg(error.message)
      setSubmitting(false)
      return
    }

    // Populate cache immediately — avoids a refetch and the null → /onboarding
    // redirect loop that would occur if RequireMember saw stale data.
    queryClient.setQueryData(['member', session.user.id], data as Member)
    navigate('/', { replace: true })
  }

  if (isLoading || member) return <LoadingPage />

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.card}>
        <div className={styles.header}>
          <span className={styles.emoji}>🏡</span>
          <h1 className={styles.title}>
            Bienvenue dans {household?.name ?? '…'} !
          </h1>
          <p className={styles.subtitle}>Comment t'appelles-tu dans la famille ?</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="displayName" className={styles.fieldLabel}>
            Prénom
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Sophie, Marc, Léa..."
            required
            disabled={submitting}
            className={styles.input}
            autoFocus
          />
        </div>

        {errorMsg && <p className={styles.error}>{errorMsg}</p>}

        <button
          type="submit"
          disabled={submitting || !displayName.trim()}
          className={styles.btn}
        >
          {submitting ? 'Enregistrement…' : 'Valider'}
        </button>
      </form>
    </div>
  )
}
