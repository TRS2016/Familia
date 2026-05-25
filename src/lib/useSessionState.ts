import { useState } from 'react'

type SetValue<T> = (value: T | ((prev: T) => T)) => void

export function useSessionState<T>(key: string, initialValue: T): [T, SetValue<T>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = sessionStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue: SetValue<T> = (value) => {
    setState(prev => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value
      try {
        sessionStorage.setItem(key, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  return [state, setValue]
}
