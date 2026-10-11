import { ref } from 'vue'
import {
  useAuth,
  getFirebaseConfig,
  fetchFirebase,
  syncAdminStatus,
  type FirebaseCheckinItem,
  type CheckinResult
} from './useAuth'
import { getCurrentFirebaseUser } from '@/services/firebase'
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
  status: 'pending' | 'approved' | 'rejected' | 'denied'
}

export interface ApprovedSpot {
  id: string
  name: string
  lat: number
  lng: number
  alt: number | null
  fylke: string
  kommune: string
  csvLine: string
  csvLineHint?: string
  ownerId?: string
  ownerName?: string
  approvedAt: string
  approvedBy?: string
  status?: 'approved' | 'exported'
  exportedToCsv?: boolean
  exportedAt?: string
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
      const res = await fetchFirebase(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const spots: TurpostItem[] = []
      for (const [id, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as Record<string, unknown>
        spots.push({
          id: String(item.id || id),
          name: typeof item.name === 'string' ? item.name : 'Uten navn',
          lat: Number(item.lat),
          lng: Number(item.lng),
          alt: item.alt !== undefined ? Number(item.alt) : null,
          fylke: typeof item.fylke === 'string' ? item.fylke : '',
          kommune: typeof item.kommune === 'string' ? item.kommune : '',
          isPrivate: true,
          ownerId: userId,
          ownerName: typeof item.ownerName === 'string' ? item.ownerName : '',
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
          suggestedForPublic: Boolean(item.suggestedForPublic),
          status: (item.status as TurpostItem['status']) || 'private',
          csvLine: typeof item.csvLine === 'string' ? item.csvLine : '',
          csvLineHint: typeof item.csvLineHint === 'string' ? item.csvLineHint : ''
        })
      }

      // For turposter som er 'pending' eller foreslått for offentlig:
      // Sjekk om admin har avvist forslaget (status: 'denied' i spot_suggestions)
      const pendingSpots = spots.filter((s) => s.status === 'pending' || s.suggestedForPublic)
      if (pendingSpots.length > 0) {
        await Promise.all(
          pendingSpots.map(async (spot) => {
            try {
              const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(String(spot.id))}.json`
              const resSuggestion = await fetchFirebase(suggestionUrl)
              if (resSuggestion.ok) {
                const suggestionData = (await resSuggestion.json()) as SpotSuggestion | null
                if (suggestionData && suggestionData.status === 'denied') {
                  // 1. Oppdater brukerens egen private node under my_spots til status: 'denied'
                  const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
                  await fetchFirebase(userSpotUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      status: 'denied',
                      suggestedForPublic: false
                    })
                  })

                  // 2. Slett turposten under spot_suggestions
                  await fetchFirebase(suggestionUrl, { method: 'DELETE' }).catch(() => {})

                  // 3. Oppdater lokalt spot-objekt
                  spot.status = 'denied'
                  spot.suggestedForPublic = false
                } else if (suggestionData && suggestionData.status === 'approved') {
                  // 1. Oppdater brukerens egen private node under my_spots til status: 'approved'
                  const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
                  await fetchFirebase(userSpotUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      status: 'approved',
                      suggestedForPublic: true
                    })
                  })

                  // 2. Slett turposten under spot_suggestions (den er nå i approved_spots)
                  await fetchFirebase(suggestionUrl, { method: 'DELETE' }).catch(() => {})

                  // 3. Oppdater lokalt spot-objekt
                  spot.status = 'approved'
                  spot.suggestedForPublic = true
                }
              }
            } catch (syncErr) {
              console.warn('[usePrivateTurposter] Kunne ikke synkronisere avvist forslag for spot:', spot.id, syncErr)
            }
          })
        )
      }

      return spots
    } catch (err) {
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
      const canSuggest = suggestForPublic && spot.status !== 'denied'
      const statusValue = spot.status === 'denied' ? 'denied' : (canSuggest ? 'pending' : 'private')
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
        suggestedForPublic: canSuggest,
        status: statusValue,
        csvLine: spot.csvLine || '',
        csvLineHint: spot.csvLineHint || ''
      }

      // 1. Lagre under brukerens egne spots: /<prefix>/brukere/<userId>/my_spots/<spotId>.json
      const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
      const resUser = await fetchFirebase(userSpotUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spotData)
      })

      if (!resUser.ok) {
        throw new Error(`Feil ved lagring i Firebase (status ${resUser.status})`)
      }

      // 2. Hvis brukeren vil foreslå for admin, legg til i /<prefix>/spot_suggestions/<spotId>.json
      if (canSuggest) {
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
        await fetchFirebase(suggestionUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(suggestionData)
        })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Kunne ikke lagre turposten.'
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
    if (spot.status === 'denied') {
      throw new Error('Denne turposten er tidligere avvist av administrator og kan ikke foreslås på nytt.')
    }
    const config = await getFirebaseConfig()
    if (!config) return

    // Sjekk om forslaget allerede har status denied i spot_suggestions
    const checkSuggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(String(spot.id))}.json`
    const checkRes = await fetchFirebase(checkSuggestionUrl)
    if (checkRes.ok) {
      const existingData = (await checkRes.json()) as SpotSuggestion | null
      if (existingData && existingData.status === 'denied') {
        throw new Error('Denne turposten er tidligere avvist av administrator og kan ikke foreslås på nytt.')
      }
    }

    const nowIso = new Date().toISOString()
    // 1. Oppdater status i brukerens egen turpost
    const userSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots/${encodeURIComponent(String(spot.id))}.json`
    await fetchFirebase(userSpotUrl, {
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
    await fetchFirebase(suggestionUrl, {
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
      await fetchFirebase(url, { method: 'DELETE' })

      // 2. Slett tilhørende private innsjekkinger
      const checkinsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}.json`
      await fetchFirebase(checkinsUrl, { method: 'DELETE' })

      // 3. Fjern eventuelt fra forslagslisten
      const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(spotId)}.json`
      await fetchFirebase(suggestionUrl, { method: 'DELETE' })
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
      const items: FirebaseCheckinItem[] = []

      // 1. my_spots_checkins (for egne opprettede private turposter)
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}.json`
      const res = await fetchFirebase(url)
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data === 'object') {
          const spotItems = Object.entries(data)
            .filter(([, item]) => Boolean(item && typeof item === 'object' && (item as Record<string, unknown>).turpostId != null))
            .map(([key, item]) => {
              const rec = item as Record<string, unknown>
              if (!rec.id) rec.id = key
              return {
                ...(rec as unknown as FirebaseCheckinItem),
                isPrivate: true,
                spotId: spotId
              }
            })
          items.push(...spotItems)
        }
      }

      // 2. private_checkins (for private innsjekkinger på offentlige turposter)
      const privUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/private_checkins.json`
      const privRes = await fetchFirebase(privUrl)
      if (privRes.ok) {
        const privData = await privRes.json()
        if (privData && typeof privData === 'object') {
          for (const [key, item] of Object.entries(privData)) {
            if (item && typeof item === 'object') {
              const rec = item as Record<string, unknown>
              if (!rec.id) rec.id = key
              const chk = rec as unknown as FirebaseCheckinItem
              if (String(chk.turpostId) === String(spotId) && !items.some(c => c.id === chk.id)) {
                items.push({
                  ...chk,
                  isPrivate: true
                })
              }
            }
          }
        }
      }

      return items
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
      const cleanupFriendsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/friends_checkins/${encodeURIComponent(checkinId)}.json`
      const cleanupPrivateUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/private_checkins/${encodeURIComponent(checkinId)}.json`
      const cleanupLegacyUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/checkins/${encodeURIComponent(checkinId)}.json`
      const cleanupVisUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
      await Promise.all([
        fetchFirebase(url, { method: 'DELETE' }),
        fetchFirebase(cleanupFriendsUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(cleanupPrivateUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(cleanupLegacyUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(cleanupVisUrl, { method: 'DELETE' }).catch(() => {})
      ])
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
      trackId?: string | null
    }
  ): Promise<{ imageUrl?: string; description?: string; visibility?: 'all' | 'friends' | 'private'; trackId?: string }> {
    if (!userId || userId === 'guest' || !spotId || !checkinId) {
      throw new Error('Mangler parametre for oppdatering av privat innsjekking.')
    }
    const config = await getFirebaseConfig()
    if (!config) {
      throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')
    }

    const patchData: {
      description?: string
      imageUrl?: string
      visibility?: 'all' | 'friends' | 'private'
      trackId?: string
    } = {}
    if (params.description !== undefined) {
      patchData.description = params.description
    }
    if (params.visibility !== undefined) {
      patchData.visibility = params.visibility
    }
    if (params.trackId !== undefined) {
      patchData.trackId = params.trackId === null ? '' : params.trackId
    }

    if (params.imageFile || params.removeImage || params.trackId !== undefined) {
      const updateRes = await updatePublicCheckin({
        turpostId: spotId,
        checkinId,
        description: params.description,
        imageFile: params.imageFile,
        removeImage: params.removeImage,
        visibility: params.visibility,
        trackId: params.trackId
      })
      if (updateRes.imageUrl !== undefined) {
        patchData.imageUrl = updateRes.imageUrl
      }
    }

    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/my_spots_checkins/${encodeURIComponent(spotId)}/${encodeURIComponent(checkinId)}.json`
    const patchRes = await fetchFirebase(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    })

    if (params.visibility !== undefined) {
      const visUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
      await fetchFirebase(visUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params.visibility) })
    }

    if (!patchRes.ok) {
      throw new Error(`Kunne ikke oppdatere privat innsjekking (status ${patchRes.status})`)
    }

    return {
      imageUrl: patchData.imageUrl,
      description: patchData.description,
      visibility: params.visibility,
      trackId: patchData.trackId
    }
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
      const res = await fetchFirebase(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const checkins: FirebaseCheckinItem[] = []
      // Data kan være strukturert som { [spotId]: { [checkinId]: item } }
      for (const [spotId, spotVal] of Object.entries(data)) {
        if (!spotVal || typeof spotVal !== 'object') continue
        for (const item of Object.values(spotVal as Record<string, unknown>)) {
          if (item && typeof item === 'object' && (item as Record<string, unknown>).turpostId != null) {
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
    trackId?: string
  }): Promise<CheckinResult> {
    const config = await getFirebaseConfig()
    if (!config) {
      throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')
    }

    // Opprett innsjekk og lagre bildet i Google Drive via Apps Script.
    // Vi setter visibility: 'private' til submitCheckin så Apps Script/useAuth ikke oppretter offentlig turpost-/vennekopi.
    const appScriptResult = await submitCheckin({
      turpostId: String(params.post.id),
      turpostName: params.post.name,
      description: params.description || '',
      imageFile: params.imageFile || undefined,
      trackId: params.trackId || undefined,
      visibility: 'private'
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
      visibility,
      isPrivate: true,
      trackId: params.trackId || appScriptResult.trackId || undefined
    }

    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/my_spots_checkins/${encodeURIComponent(String(params.post.id))}/${checkinId}.json`
    const visUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
    const [res] = await Promise.all([
      fetchFirebase(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkinItem)
      }),
      fetchFirebase(visUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visibility)
      })
    ])

    if (!res.ok) {
      throw new Error(`Kunne ikke lagre privat innsjekking (status ${res.status})`)
    }

    // Apps Script synkroniserer automatisk alle innsjekkinger til offentlig turpost- og bruker-indeks.
    // For private turposter skal innsjekkingen kun ligge under my_spots_checkins; rydd derfor opp eventuelle andre noder:
    try {
      const cleanupTurpostUrl = `${config.dbUrl}/${config.prefix}/turposter/${encodeURIComponent(String(params.post.id))}/${checkinId}.json`
      const cleanupUserUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/checkins/${checkinId}.json`
      const cleanupLegacyUserUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/${checkinId}.json`
      const cleanupFriendsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/friends_checkins/${checkinId}.json`
      const cleanupPrivateUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(params.userId)}/private_checkins/${checkinId}.json`
      await Promise.all([
        fetchFirebase(cleanupTurpostUrl, { method: 'DELETE' }),
        fetchFirebase(cleanupUserUrl, { method: 'DELETE' }),
        fetchFirebase(cleanupFriendsUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(cleanupPrivateUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(cleanupLegacyUserUrl, { method: 'DELETE' }).catch(() => {})
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
      const res = await fetchFirebase(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const suggestions: SpotSuggestion[] = []
      for (const [id, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as SpotSuggestion
        // Admin skal kun se innkommende forslag som venter på vurdering
        if (item.status && item.status !== 'pending') continue
        suggestions.push({
          ...item,
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
   * Sletter eller arkiverer et innkommende forslag for admin (f.eks. ved godkjenning).
   */
  async function deleteSpotSuggestion(spotId: string): Promise<void> {
    const config = await getFirebaseConfig()
    if (!config) return

    try {
      const url = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(spotId)}.json`
      await fetchFirebase(url, { method: 'DELETE' })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke slette spot_suggestion:', err)
      throw err
    }
  }

  /**
   * Avviser et innkommende forslag for admin.
   * Setter status til 'denied' i spot_suggestions slik at brukeren fanger det opp
   * ved neste lesing og oppdaterer sin egen my_spots-oppføring.
   */
  async function denySpotSuggestion(spotId: string): Promise<void> {
    const config = await getFirebaseConfig()
    if (!config) return

    try {
      const url = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(spotId)}.json`
      await fetchFirebase(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'denied',
          deniedAt: new Date().toISOString()
        })
      })
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke avvise spot_suggestion:', err)
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

  /**
   * Godkjenner et innkommende forslag for admin:
   * 1. Lagrer turposten under /<prefix>/approved_spots/<spotId>.json
   * 2. Merker forslaget som 'approved' i /<prefix>/spot_suggestions/<spotId>.json
   */
  async function approveSpotSuggestion(
    suggestion: SpotSuggestion,
    approvedBy?: string
  ): Promise<void> {
    const config = await getFirebaseConfig()
    if (!config) throw new Error('Firebase-konfigurasjon er ikke tilgjengelig.')

    const nowIso = new Date().toISOString()
    const approvedItem: ApprovedSpot = {
      id: String(suggestion.id),
      name: suggestion.name,
      lat: suggestion.lat,
      lng: suggestion.lng,
      alt: suggestion.alt ?? null,
      fylke: suggestion.fylke || '',
      kommune: suggestion.kommune || '',
      csvLine: suggestion.csvLine || '',
      csvLineHint: suggestion.csvLineHint || '',
      ownerId: suggestion.userId || '',
      ownerName: suggestion.userName || suggestion.userEmail || '',
      approvedAt: nowIso,
      approvedBy: approvedBy || 'Admin',
      status: 'approved',
      exportedToCsv: false
    }

    // 0. Sørg for at innlogget admin er registrert i admins-noden i Firebase RTDB
    const currentFbUser = getCurrentFirebaseUser()
    if (currentFbUser?.uid) {
      await syncAdminStatus(currentFbUser.uid, true).catch(() => {})
    }

    // 1. Lagre i approved_spots
    const approvedUrl = `${config.dbUrl}/${config.prefix}/approved_spots/${encodeURIComponent(String(suggestion.id))}.json`
    const resApproved = await fetchFirebase(approvedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(approvedItem)
    })

    if (!resApproved.ok) {
      throw new Error(`Kunne ikke lagre godkjent turpost i Firebase (status ${resApproved.status})`)
    }

    // 2. Oppdater status i spot_suggestions til 'approved'
    const suggestionUrl = `${config.dbUrl}/${config.prefix}/spot_suggestions/${encodeURIComponent(String(suggestion.id))}.json`
    await fetchFirebase(suggestionUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        approvedAt: nowIso,
        approvedBy: approvedBy || 'Admin'
      })
    }).catch(() => {})
  }

  /**
   * Henter alle godkjente turposter:
   * /<prefix>/approved_spots.json
   */
  async function fetchApprovedSpots(): Promise<ApprovedSpot[]> {
    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/approved_spots.json`
      const res = await fetchFirebase(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!data || typeof data !== 'object') return []

      const list: ApprovedSpot[] = []
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
          csvLine: typeof item.csvLine === 'string' ? item.csvLine : '',
          csvLineHint: typeof item.csvLineHint === 'string' ? item.csvLineHint : '',
          ownerId: typeof item.ownerId === 'string' ? item.ownerId : '',
          ownerName: typeof item.ownerName === 'string' ? item.ownerName : '',
          approvedAt: typeof item.approvedAt === 'string' ? item.approvedAt : '',
          approvedBy: typeof item.approvedBy === 'string' ? item.approvedBy : '',
          status: (item.status as ApprovedSpot['status']) || 'approved',
          exportedToCsv: Boolean(item.exportedToCsv),
          exportedAt: typeof item.exportedAt === 'string' ? item.exportedAt : undefined
        })
      }

      return list
    } catch (err) {
      console.warn('[usePrivateTurposter] Kunne ikke hente approved_spots:', err)
      return []
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
    denySpotSuggestion,
    approveSpotSuggestion,
    fetchApprovedSpots,
    calculateCsvPlacement
  }
}


