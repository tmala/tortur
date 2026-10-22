/**
 * Validerer at en bruker-ID kun består av sifre (f.eks. Google sub)
 * @param {unknown} val
 * @returns {boolean}
 */
export function isValidUserId(val) {
  return typeof val === 'string' && /^\d+$/.test(val.trim())
}

/**
 * Leser en celleverdi trygt som streng og filtrerer bort avrundet vitenskapelig notasjon
 * @param {unknown} val
 * @returns {string}
 */
export function cellToString(val) {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  if (/^\d+([.,]\d+)?E\+\d+$/i.test(str)) {
    console.warn(`[sheetsService] Ignorerer korrupt/avrundet tall i regnearkcelle: ${str}`)
    return ''
  }
  return str
}
