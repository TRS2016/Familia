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
      // Compresse les grosses photos (coût + payload). Tickets longs → on borne
      // la dimension sans casser le ratio.
      let img: File = file
      if (img.size > 1_572_864) {
        const { default: imageCompression } = await import('browser-image-compression')
        img = await imageCompression(file, {
          maxSizeMB: 1.2,
          maxWidthOrHeight: 2000,
          useWebWorker: true,
          fileType: 'image/jpeg',
        })
      }
      const mimeType = SUPPORTED.includes(img.type) ? img.type : 'image/jpeg'
      const image = await fileToBase64(img)

      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { image, mimeType, categories: CATEGORY_ORDER },
      })
      if (error) throw error
      const parsed = data as ParsedReceipt
      if (!parsed || !Array.isArray(parsed.items)) throw new Error('Réponse invalide')
      return parsed
    },
    onError: () => showToast({
      type: 'error',
      message: 'Lecture du ticket impossible. Réessaie avec une photo nette et bien cadrée.',
    }),
  })
}
