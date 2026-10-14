import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FriendProfileView from '../views/FriendProfileView.vue'
import FriendProfileModal from '../components/FriendProfileModal.vue'
import { useAppStateStore } from '../stores/appState'
import type { SavedTrack } from '../stores/gpsTrack'
import type { FirebaseCheckinItem } from '../composables/useAuth'

const pushMock = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { userId: 'friend_test' } }),
  useRouter: () => ({ push: pushMock })
}))

vi.mock('../composables/useFriends', () => ({
  useFriends: () => ({
    friends: { value: [{ userId: 'friend_test', userName: 'Testvenn' }] },
    loadFriends: vi.fn()
  })
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: { value: { userId: 'me_user' } }
  })
}))

describe('FriendProfileView navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushMock.mockClear()
  })

  it('navigates to /venner on normal close', async () => {
    const wrapper = mount(FriendProfileView, {
      global: {
        stubs: {
          FriendProfileModal: {
            template: '<div class="stubbed-modal"></div>',
            emits: ['close', 'view-track-on-map', 'view-turpost-on-map']
          }
        }
      }
    })

    const modal = wrapper.findComponent(FriendProfileModal)
    modal.vm.$emit('close')

    expect(pushMock).toHaveBeenCalledWith('/venner')
  })

  it('navigates directly to / (main map) on view-track-on-map', async () => {
    const appState = useAppStateStore()
    const requestViewTrackSpy = vi.spyOn(appState, 'requestViewTrack')

    const wrapper = mount(FriendProfileView, {
      global: {
        stubs: {
          FriendProfileModal: {
            template: '<div class="stubbed-modal"></div>',
            emits: ['close', 'view-track-on-map', 'view-turpost-on-map']
          }
        }
      }
    })

    const mockTrack: SavedTrack = {
      id: 'track_123',
      userId: 'friend_test',
      name: 'Kollbudalen',
      createdAt: 1728734100000,
      startTime: 1728734100000,
      endTime: 1728738300000,
      distanceMeters: 2800,
      durationMs: 4200000,
      points: [],
      visibility: 'friends'
    }

    const modal = wrapper.findComponent(FriendProfileModal)
    modal.vm.$emit('view-track-on-map', mockTrack)

    expect(requestViewTrackSpy).toHaveBeenCalledWith(mockTrack)
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('navigates directly to / (main map) on view-turpost-on-map', async () => {
    const appState = useAppStateStore()
    const requestFlyToCheckinSpy = vi.spyOn(appState, 'requestFlyToCheckin')

    const wrapper = mount(FriendProfileView, {
      global: {
        stubs: {
          FriendProfileModal: {
            template: '<div class="stubbed-modal"></div>',
            emits: ['close', 'view-track-on-map', 'view-turpost-on-map']
          }
        }
      }
    })

    const mockCheckin: FirebaseCheckinItem = {
      id: 'checkin_1',
      turpostId: 'tp_1',
      turpostName: 'Kollbudalen',
      userId: 'friend_test',
      userName: 'Testvenn',
      userAvatar: '',
      description: '',
      imageUrl: '',
      timestamp: '2026-10-12T14:35:00Z'
    }

    const modal = wrapper.findComponent(FriendProfileModal)
    modal.vm.$emit('view-turpost-on-map', mockCheckin)

    expect(requestFlyToCheckinSpy).toHaveBeenCalledWith(mockCheckin)
    expect(pushMock).toHaveBeenCalledWith('/')
  })
})
