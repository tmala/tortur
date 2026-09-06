import { getFirebaseConfig } from './useAuth'
import type { SavedTrack } from '@/stores/gpsTrack'

/**
 * Konverterer et tidsstempel (i millisekunder) til en gyldig Firebase Realtime Database-nøkkel i ISO-format.
 *
 * Firebase RTDB tillater ikke tegn som '.', '$', '#', '[', ']', '/'.
 * Vi erstatter punktum før millisekunder med understrek, slik at nøkkelen forblir gyldig ISO-format
 * uten forbudte tegn: f.eks. "2026-09-06T21:30:00_123Z".
 */
export function formatTrackKey(timestampMs: number | null | undefined): string {
  const ms = timestampMs && timestampMs > 0 ? timestampMs : Date.now()
  return new Date(ms).toISOString().replace('.', '_')
}

/**
 * Parser en ISO-nøkkel (f.eks. "2026-09-06T21:30:00_123Z" eller "2026-09-06T21:30:00Z")
 * tilbake til UNIX-millisekunder.
 */
export function parseTrackKeyTimestamp(key: string): number {
  if (!key) return Date.now()
  const normalized = key.replace('_', '.')
  const parsed = Date.parse(normalized)
  if (!isNaN(parsed)) return parsed
  const num = Number(key)
  if (!isNaN(num) && num > 0) return num
  return Date.now()
}

export function useFirebaseTracks() {
  /**
   * Henter alle lagrede spor for gitt bruker fra Firebase Realtime Database.
   * Sti: /<prefix>/brukere/<userId>/tracks.json
   */
  async function fetchUserTracksFromFirebase(userId: string): Promise<SavedTrack[]> {
    if (!userId || userId === 'guest') return []

    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks.json`
      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const tracks: SavedTrack[] = []
      for (const [key, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as any
        const parsedTime = parseTrackKeyTimestamp(key)
        const startTime = item.startTime ?? parsedTime
        const createdAt = item.createdAt ?? parsedTime
        const endTime = item.endTime ?? null
        const distanceMeters = typeof item.distanceMeters === 'number' ? item.distanceMeters : 0
        const durationMs = typeof item.durationMs === 'number' ? item.durationMs : 0
        const points = Array.isArray(item.points) ? item.points : []

        tracks.push({
          id: item.id || `track_${key}`,
          userId: item.userId || userId,
          name: item.name || `Tur ${new Date(startTime).toLocaleDateString('no-NO')}`,
          createdAt,
          startTime,
          endTime,
          distanceMeters,
          durationMs,
          points,
          firebaseKey: item.firebaseKey || key
        })
      }

      // Sorter kronologisk, nyeste tur øverst
      return tracks.sort((a, b) => (b.startTime || b.createdAt) - (a.startTime || a.createdAt))
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke hente spor fra Firebase:', err)
      return []
    }
  }

  /**
   * Lagrer eller overskriver et spor i Firebase under:
   * /<prefix>/brukere/<userId>/tracks/<iso-timestamp>.json
   */
  async function saveTrackToFirebase(userId: string, track: SavedTrack): Promise<boolean> {
    if (!userId || userId === 'guest') return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks/${encodeURIComponent(key)}.json`

      const payload: SavedTrack = {
        ...track,
        userId,
        firebaseKey: key
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      return res.ok
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke lagre spor til Firebase:', err)
      return false
    }
  }

  /**
   * Sletter et spor fra Firebase Realtime Database.
   */
  async function deleteTrackFromFirebase(userId: string, track: SavedTrack): Promise<boolean> {
    if (!userId || userId === 'guest') return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks/${encodeURIComponent(key)}.json`

      const res = await fetch(url, {
        method: 'DELETE'
      })

      return res.ok
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke slette spor fra Firebase:', err)
      return false
    }
  }

  /**
   * Oppdaterer navnet på et spor i Firebase.
   */
  async function renameTrackInFirebase(
    userId: string,
    track: SavedTrack,
    newName: string
  ): Promise<boolean> {
    if (!userId || userId === 'guest') return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks/${encodeURIComponent(key)}.json`

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      })

      return res.ok
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke oppdatere spornavn i Firebase:', err)
      return false
    }
  }

  return {
    formatTrackKey,
    parseTrackKeyTimestamp,
    fetchUserTracksFromFirebase,
    saveTrackToFirebase,
    deleteTrackFromFirebase,
    renameTrackInFirebase
  }
}
