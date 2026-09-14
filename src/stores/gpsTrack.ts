import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  type TrackPoint,
  calculateDistanceMeters
} from '@/composables/useGeolocation'
import {
  useFirebaseTracks,
  formatTrackKey
} from '@/composables/useFirebaseTracks'

export interface SavedTrack {
  id: string
  userId: string
  name: string
  createdAt: number
  points: TrackPoint[]
  distanceMeters: number
  durationMs: number
  startTime: number | null
  endTime: number | null
  firebaseKey?: string
}

const STORAGE_PREFIX = 'tortur_saved_tracks_'

const getStorageKey = (userId: string | null | undefined): string => {
  const cleanId = userId && userId.trim().length > 0 ? userId.trim() : 'guest'
  return `${STORAGE_PREFIX}${cleanId}`
}

export const useGpsTrackStore = defineStore('gpsTrack', () => {
  const currentUserId = ref<string>('guest')
  const savedTracks = ref<SavedTrack[]>([])
  const activeTrackId = ref<string | null>(null)
  const externalTrack = ref<SavedTrack | null>(null)
  const isSyncing = ref<boolean>(false)
  const syncError = ref<string | null>(null)
  const lastSyncTime = ref<number | null>(null)

  // Aktivt valgt spor som vises på kartet (hvis bruker har valgt et fra historikken eller eksternt)
  const activeTrack = computed<SavedTrack | null>(() => {
    if (!activeTrackId.value) return null
    return savedTracks.value.find((t) => t.id === activeTrackId.value) || externalTrack.value || null
  })

  // Hjelpefunksjon: last spor for gjeldende bruker fra localStorage
  const loadTracks = (userId: string | null | undefined) => {
    const cleanId = userId && userId.trim().length > 0 ? userId.trim() : 'guest'
    currentUserId.value = cleanId
    activeTrackId.value = null

    try {
      const key = getStorageKey(cleanId)
      const data = localStorage.getItem(key)
      if (data) {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) {
          savedTracks.value = parsed
          return
        }
      }
    } catch (err) {
      console.warn('[gpsTrackStore] Kunne ikke laste spor fra localStorage:', err)
    }
    savedTracks.value = []
  }

  // Hjelpefunksjon: lagre spor til localStorage for gjeldende bruker
  const persistTracks = () => {
    try {
      const key = getStorageKey(currentUserId.value)
      if (savedTracks.value.length === 0) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(savedTracks.value))
      }
    } catch (err) {
      console.warn('[gpsTrackStore] Kunne ikke persistere spor til localStorage:', err)
    }
  }

  // Sett aktiv bruker (f.eks. ved innlogging/utlogging)
  const setUser = (userId: string | null | undefined) => {
    const newId = userId && userId.trim().length > 0 ? userId.trim() : 'guest'
    if (newId !== currentUserId.value || savedTracks.value.length === 0) {
      loadTracks(newId)
    }
    if (newId !== 'guest') {
      syncTracksWithFirebase(newId).catch((err) => {
        console.warn('[gpsTrackStore] Bakgrunnssynkronisering ved setUser feilet:', err)
      })
    }
  }

  // Synkroniser spor mot Firebase Realtime Database
  const syncTracksWithFirebase = async (targetUserId?: string | null): Promise<void> => {
    const uid = targetUserId && targetUserId.trim().length > 0 ? targetUserId.trim() : currentUserId.value
    if (!uid || uid === 'guest') return

    isSyncing.value = true
    syncError.value = null

    try {
      const { fetchUserTracksFromFirebase, saveTrackToFirebase } = useFirebaseTracks()
      const remoteTracks = await fetchUserTracksFromFirebase(uid)

      // Bygg kart over eksterne spor indeksert på firebaseKey eller startTime
      const remoteMap = new Map<string, SavedTrack>()
      for (const rt of remoteTracks) {
        const key = rt.firebaseKey || (rt.startTime ? formatTrackKey(rt.startTime) : rt.id)
        remoteMap.set(key, rt)
      }

      // Flett lokale spor som ennå ikke finnes i skyen (f.eks. sporet offline)
      const mergedList: SavedTrack[] = [...remoteTracks]
      const mergedKeys = new Set(remoteMap.keys())

      for (const localTrack of savedTracks.value) {
        const localKey =
          localTrack.firebaseKey ||
          (localTrack.startTime ? formatTrackKey(localTrack.startTime) : localTrack.id)

        if (!mergedKeys.has(localKey)) {
          // Lokalt spor finnes ikke i skyen – last det opp!
          mergedKeys.add(localKey)
          mergedList.push(localTrack)
          saveTrackToFirebase(uid, localTrack).catch((err) => {
            console.warn('[gpsTrackStore] Opplasting av lokalt spor til skyen feilet:', err)
          })
        }
      }

      // Sorter kronologisk: nyeste tur øverst
      mergedList.sort((a, b) => (b.startTime || b.createdAt) - (a.startTime || a.createdAt))
      savedTracks.value = mergedList
      persistTracks()
      lastSyncTime.value = Date.now()
    } catch (err: unknown) {
      console.warn('[gpsTrackStore] Feil ved synkronisering mot Firebase:', err)
      syncError.value = err instanceof Error ? err.message : 'Kunne ikke hente spor fra skyen'
    } finally {
      isSyncing.value = false
    }
  }

  // Beregn distanse for en liste med punkter
  const computeDistance = (points: TrackPoint[]): number => {
    if (points.length < 2) return 0
    let total = 0
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      if (prev && curr) {
        total += calculateDistanceMeters(prev.lat, prev.lng, curr.lat, curr.lng)
      }
    }
    return Math.round(total)
  }

  // Generer standard tittel for et nytt spor basert på dato/tid
  const generateDefaultName = (date: Date = new Date()): string => {
    const dateStr = date.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    const timeStr = date.toLocaleTimeString('no-NO', {
      hour: '2-digit',
      minute: '2-digit'
    })
    return `Tur ${dateStr}, kl. ${timeStr}`
  }

  // Lagre et nytt spor
  const saveTrack = (points: TrackPoint[], customName?: string): SavedTrack | null => {
    if (!points || points.length === 0) return null

    const now = Date.now()
    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]

    const startTime = firstPoint?.timestamp || now
    const endTime = lastPoint?.timestamp || now
    const durationMs = Math.max(0, endTime - startTime)
    const distanceMeters = computeDistance(points)

    const newTrack: SavedTrack = {
      id: `track_${now}_${Math.random().toString(36).substring(2, 7)}`,
      userId: currentUserId.value,
      name: customName?.trim() || generateDefaultName(new Date(startTime)),
      createdAt: now,
      points: JSON.parse(JSON.stringify(points)), // Kopi av punkter
      distanceMeters,
      durationMs,
      startTime,
      endTime,
      firebaseKey: formatTrackKey(startTime)
    }

    // Legg til øverst i listen og lagre lokalt umiddelbart
    savedTracks.value.unshift(newTrack)
    persistTracks()

    // Synkroniser til Firebase i bakgrunnen hvis innlogget
    if (currentUserId.value && currentUserId.value !== 'guest') {
      const { saveTrackToFirebase } = useFirebaseTracks()
      saveTrackToFirebase(currentUserId.value, newTrack).catch((err) => {
        console.warn('[gpsTrackStore] Lagring til Firebase feilet:', err)
      })
    }

    return newTrack
  }

  // Slett et spor
  const deleteTrack = (id: string): boolean => {
    const index = savedTracks.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const [deletedTrack] = savedTracks.value.splice(index, 1)
    if (activeTrackId.value === id) {
      activeTrackId.value = null
    }
    persistTracks()

    // Slett fra Firebase i bakgrunnen hvis innlogget
    if (deletedTrack && currentUserId.value && currentUserId.value !== 'guest') {
      const { deleteTrackFromFirebase } = useFirebaseTracks()
      deleteTrackFromFirebase(currentUserId.value, deletedTrack).catch((err) => {
        console.warn('[gpsTrackStore] Sletting fra Firebase feilet:', err)
      })
    }

    return true
  }

  // Gi nytt navn til et spor
  const renameTrack = (id: string, newName: string): boolean => {
    const track = savedTracks.value.find((t) => t.id === id)
    if (!track) return false

    track.name = newName.trim() || generateDefaultName(new Date(track.createdAt))
    persistTracks()

    // Oppdater i Firebase i bakgrunnen hvis innlogget
    if (currentUserId.value && currentUserId.value !== 'guest') {
      const { renameTrackInFirebase } = useFirebaseTracks()
      renameTrackInFirebase(currentUserId.value, track, track.name).catch((err) => {
        console.warn('[gpsTrackStore] Omdøping i Firebase feilet:', err)
      })
    }

    return true
  }

  // Vis spor på kartet (tar enten spor-ID eller et komplett SavedTrack-objekt for eksterne/venners spor)
  const viewTrackOnMap = (trackOrId: string | SavedTrack, forceActive: boolean = false) => {
    if (typeof trackOrId === 'string') {
      if (!forceActive && activeTrackId.value === trackOrId) {
        // Klikk på nytt fjerner visningen
        activeTrackId.value = null
        externalTrack.value = null
      } else {
        activeTrackId.value = trackOrId
        if (externalTrack.value && externalTrack.value.id !== trackOrId) {
          externalTrack.value = null
        }
      }
    } else {
      if (!forceActive && activeTrackId.value === trackOrId.id) {
        activeTrackId.value = null
        externalTrack.value = null
      } else {
        externalTrack.value = trackOrId
        activeTrackId.value = trackOrId.id
      }
    }
  }

  // Skjul aktivt spor fra kartet
  const clearActiveTrack = () => {
    activeTrackId.value = null
    externalTrack.value = null
  }

  // Importer GPX-fil, opprett SavedTrack, lagre lokalt og synkroniser mot Firebase
  const importGpx = async (file: File, customName?: string): Promise<SavedTrack> => {
    const { parseGpxFile } = await import('@/utils/gpxParser')
    const parsed = await parseGpxFile(file)
    const trackName = customName?.trim() || parsed.name || generateDefaultName()
    const newTrack = saveTrack(parsed.points, trackName)
    if (!newTrack) {
      throw new Error('Kunne ikke opprette spor fra GPX-data.')
    }
    return newTrack
  }

  // Last ned spor som standard GPX 1.1 XML-fil
  const downloadGpx = (track: SavedTrack) => {
    if (!track || track.points.length === 0) return

    const createdDate = new Date(track.createdAt)
    const dateStr = createdDate.toISOString().slice(0, 10)
    const safeTitle = track.name
      .toLowerCase()
      .replace(/[^a-z0-9æøå_-]/gi, '_')
      .replace(/_+/g, '_')
    const fileName = `${safeTitle || 'spor'}_${dateStr}.gpx`

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`
    gpx += `<gpx version="1.1" creator="TorTur - https://tortur.app" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`
    gpx += `  <metadata>\n`
    gpx += `    <name>${escapeXml(track.name)}</name>\n`
    gpx += `    <time>${createdDate.toISOString()}</time>\n`
    gpx += `  </metadata>\n`
    gpx += `  <trk>\n`
    gpx += `    <name>${escapeXml(track.name)}</name>\n`
    gpx += `    <trkseg>\n`

    for (const pt of track.points) {
      const timeXml = pt.timestamp
        ? `\n        <time>${new Date(pt.timestamp).toISOString()}</time>`
        : ''
      gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${timeXml}\n      </trkpt>\n`
    }

    gpx += `    </trkseg>\n`
    gpx += `  </trk>\n`
    gpx += `</gpx>`

    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Enkel XML-escape
  const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;'
        case '>': return '&gt;'
        case '&': return '&amp;'
        case '\'': return '&apos;'
        case '"': return '&quot;'
        default: return c
      }
    })
  }

  // Initial last ved oppstart
  loadTracks('guest')

  return {
    currentUserId,
    savedTracks,
    activeTrackId,
    externalTrack,
    activeTrack,
    isSyncing,
    syncError,
    lastSyncTime,
    setUser,
    loadTracks,
    syncTracksWithFirebase,
    saveTrack,
    deleteTrack,
    renameTrack,
    viewTrackOnMap,
    clearActiveTrack,
    downloadGpx,
    computeDistance,
    importGpx
  }
})
