import { useState } from 'react'

// Préférence booléenne persistée par appareil (localStorage).
export function useBoolPref(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : s === '1' } catch { return initial }
  })
  const set = (v: boolean) => {
    setVal(v)
    try { localStorage.setItem(key, v ? '1' : '0') } catch { /* indisponible */ }
  }
  return [val, set]
}

// Préférence numérique persistée par appareil (localStorage).
export function useNumPref(key: string, initial: number): [number, (v: number) => void] {
  const [val, setVal] = useState<number>(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : (Number(s) || initial) } catch { return initial }
  })
  const set = (v: number) => {
    setVal(v)
    try { localStorage.setItem(key, String(v)) } catch { /* indisponible */ }
  }
  return [val, set]
}
