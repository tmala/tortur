/**
 * Hjelpefunksjoner for typesikker validering og normalisering av bruker-ID-er.
 * Sikrer at userId alltid behandles som en streng og aldri som et tall med presisjonstap.
 */

/**
 * Validerer om en verdi er en gyldig bruker-ID (må være streng, aldri tall).
 * Tall og vitenskapelig notasjon avvises eksplisitt for å hindre presisjonstap (f.eks. avrundet float i JS).
 */
export function isValidUserId(val: unknown): val is string {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed) return false
  if (/^\d+([.,]\d+)?E\+\d+$/i.test(trimmed)) return false
  return /^[a-zA-Z0-9_-]+$/.test(trimmed)
}

/**
 * Normaliserer en bruker-ID til ren streng.
 * Returnerer den trimmede strengen dersom den er gyldig, eller en tom streng ('') hvis ikke.
 */
export function normalizeUserId(val: unknown): string {
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed && !/^\d+([.,]\d+)?E\+\d+$/i.test(trimmed) && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return trimmed
    }
  }
  return ''
}
