import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'

const DEVICE_KEY = 'familia-device-id'
/** Renouvellement du verrou. Doit rester bien sous les 90 s de péremption serveur. */
const HEARTBEAT_MS = 30_000

/** Identifiant stable de cet appareil (navigateur), généré à la première demande. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/**
 * Verrou DJ : un seul appareil joue la file à la fois. Sans lui, deux appareils
 * sur l'onglet Soirée produisaient deux flux audio et deux `markPlayed`
 * concurrents qui faisaient sauter des morceaux.
 *
 * `active` = l'appareil veut être DJ. Le verrou est pris à l'activation, puis
 * renouvelé ; s'il est refusé (un autre appareil le tient et bat encore),
 * `onDenied` est appelé pour que l'appelant renonce au mode DJ.
 */
export function useDjLock(active: boolean, onDenied: () => void) {
  const deniedRef = useRef(onDenied)
  useEffect(() => { deniedRef.current = onDenied })

  useEffect(() => {
    if (!active) return
    const device = deviceId()
    let cancelled = false

    async function claim() {
      const { data, error } = await supabase.rpc('claim_lecteur_dj', {
        p_household: HOUSEHOLD_ID,
        p_device: device,
      })
      if (cancelled) return
      // Erreur réseau : on ne lâche pas le mode DJ pour autant (la lecture en
      // cours ne doit pas s'arrêter sur un hoquet), on retentera au battement.
      if (error) return
      if (data !== true) deniedRef.current()
    }

    void claim()
    const timer = setInterval(claim, HEARTBEAT_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      void supabase.rpc('release_lecteur_dj', { p_household: HOUSEHOLD_ID, p_device: device })
    }
  }, [active])
}
