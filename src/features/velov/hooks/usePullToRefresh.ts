import { useRef, useState, useCallback } from 'react'

const THRESHOLD = 72
const RESISTANCE = 0.45

export function usePullToRefresh(onRefresh?: () => void) {
  const startYRef = useRef<number | null>(null)
  const [pullY, setPullY] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current
    if (!el || el.scrollTop > 0) return
    startYRef.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startYRef.current === null) return
    const el = containerRef.current
    if (!el || el.scrollTop > 2) {
      startYRef.current = null
      setPullY(0)
      return
    }
    const dist = e.touches[0].clientY - startYRef.current
    if (dist > 0) setPullY(Math.min(dist * RESISTANCE, THRESHOLD))
  }, [])

  const onTouchEnd = useCallback(() => {
    if (pullY >= THRESHOLD) onRefresh?.()
    setPullY(0)
    startYRef.current = null
  }, [pullY, onRefresh])

  return {
    containerRef,
    pullY,
    threshold: THRESHOLD,
    isPulling: pullY > 0,
    isTriggered: pullY >= THRESHOLD,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
