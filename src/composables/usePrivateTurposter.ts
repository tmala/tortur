import { ref } from 'vue'
import { useAuth, getFirebaseConfig, type FirebaseCheckinItem, type CheckinResult } from './useAuth'
import type { TurpostItem } from './useTurposter'

export interface SpotSuggestion {
  id: string
  name: string
  lat: number
  lng: number
  alt: number
  fylke: string
  kommune: string
  csvLine: string
  csvLineHint?: string
  suggestedAt: string
  userId: string
  userEmail?: string
  userName?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface CsvPlacementResult {
  lineNumber: number
  prevName?: string
  prevLineNumber?: number
  nextName?: string
  nextLineNumber?: number
  totalLines: number
}

// Minne-cache for mountains.csv linjer for å slippe å hente 1MB på hvert tastetrykk
let cachedMountainsCsvLines: string[] | null = null

export function usePrivateTurposter() {
  const isSaving = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { submitCheckin, updatePublicCheckin, deletePublicCheckin } = useAuth()

  /**
   * Henter alle private turposter for innlogget bruker fra Firebase RTDB:
   * /<prefix>/brukere/<userId>/my_spots.json
   */
  async function fetchMySpots(userId: string): Promise<TurpostItem[]> {
    if (!userId || userId === 'guest') return []
    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      isLoading.value = true
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots.json`
      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const spots: TurpostItem[] = []
      for (const [id, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as any
        spots.push({
          id: String(item.id || id),
          name: item.name || 'Uten navn',
          lat: Number(item.lat),
          lng: Number(item.lng),
          alt: item.alt !== undefined ? Number(item.alt) : null,
          fylke: item.fylke || '',
          kommune: item.kommune || '',
          isPrivate: true,
          ownerId: userId,
          ownerName: item.ownerName || '',
          createdAt: item.createdAt || '',
          suggestedForPublic: Boolean(item.suggestedForPublic),
          status: item.status || 'private',
          csvLine: item.csvLine || '',
          csvLineHint: item.csvLineHint || ''
        })
      }

      return spots
    } catch (err: any) {
      console.warn('[usePrivateTurposter] Kunne ikke hente my_spots fra Firebase:', err)
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Lagrer en privat turpost i brukerens egen Firebase-node.
   * Hvis suggestForPublic er true, lagres den også under /<prefix>/spot_suggestions/<spotId>.json
   * slik at admin får den opp i sin liste over innkommende forslag!
   */
  async function saveMySpot(
    userId: string,
    spot: TurpostItem,
    suggestForPublic: boolean = false,
    userMeta?: { name?: string; email?: string }
  ): Promise<void> {
    if (!userId || userId === 'guest') {
      throw new Error('Bruker må være innlogget for å lagre private turposter.')
    }
    const config = await getFirebaseConfig()
    if (!config) {
      throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')
    }

    isSaving.value = true
    error.value = null

    try {
      const nowIso = new Date().toISOString()
      const spotData = {
        id: spot.id,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        alt: spot.alt,
        fylke: spot.fylke || '',
        kommune: spot.kommune || '',
        isPrivate: true,
        ownerId: userId,
        ownerName: userMeta?.name || '',
        createdAt: spot.createdAt || nowIso,
        suggestedForPublic: suggestForPublic,
        status: suggestForPublic ? 'pending' : 'private',
        csvLine: spot.csvLine || '',
        csvLineHint: spot.csvLineHint || ''
      }

      // 1. Lagre under brukerens egne spots: /<prefix>/brukere/<userId>/my_spots/<spotId>.json
      const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
      const resUser = await fetch(userSpotUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spotData)
      })

      if (!resUser.ok) {
        throw new Error(`Feil ved lagring i Firebase (status ${resUser.status})`)
      }

      // 2. Hvis brukeren vil foreslå for admin, legg til i /<prefix>/spot_suggestions/<spotId>.json
      if (suggestForPublic) {
        const suggestionData: SpotSuggestion = {
          id: String(spot.id),
          name: spot.name,
          lat: spot.lat,
          lng: spot.lng,
          alt: spot.alt ?? 0,
          fylke: spot.fylke || '',
          kommune: spot.kommune || '',
          csvLine: spot.csvLine || '',
          csvLineHint: spot.csvLineHint || '',
          suggestedAt: nowIso,
          userId: userId,
          userEmail: userMeta?.email || '',
          userName: userMeta?.name || '',
          status: 'pending'
        }

        const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(String(spot.id))}.json`
        await fetch(suggestionUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(suggestionData)
        })
      }
    } catch (err: any) {
      error.value = err.message || 'Kunne ikke lagre turposten.'
      throw err
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Sender inn en eksisterende privat turpost som forslag til admin i etterkant.
   */
  async function suggestExistingSpotForPublic(
    userId: string,
    spot: TurpostItem,
    userMeta?: { name?: string; email?: string }
  ): Promise<void> {
    if (!userId || userId === 'guest') return
    const config = await getFirebaseConfig()
    if (!config) return

    const nowIso = new Date().toISOString()
    // 1. Oppdater status i brukerens egen turpost
    const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
    await fetch(userSpotUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suggestedForPublic: true,
        status: 'pending'
      })
    })

    // 2. Legg til i spot_suggestions for admin
    const suggestionData: SpotSuggestion = {
      id: String(spot.id),
      name: spot.name,
      lat: spot.lat,
      lng: spot.lng,
      alt: spot.alt ?? 0,
      fylke: spot.fylke || '',
      kommune: spot.kommune || '',
      csvLine: spot.csvLine || '',
      csvLineHint: spot.csvLineHint || '',
      suggestedAt: nowIso,
      userId: userId,
      userEmail: userMeta?.email || '',
      userName: userMeta?.name || '',
      status: 'pending'
    }

    const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(String(spot.id))}.json`
    await fetch(suggestionUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suggestionData)
    })
  }

  /**
   * Sletter en privat turpost for innlogget bruker, samt tilhørende private innsjekkinger.
   */
  async function deleteMySpot(userId: string, spotId: string): Promise<void> {
    if (!userId || userId === 'guest') return
    const config = await getFirebaseConfig()
    if (!config) return

    try {
      // 1. Slett selve spotet
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(spotId)}.json`
      await fetch(url, { method: 'DELETE' })

      // 2. Slett tilhørende private innsjekkinger
      const checkinsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}.json`
      await fetch(checkinsUrl, { method: 'DELETE' })

      // 3. Fjern eventuelt fra forslagslisten
      const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(spotId)}.json`
      await fetch(suggestionUrl, { method: 'DELETE' })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke slette my_spot:', err)
      throw err
    }
  }

  /**
   * Henter alle innsjekkinger for en gitt privat turpost.
   */
  async function fetchPrivateCheckinsForSpot(userId: string, spotId: string): Promise<FirebaseCheckinItem[]> {
    if (!userId || userId === 'guest' || !spotId) return []
    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}.json`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      if (!data || typeof data !== 'object') return []
      return Object.values(data)
        .filter(item => item && typeof item === 'object' && (item as any).turpostId != null)
        .map(item => ({
          ...(item as FirebaseCheckinItem),
          isPrivate: true,
          spotId: spotId
        }))
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke hente innsjekkinger for spot:', err)
      return []
    }
  }

  /**
   * Sletter en enkelt privat innsjekking.
   */
  async function deletePrivateCheckin(userId: string, spotId: string, checkinId: string): Promise<void> {
    if (!userId || userId === 'guest' || !spotId || !checkinId) return
    const config = await getFirebaseConfig()
    if (!config) return

    try {
      await deletePublicCheckin({ turpostId: spotId, checkinId })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke slette fra Apps Script:', err)
    }

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}/${encodeURIComponent(checkinId)}.json`
      await fetch(url, { method: 'DELETE' })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke slette privat innsjekking:', err)
      throw err
    }
  }

  /**
   * Oppdaterer en privat innsjekking (beskrivelse og/eller bilde).
   */
  async function updatePrivateCheckin(
    userId: string,
    spotId: string,
    checkinId: string,
    params: {
      description?: string
      imageFile?: File | null
      removeImage?: boolean
      visibility?: 'all' | 'friends' | 'private'
    }
  ): Promise<{ imageUrl?: string; description?: string; visibility?: 'all' | 'friends' | 'private' }> {
    if (!userId || userId === 'guest' || !spotId || !checkinId) {
      throw new Error('Mangler parametre for oppdatering av privat innsjekking.')
    }
    const config = await getFirebaseConfig()
    if (!config) {
      throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')
    }

    const patchData: Record<string, any> = {}
    if (params.description !== undefined) {
      patchData.description = params.description
    }
    if (params.visibility !== undefined) {
      patchData.visibility = params.visibility
    }

    if (params.imageFile || params.removeImage) {
      const updateRes = await updatePublicCheckin({
        turpostId: spotId,
        checkinId,
        description: params.description,
        imageFile: params.imageFile,
        removeImage: params.removeImage,
        visibility: params.visibility
      })
      if (updateRes.imageUrl !== undefined) {
        patchData.imageUrl = updateRes.imageUrl
      }
    }

    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}/${encodeURIComponent(checkinId)}.json`
    const patchRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    })

    if (params.visibility !== undefined) {
      const visUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
      await fetch(visUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params.visibility) })
    }

    if (!patchRes.ok) {
      throw new Error(`Kunne ikke oppdatere privat innsjekking (status ${patchRes.status})`)
    }

    return { imageUrl: patchData.imageUrl, description: patchData.description, visibility: params.visibility }
  }

  /**
   * Oppdaterer eller fjerner turbildet for en privat innsjekking.
   */
  async function updatePrivateCheckinImage(
    userId: string,
    spotId: string,
    checkinId: string,
    imageFile?: File | null
  ): Promise<string> {
    const res = await updatePrivateCheckin(userId, spotId, checkinId, {
      imageFile,
      removeImage: imageFile === null
    })
    return res.imageUrl || ''
  }

  /**
   * Henter alle innsjekkinger på innlogget brukers private turposter.
   * Sti: /<prefix>/brukere/<userId>/my_spots_checkins.json
   */
  async function fetchMyPrivateCheckins(userId: string): Promise<FirebaseCheckinItem[]> {
    if (!userId || userId === 'guest') return []
    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins.json`
      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const checkins: FirebaseCheckinItem[] = []
      // Data kan være strukturert som { [spotId]: { [checkinId]: item } }
      for (const [spotId, spotVal] of Object.entries(data)) {
        if (!spotVal || typeof spotVal !== 'object') continue
        for (const item of Object.values(spotVal as any)) {
          if (item && typeof item === 'object' && (item as any).turpostId != null) {
            checkins.push({
              ...(item as FirebaseCheckinItem),
              isPrivate: true,
              spotId: spotId
            })
          }
        }
      }
      return checkins
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke hente private innsjekkinger:', err)
      return []
    }
  }

  /**
   * Utfører en innsjekking på en privat turpost.
   * Lagres KUN under brukeren selv:
   * /<prefix>/brukere/<userId>/my_spots_checkins/<spotId>/<checkinId>.json
   */
  async function submitPrivateCheckin(params: {
    userId: string
    userName: string
    userEmail?: string
    post: TurpostItem
    description?: string
    imageFile?: File | null
    visibility?: 'all' | 'friends' | 'private'
  }): Promise<CheckinResult> {
    const config = await getFirebaseConfig()
    if (!config) {
      throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')
    }

    // Opprett innsjekk og lagre bildet i Google Drive via Apps Script
    const appScriptResult = await submitCheckin({
      turpostId: String(params.post.id),
      turpostName: params.post.name,
      description: params.description || '',
      imageFile: params.imageFile || undefined
    })

    const checkinId = appScriptResult.id || `checkin_${Date.now()}`
    const nowIso = appScriptResult.timestamp || new Date().toISOString()
    const photoUrl = appScriptResult.imageUrl || ''
    const visibility = params.visibility || 'private'

    const checkinItem: FirebaseCheckinItem = {
      id: checkinId,
      turpostId: String(params.post.id),
      turpostName: params.post.name,
      userId: params.userId,
      userName: params.userName || appScriptResult.userName || 'Ukjent turgåer',
      userAvatar: appScriptResult.userAvatar || '',
      timestamp: nowIso,
      description: params.description || appScriptResult.description || '',
      imageUrl: photoUrl,
      visibility
    }

    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/my_spots_checkins/${encodeURIComponent(String(params.post.id))}/${checkinId}.json`
    const visUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
    const [res] = await Promise.all([
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkinItem)
      }),
      fetch(visUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visibility)
      })
    ])

    if (!res.ok) {
      throw new Error(`Kunne ikke lagre privat innsjekking (status ${res.status})`)
    }

    // Apps Script synkroniserer automatisk alle innsjekkinger til offentlig turpost- og bruker-indeks.
    // For private turposter skal innsjekkingen kun ligge under my_spots_checkins; rydd derfor opp de to nodene:
    try {
      const cleanupTurpostUrl = `${config.dbUrl}/${config.prefix}/turposter/${encodeURIComponent(String(params.post.id))}/${checkinId}.json`
      const cleanupUserUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/checkins/${checkinId}.json`
      const cleanupLegacyUserUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/${checkinId}.json`
      await Promise.all([
        fetch(cleanupTurpostUrl, { method: 'DELETE' }),
        fetch(cleanupUserUrl, { method: 'DELETE' }),
        fetch(cleanupLegacyUserUrl, { method: 'DELETE' }).catch(() => {})
      ])
    } catch {
      // Ignorer eventuelle nettverksfeil ved opprydding
    }

    return {
      id: checkinId,
      userId: params.userId,
      turpostId: String(params.post.id),
      turpostName: params.post.name,
      timestamp: nowIso,
      description: params.description || '',
      imageUrl: photoUrl,
      userName: params.userName || appScriptResult.userName
    }
  }

  /**
   * Henter alle innkommende turpost-forslag for admin:
   * /<prefix>/spot_suggestions.json
   */
  async function fetchSpotSuggestions(): Promise<SpotSuggestion[]> {
    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/spot_suggestions.json`
      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const suggestions: SpotSuggestion[] = []
      for (const [id, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        suggestions.push({
          ...(val as SpotSuggestion),
          id: id
        })
      }

      // Sorter nyeste forslag først
      suggestions.sort((a, b) => new Date(b.suggestedAt).getTime() - new Date(a.suggestedAt).getTime())
      return suggestions
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke hente spot_suggestions:', err)
      return []
    }
  }

  /**
   * Sletter eller arkiverer et innkommende forslag for admin.
   */
  async function deleteSpotSuggestion(spotId: string): Promise<void> {
    const config = await getFirebaseConfig()
    if (!config) return

    try {
      const url = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(spotId)}.json`
      await fetch(url, { method: 'DELETE' })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke slette spot_suggestion:', err)
      throw err
    }
  }

  /**
   * Beregner nøyaktig hvilket linjenummer i mountains.csv en ny turpost skal legges inn på.
   * mountains.csv er sortert alfabetisk etter turpostNavn.
   */
  async function calculateCsvPlacement(turpostName: string): Promise<CsvPlacementResult> {
    if (!turpostName.trim()) {
      return { lineNumber: 1, totalLines: 1 }
    }

    try {
      if (!cachedMountainsCsvLines) {
        const csvUrl = `${import.meta.env.BASE_URL}data/mountains.csv?v=${__APP_VERSION__}`
        const res = await fetch(csvUrl)
        if (res.ok) {
          const text = await res.text()
          cachedMountainsCsvLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
        }
      }

      if (!cachedMountainsCsvLines || cachedMountainsCsvLines.length === 0) {
        return { lineNumber: 1, totalLines: 1 }
      }

      const lines = cachedMountainsCsvLines
      const totalLines = lines.length

      // Header er linje 1 (index 0). Datainnhold starter på linje 2 (index 1).
      // Finn første linje hvor turpostNavn i CSV er alfabetisk større enn det nye navnet.
      const cleanNewName = turpostName.trim()

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line) continue
        const parts = line.split(';')
        if (parts.length < 2) continue
        const existingName = (parts[1] || '').trim()

        // Sammenlign med norsk kollasjon
        if (existingName.localeCompare(cleanNewName, 'nb', { sensitivity: 'base' }) > 0) {
          const lineNumber = i + 1 // 1-indeksert linjenummer hvor den nye skal settes inn

          const prevLine = lines[i - 1]
          const prevParts = prevLine ? prevLine.split(';') : []
          const prevName = i > 1 && prevParts.length >= 2 ? (prevParts[1] || '').trim() : undefined

          return {
            lineNumber,
            prevName,
            prevLineNumber: i,
            nextName: existingName,
            nextLineNumber: i + 1,
            totalLines
          }
        }
      }

      // Hvis den skal helt på slutten:
      const lastLine = lines[lines.length - 1]
      const lastParts = lastLine ? lastLine.split(';') : []
      const lastPrevName = lastParts.length >= 2 ? (lastParts[1] || '').trim() : undefined

      return {
        lineNumber: totalLines + 1,
        prevName: lastPrevName,
        prevLineNumber: totalLines,
        totalLines
      }
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke beregne CSV-plassering:', err)
      return { lineNumber: 1, totalLines: 1 }
    }
  }

  return {
    isSaving,
    isLoading,
    error,
    fetchMySpots,
    saveMySpot,
    suggestExistingSpotForPublic,
    deleteMySpot,
    fetchMyPrivateCheckins,
    fetchPrivateCheckinsForSpot,
    deletePrivateCheckin,
    updatePrivateCheckin,
    updatePrivateCheckinImage,
    submitPrivateCheckin,
    fetchSpotSuggestions,
    deleteSpotSuggestion,
    calculateCsvPlacement
  }
}


