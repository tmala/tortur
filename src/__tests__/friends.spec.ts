import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { useFriends, registerPublicUser, searchPublicUsers, fetchFriendCheckins } from '../composables/useFriends'
import * as friendsModule from '../composables/useFriends'
import { useAuth } from '../composables/useAuth'
import FriendProfileModal from '../components/FriendProfileModal.vue'

describe('useFriends - Friends system and check-in visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('registerPublicUser updates users_public node in Firebase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as any
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
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
        } as any
      }
      return { ok: true, json: async () => ({}) } as any
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
      return { ok: true, json: async () => ({}) } as any
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
      return { ok: true, json: async () => ({}) } as any
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

  it('searchPublicUsers filters users by name or email case-insensitively', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/users_public.json')) {
        return {
          ok: true,
          json: async () => ({
            u1: { userId: 'u1', userName: 'Per Hansen', email: 'per@test.no' },
            u2: { userId: 'u2', userName: 'Kari Nordmann', email: 'kari@fjord.no' },
            u3: { userId: 'u3', userName: 'Ola Hansen', email: 'ola@test.no' }
          })
        } as any
      }
      return { ok: true, json: async () => ({}) } as any
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

    const res2 = await searchPublicUsers('fjord.no')
    expect(res2.length).toBe(1)
    expect(res2[0]!.userName).toBe('Kari Nordmann')
  })

  it('setDefaultVisibility and loadDefaultVisibility persist visibility settings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => 'friends' } as any
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

  it('setCheckinVisibility writes to checkins_visibility and patches checkin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => ({}) } as any
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

    // turposter/tp_50/c_999.json PATCH
    const tpCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/tp_50/c_999.json') && c[1]?.method === 'PATCH'
    )
    expect(tpCall).toBeDefined()

    // brukere/user_me/checkins/c_999.json PATCH
    const userCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_me/checkins/c_999.json') && c[1]?.method === 'PATCH'
    )
    expect(userCall).toBeDefined()
  })

  it('fetchFriendCheckins henter vennens innsjekkinger og ekskluderer private', async () => {
    const friendCheckinsData: Record<string, any> = {
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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_42/checkins.json')) {
        return {
          ok: true,
          json: async () => friendCheckinsData
        } as any
      }
      return { ok: false, json: async () => ({}) } as any
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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/brukere/friend_50/checkins.json')) {
        return { ok: true, json: async () => friendCheckins } as any
      }
      if (urlStr.includes('/turposter/tp_fl%C3%B8yen/chk_1.json') || urlStr.includes('/turposter/tp_fløyen/chk_1.json')) {
        return { ok: true, json: async () => turpostSocialData } as any
      }
      return { ok: false, json: async () => ({}) } as any
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

  it('FriendProfileModal: starts with all check-ins minimized and expands on click', async () => {
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
      friends: { value: [] } as any,
      loadFriends: vi.fn(),
      sendFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      declineFriendRequest: vi.fn(),
      removeFriend: vi.fn(),
      isFriend: vi.fn(),
      outgoingRequests: { value: [] } as any,
      incomingRequests: { value: [] } as any,
      defaultVisibility: { value: 'all' } as any,
      setDefaultVisibility: vi.fn(),
      loadDefaultVisibility: vi.fn(),
      setCheckinVisibility: vi.fn(),
      pendingSuggestions: { value: [] } as any,
      loadPendingSuggestions: vi.fn(),
      approveSuggestion: vi.fn(),
      rejectSuggestion: vi.fn()
    } as any)

    const wrapper = mount(FriendProfileModal, {
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
})

