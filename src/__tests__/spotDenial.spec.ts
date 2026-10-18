import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MySpotsMenu from '@/components/MySpotsMenu.vue'
import SpotSuggestionsMenu from '@/components/SpotSuggestionsMenu.vue'
import type { TurpostItem } from '@/composables/useTurposter'
import type { SpotSuggestion } from '@/composables/usePrivateTurposter'
import { createPinia, setActivePinia } from 'pinia'

const mockDenySpotSuggestion = vi.fn().mockResolvedValue(undefined)
const mockDeleteSpotSuggestion = vi.fn().mockResolvedValue(undefined)
const mockFetchSpotSuggestions = vi.fn().mockResolvedValue([])
const mockCalculateCsvPlacement = vi.fn().mockResolvedValue({ lineNumber: 1, totalLines: 1 })

vi.mock('@/composables/usePrivateTurposter', () => ({
  usePrivateTurposter: () => ({
    fetchSpotSuggestions: mockFetchSpotSuggestions,
    deleteSpotSuggestion: mockDeleteSpotSuggestion,
    denySpotSuggestion: mockDenySpotSuggestion,
    calculateCsvPlacement: mockCalculateCsvPlacement
  })
}))

describe('Spot Denial Flow and UI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  describe('MySpotsMenu', () => {
    it('displays "Avvist av admin" badge and hides suggest button for denied spots', () => {
      const spots: TurpostItem[] = [
        {
          id: 'spot_denied',
          name: 'Avvist turpost',
          lat: 60.1,
          lng: 5.2,
          alt: 150,
          isPrivate: true,
          status: 'denied',
          suggestedForPublic: false
        },
        {
          id: 'spot_pending',
          name: 'Venter turpost',
          lat: 60.2,
          lng: 5.3,
          alt: 200,
          isPrivate: true,
          status: 'pending',
          suggestedForPublic: true
        },
        {
          id: 'spot_private',
          name: 'Helt privat turpost',
          lat: 60.3,
          lng: 5.4,
          alt: 300,
          isPrivate: true,
          status: 'private',
          suggestedForPublic: false
        }
      ]

      const wrapper = mount(MySpotsMenu, {
        props: {
          isOpen: true,
          spots,
          isLoading: false
        },
        global: {
          stubs: {
            Teleport: true,
            transition: false
          }
        }
      })

      const html = wrapper.html()

      // Check badges
      expect(html).toContain('🚫 Avvist av admin')
      expect(html).toContain('📨 Foreslått for admin')
      expect(html).toContain('🔒 Privat')

      // Check suggest buttons
      const suggestButtons = wrapper.findAll('.btn-suggest-spot')
      // Only spot_private should have the suggest button, spot_denied and spot_pending should not
      expect(suggestButtons).toHaveLength(1)
      expect(suggestButtons[0]?.text()).toContain('Foreslå som offentlig')
    })
  })

  describe('SpotSuggestionsMenu', () => {
    it('renders "Avvis forslag" and calls denySpotSuggestion when clicked', async () => {
      const mockSuggestions: SpotSuggestion[] = [
        {
          id: 'sugg_1',
          name: 'Foreslått fjelltopp',
          lat: 60.4,
          lng: 5.3,
          alt: 450,
          fylke: 'Vestland',
          kommune: 'Bergen',
          csvLine: 'sugg_1;Foreslått fjelltopp;60.4;5.3;450;Vestland;Bergen',
          suggestedAt: '2026-09-20T10:00:00.000Z',
          userId: 'user_sender',
          status: 'pending'
        }
      ]

      mockFetchSpotSuggestions.mockResolvedValue(mockSuggestions)

      const wrapper = mount(SpotSuggestionsMenu, {
        props: {
          isOpen: true
        },
        global: {
          stubs: {
            Teleport: true
          }
        }
      })

      // Wait for fetchSpotSuggestions
      await vi.dynamicImportSettled()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      const denyButton = wrapper.find('.btn-deny-suggestion')
      expect(denyButton.exists()).toBe(true)
      expect(denyButton.text()).toContain('Avvis forslag')

      const approveButton = wrapper.find('.btn-approve-suggestion')
      expect(approveButton.exists()).toBe(true)
      expect(approveButton.text()).toContain('Godkjenn')

      // Click deny
      await denyButton.trigger('click')

      expect(mockDenySpotSuggestion).toHaveBeenCalledWith('sugg_1')
    })
  })
})
