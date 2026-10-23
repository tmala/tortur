import { getFirebaseConfig, fetchFirebase } from './useAuth'
import type { SavedTrack, TrackVisibility } from '@/stores/gpsTrack'
import { cachedFetchJson } from '@/services/rtdbCache'

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
      const { data } = await cachedFetchJson<Record<string, unknown>>(url, {
        userId,
        freshMs: 30_000,
      })
      if (!data || typeof data !== 'object') return []

      const tracks: SavedTrack[] = []
      for (const [key, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as Record<string, unknown>
        const parsedTime = parseTrackKeyTimestamp(key)
        const startTime = typeof item.startTime === 'number' ? item.startTime : parsedTime
        let createdAt = typeof item.createdAt === 'number' ? item.createdAt : parsedTime
        if (startTime && createdAt > startTime) {
          createdAt = startTime
        }
        const endTime = typeof item.endTime === 'number' ? item.endTime : null
        const distanceMeters = typeof item.distanceMeters === 'number' ? item.distanceMeters : 0
        const durationMs = typeof item.durationMs === 'number' ? item.durationMs : 0
        const points = Array.isArray(item.points) ? (item.points as SavedTrack['points']) : []
        const id = typeof item.id === 'string' ? item.id : `track_${key}`
        const name = typeof item.name === 'string' ? item.name : `Tur ${new Date(startTime).toLocaleDateString('no-NO')}`
        const firebaseKey = typeof item.firebaseKey === 'string' ? item.firebaseKey : key
        const sharePhotosWithFriends =
          typeof item.sharePhotosWithFriends === 'boolean' ? item.sharePhotosWithFriends : undefined
        const visibility: TrackVisibility =
          typeof item.visibility === 'string' && ['all', 'friends', 'private'].includes(item.visibility)
            ? (item.visibility as TrackVisibility)
            : 'private'

        tracks.push({
          id,
          userId: typeof item.userId === 'string' ? item.userId : userId,
          name,
          createdAt,
          startTime,
          endTime,
          distanceMeters,
          durationMs,
          points,
          firebaseKey,
          sharePhotosWithFriends,
          visibility
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
   * Henter et spesifikt spor for en gitt bruker basert på trackId eller firebaseKey.
   */
  async function fetchUserTrackById(userId: string, trackId: string): Promise<SavedTrack | null> {
    if (!userId || userId === 'guest' || !trackId) return null
    const tracks = await fetchUserTracksFromFirebase(userId)
    return tracks.find((t) => t.id === trackId || t.firebaseKey === trackId) || null
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
        firebaseKey: key,
        visibility: track.visibility || 'private'
      }

      const res = await fetchFirebase(url, {
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

      const res = await fetchFirebase(url, {
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

      const res = await fetchFirebase(url, {
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

  /**
   * Oppdaterer innstilling for deling av turbilder med venner i Firebase.
   */
  async function setTrackPhotoSharingInFirebase(
    userId: string,
    track: SavedTrack,
    shareWithFriends: boolean
  ): Promise<boolean> {
    if (!userId || userId === 'guest') return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks/${encodeURIComponent(key)}.json`

      const res = await fetchFirebase(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharePhotosWithFriends: shareWithFriends })
      })

      return res.ok
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke oppdatere bildedeling i Firebase:', err)
      return false
    }
  }

  /**
   * Oppdaterer innstilling for synlighet ('all' | 'friends' | 'private') for et spor i Firebase.
   */
  async function setTrackVisibilityInFirebase(
    userId: string,
    track: SavedTrack,
    visibility: TrackVisibility
  ): Promise<boolean> {
    if (!userId || userId === 'guest') return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/tracks/${encodeURIComponent(key)}.json`

      const res = await fetchFirebase(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility })
      })

      return res.ok
    } catch (err) {
      console.warn('[useFirebaseTracks] Kunne ikke oppdatere synlighet i Firebase:', err)
      return false
    }
  }

  /**
   * Henter spor for en venn fra Firebase.
   * Returnerer kun spor som er synlige for venner ('friends') eller alle ('all').
   * Private spor utelates alltid.
   */
  async function fetchFriendTracks(friendUserId: string): Promise<SavedTrack[]> {
    if (!friendUserId || friendUserId === 'guest') return []
    const tracks = await fetchUserTracksFromFirebase(friendUserId)
    return tracks.filter((t) => t.visibility === 'friends' || t.visibility === 'all')
  }

  return {
    formatTrackKey,
    parseTrackKeyTimestamp,
    fetchUserTracksFromFirebase,
    fetchFriendTracks,
    fetchUserTrackById,
    saveTrackToFirebase,
    deleteTrackFromFirebase,
    renameTrackInFirebase,
    setTrackPhotoSharingInFirebase,
    setTrackVisibilityInFirebase
  }
}
