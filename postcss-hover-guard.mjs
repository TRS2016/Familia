/**
 * postcss-hover-guard
 *
 * Enveloppe automatiquement toute règle dont le sélecteur dépend de :hover
 * dans `@media (hover: hover)`.
 *
 * Pourquoi : sur tactile, un tap déclenche l'état :hover et le laisse « collé »
 * jusqu'au tap suivant (fond de carte surligné, bouton qui reste accentué).
 * L'app compte ~245 règles :hover réparties dans 48 CSS modules ; les garder
 * à jour à la main est intenable, donc on le fait au build.
 *
 * Les sélecteurs sont découpés : `.a:hover, .b { … }` devient
 * `.b { … }` + `@media (hover: hover) { .a:hover { … } }`, sinon `.b`
 * perdrait ses styles sur tactile.
 */

const HOVER_MEDIA = '(hover: hover)'

/** La règle est-elle déjà sous une media query qui parle de hover ? */
function alreadyGuarded(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && p.name === 'media' && /hover\s*:/.test(p.params)) return true
  }
  return false
}

/** Découpe une liste de sélecteurs en respectant les parenthèses (`:not(a, b)`). */
function splitSelectors(selector) {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) { out.push(current); current = '' }
    else current += ch
  }
  out.push(current)
  return out.map(s => s.trim()).filter(Boolean)
}

export default function hoverGuard() {
  return {
    postcssPlugin: 'postcss-hover-guard',
    Rule(rule, { AtRule }) {
      if (!rule.selector.includes(':hover')) return
      if (alreadyGuarded(rule)) return

      const parts = splitSelectors(rule.selector)
      const hovered = parts.filter(s => s.includes(':hover'))
      const plain = parts.filter(s => !s.includes(':hover'))
      if (hovered.length === 0) return

      const guarded = new AtRule({ name: 'media', params: HOVER_MEDIA })
      const moved = rule.clone({ selector: hovered.join(', ') })
      guarded.append(moved)

      if (plain.length > 0) {
        rule.selector = plain.join(', ')
        rule.after(guarded)
      } else {
        rule.replaceWith(guarded)
      }
    },
  }
}

hoverGuard.postcss = true
