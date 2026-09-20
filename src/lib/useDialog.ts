import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Comportement clavier commun à tous les dialogues de l'app :
 *
 *  - Échap ferme ;
 *  - le scroll de la page dessous est verrouillé ;
 *  - le focus entre dans le dialogue au montage et revient sur l'élément
 *    déclencheur à la fermeture ;
 *  - Tab et Maj+Tab bouclent à l'intérieur du dialogue.
 *
 * Le piège de focus est ce qui manquait : sans lui, une tabulation sortait du
 * dialogue et parcourait la page derrière l'overlay, invisible et pourtant
 * cliquable au clavier.
 *
 * @param ref      conteneur du dialogue (role="dialog")
 * @param onClose  appelé sur Échap
 * @param active   permet de câbler le hook inconditionnellement même quand le
 *                 dialogue est démonté/masqué (règle des hooks)
 */
export function useDialog(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  // Réf. à jour sans relancer l'effet : sinon le focus initial serait volé aux
  // champs de saisie à chaque frappe.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!active) return
    const container = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || !container) return

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) { e.preventDefault(); container.focus(); return }

      const first = items[0]
      const last  = items[items.length - 1]
      const current = document.activeElement

      if (e.shiftKey && (current === first || current === container)) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault(); first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // On focalise le conteneur, pas le premier champ : viser un input ferait
    // surgir le clavier tactile à chaque ouverture de bottom-sheet.
    container?.focus()

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [active, ref])
}
