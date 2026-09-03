import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LocationControls from '../components/LocationControls.vue'
import TurposterPanel from '../components/TurposterPanel.vue'
import CheckinModal from '../components/CheckinModal.vue'
import TurpostCheckinsModal from '../components/TurpostCheckinsModal.vue'

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
    expect(wrapper.find('.btn-coord').attributes('title')).toBe('Gå til koordinat')
    expect(wrapper.find('.btn-track').attributes('title')).toBe('Følg meg')

    // Click close button to dismiss menu
    await wrapper.find('.btn-close-menu').trigger('click')
    expect(wrapper.find('.brand-menu-dropdown').exists()).toBe(false)
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
})

describe('CheckinModal', () => {
  it('renders turpost information and user details when open', () => {
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
        user: sampleUser
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Molden')
    expect(text).toContain('1116 moh.')
    expect(text).toContain('Test Turgåer')
    expect(text).toContain('Sjekk inn her')
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
        currentUserId: '123'
      }
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Molden')
    expect(text).toContain('1116 moh.')
    expect(text).toContain('Du har sjekket inn på denne turposten!')

    const quickCheckinBtn = document.body.querySelector('.btn-checkin-quick') as HTMLButtonElement
    expect(quickCheckinBtn).not.toBeNull()
    quickCheckinBtn.click()
    expect(wrapper.emitted('open-checkin')).toBeTruthy()
    expect(wrapper.emitted('open-checkin')![0]![0]).toEqual(samplePost)
  })
})
