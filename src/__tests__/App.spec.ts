import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LocationControls from '../components/LocationControls.vue'
import TurposterPanel from '../components/TurposterPanel.vue'

describe('LocationControls', () => {
  it('renders application title and buttons properly', () => {
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

    expect(wrapper.text()).toContain('Hvor er jeg?')
    expect(wrapper.text()).toContain('Følg meg')
    expect(wrapper.text()).toContain('Turposter')
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

    await wrapper.find('button[title="Bytt kartlag"]').trigger('click')

    expect(wrapper.text()).toContain('Google Veikart')
    expect(wrapper.text()).toContain('Google Satellitt (Hybrid)')
    expect(wrapper.text()).toContain('Google Terreng')
  })

  it('emits locate event when clicking locate button', async () => {
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

    const locateBtn = wrapper.find('.btn-locate')
    await locateBtn.trigger('click')

    expect(wrapper.emitted('locate')).toBeTruthy()
  })

  it('emits toggle-turposter when clicking turposter button', async () => {
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

    const turBtn = wrapper.find('.btn-turposter')
    await turBtn.trigger('click')

    expect(wrapper.emitted('toggle-turposter')).toBeTruthy()
    expect(wrapper.text()).toContain('Luster')
    expect(wrapper.text()).toContain('412')
  })

  it('emits toggle-municipalities when clicking boundary button', async () => {
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

    const boundaryBtn = wrapper.findAll('.icon-btn')[0]!
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
})
