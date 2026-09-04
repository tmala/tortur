import { ref, computed } from 'vue'

export interface TurpostItem {
  id: string
  name: string
  lat: number
  lng: number
  alt: number | null
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
    } catch (err: any) {
      error.value = err.message || 'Feil ved lasting av turpostdata'
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
    } catch (err: any) {
      error.value = err.message || `Kunne ikke hente turposter for ${kommune.name}`
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
    clearSelection
  }
}
