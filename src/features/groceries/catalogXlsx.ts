// Export / import Excel (.xlsx) du catalogue de courses.
// Le .xlsx est généré à la main (zip d'XML via jszip, déjà utilisé par les
// Moments) : pas de dépendance tableur. Intérêt vs CSV : la colonne
// « catégorie » porte une vraie liste déroulante Excel (validation de données),
// chose impossible dans un fichier texte.

import { CATEGORY_ORDER } from './groceries.utils'
import { parsePrice, type CatalogCsvRow } from './catalogCsv'
import type { CatalogItem } from './useCatalog'

const HEADERS = ['nom', 'prix', 'quantite', 'categorie', 'magasin'] as const
const COLS = ['A', 'B', 'C', 'D', 'E'] as const
// Lignes couvertes par la liste déroulante au-delà des données existantes,
// pour que les ajouts manuels dans Excel en profitent aussi.
const DROPDOWN_EXTRA_ROWS = 1000

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineCell(ref: string, text: string, styleId = 0): string {
  if (!text) return ''
  return `<c r="${ref}" t="inlineStr"${styleId ? ` s="${styleId}"` : ''}>` +
    `<is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
}

function buildSheetXml(items: CatalogItem[]): string {
  const rows: string[] = []
  rows.push('<row r="1">' + HEADERS.map((h, i) => inlineCell(`${COLS[i]}1`, h, 1)).join('') + '</row>')
  items.forEach((it, idx) => {
    const r = idx + 2
    const cells = [
      inlineCell(`A${r}`, it.name),
      it.price != null ? `<c r="B${r}"><v>${it.price}</v></c>` : '',
      inlineCell(`C${r}`, it.quantity ?? ''),
      inlineCell(`D${r}`, it.category ?? ''),
      inlineCell(`E${r}`, it.store ?? ''),
    ]
    rows.push(`<row r="${r}">${cells.join('')}</row>`)
  })

  // Liste déroulante Excel sur la colonne catégorie. Limite du format : liste
  // inline ≤ 255 caractères et valeurs sans virgule — OK pour nos rayons.
  const lastRow = items.length + 1 + DROPDOWN_EXTRA_ROWS
  const list = escapeXml(CATEGORY_ORDER.join(','))

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols>' +
    '<col min="1" max="1" width="30" customWidth="1"/>' +
    '<col min="2" max="2" width="9" customWidth="1"/>' +
    '<col min="3" max="3" width="14" customWidth="1"/>' +
    '<col min="4" max="4" width="20" customWidth="1"/>' +
    '<col min="5" max="5" width="18" customWidth="1"/>' +
    '</cols>' +
    `<sheetData>${rows.join('')}</sheetData>` +
    '<dataValidations count="1">' +
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="D2:D${lastRow}">` +
    `<formula1>"${list}"</formula1>` +
    '</dataValidation>' +
    '</dataValidations>' +
    '</worksheet>'
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

const WORKBOOK =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Catalogue" sheetId="1" r:id="rId1"/></sheets>' +
  '</workbook>'

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>'

// Style 1 = en-tête en gras ; le reste est le strict minimum exigé par Excel.
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '</styleSheet>'

export async function catalogToXlsxBlob(items: CatalogItem[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', ROOT_RELS)
  zip.file('xl/workbook.xml', WORKBOOK)
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS)
  zip.file('xl/styles.xml', STYLES)
  zip.file('xl/worksheets/sheet1.xml', buildSheetXml(items))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ── Import ────────────────────────────────────────────────────────────────────

// « D12 » → index de colonne 3. Lettres seules (pas de colonnes AA+ chez nous).
function colIndex(ref: string): number {
  let n = 0
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

function cellText(cell: Element, shared: string[]): string {
  const t = cell.getAttribute('t')
  if (t === 's') {
    const idx = Number(cell.getElementsByTagName('v')[0]?.textContent ?? '')
    return shared[idx] ?? ''
  }
  if (t === 'inlineStr') return cell.getElementsByTagName('is')[0]?.textContent ?? ''
  return cell.getElementsByTagName('v')[0]?.textContent ?? ''
}

export async function parseCatalogXlsx(buffer: ArrayBuffer): Promise<CatalogCsvRow[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)

  const sheetFile = zip.file('xl/worksheets/sheet1.xml')
    ?? zip.file(/^xl\/worksheets\/.*\.xml$/)[0]
  if (!sheetFile) return []

  const parser = new DOMParser()

  // Chaînes partagées (Excel y déplace tous les textes au réenregistrement).
  const shared: string[] = []
  const sharedFile = zip.file('xl/sharedStrings.xml')
  if (sharedFile) {
    const doc = parser.parseFromString(await sharedFile.async('text'), 'application/xml')
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      shared.push(si.textContent ?? '')
    }
  }

  const doc = parser.parseFromString(await sheetFile.async('text'), 'application/xml')
  const out: CatalogCsvRow[] = []
  let isFirstRow = true

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const fields: string[] = []
    let fallbackCol = 0
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const ref = cell.getAttribute('r')
      const idx = ref ? colIndex(ref) : fallbackCol
      fields[idx] = cellText(cell, shared)
      fallbackCol = idx + 1
    }

    const first = (fields[0] ?? '').trim().toLowerCase()
    if (isFirstRow) {
      isFirstRow = false
      if (first === 'nom' || first === 'name') continue
    }

    const name = (fields[0] ?? '').trim()
    if (!name) continue
    out.push({
      name,
      price:    parsePrice(fields[1] ?? ''),
      quantity: (fields[2] ?? '').trim() || null,
      category: (fields[3] ?? '').trim() || null,
      store:    (fields[4] ?? '').trim() || null,
    })
  }
  return out
}
