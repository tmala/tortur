/**
 * elevation.ts – Tjeneste for oppslag av terrenghøyde (moh) fra Kartverkets Høyde-API (Geonorge).
 *
 * Dokumentasjon: https://ws.geonorge.no/hoydedata/v1/
 * Endepunktet /punkt tar inn geografiske koordinater (nord/lat, ost/lng) og koordsys (4258 / 4326),
 * og returnerer terrenghøyde z i meter over havet basert på Nasjonal detaljert høydemodell (laser/NDH).
 */

export interface GeonorgePunktItem {
  z?: number | null
  terreng?: number | null
  høyde?: number | null
  hoyde?: number | null
  elevation?: number | null
  datakilde?: string
  feilmelding?: string | null
}

export interface GeonorgeElevationResponse {
  punkter?: GeonorgePunktItem[]
  punkt?: GeonorgePunktItem[] | GeonorgePunktItem
  z?: number | null
  terreng?: number | null
  høyde?: number | null
  hoyde?: number | null
  elevation?: number | null
}

/**
 * Ekstraherer en avrundet heltallsverdi for terrenghøyde (meter) fra et vilkårlig Geonorge-svarobjekt.
 */
export function extractElevation(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  function parseVal(v: unknown): number | null {
    if (typeof v === 'number' && !isNaN(v) && v >= -500 && v <= 9000) {
      return Math.round(v)
    }
    if (typeof v === 'string') {
      const num = parseFloat(v)
      if (!isNaN(num) && num >= -500 && num <= 9000) {
        return Math.round(num)
      }
    }
    return null
  }

  function getFromItem(item: unknown): number | null {
    if (!item || typeof item !== 'object') return null
    const it = item as Record<string, unknown>
    return (
      parseVal(it.z) ??
      parseVal(it.terreng) ??
      parseVal(it.høyde) ??
      parseVal(it.hoyde) ??
      parseVal(it.elevation)
    )
  }

  // 1. Toppnivå-verdi
  const rootVal = getFromItem(obj)
  if (rootVal !== null) return rootVal

  // 2. obj.punkter array
  if (Array.isArray(obj.punkter) && obj.punkter.length > 0) {
    const val = getFromItem(obj.punkter[0])
    if (val !== null) return val
  }

  // 3. obj.punkt (kan være array eller enkelt-objekt)
  if (Array.isArray(obj.punkt) && obj.punkt.length > 0) {
    const val = getFromItem(obj.punkt[0])
    if (val !== null) return val
  } else if (obj.punkt && typeof obj.punkt === 'object') {
    const val = getFromItem(obj.punkt)
    if (val !== null) return val
  }

  return null
}

/**
 * Henter høyde over havet (i meter) for et punkt i Norge via Kartverkets åpne Høyde-API.
 *
 * Hvis koordinatene er utenfor Norge (eller oppslaget feiler/timer ut), returneres null.
 */
export async function fetchElevationNorway(
  lat: number,
  lng: number,
  externalSignal?: AbortSignal,
): Promise<number | null> {
  // Rask grovsjekk: Hvis koordinatene er utenfor Norges yttergrenser, avbryt umiddelbart
  if (lat < 57.0 || lat > 71.5 || lng < 4.0 || lng > 31.5) {
    return null
  }

  const url = `https://ws.geonorge.no/hoydedata/v1/punkt?nord=${lat.toFixed(6)}&ost=${lng.toFixed(6)}&koordsys=4258`
  const controller = new AbortController()

  const timeOutInMs = 45000 // 45 sekunder på server oppslag
  // Kartverkets servere interpolerer i store terrengmodeller og kotedata, noe som kan ta 10–20 sekunder
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeOutInMs)

  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId)
      return null
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return extractElevation(data)
  } catch (err: unknown) {
    // Unngå støy i konsollen dersom oppslaget ble avbrutt av timeout eller at modalen ble lukket
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      return null
    }
    console.warn('[Elevation] Kunne ikke hente høyde fra Geonorge:', err)
    return null
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }
}
