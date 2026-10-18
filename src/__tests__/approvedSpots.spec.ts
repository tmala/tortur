import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MySpotsMenu from '@/components/MySpotsMenu.vue'
import SpotSuggestionsMenu from '@/components/SpotSuggestionsMenu.vue'
import type { TurpostItem } from '@/composables/useTurposter'
import type { SpotSuggestion, ApprovedSpot } from '@/composables/usePrivateTurposter'
import { createPinia, setActivePinia } from 'pinia'

const mockApproveSpotSuggestion = vi.fn().mockResolvedValue(undefined)
const mockDenySpotSuggestion = vi.fn().mockResolvedValue(undefined)
const mockDeleteSpotSuggestion = vi.fn().mockResolvedValue(undefined)
const mockFetchSpotSuggestions = vi.fn().mockResolvedValue([])
const mockCalculateCsvPlacement = vi.fn().mockResolvedValue({ lineNumber: 1, totalLines: 1 })
const mockFetchApprovedSpots = vi.fn().mockResolvedValue([])

vi.mock('@/composables/usePrivateTurposter', () => ({
  usePrivateTurposter: () => ({
    fetchSpotSuggestions: mockFetchSpotSuggestions,
    deleteSpotSuggestion: mockDeleteSpotSuggestion,
    denySpotSuggestion: mockDenySpotSuggestion,
    approveSpotSuggestion: mockApproveSpotSuggestion,
    fetchApprovedSpots: mockFetchApprovedSpots,
    calculateCsvPlacement: mockCalculateCsvPlacement
  })
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: { value: { userId: 'admin_123', userName: 'Admin Bruker', email: 'admin@tortur.no', isAdmin: true } },
    isAdmin: { value: true },
    isLoggedIn: { value: true },
    getFirebaseConfig: vi.fn().mockResolvedValue({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'tortur' }),
    fetchFirebase: vi.fn()
  }),
  getFirebaseConfig: vi.fn().mockResolvedValue({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'tortur' }),
  fetchFirebase: vi.fn()
}))

describe('Approved Spots Flow and UI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  describe('MySpotsMenu - Approved Badge', () => {
    it('displays "✅ Godkjent av admin" badge and hides suggest button for approved spots', () => {
      const spots: TurpostItem[] = [
        {
          id: 'spot_approved',
          name: 'Godkjent turpost',
          lat: 60.1,
          lng: 5.2,
          alt: 150,
          isPrivate: true,
          status: 'approved',
          suggestedForPublic: true
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
      expect(html).toContain('✅ Godkjent av admin')
      expect(html).toContain('📨 Foreslått for admin')
      expect(html).toContain('🔒 Privat')

      // Check suggest buttons: only spot_private should have suggest button
      const suggestButtons = wrapper.findAll('.btn-suggest-spot')
      expect(suggestButtons).toHaveLength(1)
      expect(suggestButtons[0]?.text()).toContain('Foreslå som offentlig')
    })
  })

  describe('SpotSuggestionsMenu - Approve Action', () => {
    it('renders "Godkjenn og publiser" button and calls approveSpotSuggestion on click', async () => {
      const mockSuggestions: SpotSuggestion[] = [
        {
          id: 'sugg_abc',
          name: 'Ny Topp',
          lat: 60.5,
          lng: 5.5,
          alt: 500,
          fylke: 'Vestland',
          kommune: 'Bergen',
          csvLine: 'sugg_abc;Ny Topp;60.5;5.5;500;Vestland;Bergen',
          suggestedAt: '2026-10-10T12:00:00.000Z',
          userId: 'user_sender',
          userName: 'Turgåer Kari',
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

      await vi.dynamicImportSettled()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      const approveButton = wrapper.find('.btn-approve-suggestion')
      expect(approveButton.exists()).toBe(true)
      expect(approveButton.text()).toContain('Godkjenn og publiser')

      await approveButton.trigger('click')

      expect(mockApproveSpotSuggestion).toHaveBeenCalledWith(
        mockSuggestions[0],
        'Admin Bruker'
      )
    })
  })

  describe('ApprovedSpot interface structure', () => {
    it('validates approved spot model properties', () => {
      const sampleApprovedSpot: ApprovedSpot = {
        id: 'spot_1',
        name: 'Veten',
        lat: 60.5,
        lng: 5.3,
        alt: 486,
        fylke: 'Vestland',
        kommune: 'Bergen',
        csvLine: 'spot_1;Veten;60.500000;5.300000;486;Vestland;Bergen',
        ownerId: 'user_1',
        ownerName: 'Ola Nordmann',
        approvedAt: '2026-10-11T12:00:00.000Z',
        approvedBy: 'Admin Bruker',
        status: 'approved',
        exportedToCsv: false
      }

      expect(sampleApprovedSpot.id).toBe('spot_1')
      expect(sampleApprovedSpot.status).toBe('approved')
      expect(sampleApprovedSpot.exportedToCsv).toBe(false)
    })
  })
})
