import { HOUSEHOLD_ID } from './config'

export const QK = {
  member:           (userId: string) => ['member', userId] as const,
  membersList:      ['members-list', HOUSEHOLD_ID] as const,
  householdDetails: (householdId: string) => ['household-details', householdId] as const,
  householdName:    ['household-name', HOUSEHOLD_ID] as const,
}
