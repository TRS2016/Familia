import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useDialog } from '../lib/useDialog'

interface Props {
  /** Classe de l'overlay plein écran (celle de la feuille de style appelante). */
  overlayClassName: string
  /** Classe du panneau de dialogue. */
  className: string
  onClose: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
  children: ReactNode
}

/**
 * Overlay + panneau `role="dialog"` avec le comportement clavier complet
 * (Échap, piège de focus, restitution du focus, verrou du scroll).
 *
 * Pensé pour les petits dialogues de confirmation écrits à la main dans les
 * pages, qui ne passent pas par SlideUpModal et n'avaient donc ni Échap ni
 * piège de focus.
 */
export default function DialogOverlay({
  overlayClassName, className, onClose, children, ...aria
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)

  return (
    <div className={overlayClassName} onClick={onClose}>
      <div
        ref={ref}
        className={className}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...aria}
      >
        {children}
      </div>
    </div>
  )
}
