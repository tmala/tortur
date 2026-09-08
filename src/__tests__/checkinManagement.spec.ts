import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from '../composables/useAuth'
import { usePrivateTurposter } from '../composables/usePrivateTurposter'

describe('Checkin deletion and image updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('deletePublicCheckin calls Apps Script and Firebase DELETE', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
      if (typeof url === 'string' && url.includes('script.google.com')) {
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, checkinId: 'c_101' }),
          json: async () => ({ success: true, checkinId: 'c_101' })
        } as any
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as any
    })

    const { user, systemConfig, deletePublicCheckin } = useAuth()
    user.value = {
      userId: 'test_user_sub',
      userName: 'Test User',
      email: 'test@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    await deletePublicCheckin({
      turpostId: '123',
      checkinId: 'c_101',
      timestamp: '2026-09-08T10:00:00Z'
    })

    // Should call Apps Script with delete_checkin
    const appsScriptCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'delete_checkin'
    })
    expect(appsScriptCall).toBeDefined()
    const payload = JSON.parse(appsScriptCall![1]?.body as string)
    expect(payload.userId).toBe('test_user_sub')
    expect(payload.turpostId).toBe('123')
    expect(payload.checkinId).toBe('c_101')

    // Should call Firebase DELETE on turposter and brukere
    const fbTurpostDelete = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/123/c_101.json') && c[1]?.method === 'DELETE'
    )
    expect(fbTurpostDelete).toBeDefined()

    const fbUserDelete = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/test_user_sub/c_101.json') && c[1]?.method === 'DELETE'
    )
    expect(fbUserDelete).toBeDefined()
  })

  it('updatePublicCheckinImage calls Apps Script and Firebase PATCH', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('script.google.com')) {
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, checkinId: 'c_102', imageUrl: 'https://lh3.googleusercontent.com/d/file123' }),
          json: async () => ({ success: true, checkinId: 'c_102', imageUrl: 'https://lh3.googleusercontent.com/d/file123' })
        } as any
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as any
    })

    const { user, systemConfig, updatePublicCheckinImage } = useAuth()
    user.value = {
      userId: 'test_user_sub',
      userName: 'Test User',
      email: 'test@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const mockFile = new File(['dummy content'], 'photo.jpg', { type: 'image/jpeg' })
    const resultUrl = await updatePublicCheckinImage({
      turpostId: '456',
      checkinId: 'c_102',
      imageFile: mockFile
    })

    expect(resultUrl).toBe('https://lh3.googleusercontent.com/d/file123')

    // Should call Apps Script with update_checkin_image
    const appsScriptCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'update_checkin_image'
    })
    expect(appsScriptCall).toBeDefined()

    // Should call Firebase PATCH on turposter and brukere
    const fbTurpostPatch = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/456/c_102.json') && c[1]?.method === 'PATCH'
    )
    expect(fbTurpostPatch).toBeDefined()
    const patchBody = JSON.parse(fbTurpostPatch![1]?.body as string)
    expect(patchBody.imageUrl).toBe('https://lh3.googleusercontent.com/d/file123')
  })

  it('updatePrivateCheckinImage patches imageUrl in user private checkins', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as any)

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { updatePrivateCheckinImage } = usePrivateTurposter()
    await updatePrivateCheckinImage('user_123', 'spot_abc', 'checkin_999', null)

    const patchCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_123/my_spots_checkins/spot_abc/checkin_999.json') &&
      c[1]?.method === 'PATCH'
    )
    expect(patchCall).toBeDefined()
    const body = JSON.parse(patchCall![1]?.body as string)
    expect(body.imageUrl).toBe('')
  })
})
