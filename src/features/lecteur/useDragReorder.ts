import { useCallback, useEffect, useRef, useState } from 'react'

// Glisser-déposer d'une liste ordonnée côté serveur (file de soirée, playlist
// manuelle). Même geste que les courses : appui long en tactile, seuil de
// mouvement vertical à la souris — le tap/scroll natif reste intact.
// `dataAttr` est l'attribut data-* portant l'id sur chaque ligne (en camelCase
// pour dataset : 'queueId' ↔ data-queue-id).
export function useDragReorder({
  ids, dataAttr, onReorder, disabled = false,
}: {
  /** Ids dans l'ordre affiché (partie déplaçable de la liste). */
  ids: string[]
  dataAttr: string
  /** Appelé avec le nouvel ordre complet quand le geste aboutit. */
  onReorder: (nextIds: string[]) => void
  disabled?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragStateRef = useRef<{ draggingId: string; dragOverId: string | null } | null>(null)
  const cleanupRef   = useRef<(() => void) | null>(null)
  // Date de fin du dernier vrai drag : sert à ignorer le click de fin de geste
  // sur les lignes cliquables (sinon un déplacement lance la lecture).
  const lastDragEndRef = useRef(0)
  // Le geste lit l'ordre courant au relâchement, pas celui capturé au pointerdown.
  const idsRef = useRef(ids)
  const onReorderRef = useRef(onReorder)
  useEffect(() => {
    idsRef.current = ids
    onReorderRef.current = onReorder
  })

  const startDrag = useCallback((itemId: string, e: React.PointerEvent) => {
    if (disabled) return
    const startX = e.clientX
    const startY = e.clientY
    const isTouch = e.pointerType === 'touch'
    const HOLD_MS     = 250 // appui long qui arme le drag (tactile)
    const MOVE_CANCEL = 10  // px de déplacement avant armement = scroll → abandon
    const MOUSE_DRAG  = 6   // px verticaux qui arment (souris)
    let dragActivated = false
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    dragStateRef.current = { draggingId: itemId, dragOverId: null }

    // Hit test par Y : elementFromPoint renverrait la ligne en cours de drag.
    function getIdAtY(clientY: number): string | null {
      const els = document.querySelectorAll<HTMLElement>(`[data-drag-list="${dataAttr}"]`)
      for (const el of els) {
        const rect = el.getBoundingClientRect()
        if (clientY >= rect.top && clientY < rect.bottom) return el.dataset[dataAttr] ?? null
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
          if (dist > MOVE_CANCEL) cancelDrag()
          return
        }
        if (dist > MOUSE_DRAG && Math.abs(dy) > Math.abs(dx)) arm()
        else return
      }
      ev.preventDefault()
      const state = dragStateRef.current
      if (!state) return
      const targetId = getIdAtY(ev.clientY)
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
      cleanupRef.current = null
    }

    function reset() {
      dragStateRef.current = null
      setDraggingId(null)
      setDragOverId(null)
      teardown()
    }

    // Geste abandonné (scroll, appui long interrompu) : aucun réordonnancement.
    function cancelDrag() { reset() }

    function endDrag() {
      const state = dragStateRef.current
      if (dragActivated) lastDragEndRef.current = Date.now()
      if (dragActivated && state?.draggingId && state.dragOverId) {
        const next = [...idsRef.current]
        const from = next.indexOf(state.draggingId)
        const to   = next.indexOf(state.dragOverId)
        if (from !== -1 && to !== -1 && from !== to) {
          next.splice(from, 1)
          next.splice(to, 0, state.draggingId)
          onReorderRef.current(next)
        }
      }
      reset()
    }

    cleanupRef.current = teardown
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', cancelDrag)
    if (isTouch) holdTimer = setTimeout(arm, HOLD_MS)
  }, [dataAttr, disabled])

  useEffect(() => () => { cleanupRef.current?.() }, [])

  // À appeler dans le onClick d'une ligne cliquable : true = geste de drag, on
  // n'exécute pas l'action de clic.
  const justDragged = useCallback(() => Date.now() - lastDragEndRef.current < 300, [])

  return { draggingId, dragOverId, startDrag, justDragged }
}

// Ne démarre pas le drag si le pointeur est sur un bouton/champ de la ligne.
export function dragPointerDown(
  itemId: string,
  startDrag: (id: string, e: React.PointerEvent) => void,
) {
  return (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return
    startDrag(itemId, e)
  }
}
