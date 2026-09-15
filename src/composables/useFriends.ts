import { ref, computed } from 'vue'
import { getFirebaseConfig, fetchFirebase, type GoogleUser, type FirebaseCheckinItem } from './useAuth'

export type CheckinVisibility = 'all' | 'friends' | 'private'

export interface FriendUser {
  userId: string
  userName: string
  email?: string
  avatarUrl?: string
  since?: string
}

export interface FriendRequest {
  fromUserId: string
  toUserId: string
  userName: string
  userAvatar?: string
  userEmail?: string
  timestamp: string
}

export interface PublicUser {
  userId: string
  userName: string
  email?: string
  avatarUrl?: string
  lastSeen?: string
}

const STORAGE_KEY_VISIBILITY = 'tortur_default_visibility'

// Singleton state på tvers av komponenter
const friends = ref<FriendUser[]>([])
const incomingRequests = ref<FriendRequest[]>([])
const outgoingRequests = ref<FriendRequest[]>([])
const defaultVisibility = ref<CheckinVisibility>('all')
const isLoading = ref(false)
const error = ref<string | null>(null)

// Gjenopprett standard synlighet fra localStorage hvis tilgjengelig
try {
  const savedVis = localStorage.getItem(STORAGE_KEY_VISIBILITY) as CheckinVisibility | null
  if (savedVis && ['all', 'friends', 'private'].includes(savedVis)) {
    defaultVisibility.value = savedVis
  }
} catch {
  // Ignorer
}

/**
 * Registrerer eller oppdaterer brukerens offentlige profil i Firebase
 * /users_public/<userId>.json for søk og venneforespørsler
 */
export async function registerPublicUser(googleUser: GoogleUser): Promise<void> {
  if (!googleUser || !googleUser.userId || googleUser.userId === 'guest') return
  const config = await getFirebaseConfig()
  if (!config) return

  try {
    const publicData: PublicUser = {
      userId: googleUser.userId,
      userName: googleUser.userName || 'Ukjent turgåer',
      email: googleUser.email || '',
      avatarUrl: googleUser.avatarUrl || '',
      lastSeen: new Date().toISOString()
    }
    const url = `${config.dbUrl}/${config.prefix}/users_public/${encodeURIComponent(googleUser.userId)}.json`
    await fetchFirebase(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publicData)
    })
  } catch (err) {
    console.warn('[useFriends] Kunne ikke registrere public user:', err)
  }
}

/**
 * Henter alle venner for innlogget bruker
 */
export async function loadFriends(userId: string): Promise<FriendUser[]> {
  if (!userId || userId === 'guest') {
    friends.value = []
    return []
  }
  const config = await getFirebaseConfig()
  if (!config) return []

  try {
    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/friends.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data || typeof data !== 'object') {
      friends.value = []
      return []
    }

    const list: FriendUser[] = []
    for (const [fId, val] of Object.entries(data)) {
      if (!val) continue
      if (typeof val === 'object') {
        const item = val as Record<string, unknown>
        list.push({
          userId: (typeof item.userId === 'string' ? item.userId : '') || fId,
          userName: (typeof item.userName === 'string' ? item.userName : '') || 'Venn',
          email: (typeof item.email === 'string' ? item.email : '') || (typeof item.userEmail === 'string' ? item.userEmail : '') || '',
          avatarUrl: (typeof item.avatarUrl === 'string' ? item.avatarUrl : '') || '',
          since: (typeof item.since === 'string' ? item.since : '') || ''
        })
      } else if (val === true) {
        list.push({
          userId: fId,
          userName: 'Venn'
        })
      }
    }
    friends.value = list
    return list
  } catch (err) {
    console.warn('[useFriends] Feil ved henting av venner:', err)
    return []
  }
}

/**
 * Henter innkommende og utgående venneforespørsler
 */
export async function loadFriendRequests(userId: string): Promise<{
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}> {
  if (!userId || userId === 'guest') {
    incomingRequests.value = []
    outgoingRequests.value = []
    return { incoming: [], outgoing: [] }
  }
  const config = await getFirebaseConfig()
  if (!config) return { incoming: [], outgoing: [] }

  try {
    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/friend_requests.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return { incoming: [], outgoing: [] }
    const data = await res.json()
    if (!data || typeof data !== 'object') {
      incomingRequests.value = []
      outgoingRequests.value = []
      return { incoming: [], outgoing: [] }
    }

    const incoming: FriendRequest[] = []
    if (data.incoming && typeof data.incoming === 'object') {
      for (const [reqId, val] of Object.entries(data.incoming)) {
        if (val && typeof val === 'object') {
          const item = val as Record<string, unknown>
          incoming.push({
            fromUserId: (typeof item.fromUserId === 'string' ? item.fromUserId : '') || reqId,
            toUserId: (typeof item.toUserId === 'string' ? item.toUserId : '') || userId,
            userName: (typeof item.userName === 'string' ? item.userName : '') || 'Ukjent bruker',
            userAvatar: (typeof item.userAvatar === 'string' ? item.userAvatar : '') || '',
            userEmail: (typeof item.userEmail === 'string' ? item.userEmail : '') || '',
            timestamp: (typeof item.timestamp === 'string' ? item.timestamp : '') || ''
          })
        }
      }
    }

    const outgoing: FriendRequest[] = []
    if (data.outgoing && typeof data.outgoing === 'object') {
      for (const [targetId, val] of Object.entries(data.outgoing)) {
        if (val && typeof val === 'object') {
          const item = val as Record<string, unknown>
          outgoing.push({
            fromUserId: (typeof item.fromUserId === 'string' ? item.fromUserId : '') || userId,
            toUserId: (typeof item.toUserId === 'string' ? item.toUserId : '') || targetId,
            userName: (typeof item.userName === 'string' ? item.userName : '') || 'Ukjent bruker',
            userAvatar: (typeof item.userAvatar === 'string' ? item.userAvatar : '') || '',
            userEmail: (typeof item.userEmail === 'string' ? item.userEmail : '') || '',
            timestamp: (typeof item.timestamp === 'string' ? item.timestamp : '') || ''
          })
        }
      }
    }

    incomingRequests.value = incoming
    outgoingRequests.value = outgoing
    return { incoming, outgoing }
  } catch (err) {
    console.warn('[useFriends] Feil ved henting av forespørsler:', err)
    return { incoming: [], outgoing: [] }
  }
}

/**
 * Sender en venneforespørsel til en annen bruker
 */
export async function sendFriendRequest(
  currentUser: GoogleUser,
  targetUser: PublicUser
): Promise<void> {
  if (!currentUser?.userId || !targetUser?.userId) {
    throw new Error('Mangler brukerdata for venneforespørsel.')
  }
  if (currentUser.userId === targetUser.userId) {
    throw new Error('Du kan ikke sende venneforespørsel til deg selv.')
  }
  const config = await getFirebaseConfig()
  if (!config) {
    throw new Error('Firebase er ikke konfigurert.')
  }

  const timestamp = new Date().toISOString()

  // 1. Skriv til målbrukerens innkommende forespørsler
  const incomingReq: FriendRequest = {
    fromUserId: currentUser.userId,
    toUserId: targetUser.userId,
    userName: currentUser.userName || 'Turgåer',
    userAvatar: currentUser.avatarUrl || '',
    userEmail: currentUser.email || '',
    timestamp
  }
  const incomingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(targetUser.userId)}/friend_requests/incoming/${encodeURIComponent(currentUser.userId)}.json`

  // 2. Skriv til innlogget brukers utgående forespørsler
  const outgoingReq: FriendRequest = {
    fromUserId: currentUser.userId,
    toUserId: targetUser.userId,
    userName: targetUser.userName || 'Turgåer',
    userAvatar: targetUser.avatarUrl || '',
    userEmail: targetUser.email || '',
    timestamp
  }
  const outgoingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUser.userId)}/friend_requests/outgoing/${encodeURIComponent(targetUser.userId)}.json`

  const [resIn, resOut] = await Promise.all([
    fetchFirebase(incomingUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incomingReq)
    }),
    fetchFirebase(outgoingUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoingReq)
    })
  ])

  if (!resIn.ok || !resOut.ok) {
    throw new Error('Kunne ikke sende venneforespørsel. Prøv igjen.')
  }

  // Oppdater lokal tilstand
  outgoingRequests.value = [
    ...outgoingRequests.value.filter(r => r.toUserId !== targetUser.userId),
    outgoingReq
  ]
}

/**
 * Godtar en innkommende venneforespørsel
 */
export async function acceptFriendRequest(
  currentUser: GoogleUser,
  request: FriendRequest
): Promise<void> {
  if (!currentUser?.userId || !request?.fromUserId) {
    throw new Error('Ugyldig forespørsel.')
  }
  const config = await getFirebaseConfig()
  if (!config) throw new Error('Firebase ikke tilgjengelig.')

  const now = new Date().toISOString()

  // 1. Legg til som venn hos innlogget bruker
  const myFriendData: FriendUser = {
    userId: request.fromUserId,
    userName: request.userName || 'Turgåer',
    avatarUrl: request.userAvatar || '',
    email: request.userEmail || '',
    since: now
  }
  const myFriendUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUser.userId)}/friends/${encodeURIComponent(request.fromUserId)}.json`

  // 2. Legg til som venn hos avsenderen
  const theirFriendData: FriendUser = {
    userId: currentUser.userId,
    userName: currentUser.userName || 'Turgåer',
    avatarUrl: currentUser.avatarUrl || '',
    email: currentUser.email || '',
    since: now
  }
  const theirFriendUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(request.fromUserId)}/friends/${encodeURIComponent(currentUser.userId)}.json`

  // 3. Slett fra begge forespørselsnoder
  const delIncomingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUser.userId)}/friend_requests/incoming/${encodeURIComponent(request.fromUserId)}.json`
  const delOutgoingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(request.fromUserId)}/friend_requests/outgoing/${encodeURIComponent(currentUser.userId)}.json`

  await Promise.all([
    fetchFirebase(myFriendUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(myFriendData)
    }),
    fetchFirebase(theirFriendUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(theirFriendData)
    }),
    fetchFirebase(delIncomingUrl, { method: 'DELETE' }),
    fetchFirebase(delOutgoingUrl, { method: 'DELETE' })
  ])

  // Oppdater lister
  await Promise.all([
    loadFriends(currentUser.userId),
    loadFriendRequests(currentUser.userId)
  ])
}

/**
 * Avviser en innkommende venneforespørsel
 */
export async function rejectFriendRequest(
  currentUserId: string,
  senderUserId: string
): Promise<void> {
  const config = await getFirebaseConfig()
  if (!config) return

  const delIncomingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUserId)}/friend_requests/incoming/${encodeURIComponent(senderUserId)}.json`
  const delOutgoingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(senderUserId)}/friend_requests/outgoing/${encodeURIComponent(currentUserId)}.json`

  await Promise.all([
    fetchFirebase(delIncomingUrl, { method: 'DELETE' }),
    fetchFirebase(delOutgoingUrl, { method: 'DELETE' })
  ])

  incomingRequests.value = incomingRequests.value.filter(r => r.fromUserId !== senderUserId)
}

/**
 * Avbryter en utgående venneforespørsel
 */
export async function cancelFriendRequest(
  currentUserId: string,
  targetUserId: string
): Promise<void> {
  const config = await getFirebaseConfig()
  if (!config) return

  const delIncomingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(targetUserId)}/friend_requests/incoming/${encodeURIComponent(currentUserId)}.json`
  const delOutgoingUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUserId)}/friend_requests/outgoing/${encodeURIComponent(targetUserId)}.json`

  await Promise.all([
    fetchFirebase(delIncomingUrl, { method: 'DELETE' }),
    fetchFirebase(delOutgoingUrl, { method: 'DELETE' })
  ])

  outgoingRequests.value = outgoingRequests.value.filter(r => r.toUserId !== targetUserId)
}

/**
 * Avslutter et vennskap (fjerner fra begges venneliste)
 */
export async function removeFriend(
  currentUserId: string,
  friendUserId: string
): Promise<void> {
  const config = await getFirebaseConfig()
  if (!config) return

  const urlA = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(currentUserId)}/friends/${encodeURIComponent(friendUserId)}.json`
  const urlB = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(friendUserId)}/friends/${encodeURIComponent(currentUserId)}.json`

  await Promise.all([
    fetchFirebase(urlA, { method: 'DELETE' }),
    fetchFirebase(urlB, { method: 'DELETE' })
  ])

  friends.value = friends.value.filter(f => f.userId !== friendUserId)
}

/**
 * Søker etter offentlige brukere i Firebase users_public
 */
export async function searchPublicUsers(query: string = ''): Promise<PublicUser[]> {
  const config = await getFirebaseConfig()
  if (!config) return []

  try {
    const url = `${config.dbUrl}/${config.prefix}/users_public.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data || typeof data !== 'object') return []

    const q = query.trim().toLowerCase()
    const allUsers: PublicUser[] = (Object.values(data) as unknown[]).filter(
      (u): u is PublicUser => Boolean(u && typeof u === 'object' && 'userId' in u && (u as Record<string, unknown>).userId)
    )

    if (!q) return allUsers

    return allUsers.filter(u => {
      const name = (u.userName || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  } catch (err) {
    console.warn('[useFriends] Kunne ikke søke etter brukere:', err)
    return []
  }
}

/**
 * Henter innlogget brukers standard synlighetsinnstilling
 */
export async function loadDefaultVisibility(userId: string): Promise<CheckinVisibility> {
  if (!userId || userId === 'guest') return 'all'
  const config = await getFirebaseConfig()
  if (!config) return defaultVisibility.value

  try {
    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/settings/defaultVisibility.json`
    const res = await fetchFirebase(url)
    if (res.ok) {
      const data = await res.json()
      if (data && ['all', 'friends', 'private'].includes(data)) {
        defaultVisibility.value = data
        try {
          localStorage.setItem(STORAGE_KEY_VISIBILITY, data)
        } catch {
          // Ignorer
        }
      }
    }
  } catch (err) {
    console.warn('[useFriends] Kunne ikke hente defaultVisibility:', err)
  }
  return defaultVisibility.value
}

/**
 * Lagrer ny standard synlighetsinnstilling
 */
export async function setDefaultVisibility(
  userId: string,
  visibility: CheckinVisibility
): Promise<void> {
  defaultVisibility.value = visibility
  try {
    localStorage.setItem(STORAGE_KEY_VISIBILITY, visibility)
  } catch {
    // Ignorer
  }

  if (!userId || userId === 'guest') return
  const config = await getFirebaseConfig()
  if (!config) return

  try {
    const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/settings/defaultVisibility.json`
    await fetchFirebase(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visibility)
    })
  } catch (err) {
    console.warn('[useFriends] Kunne ikke lagre defaultVisibility:', err)
  }
}

/**
 * Lagrer eller oppdaterer synlighet for en spesifikk innsjekking
 */
export async function setCheckinVisibility(
  checkinId: string,
  visibility: CheckinVisibility,
  opts?: {
    turpostId?: string | number
    userId?: string
    spotId?: string
    isPrivate?: boolean
  }
): Promise<void> {
  if (!checkinId) return
  const config = await getFirebaseConfig()
  if (!config) return

  try {
    // 1. Lagre i dedikert indeks checkins_visibility/<checkinId>.json
    const visUrl = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
    const patchBody = JSON.stringify(visibility)
    await fetchFirebase(visUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: patchBody
    })

    // 2. Patch eller flytt til rett node basert på synlighet
    const jsonPatch = JSON.stringify({ visibility })

    if (opts?.isPrivate && opts?.userId && opts?.spotId) {
      const privateSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(opts.userId)}/my_spots_checkins/${encodeURIComponent(String(opts.spotId))}/${encodeURIComponent(checkinId)}.json`
      await fetchFirebase(privateSpotUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPatch
      })
    } else if (opts?.userId) {
      const uId = opts.userId
      const turpostUrl = opts.turpostId ? `${config.dbUrl}/${config.prefix}/turposter/${encodeURIComponent(String(opts.turpostId))}/${encodeURIComponent(checkinId)}.json` : null
      const friendsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(uId)}/friends_checkins/${encodeURIComponent(checkinId)}.json`
      const privateUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(uId)}/private_checkins/${encodeURIComponent(checkinId)}.json`
      const legacyCheckinsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(uId)}/checkins/${encodeURIComponent(checkinId)}.json`

      const promises: Promise<unknown>[] = []

      if (visibility === 'private') {
        let itemToSave: FirebaseCheckinItem | null = null
        const r1 = await fetchFirebase(friendsUrl)
        if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
        if (!itemToSave) {
          const r2 = await fetchFirebase(legacyCheckinsUrl)
          if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
        }
        if (itemToSave) {
          itemToSave.visibility = 'private'
          promises.push(fetchFirebase(privateUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemToSave) }))
        } else {
          promises.push(fetchFirebase(privateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonPatch }))
        }
        promises.push(fetchFirebase(friendsUrl, { method: 'DELETE' }).catch(() => {}))
        promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
        if (turpostUrl) promises.push(fetchFirebase(turpostUrl, { method: 'DELETE' }).catch(() => {}))
      } else if (visibility === 'friends') {
        let itemToSave: FirebaseCheckinItem | null = null
        const r1 = await fetchFirebase(privateUrl)
        if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
        if (!itemToSave) {
          const r2 = await fetchFirebase(legacyCheckinsUrl)
          if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
        }
        if (itemToSave) {
          itemToSave.visibility = 'friends'
          promises.push(fetchFirebase(friendsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemToSave) }))
          promises.push(fetchFirebase(privateUrl, { method: 'DELETE' }).catch(() => {}))
        } else {
          promises.push(fetchFirebase(friendsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonPatch }))
        }
        promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
        if (turpostUrl) promises.push(fetchFirebase(turpostUrl, { method: 'DELETE' }).catch(() => {}))
      } else if (visibility === 'all') {
        let itemToSave: FirebaseCheckinItem | null = null
        const r1 = await fetchFirebase(privateUrl)
        if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
        if (!itemToSave) {
          const r2 = await fetchFirebase(legacyCheckinsUrl)
          if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
        }
        if (itemToSave) {
          itemToSave.visibility = 'all'
          const itemJson = JSON.stringify(itemToSave)
          promises.push(fetchFirebase(friendsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))
          if (turpostUrl) promises.push(fetchFirebase(turpostUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))
          promises.push(fetchFirebase(privateUrl, { method: 'DELETE' }).catch(() => {}))
        } else {
          promises.push(fetchFirebase(friendsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonPatch }))
          if (turpostUrl) promises.push(fetchFirebase(turpostUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonPatch }))
        }
        promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
      clearFriendsCheckinsCache()
    }
  } catch (err) {
    console.warn('[useFriends] Kunne ikke lagre innsjekk-synlighet:', err)
  }
}

/**
 * Henter synlighet for en innsjekking
 */
export async function getCheckinVisibility(checkinId: string): Promise<CheckinVisibility> {
  const config = await getFirebaseConfig()
  if (!config || !checkinId) return 'all'

  try {
    const url = `${config.dbUrl}/${config.prefix}/checkins_visibility/${encodeURIComponent(checkinId)}.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return 'all'
    const data = await res.json()
    if (data && ['all', 'friends', 'private'].includes(data)) {
      return data as CheckinVisibility
    }
    return 'all'
  } catch {
    return 'all'
  }
}

/**
 * Henter innsjekkinger for en gitt venn fra Firebase.
 * Henter primært fra /friends_checkins/ (med fallback til /checkins/).
 * Filtrerer ut eventuelle private innsjekkinger som forsvar.
 */
export async function fetchFriendCheckins(
  friendUserId: string,
  options?: { enrichTurposts?: boolean; targetTurpostId?: string | number }
): Promise<FirebaseCheckinItem[]> {
  if (!friendUserId || friendUserId === 'guest') return []
  const config = await getFirebaseConfig()
  if (!config) return []

  try {
    const checkinMap = new Map<string, FirebaseCheckinItem>()

    // 1. Hent fra friends_checkins.json (delte turer)
    const friendsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(friendUserId)}/friends_checkins.json`
    const friendsRes = await fetchFirebase(friendsUrl)
    if (friendsRes.ok) {
      const data = (await friendsRes.json()) as Record<string, Record<string, unknown>> | null
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object') {
            const item = { ...val, id: (val.id as string) || key } as unknown as FirebaseCheckinItem
            checkinMap.set(key, item)
          }
        }
      }
    }

    // 2. Hvis friends_checkins var tom, prøv fallback til legacy checkins.json
    if (checkinMap.size === 0) {
      const legacyUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(friendUserId)}/checkins.json`
      const legacyRes = await fetchFirebase(legacyUrl)
      if (legacyRes.ok) {
        const rawData = (await legacyRes.json()) as Record<string, Record<string, unknown>> | null
        if (rawData && typeof rawData === 'object') {
          for (const [key, val] of Object.entries(rawData)) {
            if (val && typeof val === 'object') {
              const item = { ...val, id: (val.id as string) || key } as unknown as FirebaseCheckinItem
              checkinMap.set(key, item)
            }
          }
        }
      }
    }

    // 3. Samle innsjekkinger med turpostId og sørg for at userId er satt
    const items: FirebaseCheckinItem[] = []
    for (const item of checkinMap.values()) {
      if (item.turpostId != null) {
        if (!item.userId) item.userId = friendUserId
        items.push(item)
      }
    }

    // 4. Filtrer basert på synlighet og type:
    // - Utelat private innsjekkinger (visibility: 'private')
    // - Utelat private spots (turpostId starter med 'spot_' eller isPrivate: true)
    // - Ta med 'friends', 'all', eller uspesifisert synlighet (standard offentlig)
    const filtered = items.filter(c => {
      if (c.isPrivate || (c.turpostId && String(c.turpostId).startsWith('spot_'))) return false
      const vis = c.visibility || 'all'
      return vis !== 'private'
    })

    // 5. Hent ferske reaksjoner og kommentarer direkte fra turpost-noden i Firebase
    // Slik at likes/kommentarer lagt inn på turposten alltid vises i venneprofilen
    // For optimal ytelse berikes kun relevante turposter hvis targetTurpostId er angitt.
    const shouldEnrich = options?.enrichTurposts !== false
    const targetTurpostIdStr = options?.targetTurpostId != null ? String(options.targetTurpostId) : null

    if (shouldEnrich) {
      const itemsToEnrich = targetTurpostIdStr
        ? filtered.filter(item => String(item.turpostId) === targetTurpostIdStr)
        : filtered

      await Promise.all(
        itemsToEnrich.map(async (item) => {
          if (!item.turpostId || item.isPrivate) return
          try {
            const turpostUrl = `${config.dbUrl}/${config.prefix}/turposter/${encodeURIComponent(String(item.turpostId))}/${encodeURIComponent(item.id)}.json`
            const tpRes = await fetchFirebase(turpostUrl)
            if (tpRes.ok) {
              const tpData = await tpRes.json()
              if (tpData && typeof tpData === 'object') {
                if (tpData.likes) {
                  item.likes = { ...(item.likes || {}), ...tpData.likes }
                }
                if (tpData.comments) {
                  item.comments = { ...(item.comments || {}), ...tpData.comments }
                }
                if (!item.turpostName && tpData.turpostName) {
                  item.turpostName = tpData.turpostName
                }
              }
            }
          } catch {
            // Ignorer nettverksfeil per post
          }
        })
      )
    }

    // Sorter nyeste først
    return filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime()
      const timeB = new Date(b.timestamp || 0).getTime()
      return timeB - timeA
    })
  } catch (err) {
    console.warn('[useFriends] Kunne ikke hente vennens innsjekkinger:', err)
    return []
  }
}

interface CachedFriendCheckins {
  checkins: FirebaseCheckinItem[]
  fetchedAt: number
}

const friendCheckinsCache = new Map<string, CachedFriendCheckins>()
const FRIEND_CHECKINS_CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutter

/**
 * Tømmer hurtigbufferet for venners innsjekkinger (f.eks. ved endring av venner eller synlighet).
 */
export function clearFriendsCheckinsCache(): void {
  friendCheckinsCache.clear()
}

/**
 * Henter innsjekkinger for en venn, med minne-cache for å unngå gjentatte REST-kall.
 */
export async function fetchCachedFriendCheckins(
  friendUserId: string,
  forceRefresh = false,
  targetTurpostId?: string | number
): Promise<FirebaseCheckinItem[]> {
  const now = Date.now()
  const cached = friendCheckinsCache.get(friendUserId)
  if (!forceRefresh && cached && now - cached.fetchedAt < FRIEND_CHECKINS_CACHE_TTL_MS) {
    return cached.checkins
  }
  const checkins = await fetchFriendCheckins(friendUserId, { targetTurpostId })
  friendCheckinsCache.set(friendUserId, { checkins, fetchedAt: now })
  return checkins
}

/**
 * Henter alle innsjekkinger fra brukerens venner for en spesifikk turpost.
 * Bruker minne-cache så oppslag mot venners noder ikke gjentas for hver turpost.
 */
export async function fetchFriendsCheckinsForTurpost(
  turpostId: string | number,
  friendUserIds?: string[]
): Promise<FirebaseCheckinItem[]> {
  if (!turpostId) return []

  const targetIds = friendUserIds && friendUserIds.length > 0
    ? friendUserIds
    : friends.value.map(f => f.userId)

  if (!targetIds || targetIds.length === 0) return []

  const targetStr = String(turpostId)
  const results = await Promise.all(
    targetIds.map(fId => fetchCachedFriendCheckins(fId, false, targetStr))
  )

  const matching: FirebaseCheckinItem[] = []
  for (const list of results) {
    for (const c of list) {
      if (String(c.turpostId) === targetStr) {
        matching.push(c)
      }
    }
  }

  return matching
}

export function useFriends() {
  const friendUserIds = computed(() => new Set(friends.value.map(f => f.userId)))
  const hasPendingRequests = computed(() => incomingRequests.value.length > 0)

  function isFriend(targetUserId: string): boolean {
    return friendUserIds.value.has(targetUserId)
  }

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    defaultVisibility,
    isLoading,
    error,
    friendUserIds,
    hasPendingRequests,
    isFriend,
    registerPublicUser,
    loadFriends,
    loadFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
    searchPublicUsers,
    loadDefaultVisibility,
    setDefaultVisibility,
    setCheckinVisibility,
    getCheckinVisibility,
    fetchFriendCheckins,
    fetchFriendsCheckinsForTurpost,
    clearFriendsCheckinsCache
  }
}
