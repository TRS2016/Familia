// Citations inspirantes — « Souffle du jour ».
// Une citation par jour, sélectionnée de façon déterministe (même citation
// pour tous les membres le même jour). Pour en ajouter : compléter le tableau.

export interface Quote {
  text: string
  author: string
}

export const QUOTES: Quote[] = [
  { text: "You can't go back and change the beginning, but you can start where you are and change the ending.", author: 'C. S. Lewis' },
  { text: 'The only thing standing between you and outrageous success is continuous progress.', author: 'Dan Waldschmidt' },
  { text: 'One big reason for a winning attitude is that you will take the necessary steps and not quit when the going gets difficult.', author: 'Don M. Green' },
  { text: "Sometimes things aren't clear right away. That's where you need to be patient and persevere and see where things lead.", author: 'Mary Pierce' },
  { text: 'Whatever we believe about ourselves and our ability comes true for us.', author: 'Susan L. Taylor' },
  { text: 'I can and I will. Watch me.', author: 'Carrie Green' },
  { text: 'Great things never came from comfort zones.', author: 'Tony Luziaya' },
  { text: 'Keep your face always toward the sunshine, and shadows will fall behind you.', author: 'Walt Whitman' },
  { text: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda' },
  { text: 'Excellence happens not by accident. It is a process.', author: 'A. P. J. Abdul Kalam' },
  { text: 'Do the best you can. No one can do more than that.', author: 'John Wooden' },
  { text: 'A winner is a dreamer who never gives up.', author: 'Nelson Mandela' },
  { text: 'The best way to guarantee a loss is to quit.', author: 'Morgan Freeman' },
  { text: 'I am experienced enough to do this. I am knowledgeable enough to do this. I am prepared enough to do this. I am mature enough to do this. I am brave enough to do this.', author: 'Alexandria Ocasio-Cortez' },
  { text: 'You are never too old to set another goal or to dream a new dream.', author: 'Malala Yousafzai' },
  { text: 'You never know what you can do until you try.', author: 'William Cobbett' },
  { text: 'There is no elevator to success, you have to take the stairs.', author: 'Zig Ziglar' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
]

/** Numéro du jour dans l'année (1–366), en heure locale. */
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

/** Citation du jour : déterministe, identique pour tous le même jour. */
export function quoteOfTheDay(date = new Date()): Quote {
  return QUOTES[dayOfYear(date) % QUOTES.length]
}
