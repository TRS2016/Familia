import { HOUSEHOLD_ID } from './config'

export const QK = {
  member:           (userId: string) => ['member', userId] as const,
  membersList:      ['members-list', HOUSEHOLD_ID] as const,
  householdDetails: (householdId: string) => ['household-details', householdId] as const,
  householdName:    ['household-name', HOUSEHOLD_ID] as const,

  homeEvents:  ['home-events-upcoming',   HOUSEHOLD_ID] as const,
  homeKakebo:  ['home-kakebo',            HOUSEHOLD_ID] as const,
  homeHabits:  ['home-habits',            HOUSEHOLD_ID] as const,
  homeMedia:   ['home-media-in-progress', HOUSEHOLD_ID] as const,
  homeMoments: ['home-moments',           HOUSEHOLD_ID] as const,

  velovFavorites: (memberId: string) => ['velov-favorites', memberId] as const,
}
