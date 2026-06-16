import { Minus, Plus } from 'lucide-react'
import styles from './TrainingPage.module.css'

export default function Stepper({ label, value, setValue, step, min, max, fmt, accent, wide }: {
  label: string
  value: number
  setValue: (v: number) => void
  step: number
  min: number
  max: number
  fmt?: (v: number) => string
  accent?: boolean
  wide?: boolean
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className={[styles.stepper, accent ? styles.stepperAccent : '', wide ? styles.stepperWide : ''].join(' ')}>
      <span className={[styles.stepperLabel, accent ? styles.stepperLabelAccent : ''].join(' ')}>{label}</span>
      <div className={styles.stepperControls}>
        <button type="button" className={styles.stepperBtn} onClick={() => setValue(clamp(value - step))} aria-label="Moins">
          <Minus size={13} strokeWidth={2.5} />
        </button>
        <span className={styles.stepperValue}>{fmt ? fmt(value) : value}</span>
        <button type="button" className={styles.stepperBtn} onClick={() => setValue(clamp(value + step))} aria-label="Plus">
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
