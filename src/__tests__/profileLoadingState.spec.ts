import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ProfileCheckinsTab from '../components/profile/ProfileCheckinsTab.vue'
import ProfileTabBar from '../components/profile/ProfileTabBar.vue'
import ProfileSpotsTab from '../components/profile/ProfileSpotsTab.vue'
import ProfileTracksTab from '../components/profile/ProfileTracksTab.vue'
import FriendsListTab from '../components/friends/FriendsListTab.vue'
import FriendProfileMenu from '../components/FriendProfileMenu.vue'
import LoadingSpinner from '../components/common/LoadingSpinner.vue'
import * as friendsModule from '../composables/useFriends'
import { useFriends, loadFriends, type FriendUser } from '../composables/useFriends'
import { useAuth, type FirebaseCheckinItem } from '../composables/useAuth'
import { useGpsTrackStore } from '../stores/gpsTrack'

describe('Profile Loading Spinners and Indicators', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('ProfileCheckinsTab.vue', () => {
    it('shows LoadingSpinner and hides empty-state when isLoading is true', () => {
      const wrapper = mount(ProfileCheckinsTab, {
        props: {
          checkins: [],
          isLoading: true,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)
      expect(wrapper.find('.empty-state').exists()).toBe(false)
      expect(wrapper.text()).toContain('Henter dine innsjekkinger...')
    })

    it('shows empty-state and hides LoadingSpinner when isLoading is false and list is empty', () => {
      const wrapper = mount(ProfileCheckinsTab, {
        props: {
          checkins: [],
          isLoading: false,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Ingen innsjekkinger enda')
    })

    it('shows checkin list and hides LoadingSpinner when items exist', () => {
      const mockCheckin: FirebaseCheckinItem = {
        id: 'c1',
        turpostId: 'tp_1',
        turpostName: 'Preikestolen',
        userId: 'u1',
        userName: 'Ola',
        userAvatar: '',
        description: 'Flott tur',
        imageUrl: '',
        timestamp: '2026-10-10T12:00:00Z',
      }

      const wrapper = mount(ProfileCheckinsTab, {
        props: {
          checkins: [mockCheckin],
          isLoading: false,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
      expect(wrapper.find('.empty-state').exists()).toBe(false)
      expect(wrapper.text()).toContain('Preikestolen')
    })
  })

  describe('ProfileTabBar.vue', () => {
    it('displays ellipsis for checkins badge when isCheckinsLoading is true', () => {
      const wrapper = mount(ProfileTabBar, {
        props: {
          checkinsCount: 5,
          isCheckinsLoading: true,
        },
      })

      const badge = wrapper.find('.checkins-badge')
      expect(badge.text()).toBe('…')
    })

    it('displays numeric count for checkins badge when isCheckinsLoading is false', () => {
      const wrapper = mount(ProfileTabBar, {
        props: {
          checkinsCount: 5,
          isCheckinsLoading: false,
        },
      })

      const badge = wrapper.find('.checkins-badge')
      expect(badge.text()).toBe('5')
    })

    it('displays ellipsis for spots badge when isSpotsLoading is true', () => {
      const wrapper = mount(ProfileTabBar, {
        props: {
          mySpotsCount: 3,
          isSpotsLoading: true,
        },
      })

      const badge = wrapper.find('.spots-badge')
      expect(badge.text()).toBe('…')
    })
  })

  describe('ProfileSpotsTab.vue', () => {
    it('shows LoadingSpinner when isLoading is true', () => {
      const wrapper = mount(ProfileSpotsTab, {
        props: {
          spots: [],
          isLoading: true,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)
      expect(wrapper.find('.empty-state').exists()).toBe(false)
      expect(wrapper.text()).toContain('Henter dine private turposter...')
    })

    it('shows empty-state when isLoading is false and spots is empty', () => {
      const wrapper = mount(ProfileSpotsTab, {
        props: {
          spots: [],
          isLoading: false,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('FriendsListTab.vue', () => {
    it('shows LoadingSpinner when isLoading is true and friends list is empty', () => {
      const wrapper = mount(FriendsListTab, {
        props: {
          friends: [],
          actionLoadingId: null,
          isLoading: true,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)
      expect(wrapper.find('.empty-state').exists()).toBe(false)
      expect(wrapper.text()).toContain('Henter dine venner...')
    })

    it('shows empty-state when isLoading is false and friends list is empty', () => {
      const wrapper = mount(FriendsListTab, {
        props: {
          friends: [],
          actionLoadingId: null,
          isLoading: false,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('ProfileTracksTab.vue', () => {
    it('shows LoadingSpinner during initial sync when savedTracks is empty', () => {
      const trackStore = useGpsTrackStore()
      trackStore.savedTracks = []
      trackStore.isSyncing = true

      const wrapper = mount(ProfileTracksTab, {
        props: {
          isLoggedIn: true,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)
      expect(wrapper.find('.empty-state').exists()).toBe(false)
      expect(wrapper.text()).toContain('Henter dine spor...')
    })

    it('shows empty-state when not syncing and savedTracks is empty', () => {
      const trackStore = useGpsTrackStore()
      trackStore.savedTracks = []
      trackStore.isSyncing = false

      const wrapper = mount(ProfileTracksTab, {
        props: {
          isLoggedIn: true,
        },
      })

      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('FriendProfileMenu.vue', () => {
    it('shows ellipsis in stats and tab badge while friend checkins are loading', async () => {
      let resolvePromise: (val: FirebaseCheckinItem[]) => void = () => {}
      const pendingFetch = new Promise<FirebaseCheckinItem[]>((resolve) => {
        resolvePromise = resolve
      })

      vi.spyOn(friendsModule, 'useFriends').mockReturnValue({
        fetchFriendCheckins: vi.fn().mockImplementation(() => pendingFetch),
        friends: { value: [] },
        loadFriends: vi.fn(),
        isLoading: { value: false },
      } as unknown as ReturnType<typeof friendsModule.useFriends>)

      const friend: FriendUser = {
        userId: 'friend_test',
        userName: 'Testvenn',
      }

      const wrapper = mount(FriendProfileMenu, {
        props: {
          isOpen: true,
          friend,
          currentUserId: 'me_user',
        },
      })

      // While pending: stats and checkins tab badge should display '…'
      expect(wrapper.find('.stat-num').text()).toBe('…')
      expect(wrapper.find('.tab-badge.checkins').text()).toBe('…')
      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)

      // Resolve the fetch
      resolvePromise([
        {
          id: 'c1',
          turpostId: 'tp_1',
          turpostName: 'Dronningstien',
          userId: 'friend_test',
          userName: 'Testvenn',
          userAvatar: '',
          description: '',
          imageUrl: '',
          timestamp: '2026-10-15T10:00:00Z',
        },
      ])

      await flushPromises()
      await wrapper.vm.$nextTick()

      // After resolve: count is updated
      expect(wrapper.find('.stat-num').text()).toBe('1')
      expect(wrapper.find('.tab-badge.checkins').text()).toBe('1')
      expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
    })
  })

  describe('useFriends.loadFriends', () => {
    it('toggles isLoading to true during fetch and resets to false in finally', async () => {
      const { systemConfig } = useAuth()
      systemConfig.value = {
        FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
        FIREBASE_SECRET_PREFIX: 'test_prefix',
      }

      let resolveFetch: (data: unknown) => void = () => {}
      const pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve
      })

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        await pendingFetch
        return {
          ok: true,
          json: async () => ({
            friend_1: {
              userId: 'friend_1',
              userName: 'Kari',
            },
          }),
        } as unknown as Response
      })

      const { isLoading } = useFriends()
      expect(isLoading.value).toBe(false)

      const loadPromise = loadFriends('user_me')
      expect(isLoading.value).toBe(true)

      resolveFetch(null)
      await loadPromise

      expect(isLoading.value).toBe(false)
    })
  })
})
