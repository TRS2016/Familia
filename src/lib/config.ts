const householdId = import.meta.env.VITE_HOUSEHOLD_ID

if (!householdId) {
  throw new Error(
    'Missing VITE_HOUSEHOLD_ID. Copy .env.example → .env.local and fill in the household UUID.'
  )
}

export const HOUSEHOLD_ID: string = householdId
