import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/useToast'
import { CATEGORY_ORDER } from './groceries.utils'

// Lecture d'un ticket de caisse via l'Edge Function `parse-receipt` (vision IA).
// Retour : articles structurés à valider avant ajout au catalogue.

export interface ParsedReceiptItem {
  name: string
  quantity: string
  price: string // décimal en chaîne (ex "1.99") ou "" — parsé au moment de l'ajout
  category: string
}
export interface ParsedReceipt {
  store: string
  items: ParsedReceiptItem[]
}

// Encodage base64 par blocs (évite un débordement de pile sur les grandes images).
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function useParseReceipt() {
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (file: File): Promise<ParsedReceipt> => {
      // Toujours ré-encoder en JPEG : convertit le HEIC (iPhone, non supporté par
      // la vision) et borne la dimension. La conversion est cheap même sur les
      // petits fichiers et évite d'envoyer un format que le modèle refuse.
      let img: File = file
      try {
        const { default: imageCompression } = await import('browser-image-compression')
        img = await imageCompression(file, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 2200,
          useWebWorker: true,
          fileType: 'image/jpeg',
        })
      } catch { /* si la conversion échoue, on tente l'original */ }
      const mimeType = SUPPORTED.includes(img.type) ? img.type : 'image/jpeg'
      const image = await fileToBase64(img)

      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { image, mimeType, categories: CATEGORY_ORDER },
      })
      if (error) {
        // Remonte le vrai message renvoyé par l'Edge Function (sinon masqué).
        let detail = ''
        try {
          const ctx = (error as { context?: Response }).context
          const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null
          detail = (body as { error?: string })?.error ?? ''
        } catch { /* corps illisible */ }
        throw new Error(detail || 'invoke')
      }
      const parsed = data as ParsedReceipt
      if (!parsed || !Array.isArray(parsed.items)) throw new Error('Réponse invalide')
      return parsed
    },
    onError: (e) => {
      const msg = e instanceof Error && e.message && e.message !== 'invoke' ? e.message : null
      showToast({
        type: 'error',
        message: msg ?? 'Lecture du ticket impossible. Réessaie avec une photo nette et bien cadrée.',
      })
    },
  })
}
