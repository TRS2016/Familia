import { useState } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import { supabase } from '../../lib/supabase'
import styles from './GroceriesPage.module.css'

// Envoi de la liste (3 premiers articles + compteur) en notification push au
// foyer, avec message optionnel. Partagé entre la liste active et les modèles.
export default function NotifyListModal({ title, itemNames, onClose }: {
  title: string
  itemNames: string[]
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (itemNames.length === 0 || sending) return
    setSending(true)
    try {
      const names = itemNames.slice(0, 3)
      const extra = itemNames.length > 3 ? ` +${itemNames.length - 3}` : ''
      const articleStr = names.join(', ') + extra
      const body = message.trim() ? `${message.trim()} — ${articleStr}` : articleStr
      // invoke ne throw pas sur une erreur HTTP : il faut lire { error },
      // sinon on affiche « envoyée » même quand l'edge function a échoué.
      const { error } = await supabase.functions.invoke('notify-household', {
        body: { title, body, module: 'groceries' },
      })
      if (error) throw error
      showToast({ type: 'success', message: 'Notification envoyée.' })
      onClose()
    } catch {
      showToast({ type: 'error', message: "Impossible d'envoyer la notification." })
    } finally {
      setSending(false)
    }
  }

  return (
    <SlideUpModal title="Envoyer la liste" onClose={onClose}>
      <div className={styles.notifyForm}>
        <p className={styles.notifyArticles}>
          {itemNames.slice(0, 3).join(', ')}
          {itemNames.length > 3 && ` +${itemNames.length - 3} article${itemNames.length - 3 > 1 ? 's' : ''}`}
        </p>
        <textarea
          className={styles.notifyTextarea}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Ajouter un message… ex : tu peux t'occuper de ça ?"
          aria-label="Message à joindre à la notification"
          rows={3}
          autoFocus
        />
        <button className={styles.notifySendBtn} disabled={sending} onClick={send}>
          {sending ? 'Envoi…' : 'Envoyer la notification'}
        </button>
      </div>
    </SlideUpModal>
  )
}
