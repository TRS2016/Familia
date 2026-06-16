import { useCallback, useEffect, useRef, useState } from 'react'
import { HOUSEHOLD_ID } from '../../lib/config'
import type { Grocery } from './useGroceries'

const ORDER_STORAGE_KEY = `familia-grocery-order-${HOUSEHOLD_ID}`

// Ordre manuel (drag & drop) des articles non cochés, persisté en localStorage
// par appareil (décision V1). Gère aussi l'état de drag via pointer events,
// compatible mobile + desktop.
export function useGroceryDragOrder(data: Grocery[] | undefined) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? '[]') }
    catch { return [] }
  })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragStateRef = useRef<{ draggingId: string; dragOverId: string | null } | null>(null)
  const pendingDragCleanupRef = useRef<(() => void) | null>(null)

  // Sync de l'ordre avec les données serveur : nouveaux ids devant, ids supprimés
  // retirés.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data) return
    const uncheckedIds = data.filter(g => !g.checked).map(g => g.id)
    setOrderedIds(prev => {
      const prevSet = new Set(prev)
      const currentSet = new Set(uncheckedIds)
      const newIds = uncheckedIds.filter(id => !prevSet.has(id))
      const filtered = prev.filter(id => currentSet.has(id))
      const next = [...newIds, ...filtered]
      try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [data])
  /* eslint-enable react-hooks/set-state-in-effect */

  const startDrag = useCallback((itemId: string, e: React.PointerEvent<HTMLLIElement>) => {
    const startX = e.clientX
    const startY = e.clientY
    const isTouch = e.pointerType === 'touch'
    // Tactile : appui long avant d'armer le drag (le reste = scroll/tap natif).
    // Souris : un petit seuil de mouvement suffit (pas de conflit avec le scroll).
    const HOLD_MS       = 250  // durée d'appui pour armer (tactile)
    const MOVE_CANCEL   = 10   // px de déplacement qui annule l'appui long (= scroll)
    const MOUSE_DRAG    = 6    // px de déplacement vertical qui arme (souris)
    let dragActivated = false
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    dragStateRef.current = { draggingId: itemId, dragOverId: null }

    // Hit test par Y — évite le souci d'elementFromPoint qui renvoie l'élément en
    // cours de drag (même à opacity 0.3, il bloque le hit).
    function getItemIdAtY(clientY: number): string | null {
      const els = document.querySelectorAll<HTMLElement>('[data-grocery-id][data-draggable]')
      for (const el of els) {
        const rect = el.getBoundingClientRect()
        if (clientY >= rect.top && clientY < rect.bottom) {
          return el.dataset.groceryId ?? null
        }
      }
      return null
    }

    function arm() {
      if (dragActivated) return
      dragActivated = true
      try { navigator.vibrate?.(30) } catch { /* non supporté */ }
      setDraggingId(itemId)
    }

    function onMove(ev: PointerEvent) {
      if (!dragActivated) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const dist = Math.hypot(dx, dy)
        if (isTouch) {
          // Avant l'armement : tout déplacement notable = scroll/tap → on abandonne
          // (sans preventDefault, donc le scroll natif a lieu).
          if (dist > MOVE_CANCEL) cancelDrag()
          return
        }
        // Souris : on arme dès un mouvement principalement vertical.
        if (dist > MOUSE_DRAG && Math.abs(dy) > Math.abs(dx)) arm()
        else return
      }
      ev.preventDefault()
      const state = dragStateRef.current
      if (!state) return
      const targetId = getItemIdAtY(ev.clientY)
      if (targetId !== null && targetId !== state.draggingId && targetId !== state.dragOverId) {
        state.dragOverId = targetId
        setDragOverId(targetId)
      }
    }

    function teardown() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', cancelDrag)
      pendingDragCleanupRef.current = null
    }

    // Geste abandonné (scroll ou appui long interrompu) : aucun réordonnancement.
    function cancelDrag() {
      dragStateRef.current = null
      setDraggingId(null)
      setDragOverId(null)
      teardown()
    }

    function endDrag() {
      if (dragActivated) {
        const state = dragStateRef.current
        if (state?.draggingId && state?.dragOverId) {
          const { draggingId: dId, dragOverId: overId } = state
          setOrderedIds(prev => {
            const next = [...prev]
            const from = next.indexOf(dId)
            const to = next.indexOf(overId)
            if (from !== -1 && to !== -1) {
              next.splice(from, 1)
              next.splice(to, 0, dId)
            }
            try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
            return next
          })
        }
      }
      dragStateRef.current = null
      setDraggingId(null)
      setDragOverId(null)
      teardown()
    }

    pendingDragCleanupRef.current = teardown
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', cancelDrag)
    // Tactile : démarre le minuteur d'appui long. Un scroll annule via onMove/pointercancel.
    if (isTouch) holdTimer = setTimeout(arm, HOLD_MS)
  }, [])

  useEffect(() => () => { pendingDragCleanupRef.current?.() }, [])

  return { orderedIds, draggingId, dragOverId, startDrag }
}
