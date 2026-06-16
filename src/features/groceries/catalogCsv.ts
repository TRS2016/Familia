// Import CSV du catalogue de courses (l'export se fait en .xlsx, voir
// catalogXlsx.ts — le CSV reste accepté à l'import pour compatibilité).
// Parsing tolérant : séparateur « ; » ou « , », décimale virgule ou point.

export interface CatalogCsvRow {
  name: string
  price: number | null
  quantity: string | null
  category: string | null
  store: string | null
}

// Parse un CSV en lignes de champs, gère les champs entre guillemets (avec
// séparateur/saut de ligne internes et "" échappé).
function tokenize(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === sep) {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else if (c === '\r') {
      // ignoré (géré avec \n)
    } else {
      field += c
    }
  }
  // dernier champ / dernière ligne
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function parsePrice(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseCatalogCsv(text: string): CatalogCsvRow[] {
  // Retire un éventuel BOM
  const clean = text.replace(/^\uFEFF/, '')
  if (!clean.trim()) return []

  // Détecte le séparateur d'après la 1re ligne (; prioritaire, sinon ,)
  const firstLine = clean.slice(0, clean.search(/\r?\n/) >= 0 ? clean.search(/\r?\n/) : clean.length)
  const sep = firstLine.includes(';') ? ';' : ','

  const rows = tokenize(clean, sep)
  if (rows.length === 0) return []

  // Saute la ligne d'en-tête si elle ressemble à un header connu
  const firstCell = (rows[0][0] ?? '').trim().toLowerCase()
  const hasHeader = firstCell === 'nom' || firstCell === 'name'
  const dataRows = hasHeader ? rows.slice(1) : rows

  const out: CatalogCsvRow[] = []
  for (const r of dataRows) {
    const name = (r[0] ?? '').trim()
    if (!name) continue // ignore lignes sans nom
    out.push({
      name,
      price:    parsePrice(r[1] ?? ''),
      quantity: (r[2] ?? '').trim() || null,
      category: (r[3] ?? '').trim() || null,
      store:    (r[4] ?? '').trim() || null,
    })
  }
  return out
}

// Déclenche le téléchargement d'un fichier côté navigateur.
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

