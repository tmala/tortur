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
        list.push({
          userId: (val as any).userId || fId,
          userName: (val as any).userName || 'Venn',
          email: (val as any).email || (val as any).userEmail || '',
          avatarUrl: (val as any).avatarUrl || '',
          since: (val as any).since || ''
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
          incoming.push({
            fromUserId: (val as any).fromUserId || reqId,
            toUserId: (val as any).toUserId || userId,
            userName: (val as any).userName || 'Ukjent bruker',
            userAvatar: (val as any).userAvatar || '',
            userEmail: (val as any).userEmail || '',
            timestamp: (val as any).timestamp || ''
          })
        }
      }
    }

    const outgoing: FriendRequest[] = []
    if (data.outgoing && typeof data.outgoing === 'object') {
      for (const [targetId, val] of Object.entries(data.outgoing)) {
        if (val && typeof val === 'object') {
          outgoing.push({
            fromUserId: (val as any).fromUserId || userId,
            toUserId: (val as any).toUserId || targetId,
            userName: (val as any).userName || 'Ukjent bruker',
            userAvatar: (val as any).userAvatar || '',
            userEmail: (val as any).userEmail || '',
            timestamp: (val as any).timestamp || ''
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
    const allUsers: PublicUser[] = Object.values(data).filter(
      (u: any) => u && typeof u === 'object' && u.userId
    ) as PublicUser[]

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

    // 2. Patch også inn på selve sjekk-inn-objektene for rask lesing
    const jsonPatch = JSON.stringify({ visibility })

    if (opts?.isPrivate && opts?.userId && opts?.spotId) {
      const privateSpotUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(opts.userId)}/my_spots_checkins/${encodeURIComponent(String(opts.spotId))}/${encodeURIComponent(checkinId)}.json`
      await fetchFirebase(privateSpotUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPatch
      })
    } else {
      const promises: Promise<any>[] = []
      if (opts?.turpostId) {
        const turpostUrl = `${config.dbUrl}/${config.prefix}/turposter/${encodeURIComponent(String(opts.turpostId))}/${encodeURIComponent(checkinId)}.json`
        promises.push(
          fetchFirebase(turpostUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: jsonPatch
          })
        )
      }
      if (opts?.userId) {
        const userUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(opts.userId)}/checkins/${encodeURIComponent(checkinId)}.json`
        promises.push(
          fetchFirebase(userUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: jsonPatch
          })
        )
      }
      if (promises.length > 0) {
        await Promise.all(promises)
      }
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

const RESERVED_USER_SUBKEYS = new Set([
  'checkins',
  'my_spots',
  'my_spots_checkins',
  'tracks',
  'friends',
  'friend_requests',
  'settings'
])

/**
 * Henter innsjekkinger for en gitt venn fra Firebase.
 * Filtrerer ut private innsjekkinger (visibility: 'private' eller spot_).
 * Viser 'all' og 'friends' innsjekkinger.
 */
export async function fetchFriendCheckins(friendUserId: string): Promise<FirebaseCheckinItem[]> {
  if (!friendUserId) return []
  const config = await getFirebaseConfig()
  if (!config) return []

  try {
    const checkinMap = new Map<string, FirebaseCheckinItem>()

    // 1. Hent fra /checkins/
    const checkinsUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(friendUserId)}/checkins.json`
    const res = await fetchFirebase(checkinsUrl)
    if (res.ok) {
      const rawData = await res.json()
      if (rawData && typeof rawData === 'object') {
        for (const [key, val] of Object.entries(rawData)) {
          if (val && typeof val === 'object') {
            const item = { ...(val as any), id: (val as any).id || key }
            checkinMap.set(key, item)
          }
        }
      }
    }

    // 2. Hent også fra rotnivå (hvis vennen har legacy innsjekkinger som ikke er flyttet enda)
    const rootUrl = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(friendUserId)}.json`
    const rootRes = await fetchFirebase(rootUrl)
    if (rootRes.ok) {
      const rootData = await rootRes.json()
      if (rootData && typeof rootData === 'object') {
        for (const [key, val] of Object.entries(rootData)) {
          if (RESERVED_USER_SUBKEYS.has(key)) continue
          if (val && typeof val === 'object') {
            const existing = checkinMap.get(key)
            if (existing) {
              checkinMap.set(key, {
                ...val,
                ...existing,
                id: existing.id || (val as any).id || key,
                likes: existing.likes || (val as any).likes,
                comments: existing.comments || (val as any).comments
              })
            } else {
              checkinMap.set(key, { ...(val as any), id: (val as any).id || key })
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
    await Promise.all(
      filtered.map(async (item) => {
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
    fetchFriendCheckins
  }
}
