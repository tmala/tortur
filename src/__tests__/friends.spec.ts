import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useFriends, registerPublicUser, searchPublicUsers, fetchFriendCheckins, fetchFriendsCheckinsForTurpost, clearFriendsCheckinsCache, type CheckinVisibility, type FriendUser, type FriendRequest } from '../composables/useFriends'
import * as friendsModule from '../composables/useFriends'
import { setCachedMountainsListForTest, setCachedApprovedSpotsForTest } from '../composables/useTurposter'
import { useAuth } from '../composables/useAuth'
import FriendProfileMenu from '../components/FriendProfileMenu.vue'
import FriendSearchTab from '../components/friends/FriendSearchTab.vue'

describe('useFriends - Friends system and check-in visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setCachedMountainsListForTest(null)
    setCachedApprovedSpotsForTest(null)
  })

  it('registerPublicUser updates users_public node in Firebase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    await registerPublicUser({
      userId: 'user_123',
      userName: 'Ola Nordmann',
      email: 'ola@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      lastLogin: '2026-09-11T10:00:00Z'
    })

    const call = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/users_public/user_123.json') && c[1]?.method === 'PUT'
    )
    expect(call).toBeDefined()
    const body = JSON.parse(call![1]?.body as string)
    expect(body.userId).toBe('user_123')
    expect(body.userName).toBe('Ola Nordmann')
    expect(body.email).toBe('ola@example.com')
  })

  it('loadFriends loads friends correctly into state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/brukere/user_me/friends.json')) {
        return {
          ok: true,
          json: async () => ({
            friend_1: {
              userId: 'friend_1',
              userName: 'Kari Turgåer',
              avatarUrl: '',
              since: '2026-09-01T12:00:00Z'
            }
          })
        } as unknown as Response
      }
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { friends, loadFriends, isFriend } = useFriends()
    const list = await loadFriends('user_me')
    expect(list.length).toBe(1)
    expect(list[0]!.userId).toBe('friend_1')
    expect(list[0]!.userName).toBe('Kari Turgåer')
    expect(friends.value.length).toBe(1)
    expect(isFriend('friend_1')).toBe(true)
    expect(isFriend('stranger')).toBe(false)
  })

  it('sendFriendRequest puts incoming for target and outgoing for current user', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { sendFriendRequest, outgoingRequests } = useFriends()

    await sendFriendRequest(
      {
        userId: 'user_a',
        userName: 'User A',
        email: 'a@example.com',
        avatarUrl: '',
        lastLogin: ''
      },
      {
        userId: 'user_b',
        userName: 'User B',
        email: 'b@example.com'
      }
    )

    // Check incoming request for target
    const incomingCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_b/friend_requests/incoming/user_a.json') && c[1]?.method === 'PUT'
    )
    expect(incomingCall).toBeDefined()
    const incBody = JSON.parse(incomingCall![1]?.body as string)
    expect(incBody.fromUserId).toBe('user_a')
    expect(incBody.toUserId).toBe('user_b')

    // Check outgoing request for sender
    const outgoingCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_a/friend_requests/outgoing/user_b.json') && c[1]?.method === 'PUT'
    )
    expect(outgoingCall).toBeDefined()
    expect(outgoingRequests.value.some(r => r.toUserId === 'user_b')).toBe(true)
  })

  it('acceptFriendRequest puts friend in both users and deletes requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { acceptFriendRequest } = useFriends()

    await acceptFriendRequest(
      {
        userId: 'user_b',
        userName: 'User B',
        email: 'b@example.com',
        avatarUrl: '',
        lastLogin: ''
      },
      {
        fromUserId: 'user_a',
        toUserId: 'user_b',
        userName: 'User A',
        timestamp: '2026-09-11T10:00:00Z'
      }
    )

    // Check friend added to user_b
    const friendBCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_b/friends/user_a.json') && c[1]?.method === 'PUT'
    )
    expect(friendBCall).toBeDefined()

    // Check friend added to user_a
    const friendACall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_a/friends/user_b.json') && c[1]?.method === 'PUT'
    )
    expect(friendACall).toBeDefined()

    // Check requests deleted
    const delIncoming = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_b/friend_requests/incoming/user_a.json') && c[1]?.method === 'DELETE'
    )
    expect(delIncoming).toBeDefined()

    const delOutgoing = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_a/friend_requests/outgoing/user_b.json') && c[1]?.method === 'DELETE'
    )
    expect(delOutgoing).toBeDefined()
  })

  it('searchPublicUsers filters users by name case-insensitively and ignores email', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/users_public.json')) {
        return {
          ok: true,
          json: async () => ({
            u1: { userId: 'u1', userName: 'Per Hansen', email: 'per@test.no' },
            u2: { userId: 'u2', userName: 'Kari Nordmann', email: 'kari@fjord.no' },
            u3: { userId: 'u3', userName: 'Ola Hansen', email: 'ola@test.no' }
          })
        } as unknown as Response
      }
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const res1 = await searchPublicUsers('hansen')
    expect(res1.length).toBe(2)
    expect(res1.map(u => u.userName)).toContain('Per Hansen')
    expect(res1.map(u => u.userName)).toContain('Ola Hansen')

    // Skal ikke matche på e-post
    const resEmail = await searchPublicUsers('fjord.no')
    expect(resEmail.length).toBe(0)

    const res2 = await searchPublicUsers('nordmann')
    expect(res2.length).toBe(1)
    expect(res2[0]!.userName).toBe('Kari Nordmann')
  })

  it('setDefaultVisibility and loadDefaultVisibility persist visibility settings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => 'friends' } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { setDefaultVisibility, loadDefaultVisibility, defaultVisibility } = useFriends()

    await setDefaultVisibility('user_me', 'friends')
    expect(defaultVisibility.value).toBe('friends')
    expect(localStorage.getItem('tortur_default_visibility')).toBe('friends')

    const saveCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_me/settings/defaultVisibility.json') && c[1]?.method === 'PUT'
    )
    expect(saveCall).toBeDefined()

    const loaded = await loadDefaultVisibility('user_me')
    expect(loaded).toBe('friends')
  })

  it('setCheckinVisibility writes to checkins_visibility, private_checkins and deletes from turposter when private', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => ({ id: 'c_999', turpostId: 'tp_50' }) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { setCheckinVisibility } = useFriends()

    await setCheckinVisibility('c_999', 'private', {
      turpostId: 'tp_50',
      userId: 'user_me'
    })

    // checkins_visibility/<id>.json PUT
    const visCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/checkins_visibility/c_999.json') && c[1]?.method === 'PUT'
    )
    expect(visCall).toBeDefined()

    // private_checkins/c_999.json
    const privCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_me/private_checkins/c_999.json')
    )
    expect(privCall).toBeDefined()

    // turposter/tp_50/c_999.json DELETE (skal slettes fra turpost når den er privat)
    const tpCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/tp_50/c_999.json') && c[1]?.method === 'DELETE'
    )
    expect(tpCall).toBeDefined()
  })

  it('setCheckinVisibility for private spots oppdaterer my_spots_checkins og sletter eventuelle kopier i friends_checkins', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { setCheckinVisibility } = useFriends()

    await setCheckinVisibility('c_tom_1', 'friends', {
      spotId: '72f2bfcde003ba545b3b6748',
      userId: 'user_tom',
      isPrivate: true
    })

    // my_spots_checkins PATCH
    const patchCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_tom/my_spots_checkins/72f2bfcde003ba545b3b6748/c_tom_1.json') && c[1]?.method === 'PATCH'
    )
    expect(patchCall).toBeDefined()

    // friends_checkins DELETE (skal slettes for å unngå lekkasje)
    const deleteFriendsCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_tom/friends_checkins/c_tom_1.json') && c[1]?.method === 'DELETE'
    )
    expect(deleteFriendsCall).toBeDefined()
  })

  it('fetchFriendCheckins henter vennens innsjekkinger og ekskluderer private', async () => {
    const friendCheckinsData: Record<string, unknown> = {
      chk_pub: {
        id: 'chk_pub',
        userId: 'friend_42',
        turpostId: 'tp_1',
        turpostName: 'Ulriken',
        timestamp: '2026-09-10T10:00:00Z',
        visibility: 'all'
      },
      chk_friends: {
        id: 'chk_friends',
        userId: 'friend_42',
        turpostId: 'tp_2',
        turpostName: 'Fløyen',
        timestamp: '2026-09-11T12:00:00Z',
        visibility: 'friends'
      },
      chk_secret: {
        id: 'chk_secret',
        userId: 'friend_42',
        turpostId: 'tp_3',
        turpostName: 'Hemmelig sted',
        timestamp: '2026-09-09T08:00:00Z',
        visibility: 'private'
      },
      chk_spot: {
        id: 'chk_spot',
        userId: 'friend_42',
        turpostId: 'spot_99',
        turpostName: 'Privat hytte',
        timestamp: '2026-09-08T08:00:00Z',
        isPrivate: true
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_42/checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_42')

    // Skal kun inneholde chk_pub og chk_friends (2 stk)
    expect(result.length).toBe(2)
    // Sortert nyeste først: chk_friends (11.09) før chk_pub (10.09)
    expect(result[0]?.id).toBe('chk_friends')
    expect(result[1]?.id).toBe('chk_pub')
    // Ingen private
    expect(result.some(c => c.id === 'chk_secret')).toBe(false)
    expect(result.some(c => c.id === 'chk_spot')).toBe(false)
  })

  it('fetchFriendCheckins ekskluderer uoffisielle private turposter selv om visibility er satt til all og isPrivate mangler', async () => {
    // Sett opp mock for offentlige turposter: kun tp_official_1 er offentlig kjent
    setCachedMountainsListForTest([
      {
        id: 'tp_official_1',
        name: 'Preben KAFFE OG VINBAR',
        lat: 60.39,
        lng: 5.32,
        alt: 10
      }
    ])

    const friendCheckinsData: Record<string, unknown> = {
      chk_official: {
        id: 'chk_official',
        userId: 'friend_tom',
        turpostId: 'tp_official_1',
        turpostName: 'Preben KAFFE OG VINBAR',
        timestamp: '2026-10-11T15:35:00Z',
        visibility: 'all'
      },
      chk_hh14_leak: {
        id: 'c_1790098943477',
        userId: 'friend_tom',
        turpostId: '72f2bfcde003ba545b3b6748', // privat spot ID
        turpostName: 'HH14',
        timestamp: '2026-09-22T17:42:23Z',
        description: 'Beina på bordet!',
        visibility: 'all' // lekt kopi fra Apps Script med default "all"
        // merk: isPrivate mangler i den lekkede noden!
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_tom/friends_checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_tom')

    // Den private turposten HH14 skal være filtrert bort!
    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('chk_official')
    expect(result.some(c => c.id === 'c_1790098943477')).toBe(false)
  })

  it('fetchFriendCheckins inkluderer innsjekkinger på turposter i approved_spots', async () => {
    // Ingen turposter i mountains.csv
    setCachedMountainsListForTest([])
    // Turposten finnes derimot i approved_spots
    setCachedApprovedSpotsForTest([
      {
        id: 'spot_preben_kaffe',
        name: 'Preben KAFFE OG VINBAR',
        lat: 60.39,
        lng: 5.32,
        alt: 12,
        status: 'approved'
      }
    ])

    const friendCheckinsData: Record<string, unknown> = {
      chk_approved: {
        id: 'chk_preben_1',
        userId: 'friend_tom',
        turpostId: 'spot_preben_kaffe',
        turpostName: 'Preben KAFFE OG VINBAR',
        timestamp: '2026-10-11T16:00:00Z',
        visibility: 'friends',
        isPrivate: true // opprinnelig merket da spotten var privat før godkjenning
      },
      chk_hh14_unapproved: {
        id: 'c_hh14',
        userId: 'friend_tom',
        turpostId: 'spot_hh14_private',
        turpostName: 'HH14',
        timestamp: '2026-09-22T17:42:23Z',
        visibility: 'friends',
        isPrivate: true
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_tom/friends_checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_tom')

    // Kun den godkjente turposten Preben KAFFE OG VINBAR skal tas med
    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('chk_preben_1')
    expect(result[0]?.turpostId).toBe('spot_preben_kaffe')
    expect(result[0]?.isPrivate).toBe(false) // skal være behandlet som offentlig turpost
    // HH14 skal være filtrert bort
    expect(result.some(c => c.id === 'c_hh14')).toBe(false)
  })

  it('fetchFriendCheckins beriker visibility fra checkins_visibility hvis overstyring finnes', async () => {
    setCachedMountainsListForTest([
      {
        id: 'tp_sudoku',
        name: 'SudokuKaféen',
        lat: 60.39,
        lng: 5.32,
        alt: 10
      }
    ])

    const friendCheckinsData: Record<string, unknown> = {
      chk_sudoku: {
        id: 'chk_sudoku_1',
        userId: 'friend_tom',
        turpostId: 'tp_sudoku',
        turpostName: 'SudokuKaféen',
        timestamp: '2026-09-11T16:11:00Z',
        visibility: 'all' // opprinnelig lagret som all i noden
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_tom/friends_checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as unknown as Response
      }
      if (urlStr.includes('/checkins_visibility/chk_sudoku_1.json')) {
        return {
          ok: true,
          json: async () => 'friends' // Bruker har endret synlighet til friends
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_tom')

    expect(result.length).toBe(1)
    expect(result[0]?.visibility).toBe('friends')
  })

  it('fetchFriendCheckins henter fra friends_checkins.json og kaller aldri rotnoden til brukeren', async () => {
    const friendCheckinsData: Record<string, unknown> = {
      chk_pub: {
        id: 'chk_pub',
        userId: 'friend_99',
        turpostId: 'tp_1',
        turpostName: 'Ulriken',
        timestamp: '2026-09-10T10:00:00Z',
        visibility: 'all'
      }
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_99/friends_checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_99')

    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('chk_pub')

    // Sjekk at rotnoden ALDRI ble kalt
    const rootCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).endsWith('/brukere/friend_99.json') || String(c[0]).includes('/brukere/friend_99.json?')
    )
    expect(rootCall).toBeUndefined()
  })

  it('fetchFriendCheckins fletter inn likes og kommentarer fra turposten', async () => {
    const friendCheckins = {
      chk_1: {
        id: 'chk_1',
        turpostId: 'tp_fløyen',
        turpostName: 'Fløyen',
        timestamp: '2026-09-11T12:00:00Z',
        description: 'Fin tur!'
      }
    }

    const turpostSocialData = {
      likes: {
        user_liker: { userId: 'user_liker', userName: 'Liker', reaction: 'like', emoji: '👍' }
      },
      comments: {
        comm_1: { id: 'comm_1', userId: 'user_comm', userName: 'Kommentator', text: 'Bra jobba!' }
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_50/checkins.json')) {
        return { ok: true, json: async () => friendCheckins } as unknown as Response
      }
      if (urlStr.includes('/turposter/tp_fl%C3%B8yen/chk_1.json') || urlStr.includes('/turposter/tp_fløyen/chk_1.json')) {
        return { ok: true, json: async () => turpostSocialData } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendCheckins } = useFriends()
    const result = await fetchFriendCheckins('friend_50')

    expect(result.length).toBe(1)
    expect(result[0]?.likes?.user_liker).toBeDefined()
    expect(result[0]?.likes?.user_liker?.emoji).toBe('👍')
    expect(result[0]?.comments?.comm_1).toBeDefined()
    expect(result[0]?.comments?.comm_1?.text).toBe('Bra jobba!')
    expect(result[0]?.userId).toBe('friend_50')
  })

  it('fetchFriendsCheckinsForTurpost henter og cacher venners innsjekkinger for en gitt turpost', async () => {
    clearFriendsCheckinsCache()
    const trillebarCheckins = {
      chk_rolland: {
        id: 'chk_rolland',
        userId: 'trillebar',
        userName: 'Trillebar',
        turpostId: 'tp_rollandsoksen',
        turpostName: 'Rollandsoksen',
        visibility: 'friends',
        timestamp: '2026-09-12T10:00:00Z'
      },
      chk_annet: {
        id: 'chk_annet',
        userId: 'trillebar',
        userName: 'Trillebar',
        turpostId: 'tp_gavelen',
        turpostName: 'Gavelen',
        visibility: 'friends',
        timestamp: '2026-09-12T11:00:00Z'
      }
    }

    let fetchCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/trillebar/friends_checkins.json')) {
        fetchCount++
        return { ok: true, json: async () => trillebarCheckins } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { fetchFriendsCheckinsForTurpost } = useFriends()

    // 1. Første oppslag for Rollandsoksen
    const result1 = await fetchFriendsCheckinsForTurpost('tp_rollandsoksen', ['trillebar'])
    expect(result1.length).toBe(1)
    expect(result1[0]?.id).toBe('chk_rolland')
    expect(result1[0]?.turpostId).toBe('tp_rollandsoksen')
    expect(fetchCount).toBe(1)

    // 2. Andre oppslag for annen turpost (Gavelen) – skal treffe minne-cache uten nytt REST-kall
    const result2 = await fetchFriendsCheckinsForTurpost('tp_gavelen', ['trillebar'])
    expect(result2.length).toBe(1)
    expect(result2[0]?.id).toBe('chk_annet')
    expect(fetchCount).toBe(1) // Fremdeles 1, fordi trillebars data var cachet!

    // 3. Tøm cache og hent igjen – skal utløse nytt fetch
    clearFriendsCheckinsCache()
    await fetchFriendsCheckinsForTurpost('tp_rollandsoksen', ['trillebar'])
    expect(fetchCount).toBe(2)
  })

  it('FriendProfileMenu: starts with all check-ins minimized and expands on click', async () => {
    // Mock useFriends to inject checkins directly, bypassing Firebase
    const mockCheckins = [
      {
        id: 'chk_1',
        turpostId: 'tp_1',
        turpostName: 'Storronden',
        timestamp: '2026-09-01T10:00:00Z',
        description: 'Flott tur til Storronden!',
        visibility: 'friends',
        userId: 'friend_test',
        userName: 'Fjellturvenn'
      },
      {
        id: 'chk_2',
        turpostId: 'tp_2',
        turpostName: 'Rondslottet',
        timestamp: '2026-09-02T10:00:00Z',
        description: 'Vindfullt på toppen',
        visibility: 'friends',
        userId: 'friend_test',
        userName: 'Fjellturvenn'
      }
    ]

    vi.spyOn(friendsModule, 'useFriends').mockReturnValue({
      fetchFriendCheckins: vi.fn().mockResolvedValue(mockCheckins),
      friends: ref<FriendUser[]>([]),
      loadFriends: vi.fn(),
      sendFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      declineFriendRequest: vi.fn(),
      removeFriend: vi.fn(),
      isFriend: vi.fn(),
      outgoingRequests: ref<FriendRequest[]>([]),
      incomingRequests: ref<FriendRequest[]>([]),
      defaultVisibility: ref<CheckinVisibility>('all'),
      setDefaultVisibility: vi.fn(),
      loadDefaultVisibility: vi.fn(),
      setCheckinVisibility: vi.fn(),
      pendingSuggestions: ref([]),
      loadPendingSuggestions: vi.fn(),
      approveSuggestion: vi.fn(),
      rejectSuggestion: vi.fn()
    } as unknown as ReturnType<typeof friendsModule.useFriends>)

    const wrapper = mount(FriendProfileMenu, {
      props: {
        isOpen: true,
        friend: {
          userId: 'friend_test',
          userName: 'Fjellturvenn'
        },
        currentUserId: 'me_user'
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    // Som standard skal alle innsjekkinger være minimert (notater skjult)
    expect(wrapper.text()).not.toContain('Flott tur til Storronden!')
    expect(wrapper.text()).not.toContain('Vindfullt på toppen')

    // Klikk på den første innsjekkingen for å ekspandere
    const headerBtns = wrapper.findAll('.checkin-header-btn')
    expect(headerBtns.length).toBe(2)
    await headerBtns[0]!.trigger('click')
    await wrapper.vm.$nextTick()

    // Nå skal første notat være synlig (første i lista er chk_2 – nyeste), andre minimert
    const textAfterExpand = wrapper.text()
    expect(
      textAfterExpand.includes('Flott tur til Storronden!') ||
      textAfterExpand.includes('Vindfullt på toppen')
    ).toBe(true)

    // Klikk på den ekspanderte knappen igjen for å minimere
    await headerBtns[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Flott tur til Storronden!')
    expect(wrapper.text()).not.toContain('Vindfullt på toppen')

    wrapper.unmount()
  })

  it('FriendProfileMenu: allows switching between Innsjekkinger and GPS-spor tabs and renders friend tracks', async () => {
    const firebaseTracksModule = await import('../composables/useFirebaseTracks')
    const mockTracks = [
      {
        id: 'track_1',
        userId: 'friend_test',
        name: 'Tur over Vidden',
        createdAt: 1726401600000,
        startTime: 1726401600000,
        endTime: 1726416000000,
        distanceMeters: 14500,
        durationMs: 14400000,
        points: [],
        visibility: 'friends' as const
      }
    ]

    vi.spyOn(firebaseTracksModule, 'useFirebaseTracks').mockReturnValue({
      fetchFriendTracks: vi.fn().mockResolvedValue(mockTracks),
      formatTrackKey: vi.fn(),
      parseTrackKeyTimestamp: vi.fn(),
      fetchUserTracksFromFirebase: vi.fn().mockResolvedValue(mockTracks),
      fetchUserTrackById: vi.fn(),
      saveTrackToFirebase: vi.fn(),
      deleteTrackFromFirebase: vi.fn(),
      renameTrackInFirebase: vi.fn(),
      setTrackPhotoSharingInFirebase: vi.fn(),
      setTrackVisibilityInFirebase: vi.fn()
    } as unknown as ReturnType<typeof firebaseTracksModule.useFirebaseTracks>)

    const wrapper = mount(FriendProfileMenu, {
      props: {
        isOpen: true,
        friend: {
          userId: 'friend_test',
          userName: 'Fjellturvenn'
        },
        currentUserId: 'me_user'
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    // Sjekk at fanene finnes
    const tabBtns = wrapper.findAll('.profile-tab-btn')
    expect(tabBtns.length).toBe(2)
    expect(tabBtns[0]!.text()).toContain('Innsjekkinger')
    expect(tabBtns[1]!.text()).toContain('GPS-spor')

    // Klikk på GPS-spor fanen
    await tabBtns[1]!.trigger('click')
    await wrapper.vm.$nextTick()

    // Sjekk at vennens delte spor nå vises
    expect(wrapper.text()).toContain('Tur over Vidden')
    expect(wrapper.text()).toContain('14.5 km')
    expect(wrapper.text()).toContain('Delte turer')

    // Klikk for å ekspandere sporet
    const trackHeaderBtn = wrapper.find('.track-header-btn')
    expect(trackHeaderBtn.exists()).toBe(true)
    await trackHeaderBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Sjekk at "Vis på kart" vises, men GPX-nedlasting IKKE er tilgjengelig for venner
    const viewMapBtn = wrapper.find('.btn-view-map')
    expect(viewMapBtn.exists()).toBe(true)
    expect(wrapper.find('.btn-download-gpx').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('GPX')

    // Klikk på "Vis på kart" og sjekk at view-track-on-map emittes direkte uten å lukke tilbake til venner-modal
    await viewMapBtn.trigger('click')
    expect(wrapper.emitted('view-track-on-map')).toBeTruthy()
    expect(wrapper.emitted('view-track-on-map')![0]![0]).toMatchObject({ id: 'track_1' })
    expect(wrapper.emitted('close')).toBeFalsy()

    wrapper.unmount()
  })

  it('FriendSearchTab does not show email addresses in search results list', async () => {
    const mockUsers = [
      { userId: 'u1', userName: 'Per Hansen', email: 'per@test.no' },
      { userId: 'u2', userName: 'Kari Nordmann', email: 'kari@fjord.no' }
    ]

    const wrapper = mount(FriendSearchTab, {
      props: {
        searchQuery: '',
        searchResults: mockUsers,
        isSearching: false,
        actionLoadingId: null,
        outgoingTargetIds: new Set<string>(),
        incomingSenderIds: new Set<string>(),
        isFriend: () => false
      }
    })

    expect(wrapper.text()).toContain('Per Hansen')
    expect(wrapper.text()).toContain('Kari Nordmann')
    expect(wrapper.text()).not.toContain('per@test.no')
    expect(wrapper.text()).not.toContain('kari@fjord.no')

    const input = wrapper.find<HTMLInputElement>('input.search-input')
    expect(input.attributes('placeholder')).toBe('Søk etter turgåere på navn...')

    wrapper.unmount()
  })
})

