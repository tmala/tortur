import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CheckinModal from '@/components/CheckinModal.vue'
import EditCheckinModal from '@/components/EditCheckinModal.vue'
import type { TurpostItem } from '@/composables/useTurposter'
import type { GoogleUser, FirebaseCheckinItem } from '@/composables/useAuth'

describe('Foto- og kamerahåndtering ved innsjekking (Android og iOS)', () => {
  const originalUserAgent = navigator.userAgent
  const originalMaxTouchPoints = navigator.maxTouchPoints

  const mockTurpost: TurpostItem = {
    id: 'tp_1',
    name: 'Fløyen',
    lat: 60.39,
    lng: 5.32,
    alt: 400,
  }

  const mockUser: GoogleUser = {
    userId: 'user_1',
    userName: 'Ola Nordmann',
    email: 'ola@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    lastLogin: new Date().toISOString(),
  }

  const mockCheckin: FirebaseCheckinItem = {
    id: 'chk_1',
    userId: 'user_1',
    userName: 'Ola Nordmann',
    userAvatar: 'https://example.com/avatar.png',
    timestamp: '2026-10-12T00:00:00.000Z',
    turpostId: 'tp_1',
    turpostName: 'Fløyen',
    description: 'Flott tur!',
    imageUrl: 'https://example.com/photo.jpg',
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
      writable: true,
    })
  })

  describe('CheckinModal', () => {
    it('viser to knapper på mobil (Android): "Ta bilde" og "Velg bilde", med kamera-input konfigurert med capture="environment"', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 14; SM-G991B) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      })

      const wrapper = mount(CheckinModal, {
        props: {
          isOpen: true,
          turpost: mockTurpost,
          user: mockUser,
        },
        global: {
          stubs: {
            teleport: true,
            WebcamCapture: true,
            CheckinVisibilitySelector: true,
            TrackPickerModal: true,
          },
        },
      })

      // Sjekk at begge skjulte input-elementer finnes
      const fileInputs = wrapper.findAll('input[type="file"]')
      expect(fileInputs.length).toBe(2)

      const cameraInput = fileInputs.find((input) => input.attributes('capture') === 'environment')
      const galleryInput = fileInputs.find((input) => !input.attributes('capture'))

      expect(cameraInput).toBeDefined()
      expect(cameraInput?.attributes('accept')).toBe('image/*')
      expect(galleryInput).toBeDefined()
      expect(galleryInput?.attributes('accept')).toBe('image/*')

      // Sjekk at mobil-knappene vises
      const buttons = wrapper.findAll('.photo-choice-btn')
      expect(buttons.length).toBe(2)

      const takePhotoBtn = buttons[0]
      const galleryBtn = buttons[1]
      expect(takePhotoBtn).toBeDefined()
      expect(galleryBtn).toBeDefined()

      if (!takePhotoBtn || !galleryBtn) return

      expect(takePhotoBtn.text()).toContain('Ta bilde')
      expect(takePhotoBtn.text()).toContain('Med kamera nå')
      expect(takePhotoBtn.attributes('aria-label')).toBe('Ta bilde med kamera')

      expect(galleryBtn.text()).toContain('Velg bilde')
      expect(galleryBtn.text()).toContain('Fra bildegalleri')
      expect(galleryBtn.attributes('aria-label')).toBe('Velg bilde fra bildegalleri')

      // Klikk på "Ta bilde" skal trigge click på kamera-input
      const cameraInputEl = cameraInput?.element as HTMLInputElement
      const cameraClickSpy = vi.spyOn(cameraInputEl, 'click')
      await takePhotoBtn.trigger('click')
      expect(cameraClickSpy).toHaveBeenCalled()

      // Klikk på "Velg bilde" skal trigge click på galleri-input
      const galleryInputEl = galleryInput?.element as HTMLInputElement
      const galleryClickSpy = vi.spyOn(galleryInputEl, 'click')
      await galleryBtn.trigger('click')
      expect(galleryClickSpy).toHaveBeenCalled()
    })

    it('viser to knapper på desktop: "Webkamera" og "Velg bilde" fra datamaskin', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36',
        configurable: true,
      })
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      })

      const wrapper = mount(CheckinModal, {
        props: {
          isOpen: true,
          turpost: mockTurpost,
          user: mockUser,
        },
        global: {
          stubs: {
            teleport: true,
            WebcamCapture: true,
            CheckinVisibilitySelector: true,
            TrackPickerModal: true,
          },
        },
      })

      const buttons = wrapper.findAll('.photo-choice-btn')
      expect(buttons.length).toBe(2)

      const webcamBtn = buttons[0]
      const fileBtn = buttons[1]
      expect(webcamBtn).toBeDefined()
      expect(fileBtn).toBeDefined()

      if (!webcamBtn || !fileBtn) return

      expect(webcamBtn.text()).toContain('Webkamera')
      expect(webcamBtn.text()).toContain('Ta bilde nå')
      expect(fileBtn.text()).toContain('Velg bilde')
      expect(fileBtn.text()).toContain('Fra datamaskin')
    })
  })

  describe('EditCheckinModal', () => {
    it('viser to knapper i photo picker på mobil (Android): "Ta bilde" og "Velg bilde"', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      })

      // Checkin uten bilde for å se photo-picker-box
      const checkinWithoutPhoto: FirebaseCheckinItem = {
        ...mockCheckin,
        imageUrl: '',
      }

      const wrapper = mount(EditCheckinModal, {
        props: {
          isOpen: true,
          checkin: checkinWithoutPhoto,
        },
        global: {
          stubs: {
            teleport: true,
            WebcamCapture: true,
            CheckinVisibilitySelector: true,
            TrackPickerModal: true,
          },
        },
      })

      const fileInputs = wrapper.findAll('input[type="file"]')
      expect(fileInputs.length).toBe(2)

      const cameraInput = fileInputs.find((input) => input.attributes('capture') === 'environment')
      const galleryInput = fileInputs.find((input) => !input.attributes('capture'))

      expect(cameraInput).toBeDefined()
      expect(galleryInput).toBeDefined()

      const buttons = wrapper.findAll('.btn-photo-action')
      expect(buttons.length).toBe(2)

      const takePhotoBtn = buttons[0]
      const galleryBtn = buttons[1]
      expect(takePhotoBtn).toBeDefined()
      expect(galleryBtn).toBeDefined()

      if (!takePhotoBtn || !galleryBtn) return

      expect(takePhotoBtn.text()).toContain('Ta bilde')
      expect(takePhotoBtn.text()).toContain('Med kamera nå')
      expect(galleryBtn.text()).toContain('Velg bilde')
      expect(galleryBtn.text()).toContain('Fra bildegalleri')

      // Sjekk click dispatch
      const cameraInputEl = cameraInput?.element as HTMLInputElement
      const cameraClickSpy = vi.spyOn(cameraInputEl, 'click')
      await takePhotoBtn.trigger('click')
      expect(cameraClickSpy).toHaveBeenCalled()
    })

    it('viser "Kamera" og "Galleri" i preview-actions på mobil når bilde eksisterer', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1',
        configurable: true,
      })

      const wrapper = mount(EditCheckinModal, {
        props: {
          isOpen: true,
          checkin: mockCheckin,
        },
        global: {
          stubs: {
            teleport: true,
            WebcamCapture: true,
            CheckinVisibilitySelector: true,
            TrackPickerModal: true,
          },
        },
      })

      const previewActionButtons = wrapper.findAll('.btn-preview-action')
      expect(previewActionButtons.length).toBe(3) // Kamera, Galleri, Fjern bilde

      const cameraBtn = previewActionButtons[0]
      const galleryBtn = previewActionButtons[1]
      const removeBtn = previewActionButtons[2]

      expect(cameraBtn).toBeDefined()
      expect(galleryBtn).toBeDefined()
      expect(removeBtn).toBeDefined()

      if (!cameraBtn || !galleryBtn || !removeBtn) return

      expect(cameraBtn.text()).toContain('Kamera')
      expect(galleryBtn.text()).toContain('Galleri')
      expect(removeBtn.text()).toContain('Fjern bilde')
    })
  })
})
