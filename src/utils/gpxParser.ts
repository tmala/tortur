import type { TrackPoint } from '@/composables/useGeolocation'

export interface ParsedGpxResult {
  name: string
  points: TrackPoint[]
}

/**
 * Parser en GPX XML-streng og returnerer spornavn og liste over TrackPoint.
 * Støtter GPX 1.0 og 1.1, flere segmenter (<trkseg>) og spor (<trk>).
 */
export function parseGpx(xmlString: string): ParsedGpxResult {
  if (!xmlString || typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new Error('GPX-innholdet er tomt.')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Ugyldig XML i GPX-filen: ' + (parserError.textContent?.slice(0, 100) || 'Parse-feil'))
  }

  // 1. Ekstraher navn: <trk><name>, deretter <metadata><name>, <metadata><desc>, eller <desc>
  let name = ''
  const trkName = doc.querySelector('trk > name')
  if (trkName && trkName.textContent && trkName.textContent.trim().length > 0) {
    name = trkName.textContent.trim()
  } else {
    const metaName = doc.querySelector('metadata > name')
    if (metaName && metaName.textContent && metaName.textContent.trim().length > 0) {
      name = metaName.textContent.trim()
    } else {
      const metaDesc = doc.querySelector('metadata > desc')
      if (metaDesc && metaDesc.textContent && metaDesc.textContent.trim().length > 0) {
        name = metaDesc.textContent.trim()
      } else {
        const descEl = doc.querySelector('desc')
        if (descEl && descEl.textContent && descEl.textContent.trim().length > 0) {
          name = descEl.textContent.trim()
        }
      }
    }
  }

  // 2. Ekstraher punkter: finn alle <trkpt> (eventuelt <rtept> som fallback)
  let ptElements = Array.from(doc.querySelectorAll('trkpt'))
  if (ptElements.length === 0) {
    ptElements = Array.from(doc.querySelectorAll('rtept'))
  }

  const points: TrackPoint[] = []

  for (const el of ptElements) {
    const latStr = el.getAttribute('lat')
    const lonStr = el.getAttribute('lon') || el.getAttribute('lng')
    if (!latStr || !lonStr) continue

    const lat = parseFloat(latStr)
    const lng = parseFloat(lonStr)
    if (isNaN(lat) || isNaN(lng)) continue

    const point: TrackPoint = { lat, lng }

    const timeEl = el.querySelector('time')
    if (timeEl && timeEl.textContent) {
      const parsedTime = Date.parse(timeEl.textContent.trim())
      if (!isNaN(parsedTime)) {
        point.timestamp = parsedTime
      }
    }

    points.push(point)
  }

  if (points.length === 0) {
    throw new Error('Ingen gyldige GPS-punkter funnet i GPX-filen.')
  }

  // 3. Ekstraher eventuelt <metadata><time> eller <time> på rotnivå som fallback-tidsstempel
  let metadataTime: number | undefined
  const metaTimeEl = doc.querySelector('metadata > time') || doc.querySelector('gpx > time')
  if (metaTimeEl && metaTimeEl.textContent) {
    const parsedMetaTime = Date.parse(metaTimeEl.textContent.trim())
    if (!isNaN(parsedMetaTime)) {
      metadataTime = parsedMetaTime
    }
  }

  if (metadataTime) {
    for (const pt of points) {
      if (!pt.timestamp) {
        pt.timestamp = metadataTime
      }
    }
  }

  return {
    name,
    points
  }
}

/**
 * Leser en File som tekst og parser den med parseGpx.
 * Hvis sporet mangler navn i selve GPX-en, benyttes filnavnet uten filetternavn.
 */
export async function parseGpxFile(file: File): Promise<ParsedGpxResult> {
  const text = await file.text()
  const result = parseGpx(text)

  if (!result.name) {
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim()
    result.name = baseName || 'Importert GPX-spor'
  }

  return result
}
