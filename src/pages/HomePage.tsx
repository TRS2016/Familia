import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useMember } from '../auth/useMember'

interface HouseholdDetails {
  name: string
  members: { id: string; display_name: string }[]
}

export default function HomePage() {
  const { data: member } = useMember()

  const { data: householdDetails } = useQuery({
    queryKey: ['household-details', member?.household_id],
    queryFn: async (): Promise<HouseholdDetails> => {
      const [householdRes, membersRes] = await Promise.all([
        supabase
          .from('households')
          .select('name')
          .eq('id', member!.household_id)
          .single(),
        supabase
          .from('members')
          .select('id, display_name')
          .eq('household_id', member!.household_id),
      ])
      if (householdRes.error) throw householdRes.error
      if (membersRes.error) throw membersRes.error
      return {
        name: (householdRes.data as { name: string }).name,
        members: membersRes.data as { id: string; display_name: string }[],
      }
    },
    enabled: !!member,
  })

  // member is guaranteed non-null by RequireMember, but guard for TypeScript.
  if (!member) return <p>Chargement...</p>

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <h1>Familia</h1>
      <p>Bonjour {member.display_name} 👋</p>

      {householdDetails ? (
        <>
          <p>Membre de : {householdDetails.name}</p>
          <h2>Membres du foyer</h2>
          <ul>
            {householdDetails.members.map(m => (
              <li key={m.id}>{m.display_name}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Chargement du foyer...</p>
      )}

      <p><Link to="/groceries">Courses →</Link></p>
      <p><Link to="/calendar">Calendrier →</Link></p>
      <button onClick={handleSignOut}>Se déconnecter</button>
    </div>
  )
}
