export const MEMBER_PALETTE = ['#E07B54', '#5B9E8F', '#9B7AC4', '#E8B84B'] as const

export function memberColor(index: number): string {
  return MEMBER_PALETTE[index % MEMBER_PALETTE.length]
}
