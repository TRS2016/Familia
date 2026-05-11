import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useAuth } from '../auth/useAuth'
import { useMember } from '../auth/useMember'
import type { Member } from '../auth/useMember'

export default function OnboardingPage() {
  const { session } = useAuth()
  const { data: member, isLoading } = useMember()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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

    // Populate the cache immediately so RequireMember sees the member
    // on the next render without an intermediate null → /onboarding redirect loop.
    queryClient.setQueryData(['member', session.user.id], data as Member)
    navigate('/', { replace: true })
  }

  if (isLoading || member) return <p>Chargement...</p>

  return (
    <form onSubmit={handleSubmit}>
      <h1>Bienvenue !</h1>
      <p>Comment t'appelles-tu dans la famille ?</p>
      <div>
        <label htmlFor="displayName">Prénom</label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="ex : Sophie"
          required
          disabled={submitting}
        />
      </div>
      <button type="submit" disabled={submitting || !displayName.trim()}>
        {submitting ? 'Enregistrement...' : 'Valider'}
      </button>
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
    </form>
  )
}
