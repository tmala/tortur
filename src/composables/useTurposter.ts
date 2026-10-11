import { ref, computed } from 'vue'
import { getFirebaseConfig, fetchFirebase } from './useAuth'

export interface TurpostItem {
  id: string
  name: string
  lat: number
  lng: number
  alt: number | null
  fylke?: string
  kommune?: string
  isPrivate?: boolean
  ownerId?: string
  ownerName?: string
  createdAt?: string
  suggestedForPublic?: boolean
  status?: 'private' | 'pending' | 'approved' | 'denied' | 'exported'
  csvLine?: string
  csvLineHint?: string
}

export interface KommuneInfo {
  name: string
  slug: string
  count: number
}

export interface FylkeInfo {
  name: string
  slug: string
  count: number
  kommuner: KommuneInfo[]
}

export function findKommuneInHierarchy(
  hierarchyList: FylkeInfo[],
  name: string
): { fylke: FylkeInfo; kommune: KommuneInfo } | null {
  const clean = name.trim().toLowerCase()
  if (!clean) return null

  // 1. Nøyaktig treff (case-insensitive)
  for (const f of hierarchyList) {
    for (const k of f.kommuner) {
      if (k.name.toLowerCase() === clean) {
        return { fylke: f, kommune: k }
      }
    }
  }

  // 2. Normalisert treff (uten aksenter)
  const normClean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const f of hierarchyList) {
    for (const k of f.kommuner) {
      const normK = k.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (normK === normClean) {
        return { fylke: f, kommune: k }
      }
    }
  }

  // 3. Flerdelte / tospråklige navn (f.eks. samiske navn med skråstrek eller bindestrek)
  for (const f of hierarchyList) {
    for (const k of f.kommuner) {
      const parts = k.name.toLowerCase().split(/[\/\-–]/).map(p => p.trim())
      if (parts.includes(clean)) {
        return { fylke: f, kommune: k }
      }
      const searchParts = clean.split(/[\/\-–]/).map(p => p.trim())
      if (searchParts.some(sp => parts.includes(sp))) {
        return { fylke: f, kommune: k }
      }
    }
  }

  return null
}

let cachedMountainsList: TurpostItem[] | null = null
let cachedApprovedSpots: TurpostItem[] | null = null
let approvedSpotsFetchedAt = 0

/**
 * Henter alle godkjente turposter fra Firebase Realtime Database:
 * /<prefix>/approved_spots.json
 * Resultatet caches med en TTL på 60 sekunder.
 */
export async function fetchApprovedSpotsFromFirebase(force = false): Promise<TurpostItem[]> {
  const now = Date.now()
  if (!force && cachedApprovedSpots && now - approvedSpotsFetchedAt < 60000) {
    return cachedApprovedSpots
  }

  const config = await getFirebaseConfig()
  if (!config) return cachedApprovedSpots || []

  try {
    const url = `${config.dbUrl}/${config.prefix}/approved_spots.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return cachedApprovedSpots || []

    const data = await res.json()
    if (!data || typeof data !== 'object') {
      cachedApprovedSpots = []
      approvedSpotsFetchedAt = now
      return []
    }

    const list: TurpostItem[] = []
    for (const [id, val] of Object.entries(data)) {
      if (!val || typeof val !== 'object') continue
      const item = val as Record<string, unknown>
      list.push({
        id: String(item.id || id),
        name: typeof item.name === 'string' ? item.name : 'Uten navn',
        lat: Number(item.lat),
        lng: Number(item.lng),
        alt: item.alt !== undefined && item.alt !== null ? Number(item.alt) : null,
        fylke: typeof item.fylke === 'string' ? item.fylke : '',
        kommune: typeof item.kommune === 'string' ? item.kommune : '',
        isPrivate: false,
        status: 'approved',
        csvLine: typeof item.csvLine === 'string' ? item.csvLine : '',
        csvLineHint: typeof item.csvLineHint === 'string' ? item.csvLineHint : ''
      })
    }
    cachedApprovedSpots = list
    approvedSpotsFetchedAt = now
    return list
  } catch (err) {
    console.warn('[useTurposter] Kunne ikke laste approved_spots fra Firebase:', err)
    return cachedApprovedSpots || []
  }
}

/**
 * Kun for enhetstesting: overstyrer eller nullstiller hurtigbuffer for approved_spots.
 */
export function setCachedApprovedSpotsForTest(list: TurpostItem[] | null): void {
  cachedApprovedSpots = list
  approvedSpotsFetchedAt = list ? Date.now() : 0
}

/**
 * Slår opp en turpost i mountains.csv eller approved_spots basert på ID eller navn.
 * Returnerer et TurpostItem med koordinater, fylke og kommune.
 */
export async function lookupTurpost(
  turpostId?: string,
  turpostName?: string,
  additionalSpots?: TurpostItem[]
): Promise<TurpostItem | null> {
  if (!turpostId && !turpostName) return null

  // 1. Sjekk eventuelle eksplisitte tilleggs-spots (f.eks. fra komponent eller modal)
  if (additionalSpots && additionalSpots.length > 0) {
    if (turpostId) {
      const match = additionalSpots.find(p => String(p.id) === String(turpostId))
      if (match) return match
    }
    if (turpostName) {
      const clean = turpostName.trim().toLowerCase()
      const match = additionalSpots.find(p => p.name.toLowerCase() === clean)
      if (match) return match
    }
  }

  // 2. Sjekk felles turpostdatabase fra mountains.csv
  if (!cachedMountainsList) {
    try {
      const csvUrl = `${import.meta.env.BASE_URL}data/mountains.csv?v=${__APP_VERSION__}`
      const res = await fetch(csvUrl)
      if (res.ok) {
        const text = await res.text()
        const lines = text.split(/\r?\n/)
        const list: TurpostItem[] = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]?.trim()
          if (!line) continue
          const parts = line.split(';')
          if (parts.length >= 4) {
            const id = (parts[0] || '').trim()
            const name = (parts[1] || '').trim()
            const lat = parseFloat(parts[2] || '0')
            const lng = parseFloat(parts[3] || '0')
            const alt = parts[4] ? parseFloat(parts[4]) : null
            const fylke = (parts[5] || '').trim()
            const kommune = (parts[6] || '').trim()
            if (id && !isNaN(lat) && !isNaN(lng)) {
              list.push({ id, name, lat, lng, alt, fylke, kommune })
            }
          }
        }
        cachedMountainsList = list
      }
    } catch (e) {
      console.warn('Kunne ikke laste mountains.csv for oppslag av turpost:', e)
    }
  }

  if (cachedMountainsList && cachedMountainsList.length > 0) {
    if (turpostId) {
      const match = cachedMountainsList.find(p => p.id === turpostId)
      if (match) return match
    }

    if (turpostName) {
      const clean = turpostName.trim().toLowerCase()
      const match = cachedMountainsList.find(p => p.name.toLowerCase() === clean)
      if (match) return match
    }
  }

  // 3. Sjekk godkjente turposter (approved_spots i Firebase RTDB)
  const approvedList = await fetchApprovedSpotsFromFirebase()
  if (approvedList && approvedList.length > 0) {
    if (turpostId) {
      const match = approvedList.find(p => String(p.id) === String(turpostId))
      if (match) return match
    }

    if (turpostName) {
      const clean = turpostName.trim().toLowerCase()
      const match = approvedList.find(p => p.name.toLowerCase() === clean)
      if (match) return match
    }
  }

  return null
}

/**
 * Henter alle offentlig kjente turpost-IDer (fra mountains.csv, approved_spots og eventuelt tilleggs-spots).
 */
export async function getPublicTurpostIds(additionalSpots?: TurpostItem[]): Promise<Set<string>> {
  if (!cachedMountainsList) {
    // Sørg for at mountains.csv er lastet inn
    await lookupTurpost('__ensure_cache__')
  }

  const ids = new Set<string>()
  if (cachedMountainsList) {
    for (const p of cachedMountainsList) {
      if (p.id) ids.add(String(p.id))
    }
  }

  // Inkluder også godkjente turposter fra Firebase RTDB (approved_spots)
  const approvedList = await fetchApprovedSpotsFromFirebase()
  if (approvedList && approvedList.length > 0) {
    for (const p of approvedList) {
      if (p.id) ids.add(String(p.id))
    }
  }

  if (additionalSpots && additionalSpots.length > 0) {
    for (const s of additionalSpots) {
      if (s.id && !s.isPrivate) {
        ids.add(String(s.id))
      }
    }
  }

  return ids
}

/**
 * Sjekker om en gitt turpost-ID tilhører en offentlig kjent turpost.
 * Returnerer false dersom ID-en tilhører en privat turpost eller mangler.
 */
export async function isPublicTurpost(
  turpostId?: string | number,
  additionalSpots?: TurpostItem[]
): Promise<boolean> {
  if (!turpostId) return false
  const idStr = String(turpostId).trim()
  if (!idStr) return false

  const publicIds = await getPublicTurpostIds(additionalSpots)
  if (publicIds.size > 0) {
    return publicIds.has(idStr)
  }

  // Fallback kun dersom turpostlisten ikke kunne lastes (f.eks. offline eller enhetstester uten mock)
  return !idStr.startsWith('spot_')
}

/**
 * Kun for enhetstesting: overstyrer eller nullstiller hurtigbuffer for mountains.csv.
 */
export function setCachedMountainsListForTest(list: TurpostItem[] | null): void {
  cachedMountainsList = list
}

export function useTurposter() {
  const hierarchy = ref<FylkeInfo[]>([])
  const selectedFylke = ref<FylkeInfo | null>(null)
  const selectedKommune = ref<KommuneInfo | null>(null)
  const turposter = ref<TurpostItem[]>([])
  const isEnabled = ref(false)
  const isLoadingHierarchy = ref(false)
  const isLoadingPosts = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')

  const availableKommuner = computed(() => {
    return selectedFylke.value ? selectedFylke.value.kommuner : []
  })

  const filteredTurposter = computed(() => {
    if (!searchQuery.value.trim()) return turposter.value
    const q = searchQuery.value.toLowerCase().trim()
    return turposter.value.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.alt && p.alt.toString().includes(q))
    )
  })

  const loadHierarchy = async (force = false) => {
    if (hierarchy.value.length > 0 && !force) return
    isLoadingHierarchy.value = true
    error.value = null
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/hierarchy.json?v=${__APP_VERSION__}`)
      if (!res.ok) throw new Error(`Kunne ikke laste fylkesoversikt (${res.status})`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error('Mottok ugyldig format for fylkesoversikt')
      }
      const data: FylkeInfo[] = await res.json()
      hierarchy.value = data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Feil ved lasting av turpostdata'
    } finally {
      isLoadingHierarchy.value = false
    }
  }

  const selectFylke = (fylke: FylkeInfo | null) => {
    selectedFylke.value = fylke
    selectedKommune.value = null
    turposter.value = []
    searchQuery.value = ''
  }

  const selectKommune = async (kommune: KommuneInfo | null) => {
    selectedKommune.value = kommune
    searchQuery.value = ''
    if (!selectedFylke.value || !kommune) {
      turposter.value = []
      return
    }

    isLoadingPosts.value = true
    error.value = null
    try {
      const url = `${import.meta.env.BASE_URL}data/turposter/${selectedFylke.value.slug}/${kommune.slug}.json?v=${__APP_VERSION__}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Kunne ikke laste turposter for ${kommune.name} (${res.status})`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Ugyldig data mottatt for ${kommune.name}`)
      }
      const data: TurpostItem[] = await res.json()
      turposter.value = data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : `Kunne ikke hente turposter for ${kommune.name}`
    } finally {
      isLoadingPosts.value = false
    }
  }

  const findKommuneByName = async (name: string): Promise<{ fylke: FylkeInfo; kommune: KommuneInfo } | null> => {
    await loadHierarchy()
    return findKommuneInHierarchy(hierarchy.value, name)
  }

  const selectKommuneByName = async (name: string): Promise<{ fylke: FylkeInfo; kommune: KommuneInfo } | null> => {
    const match = await findKommuneByName(name)
    if (match) {
      selectedFylke.value = match.fylke
      await selectKommune(match.kommune)
      return match
    }
    return null
  }

  const clearSelection = () => {
    selectedFylke.value = null
    selectedKommune.value = null
    turposter.value = []
    searchQuery.value = ''
  }

  return {
    hierarchy,
    selectedFylke,
    selectedKommune,
    availableKommuner,
    turposter,
    filteredTurposter,
    isEnabled,
    isLoadingHierarchy,
    isLoadingPosts,
    error,
    searchQuery,
    loadHierarchy,
    selectFylke,
    selectKommune,
    findKommuneByName,
    selectKommuneByName,
    lookupTurpost,
    fetchApprovedSpotsFromFirebase,
    getPublicTurpostIds,
    isPublicTurpost,
    clearSelection
  }
}
