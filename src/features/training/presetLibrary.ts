import type { TrainingMode, TrainingConfig } from './training'

// Séances suggérées (catalogue en dur). L'utilisateur les ajoute en 1 tap à ses
// presets, puis peut les personnaliser comme n'importe quelle séance.
// Les configs respectent la mécanique des exercices :
//  - tabata / intervals : un exercice par SÉRIE (sets) ;
//  - emom               : un exercice par MINUTE (cycle sur rounds) ;
//  - amrap / fortime     : liste de circuit (l'athlète enchaîne à son rythme).
export interface SuggestedPreset {
  name: string
  mode: TrainingMode
  config: TrainingConfig
}

const ex = (...names: string[]) => names.map(name => ({ name }))

export const SUGGESTED_PRESETS: SuggestedPreset[] = [
  // ── 🦵 Jambes ──
  {
    name: 'Jambes Tabata', mode: 'tabata',
    config: { prepare: 10, work: 20, rest: 10, rounds: 8, sets: 2, setRest: 60, focus: 'Jambes',
      exercises: ex('Squats', 'Fentes alternées') },
  },
  {
    name: 'EMOM Jambes 10′', mode: 'emom',
    config: { prepare: 10, interval: 60, rounds: 10, focus: 'Jambes',
      exercises: ex('Squats', 'Fentes', 'Squat sauté', 'Chaise au mur') },
  },
  // ── 💪 Haut du corps ──
  {
    name: 'Haut du corps Intervalles', mode: 'intervals',
    config: { prepare: 10, work: 40, rest: 20, rounds: 3, sets: 4, setRest: 45, focus: 'Haut du corps',
      exercises: ex('Pompes', 'Dips', 'Superman', 'Gainage') },
  },
  {
    name: 'EMOM Push 8′', mode: 'emom',
    config: { prepare: 10, interval: 60, rounds: 8, focus: 'Haut du corps',
      exercises: ex('Pompes', 'Dips', 'Pompes serrées', 'Pike push-ups') },
  },
  // ── 🔥 Abdos ──
  {
    name: 'Abdos Tabata', mode: 'tabata',
    config: { prepare: 10, work: 20, rest: 10, rounds: 8, sets: 2, setRest: 45, focus: 'Abdos',
      exercises: ex('Crunchs', 'Gainage') },
  },
  {
    name: 'AMRAP Core 8′', mode: 'amrap',
    config: { prepare: 10, duration: 8 * 60, focus: 'Abdos',
      exercises: ex('15 Crunchs', '30s Gainage', '20 Mountain climbers', '20 Russian twists') },
  },
  // ── 🏃 Cardio ──
  {
    name: 'HIIT Cardio', mode: 'intervals',
    config: { prepare: 10, work: 30, rest: 15, rounds: 2, sets: 6, setRest: 30, focus: 'Cardio',
      exercises: ex('Burpees', 'Jumping jacks', 'Montées de genoux', 'Mountain climbers', 'Squat jumps', 'Talons-fesses') },
  },
  {
    name: 'For Time Cardio', mode: 'fortime',
    config: { prepare: 10, target: 5, cap: 12 * 60, focus: 'Cardio',
      exercises: ex('10 Burpees', '20 Squats', '30 Mountain climbers') },
  },
  // ── 🤸 Full body ──
  {
    name: 'Full body 24′', mode: 'tabata',
    config: { prepare: 10, work: 30, rest: 15, rounds: 6, sets: 4, setRest: 60, focus: 'Full body',
      exercises: ex('Squats', 'Pompes', 'Fentes', 'Gainage') },
  },
  {
    name: 'EMOM Full body 12′', mode: 'emom',
    config: { prepare: 10, interval: 60, rounds: 12, focus: 'Full body',
      exercises: ex('Burpees', 'Squats', 'Pompes', 'Gainage') },
  },
  // ── 🧘 Mobilité ──
  {
    name: 'Mobilité douce', mode: 'intervals',
    config: { prepare: 10, work: 45, rest: 15, rounds: 1, sets: 6, setRest: 20, focus: 'Mobilité',
      exercises: ex('Cat-cow', 'Rotation hanches', 'Étirement ischios', 'Fente basse', 'Rotation épaules', 'Respiration') },
  },
]
