import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import MapView from '../views/MapView.vue'
import AppHeader from '../components/AppHeader.vue'
import LocationControls from '../components/LocationControls.vue'
import TurposterPanel from '../components/TurposterPanel.vue'
import CheckinModal from '../components/CheckinModal.vue'
import TurpostCheckinsModal from '../components/TurpostCheckinsModal.vue'
import UserProfileMenu from '../components/UserProfileMenu.vue'
import MapLayerButton from '../components/MapLayerButton.vue'
import type { FylkeInfo } from '../composables/useTurposter'
import type { GoogleUser } from '../composables/useAuth'
import { useAppStateStore } from '../stores/appState'
import type { SavedTrack } from '../stores/gpsTrack'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AppHeader', () => {
  it('renders application title and toggles menu properly', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
      },
    })

    expect(wrapper.text()).toContain('TorTur')
    // Menu is closed by default to save map space
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)

    // Click TorTur badge to open menu
    await wrapper.find('.brand-badge-btn').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(true)
    expect(wrapper.text()).toContain('Turposter')
    expect(wrapper.find('.btn-locate').attributes('title')).toBe('Hvor er jeg?')
    expect(wrapper.find('.btn-local-turposter').attributes('title')).toBe('Vis turposter der jeg er')
    expect(wrapper.find('.btn-track').exists()).toBe(false)
    expect(wrapper.find('.btn-install').exists()).toBe(false)
    expect(wrapper.find('button[title="Om appen"]').exists()).toBe(false)

    // Click close button to dismiss menu
    await wrapper.find('.btn-close-menu').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)
  })

  it('hides AIS controls for non-admin users and shows them for admin with active admin mode', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        isLoggedIn: true,
        isAdmin: false,
        isAdminActive: false,
      },
    })

    // Open menu
    await wrapper.find('.brand-badge-btn').trigger('click')
    expect(wrapper.find('.btn-ais').exists()).toBe(false)
    expect(wrapper.find('button[title="Båttrafikk (AIS) innstillinger"]').exists()).toBe(false)

    // Set isAdmin: true with active admin mode
    await wrapper.setProps({ isAdmin: true, isAdminActive: true })
    expect(wrapper.find('.btn-ais').exists()).toBe(true)
    expect(wrapper.find('button[title="Båttrafikk (AIS) innstillinger"]').exists()).toBe(true)

    // Turn off admin mode -> AIS should be hidden even for admin
    await wrapper.setProps({ isAdminActive: false })
    expect(wrapper.find('.btn-ais').exists()).toBe(false)
    expect(wrapper.find('button[title="Båttrafikk (AIS) innstillinger"]').exists()).toBe(false)
  })

  it('emits locate event when clicking locate button in menu', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
      },
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const locateBtn = wrapper.find('.btn-locate')
    await locateBtn.trigger('click')

    expect(wrapper.emitted('locate')).toBeTruthy()
  })

  it('emits toggle-turposter when clicking turposter button in menu', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: 'Luster',
        turpostCount: 412,
      },
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const turBtn = wrapper.find('.btn-turposter')
    expect(wrapper.text()).toContain('Luster')
    expect(wrapper.text()).toContain('412')
    await turBtn.trigger('click')

    expect(wrapper.emitted('toggle-turposter')).toBeTruthy()
    // Menyen skal lukkes automatisk når turposter-knappen klikkes
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)
  })

  it('closes menu automatically when isTurposterOpen becomes true', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: 'Bergen',
        turpostCount: 240,
      },
    })

    // Åpne menyen
    await wrapper.find('.brand-badge-btn').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(true)

    // Simuler at turposter-panelet åpnes
    await wrapper.setProps({ isTurposterOpen: true })
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)
  })

  it('does not render boundary button in menu', async () => {
    const wrapper = mount(AppHeader, {
      props: {
        isLocating: false,
        isTracking: false,
        activeLayer: 'standard',
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
      },
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const boundaryBtn = wrapper.find('button[title="Slå av/på visning av kommunegrenser"]')
    expect(boundaryBtn.exists()).toBe(false)
  })
})

describe('LocationControls', () => {
  it('renders user location coordinates and accuracy badge', () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: {
          lat: 60.3913,
          lng: 5.3221,
          accuracy: 12,
          altitude: null,
          speed: null,
          heading: null,
          timestamp: Date.now(),
        },
        centerCoords: null,
        error: null,
      },
    })

    expect(wrapper.text()).toContain('60.3913°')
    expect(wrapper.text()).toContain('5.3221°')
    expect(wrapper.text()).toContain('±12m')
  })

  it('renders center coords when userLocation is null', () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        centerCoords: { lat: 59.9139, lng: 10.7522, zoom: 12 },
        error: null,
      },
    })

    expect(wrapper.text()).toContain('Senter: 59.9139°, 10.7522° (Zoom 12)')
  })

  it('renders error banner and emits locate and clear-error', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        centerCoords: null,
        error: 'Posisjon utilgjengelig',
      },
    })

    expect(wrapper.find('.error-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('Posisjon utilgjengelig')

    await wrapper.find('.btn-retry').trigger('click')
    expect(wrapper.emitted('locate')).toBeTruthy()

    await wrapper.find('.btn-dismiss').trigger('click')
    expect(wrapper.emitted('clear-error')).toBeTruthy()
  })
})

describe('TurposterPanel', () => {
  const sampleHierarchy = [
    {
      name: 'Vestland',
      slug: 'vestland',
      count: 6246,
      kommuner: [
        { name: 'Luster', slug: 'luster', count: 412 },
        { name: 'Sogndal', slug: 'sogndal', count: 280 }
      ]
    }
  ]

  it('renders fylke list in step 1', () => {
    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: null,
        selectedKommune: null,
        turposter: [],
        filteredTurposter: [],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: ''
      }
    })

    expect(wrapper.text()).toContain('Trinn 1: Velg fylke')
    expect(wrapper.text()).toContain('Vestland')
    expect(wrapper.text()).toContain('poster')
  })

  it('renders kommune list in step 2 when fylke is selected', () => {
    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: sampleHierarchy[0]!,
        selectedKommune: null,
        turposter: [],
        filteredTurposter: [],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: ''
      }
    })

    expect(wrapper.text()).toContain('Trinn 2: Velg kommune i Vestland')
    expect(wrapper.text()).toContain('Luster')
    expect(wrapper.text()).toContain('412 poster')
  })

  it('handles region switching and empty state for Utlandet', async () => {
    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: null,
        selectedKommune: null,
        turposter: [],
        filteredTurposter: [],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: ''
      }
    })

    expect(wrapper.text()).toContain('Norge')
    expect(wrapper.text()).toContain('Utlandet')

    // Klikk på Utlandet-fanen
    const buttons = wrapper.findAll('.region-tab-btn')
    expect(buttons.length).toBe(2)
    await buttons[1]!.trigger('click')

    // Siden sampleHierarchy ikke har utlandet, vises tom-tilstand
    expect(wrapper.text()).toContain('Ingen turposter i utlandet ennå')
  })

  it('renders country list when Utlandet fylke exists in hierarchy', async () => {
    const hierarchyWithUtland = [
      ...sampleHierarchy,
      {
        name: 'Utlandet',
        slug: 'utlandet',
        count: 5,
        kommuner: [
          { name: 'Spania', slug: 'spania', count: 3 },
          { name: 'Sverige', slug: 'sverige', count: 2 }
        ]
      }
    ]

    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: hierarchyWithUtland,
        selectedFylke: null,
        selectedKommune: null,
        turposter: [],
        filteredTurposter: [],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: ''
      }
    })

    // Klikk på Utlandet-fanen
    const buttons = wrapper.findAll('.region-tab-btn')
    await buttons[1]!.trigger('click')

    // Sjekk at event 'select-fylke' ble trigget med Utlandet-fylket
    expect(wrapper.emitted('select-fylke')).toBeTruthy()
    const emittedFylke = wrapper.emitted('select-fylke')![0]![0] as FylkeInfo
    expect(emittedFylke.slug).toBe('utlandet')

    // Oppdater props som om forelder valgte Utlandet
    await wrapper.setProps({ selectedFylke: hierarchyWithUtland[1] })
    expect(wrapper.text()).toContain('Velg land eller område')
    expect(wrapper.text()).toContain('Spania')
    expect(wrapper.text()).toContain('3 poster')
    expect(wrapper.text()).toContain('Sverige')
    expect(wrapper.text()).toContain('2 poster')
  })

  it('does not render checkin button in turposter list (must check in from map)', () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: sampleHierarchy[0]!,
        selectedKommune: sampleHierarchy[0]!.kommuner[0]!,
        turposter: [samplePost],
        filteredTurposter: [samplePost],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: '',
        isLoggedIn: true
      }
    })

    expect(wrapper.find('.btn-checkin-list').exists()).toBe(false)
  })

  it('renders visited tag and view-checkins button in turposter list', async () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: sampleHierarchy[0]!,
        selectedKommune: sampleHierarchy[0]!.kommuner[0]!,
        turposter: [samplePost],
        filteredTurposter: [samplePost],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: '',
        isLoggedIn: true,
        visitedTurpostIds: new Set(['luster-1'])
      }
    })

    expect(wrapper.find('.visited-tag').exists()).toBe(true)
    expect(wrapper.find('.visited-tag').text()).toContain('Besøkt')

    const viewBtn = wrapper.find('.btn-view-list')
    expect(viewBtn.exists()).toBe(true)
    await viewBtn.trigger('click')
    expect(wrapper.emitted('view-checkins')).toBeTruthy()
    expect(wrapper.emitted('view-checkins')![0]![0]).toEqual(samplePost)
  })

  it('hides view-checkins button in turposter list when not logged in', () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const wrapper = mount(TurposterPanel, {
      props: {
        isOpen: true,
        hierarchy: sampleHierarchy,
        selectedFylke: sampleHierarchy[0]!,
        selectedKommune: sampleHierarchy[0]!.kommuner[0]!,
        turposter: [samplePost],
        filteredTurposter: [samplePost],
        isLoadingHierarchy: false,
        isLoadingPosts: false,
        searchQuery: '',
        isLoggedIn: false
      }
    })

    expect(wrapper.find('.btn-view-list').exists()).toBe(false)
  })
})

describe('CheckinModal', () => {
  it('renders turpost information and user details when within 100m range', () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const sampleUser = {
      userId: '123456789',
      userName: 'Test Turgåer',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      lastLogin: '2026-09-03T10:00:00Z'
    }

    const wrapper = mount(CheckinModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        user: sampleUser,
        userLocation: {
          lat: 61.3412,
          lng: 7.3145,
          accuracy: 5,
          heading: null,
          speed: null,
          altitude: 1116,
          timestamp: Date.now()
        }
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Molden')
    expect(text).toContain('1116 moh.')
    expect(text).toContain('Test Turgåer')
    expect(text).toContain('Innen rekkevidde')
    expect(text).toContain('Sjekk inn her')
  })

  it('disables check-in when user is further than 100 meters away', () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const sampleUser = {
      userId: '123456789',
      userName: 'Test Turgåer',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      lastLogin: '2026-09-03T10:00:00Z'
    }

    // User is far away (e.g. Bergen instead of Luster)
    const wrapper = mount(CheckinModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        user: sampleUser,
        userLocation: {
          lat: 60.3913,
          lng: 5.3221,
          accuracy: 5,
          heading: null,
          speed: null,
          altitude: 10,
          timestamp: Date.now()
        }
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('For langt unna')
    const submitBtn = document.body.querySelector('.btn-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })
})

describe('TurpostCheckinsModal', () => {
  it('renders turpost details and visited status', async () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const wrapper = mount(TurpostCheckinsModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        isLoggedIn: true,
        hasVisited: true,
        currentUserId: '123',
        userLocation: {
          lat: 61.3412,
          lng: 7.3145,
          accuracy: 5,
          heading: null,
          speed: null,
          altitude: 1116,
          timestamp: Date.now()
        }
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Molden')
    expect(text).toContain('1116 moh.')
    expect(text).toContain('Du har sjekket inn på denne turposten!')

    const quickCheckinBtn = document.body.querySelector('.btn-checkin-quick') as HTMLButtonElement
    expect(quickCheckinBtn).not.toBeNull()
    expect(quickCheckinBtn.disabled).toBe(false)
    quickCheckinBtn.click()
    expect(wrapper.emitted('open-checkin')).toBeTruthy()
    expect(wrapper.emitted('open-checkin')![0]![0]).toEqual(samplePost)
  })

  it('disables quick checkin when user is too far away', () => {
    const samplePost = {
      id: 'luster-1',
      name: 'Molden',
      lat: 61.3412,
      lng: 7.3145,
      alt: 1116
    }

    const wrapper = mount(TurpostCheckinsModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        isLoggedIn: true,
        hasVisited: false,
        currentUserId: '123',
        userLocation: {
          lat: 60.3913,
          lng: 5.3221,
          accuracy: 5,
          heading: null,
          speed: null,
          altitude: 10,
          timestamp: Date.now()
        }
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('For langt unna')
    const quickCheckinBtn = document.body.querySelector('.btn-checkin-quick') as HTMLButtonElement
    expect(quickCheckinBtn.disabled).toBe(true)
  })

  it('displays user own checkin with visibility friends immediately without showing empty state', async () => {
    const { useAppStateStore } = await import('../stores/appState')
    const appState = useAppStateStore()
    appState.myCheckins = [
      {
        id: 'chk_rollandsoksen_user',
        turpostId: 'tp_rollandsoksen',
        turpostName: 'Rollandsoksen',
        userId: 'user_me',
        userName: 'Min Bruker',
        userAvatar: '',
        imageUrl: '',
        timestamp: '2026-09-15T12:00:00Z',
        visibility: 'friends',
        description: 'Fin tur til Rollandsoksen i solnedgang'
      }
    ]

    const samplePost = {
      id: 'tp_rollandsoksen',
      name: 'Rollandsoksen',
      lat: 60.4545,
      lng: 5.3262,
      alt: 186
    }

    mount(TurpostCheckinsModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        isLoggedIn: true,
        hasVisited: true,
        currentUserId: 'user_me'
      }
    })

    await flushPromises()
    const text = document.body.textContent || ''
    expect(text).not.toContain('Ingen innsjekkinger enda')
    expect(text).toContain('Rollandsoksen')
    expect(text).toContain('Fin tur til Rollandsoksen i solnedgang')
    expect(text).toContain('Deg')
    expect(text).toContain('Venner')
  })

  it('displays user own checkin with visibility private with Kun meg tag', async () => {
    const { useAppStateStore } = await import('../stores/appState')
    const appState = useAppStateStore()
    appState.myCheckins = [
      {
        id: 'chk_priv_user',
        turpostId: 'tp_rollandsoksen',
        turpostName: 'Rollandsoksen',
        userId: 'user_me',
        userName: 'Min Bruker',
        userAvatar: '',
        imageUrl: '',
        timestamp: '2026-09-15T12:00:00Z',
        visibility: 'private',
        description: 'Hemmelig tur til toppen'
      }
    ]

    const samplePost = {
      id: 'tp_rollandsoksen',
      name: 'Rollandsoksen',
      lat: 60.4545,
      lng: 5.3262,
      alt: 186
    }

    mount(TurpostCheckinsModal, {
      props: {
        isOpen: true,
        turpost: samplePost,
        isLoggedIn: true,
        hasVisited: true,
        currentUserId: 'user_me'
      }
    })

    await flushPromises()
    const text = document.body.textContent || ''
    expect(text).not.toContain('Ingen innsjekkinger enda')
    expect(text).toContain('Hemmelig tur til toppen')
    expect(text).toContain('Deg')
    expect(text).toContain('Kun meg')
  })
})

describe('UserProfileMenu', () => {
  it('renders user details, stats, chronological checkins, and emits logout', async () => {
    const sampleUser = {
      userId: '112985692350976832637',
      userName: 'Tor Mala',
      email: 'tormala@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      lastLogin: '2026-09-03T10:00:00Z'
    }

    const checkins = [
      {
        id: 'c_1',
        userId: '112985692350976832637',
        userName: 'Tor Mala',
        userAvatar: '',
        turpostId: '5ee93bee5d376792d0c660b6',
        turpostName: 'Gavelen',
        timestamp: '2026-09-01T10:00:00Z',
        description: 'Tidligere tur',
        imageUrl: ''
      },
      {
        id: 'c_2',
        userId: '112985692350976832637',
        userName: 'Tor Mala',
        userAvatar: '',
        turpostId: '5f5132e559c7186497f302c4',
        turpostName: 'Vardetangen',
        timestamp: '2026-09-03T10:39:45Z',
        description: 'Nyeste tur!',
        imageUrl: ''
      }
    ]

    const wrapper = mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins
      }
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Tor Mala')
    expect(bodyText).toContain('tormala@example.com')
    expect(bodyText).toContain('Gavelen')
    expect(bodyText).toContain('Vardetangen')

    // Alle innsjekkinger skal som standard være minimert (detaljer skjult)
    expect(document.body.textContent).not.toContain('Nyeste tur!')

    // Klikk for å ekspandere det første kortet
    const firstCardHeader = document.body.querySelector('.checkin-card-header') as HTMLElement
    expect(firstCardHeader).not.toBeNull()
    firstCardHeader.click()
    await wrapper.vm.$nextTick()

    // Nå skal notatet for første kort være synlig
    expect(document.body.textContent).toContain('Nyeste tur!')

    // Klikk igjen for å minimere kortet på nytt
    firstCardHeader.click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).not.toContain('Nyeste tur!')

    // Vardetangen (nyeste) skal komme før Gavelen i DOM
    const currentBody = document.body.textContent || ''
    const vardetangenPos = currentBody.indexOf('Vardetangen')
    const gavelenPos = currentBody.indexOf('Gavelen')
    expect(vardetangenPos).toBeLessThan(gavelenPos)

    const logoutBtn = document.body.querySelector('.btn-profile-logout') as HTMLButtonElement
    expect(logoutBtn).not.toBeNull()
    logoutBtn.click()
    expect(wrapper.emitted('logout')).toBeTruthy()
  })

  it('deduplicates duplicate checkins preferring the one marked as private', async () => {
    const sampleUser: GoogleUser = {
      userId: '112985692350976832637',
      userName: 'Tor Mala',
      email: 'tormala@example.com',
      avatarUrl: '',
      lastLogin: '2026-09-10T00:16:00Z'
    }

    const checkins = [
      {
        id: 'c_100',
        userId: '112985692350976832637',
        userName: 'Tor Mala',
        userAvatar: '',
        turpostId: 'spot_123',
        turpostName: 'Malabu',
        timestamp: '2026-09-10T00:16:00Z',
        description: 'Fin tur',
        imageUrl: '',
        isPrivate: false
      },
      {
        id: 'c_100',
        userId: '112985692350976832637',
        userName: 'Tor Mala',
        userAvatar: '',
        turpostId: 'spot_123',
        turpostName: 'Malabu',
        timestamp: '2026-09-10T00:16:00Z',
        description: 'Fin tur',
        imageUrl: '',
        isPrivate: true
      }
    ]

    mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins
      }
    })

    const headings = document.body.querySelectorAll('.turpost-heading')
    const malabuHeadings = Array.from(headings).filter(h => h.textContent?.includes('Malabu'))
    expect(malabuHeadings).toHaveLength(1)

    const badge = document.body.querySelector('.private-badge-pill')
    expect(badge).not.toBeNull()
  })

  it('emits open-friends, open-saved-tracks, open-my-spots without emitting close', async () => {
    const sampleUser = {
      userId: 'user_123',
      userName: 'Test Bruker',
      email: 'test@example.com',
      avatarUrl: '',
      lastLogin: '2026-09-10T00:00:00Z'
    }

    const wrapper = mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins: [],
        friendsCount: 3,
        savedTracksCount: 2,
        mySpotsCount: 5
      }
    })

    const friendsBtn = document.body.querySelector('.profile-friends-card') as HTMLButtonElement
    expect(friendsBtn).not.toBeNull()
    friendsBtn.click()
    expect(wrapper.emitted('open-friends')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    const tracksBtn = document.body.querySelector('.profile-tracks-card') as HTMLButtonElement
    expect(tracksBtn).not.toBeNull()
    tracksBtn.click()
    expect(wrapper.emitted('open-saved-tracks')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    const spotsBtn = document.body.querySelector('.profile-spots-card') as HTMLButtonElement
    expect(spotsBtn).not.toBeNull()
    spotsBtn.click()
    expect(wrapper.emitted('open-my-spots')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('renders compact stat badges in header with tooltips and counts', async () => {
    const sampleUser = {
      userId: 'user_123',
      userName: 'Test Bruker',
      email: 'test@example.com',
      avatarUrl: '',
      lastLogin: '2026-09-10T00:00:00Z'
    }

    const checkins = [
      {
        id: 'c_1',
        userId: 'user_123',
        userName: 'Test Bruker',
        userAvatar: '',
        turpostId: 'post_1',
        turpostName: 'Fløyen',
        timestamp: '2026-09-01T10:00:00Z',
        description: 'Fin tur',
        imageUrl: ''
      },
      {
        id: 'c_2',
        userId: 'user_123',
        userName: 'Test Bruker',
        userAvatar: '',
        turpostId: 'post_1',
        turpostName: 'Fløyen',
        timestamp: '2026-09-02T10:00:00Z',
        description: 'Nok en tur',
        imageUrl: ''
      },
      {
        id: 'c_3',
        userId: 'user_123',
        userName: 'Test Bruker',
        userAvatar: '',
        turpostId: 'post_2',
        turpostName: 'Ulriken',
        timestamp: '2026-09-03T10:00:00Z',
        description: 'Høy topp',
        imageUrl: ''
      }
    ]

    mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins
      }
    })

    const trophyBadge = document.body.querySelector('.header-stat-badge.trophy') as HTMLElement
    expect(trophyBadge).not.toBeNull()
    expect(trophyBadge.textContent).toContain('3')
    expect(trophyBadge.getAttribute('title')).toBe('3 innsjekkinger')

    const mountainBadge = document.body.querySelector('.header-stat-badge.mountain') as HTMLElement
    expect(mountainBadge).not.toBeNull()
    expect(mountainBadge.textContent).toContain('2')
    expect(mountainBadge.getAttribute('title')).toBe('2 unike turposter')
  })

  it('renders "Mine spor" and shows "Forslag" card only for admin with pending suggestions', async () => {
    const sampleUser = {
      userId: 'admin_1',
      userName: 'Admin Bruker',
      email: 'admin@example.com',
      avatarUrl: '',
      lastLogin: '2026-09-10T00:00:00Z'
    }

    // 1. Admin uten forslag: forslag-knapp vises ikke
    const wrapperNoSuggestions = mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins: [],
        isAdmin: true,
        spotSuggestionsCount: 0
      }
    })

    expect(document.body.textContent).toContain('Spor')
    expect(document.body.querySelector('.profile-suggestions-card')).toBeNull()
    wrapperNoSuggestions.unmount()
    document.body.innerHTML = ''

    // 2. Admin med forslag: forslag-knapp vises med antall nye
    const wrapperWithSuggestions = mount(UserProfileMenu, {
      props: {
        isOpen: true,
        user: sampleUser,
        checkins: [],
        isAdmin: true,
        spotSuggestionsCount: 3
      }
    })

    const suggestionsCard = document.body.querySelector('.profile-suggestions-card') as HTMLButtonElement
    expect(suggestionsCard).not.toBeNull()
    expect(suggestionsCard.textContent).toContain('Forslag')
    expect(suggestionsCard.textContent).toContain('3 nye')

    suggestionsCard.click()
    expect(wrapperWithSuggestions.emitted('open-spot-suggestions')).toHaveLength(1)
    expect(wrapperWithSuggestions.emitted('close')).toBeUndefined()
    wrapperWithSuggestions.unmount()
  })
})

describe('Automatisk valg av OpenStreetMap ved geolokasjon i utlandet (f.eks. Guardamar del Segura)', () => {
  it('velger automatisk Standard OpenStreetMap når brukeren befinner seg i Guardamar del Segura (Spania)', async () => {
    const guardamarCoords = {
      latitude: 38.0904, // Guardamar del Segura, Spania
      longitude: -0.6577,
      accuracy: 10,
      heading: null,
      speed: null,
      altitude: null
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            {
              name: 'Utlandet',
              slug: 'utlandet',
              count: 6,
              kommuner: [{ name: 'Spania', slug: 'spania', count: 6 }]
            }
          ]
        } as unknown as Response
      }
      return { ok: false, headers: { get: () => '' } } as unknown as Response
    })

    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: guardamarCoords,
          timestamp: Date.now()
        })
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn()
    }
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: mockGeolocation
    })

    const wrapper = mount(MapView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          MapViewer: true,
          RouterView: true
        }
      }
    })

    // Vent på at onMounted og async isAbroad har fullført
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Sjekk at AppHeader mottar activeLayer='standard' (Standard OpenStreetMap)
    const appHeader = wrapper.findComponent(AppHeader)
    expect(appHeader.exists()).toBe(true)
    expect(appHeader.props('activeLayer')).toBe('standard')
  })

  it('beholder Norgeskart når brukeren befinner seg i Norge (f.eks. Bergen)', async () => {
    const bergenCoords = {
      latitude: 60.3913, // Bergen, Norge
      longitude: 5.3221,
      accuracy: 10,
      heading: null,
      speed: null,
      altitude: null
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            {
              name: 'Vestland',
              slug: 'vestland',
              count: 100,
              kommuner: [{ name: 'Bergen', slug: 'bergen', count: 50 }]
            }
          ]
        } as unknown as Response
      }
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Bergen' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [5.1, 60.2],
                      [5.5, 60.2],
                      [5.5, 60.5],
                      [5.1, 60.5],
                      [5.1, 60.2]
                    ]
                  ]
                }
              }
            ]
          })
        } as unknown as Response
      }
      return { ok: false, headers: { get: () => '' } } as unknown as Response
    })

    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: bergenCoords,
          timestamp: Date.now()
        })
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn()
    }
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: mockGeolocation
    })

    const wrapper = mount(MapView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          MapViewer: true,
          RouterView: true
        }
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const appHeader = wrapper.findComponent(AppHeader)
    expect(appHeader.exists()).toBe(true)
    // For posisjon i Norge forblir kartet på norgeskart
    expect(appHeader.props('activeLayer')).toBe('norgeskart')
  })

  it('bytter automatisk til Standard OpenStreetMap når brukeren viser et spor i utlandet (f.eks. Alcudia på Mallorca)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const appState = useAppStateStore()

    const wrapper = mount(MapView, {
      global: {
        plugins: [pinia],
        stubs: {
          MapViewer: true,
          RouterView: true
        }
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    // Sjekk at initialt kartlag er norgeskart
    const appHeader = wrapper.findComponent(AppHeader)
    expect(appHeader.props('activeLayer')).toBe('norgeskart')

    // Be om å vise et spor i Alcudia, Mallorca (Spania)
    const mallorcaTrack: SavedTrack = {
      id: 'alcudia_1',
      userId: 'friend_1',
      name: 'Alcudia GamleByRunde',
      createdAt: 1727771000000,
      startTime: 1727771000000,
      endTime: 1727787500000,
      distanceMeters: 4300,
      durationMs: 16500000,
      points: [
        { lat: 39.8523, lng: 3.1215 },
        { lat: 39.8530, lng: 3.1220 }
      ],
      visibility: 'friends'
    }

    appState.requestViewTrack(mallorcaTrack)
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Kartlaget skal nå automatisk ha byttet til standard (OpenStreetMap)
    expect(appHeader.props('activeLayer')).toBe('standard')
  })

  it('beholder Norgeskart når brukeren viser et spor i Norge (f.eks. Bergen)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const appState = useAppStateStore()

    const wrapper = mount(MapView, {
      global: {
        plugins: [pinia],
        stubs: {
          MapViewer: true,
          RouterView: true
        }
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const appHeader = wrapper.findComponent(AppHeader)
    expect(appHeader.props('activeLayer')).toBe('norgeskart')

    const bergenTrack: SavedTrack = {
      id: 'kollbudalen_1',
      userId: 'friend_1',
      name: 'Kollbudalen',
      createdAt: 1728734100000,
      startTime: 1728734100000,
      endTime: 1728738300000,
      distanceMeters: 2800,
      durationMs: 4200000,
      points: [
        { lat: 60.4621, lng: 5.3437 },
        { lat: 60.4630, lng: 5.3450 }
      ],
      visibility: 'friends'
    }

    appState.requestViewTrack(bergenTrack)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(appHeader.props('activeLayer')).toBe('norgeskart')
  })

  it('sentrerer kartet på brukerens posisjon så snart den blir funnet', async () => {
    const osloCoords = {
      latitude: 59.9139,
      longitude: 10.7522,
      accuracy: 10,
      heading: null,
      speed: null,
      altitude: null
    }

    const centerOnUserSpy = vi.fn()

    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: osloCoords,
          timestamp: Date.now()
        })
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn()
    }
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: mockGeolocation
    })

    const wrapper = mount(MapView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          MapViewer: {
            template: '<div id="map-viewer-stub"></div>',
            methods: {
              centerOnUser: centerOnUserSpy
            }
          },
          RouterView: true
        }
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(centerOnUserSpy).toHaveBeenCalledWith(true, 15)
  })


})

describe('MapLayerButton', () => {
  it('does not show Google map layers when user is not logged in', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: false,
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    expect(wrapper.text()).not.toContain('Google Veikart')
    expect(wrapper.text()).not.toContain('Google Satellitt')
    expect(wrapper.text()).not.toContain('Google Terreng')
    expect(wrapper.text()).toContain('Standard OpenStreetMap')
    expect(wrapper.text()).toContain('Kartverket Sjøkart')
    expect(wrapper.text()).toContain('OpenSeaMap Sjøkart')
  })

  it('shows Google map layers only when user is admin, and shows sea maps for all users', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: true,
        isAdmin: false,
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    expect(wrapper.text()).not.toContain('Google Veikart')
    expect(wrapper.text()).not.toContain('Google Satellitt (Hybrid)')
    expect(wrapper.text()).not.toContain('Google Terreng')

    expect(wrapper.text()).toContain('Kartverket Sjøkart')
    expect(wrapper.text()).toContain('OpenSeaMap Sjøkart')

    await wrapper.setProps({ isAdmin: true })
    expect(wrapper.text()).toContain('Google Veikart')
    expect(wrapper.text()).toContain('Google Satellitt (Hybrid)')
    expect(wrapper.text()).toContain('Google Terreng')
  })

  it('renders map layers in ascending order of sortnum', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: false,
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    const layerItems = wrapper.findAll('.layer-item .layer-name')
    const layerNames = layerItems.map((item) => item.text())

    expect(layerNames[0]).toBe('Kartverket Norgeskart')
    expect(layerNames[1]).toBe('Topografisk (OpenTopoMap)')
    expect(layerNames[2]).toBe('Standard OpenStreetMap')
  })

  it('emits change-layer when selecting a layer', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: false,
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')
    expect(wrapper.find('.layer-modal').exists()).toBe(true)

    const layerItems = wrapper.findAll('.layer-item')
    expect(layerItems[0]).toBeDefined()
    await layerItems[0]!.trigger('click')

    expect(wrapper.emitted('change-layer')).toBeTruthy()
    expect(wrapper.emitted('change-layer')?.[0]).toEqual(['norgeskart'])
  })

  it('does not show Mapbox map layers when user is not admin or mapboxToken is missing', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: true,
        isAdmin: false,
        mapboxToken: 'pk.mocktoken',
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')
    expect(wrapper.text()).not.toContain('Mapbox')

    // Admin, men mangler token
    await wrapper.setProps({ isAdmin: true, mapboxToken: '' })
    expect(wrapper.text()).not.toContain('Mapbox')
  })

  it('shows Mapbox map layers when user is admin and mapboxToken is provided', async () => {
    const wrapper = mount(MapLayerButton, {
      props: {
        activeLayer: 'standard',
        isLoggedIn: true,
        isAdmin: true,
        mapboxToken: 'pk.mocktoken123',
      },
    })

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')
    expect(wrapper.text()).toContain('Mapbox Friluft (Outdoors)')
    expect(wrapper.text()).toContain('Mapbox Satellitt (Hybrid)')
    expect(wrapper.text()).toContain('Mapbox Veikart')

    const mapboxItem = wrapper.findAll('.layer-item').find((el) => el.text().includes('Mapbox Friluft'))
    expect(mapboxItem).toBeDefined()
    await mapboxItem!.trigger('click')

    expect(wrapper.emitted('change-layer')).toBeTruthy()
    expect(wrapper.emitted('change-layer')?.[0]).toEqual(['mapbox_outdoors'])
  })
})


