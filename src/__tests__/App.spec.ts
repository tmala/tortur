import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LocationControls from '../components/LocationControls.vue'
import TurposterPanel from '../components/TurposterPanel.vue'
import CheckinModal from '../components/CheckinModal.vue'
import TurpostCheckinsModal from '../components/TurpostCheckinsModal.vue'
import UserProfileModal from '../components/UserProfileModal.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('LocationControls', () => {
  it('renders application title and toggles menu properly', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: { lat: 60.3913, lng: 5.3221, zoom: 13 },
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true
      }
    })

    expect(wrapper.text()).toContain('TorTur')
    // Menu is closed by default to save map space
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)

    // Click TorTur badge to open menu
    await wrapper.find('.brand-badge-btn').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(true)
    expect(wrapper.text()).toContain('Turposter')
    expect(wrapper.find('.btn-locate').attributes('title')).toBe('Hvor er jeg?')
    expect(wrapper.find('.btn-local-turposter').attributes('title')).toBe('Vis turposter i min kommune')
    expect(wrapper.find('.btn-track').attributes('title')).toBe('Følg meg')

    // Click close button to dismiss menu
    await wrapper.find('.btn-close-menu').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)
  })

  it('hides AIS controls for non-admin users and shows them for admin', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true,
        isLoggedIn: true,
        isAdmin: false
      }
    })

    // Open menu
    await wrapper.find('.brand-badge-btn').trigger('click')
    expect(wrapper.find('.btn-ais').exists()).toBe(false)
    expect(wrapper.find('button[title="Båttrafikk (AIS) innstillinger"]').exists()).toBe(false)

    // Set isAdmin: true
    await wrapper.setProps({ isAdmin: true })
    expect(wrapper.find('.btn-ais').exists()).toBe(true)
    expect(wrapper.find('button[title="Båttrafikk (AIS) innstillinger"]').exists()).toBe(true)
  })

  it('does not show Google map layers when user is not logged in', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true,
        isLoggedIn: false
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    expect(wrapper.text()).not.toContain('Google Veikart')
    expect(wrapper.text()).not.toContain('Google Satellitt')
    expect(wrapper.text()).not.toContain('Google Terreng')
    expect(wrapper.text()).toContain('Standard OpenStreetMap')
  })

  it('shows Google map layers when user is logged in', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true,
        isLoggedIn: true
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    expect(wrapper.text()).toContain('Google Veikart')
    expect(wrapper.text()).toContain('Google Satellitt (Hybrid)')
    expect(wrapper.text()).toContain('Google Terreng')
  })

  it('renders map layers in ascending order of sortnum', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true,
        isLoggedIn: false
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    const layerItems = wrapper.findAll('.layer-item .layer-name')
    const layerNames = layerItems.map(item => item.text())

    // Sjekk at Norgeskart (sortnum 10) kommer før Standard OSM (sortnum 20), og før Sjøkart (sortnum 30)
    expect(layerNames[0]).toBe('Kartverket Norgeskart')
    expect(layerNames[1]).toBe('Standard OpenStreetMap')
    expect(layerNames[2]).toBe('Kartverket Sjøkart')
  })

  it('emits locate event when clicking locate button in menu', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const locateBtn = wrapper.find('.btn-locate')
    await locateBtn.trigger('click')

    expect(wrapper.emitted('locate')).toBeTruthy()
  })

  it('emits toggle-turposter when clicking turposter button in menu', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: 'Luster',
        turpostCount: 412,
        showMunicipalities: true
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const turBtn = wrapper.find('.btn-turposter')
    await turBtn.trigger('click')

    expect(wrapper.emitted('toggle-turposter')).toBeTruthy()
    expect(wrapper.text()).toContain('Luster')
    expect(wrapper.text()).toContain('412')
  })

  it('emits toggle-municipalities when clicking boundary button in menu', async () => {
    const wrapper = mount(LocationControls, {
      props: {
        userLocation: null,
        isLocating: false,
        isTracking: false,
        error: null,
        activeLayer: 'standard',
        centerCoords: null,
        isTurposterOpen: false,
        activeKommuneName: null,
        turpostCount: 0,
        showMunicipalities: true
      }
    })

    await wrapper.find('.brand-badge-btn').trigger('click')
    const boundaryBtn = wrapper.find('button[title="Slå av/på visning av kommunegrenser"]')
    await boundaryBtn.trigger('click')

    expect(wrapper.emitted('toggle-municipalities')).toBeTruthy()
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
    const emittedFylke = wrapper.emitted('select-fylke')![0]![0] as any
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
})

describe('UserProfileModal', () => {
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

    const wrapper = mount(UserProfileModal, {
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

    // Sjekk at detaljer er skjult når listen er kollapset
    expect(document.body.textContent).not.toContain('Nyeste tur!')

    // Klikk for å ekspandere det første kortet
    const firstCardHeader = document.body.querySelector('.checkin-card-header') as HTMLElement
    expect(firstCardHeader).not.toBeNull()
    firstCardHeader.click()
    await wrapper.vm.$nextTick()

    // Nå skal notatet vises
    expect(document.body.textContent).toContain('Nyeste tur!')

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
})
