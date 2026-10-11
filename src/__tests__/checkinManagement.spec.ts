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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
      if (typeof url === 'string' && (url.includes('script.google.com') || url.includes('/api/') || url.includes('tortur-api'))) {
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, checkinId: 'c_101' }),
          json: async () => ({ success: true, checkinId: 'c_101' })
        } as unknown as Response
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
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
      String(c[0]).includes('/brukere/test_user_sub/checkins/c_101.json') && c[1]?.method === 'DELETE'
    )
    expect(fbUserDelete).toBeDefined()
  })

  it('updatePublicCheckinImage calls Apps Script and Firebase PATCH', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && (url.includes('script.google.com') || url.includes('/api/') || url.includes('tortur-api') || url.includes('cloudfunctions.net'))) {
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, checkinId: 'c_102', imageUrl: 'https://lh3.googleusercontent.com/d/file123' }),
          json: async () => ({ success: true, checkinId: 'c_102', imageUrl: 'https://lh3.googleusercontent.com/d/file123' })
        } as unknown as Response
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
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

    // Should call Apps Script with update_checkin or update_checkin_image
    const appsScriptCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'update_checkin' || body?.action === 'update_checkin_image'
    })
    expect(appsScriptCall).toBeDefined()

    // Should call Firebase PATCH on turposter and brukere checkins
    const fbTurpostPatch = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/456/c_102.json') && c[1]?.method === 'PATCH'
    )
    expect(fbTurpostPatch).toBeDefined()
    const patchBody = JSON.parse(fbTurpostPatch![1]?.body as string)
    expect(patchBody.imageUrl).toBe('https://lh3.googleusercontent.com/d/file123')

    const fbUserPatch = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/test_user_sub/checkins/c_102.json') && c[1]?.method === 'PATCH'
    )
    expect(fbUserPatch).toBeDefined()
  })

  it('updatePublicCheckin updates description and removes image', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && (url.includes('script.google.com') || url.includes('/api/') || url.includes('tortur-api') || url.includes('cloudfunctions.net'))) {
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, checkinId: 'c_103' }),
          json: async () => ({ success: true, checkinId: 'c_103' })
        } as unknown as Response
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
    })

    const { user, systemConfig, updatePublicCheckin } = useAuth()
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

    await updatePublicCheckin({
      turpostId: '789',
      checkinId: 'c_103',
      description: 'Fin tur til toppen!',
      removeImage: true
    })

    const appsScriptCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'update_checkin'
    })
    expect(appsScriptCall).toBeDefined()
    const payload = JSON.parse(appsScriptCall![1]?.body as string)
    expect(payload.description).toBe('Fin tur til toppen!')
    expect(payload.removeImage).toBe(true)

    const fbTurpostPatch = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/turposter/789/c_103.json') && c[1]?.method === 'PATCH'
    )
    expect(fbTurpostPatch).toBeDefined()
    const patchBody = JSON.parse(fbTurpostPatch![1]?.body as string)
    expect(patchBody.description).toBe('Fin tur til toppen!')
    expect(patchBody.imageUrl).toBe('')

    const fbUserPatch = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/test_user_sub/checkins/c_103.json') && c[1]?.method === 'PATCH'
    )
    expect(fbUserPatch).toBeDefined()
  })

  it('updatePrivateCheckinImage patches imageUrl in user private checkins', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, imageUrl: '' }),
      json: async () => ({})
    } as unknown as Response)

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

  it('migrerer automatisk eldre innsjekkinger fra bruker-rot til /checkins/ under fetchMyCheckins', async () => {
    const fakeUserData: Record<string, unknown> = {
      tracks: { 'track-1': { id: 'track-1' } },
      my_spots: { 'spot-1': { id: 'spot-1' } },
      settings: { defaultVisibility: 'all' },
      // To eldre innsjekkinger som ligger direkte under bruker-ID:
      'chk_old_1': {
        id: 'chk_old_1',
        turpostId: '1001',
        turpostName: 'Ulriken',
        timestamp: '2026-09-01T12:00:00Z',
        userId: 'user_mig_1'
      },
      'chk_old_2': {
        id: 'chk_old_2',
        turpostId: '1002',
        turpostName: 'Fløyen',
        timestamp: '2026-09-02T14:00:00Z',
        userId: 'user_mig_1'
      }
    }

    const checkinsSubnode: Record<string, unknown> = {}

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const urlStr = String(url)

      // 1. GET brukerrot under migrering
      if (urlStr.endsWith('/brukere/user_mig_1.json') && (!opts || opts.method === 'GET' || !opts.method)) {
        return {
          ok: true,
          json: async () => fakeUserData
        } as unknown as Response
      }

      // 2. PUT til /checkins/<id>.json
      if (urlStr.includes('/brukere/user_mig_1/checkins/') && opts?.method === 'PUT') {
        const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}
        checkinsSubnode[body.id] = body
        return { ok: true, json: async () => body } as unknown as Response
      }

      // 3. DELETE fra gammel rot
      if (urlStr.endsWith('/brukere/user_mig_1/chk_old_1.json') && opts?.method === 'DELETE') {
        delete fakeUserData['chk_old_1']
        return { ok: true, json: async () => null } as unknown as Response
      }
      if (urlStr.endsWith('/brukere/user_mig_1/chk_old_2.json') && opts?.method === 'DELETE') {
        delete fakeUserData['chk_old_2']
        return { ok: true, json: async () => null } as unknown as Response
      }

      // 4. GET /checkins.json
      if (urlStr.endsWith('/brukere/user_mig_1/checkins.json')) {
        return {
          ok: true,
          json: async () => checkinsSubnode
        } as unknown as Response
      }

      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { user, systemConfig, fetchMyCheckins } = useAuth()
    user.value = {
      userId: 'user_mig_1',
      userName: 'Migrasjonsbruker',
      email: 'mig@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const checkins = await fetchMyCheckins()

    // Verifiser at begge innsjekkinger ble returnert
    expect(checkins.length).toBe(2)
    expect(checkins.map(c => c.id).sort()).toEqual(['chk_old_1', 'chk_old_2'])

    // Verifiser at PUT ble kalt til /checkins/ for begge to
    const putChk1 = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_mig_1/checkins/chk_old_1.json') && c[1]?.method === 'PUT'
    )
    const putChk2 = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_mig_1/checkins/chk_old_2.json') && c[1]?.method === 'PUT'
    )
    expect(putChk1).toBeDefined()
    expect(putChk2).toBeDefined()

    // Verifiser at DELETE ble kalt for de gamle rot-nodene
    const delOld1 = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_mig_1/chk_old_1.json') && c[1]?.method === 'DELETE'
    )
    const delOld2 = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('/brukere/user_mig_1/chk_old_2.json') && c[1]?.method === 'DELETE'
    )
    expect(delOld1).toBeDefined()
    expect(delOld2).toBeDefined()

    // Verifiser at subnoder som tracks, my_spots, settings IKKE ble slettet
    const delTracks = fetchSpy.mock.calls.find(c => String(c[0]).includes('/tracks') && c[1]?.method === 'DELETE')
    expect(delTracks).toBeUndefined()

    // Verifiser at localStorage-flagg ble satt
    expect(localStorage.getItem('tortur_migrated_checkins_user_mig_1')).toBe('true')
  })

  it('lookupTurpost finner turpost fra CSV basert på ID eller navn', async () => {
    const { lookupTurpost } = await import('../composables/useTurposter')

    const mockCsv = `turpostId;turpostNavn;latitude;longitude;altitude;fylke;kommune
post_101;Ekorn-stien;60.45;5.32;150;Vestland;Bergen
post_102;Hafskorsundet;61.42;7.25;210;Vestland;Luster`

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('mountains.csv')) {
        return {
          ok: true,
          text: async () => mockCsv
        } as unknown as Response
      }
      return { ok: false } as unknown as Response
    })

    const byId = await lookupTurpost('post_101')
    expect(byId).toBeDefined()
    expect(byId?.name).toBe('Ekorn-stien')
    expect(byId?.lat).toBe(60.45)
    expect(byId?.lng).toBe(5.32)
    expect(byId?.kommune).toBe('Bergen')

    const byName = await lookupTurpost(undefined, 'hafskorsundet')
    expect(byName).toBeDefined()
    expect(byName?.id).toBe('post_102')
    expect(byName?.kommune).toBe('Luster')

    const nonExistent = await lookupTurpost('does_not_exist')
    expect(nonExistent).toBeNull()
  })

  it('submitCheckin sender bilde som base64 data-URL og oppretter innsjekk', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
      if (typeof url === 'string' && (url.includes('script.google.com') || url.includes('/api/') || url.includes('tortur-api') || url.includes('cloudfunctions.net'))) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              success: true,
              checkin: {
                id: 'c_test_image',
                turpostId: '101',
                turpostName: 'Fjelltopp',
                timestamp: '2026-09-16T12:00:00.000Z',
                description: 'Flott tur',
                imageUrl: 'https://lh3.googleusercontent.com/d/newimage123',
                userId: 'test_user_sub'
              }
            }),
          json: async () => ({})
        } as unknown as Response
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
    })

    const { user, systemConfig, submitCheckin } = useAuth()
    user.value = {
      userId: 'test_user_sub',
      userName: 'Test Turgåer',
      email: 'tur@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const testFile = new File(['bilde-innhold-test'], 'tur.jpg', { type: 'image/jpeg' })
    const res = await submitCheckin({
      turpostId: '101',
      turpostName: 'Fjelltopp',
      description: 'Flott tur',
      imageFile: testFile
    })

    expect(res.id).toBe('c_test_image')
    expect(res.imageUrl).toBe('https://lh3.googleusercontent.com/d/newimage123')

    // Verifiser payload sendt til Apps Script
    const appsScriptCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'checkin'
    })
    expect(appsScriptCall).toBeDefined()
    const callBody = JSON.parse(appsScriptCall![1]?.body as string)
    expect(callBody.image).toBeDefined()
    expect(callBody.image.mimeType).toBe('image/jpeg')
    expect(callBody.image.base64).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('submitCheckin laster opp bilde direkte via Cloud Function multipart og sender imageUrl til backend', async () => {
    vi.stubEnv('VITE_DRIVE_UPLOAD_URL', 'https://europe-west1-test.cloudfunctions.net/uploadCheckinImage')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('uploadCheckinImage') && opts?.body instanceof FormData) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'https://lh3.googleusercontent.com/d/cloudimage999',
            fileId: 'cloudimage999'
          })
        } as unknown as Response
      }
      if (urlStr.includes('script.google.com') || urlStr.includes('/api/') || urlStr.includes('tortur-api') || urlStr.includes('cloudfunctions.net')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              success: true,
              checkin: {
                id: 'c_test_cloud_upload',
                turpostId: '202',
                turpostName: 'Utsikten',
                timestamp: '2026-09-17T10:00:00.000Z',
                description: 'Nydelig vær',
                imageUrl: 'https://lh3.googleusercontent.com/d/cloudimage999',
                userId: 'test_user_sub'
              }
            }),
          json: async () => ({})
        } as unknown as Response
      }
      return {
        ok: true,
        text: async () => JSON.stringify({}),
        json: async () => ({})
      } as unknown as Response
    })

    const { user, systemConfig, submitCheckin } = useAuth()
    user.value = {
      userId: 'test_user_sub',
      userName: 'Test Turgåer',
      email: 'tur@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const testFile = new File(['bilde-innhold-multipart'], 'utsikt.jpg', { type: 'image/jpeg' })
    const res = await submitCheckin({
      turpostId: '202',
      turpostName: 'Utsikten',
      description: 'Nydelig vær',
      imageFile: testFile
    })

    expect(res.id).toBe('c_test_cloud_upload')
    expect(res.imageUrl).toBe('https://lh3.googleusercontent.com/d/cloudimage999')

    // Verifiser at Cloud Function ble kalt med multipart FormData
    const cloudCall = fetchSpy.mock.calls.find(c => {
      const u = typeof c[0] === 'string' ? c[0] : c[0].toString()
      return u.includes('uploadCheckinImage')
    })
    expect(cloudCall).toBeDefined()
    expect(cloudCall![1]?.body).toBeInstanceOf(FormData)

    // Verifiser payload sendt til backend: har imageUrl og ingen tung base64-body
    const backendCall = fetchSpy.mock.calls.find(c => {
      const body = typeof c[1]?.body === 'string' ? JSON.parse(c[1].body) : null
      return body?.action === 'checkin'
    })
    expect(backendCall).toBeDefined()
    const callBody = JSON.parse(backendCall![1]?.body as string)
    expect(callBody.imageUrl).toBe('https://lh3.googleusercontent.com/d/cloudimage999')
    expect(callBody.image).toBeUndefined()

    vi.unstubAllEnvs()
  })

  it('fetchTurpostCheckins ignorerer korrupte spøkelses-innsjekkinger og tildeler id fra nøkkel', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/turposter/tp_ghost.json')) {
        return {
          ok: true,
          json: async () => ({
            valid_1: {
              id: 'valid_1',
              turpostId: 'tp_ghost',
              userId: 'user_1',
              userName: 'Kari Nordmann',
              timestamp: '2026-09-21T10:00:00Z',
              description: 'Flott tur!'
            },
            key_without_id: {
              turpostId: 'tp_ghost',
              userId: 'user_2',
              userName: 'Ola Nordmann',
              timestamp: '2026-09-21T11:00:00Z',
              description: 'Uten id felt i noden'
            },
            corrupt_ghost: {
              description: 'Oppholdsbyge',
              imageUrl: 'https://example.com/img.jpg',
              trackId: 'track_123'
              // Mangler både timestamp og userId!
            }
          })
        } as unknown as Response
      }
      return { ok: true, json: async () => ({}) } as unknown as Response
    })

    const { systemConfig, fetchTurpostCheckins } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const checkins = await fetchTurpostCheckins('tp_ghost')

    // Skal ignorere corrupt_ghost, så bare 2 gyldige elementer returneres
    expect(checkins.length).toBe(2)
    expect(checkins.find(c => c.description === 'Oppholdsbyge')).toBeUndefined()

    // Skal ha satt id = key for noden som manglet id
    const itemWithoutId = checkins.find(c => c.userName === 'Ola Nordmann')
    expect(itemWithoutId?.id).toBe('key_without_id')

    fetchSpy.mockRestore()
  })

  it('updatePublicCheckin feiler ved ugyldig eller manglende checkinId', async () => {
    const { user, updatePublicCheckin } = useAuth()
    user.value = {
      userId: 'test_user_sub',
      userName: 'Test User',
      email: 'test@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }

    await expect(
      updatePublicCheckin({
        turpostId: '123',
        checkinId: '',
        description: 'Test'
      })
    ).rejects.toThrow('Ugyldig eller manglende checkinId')

    await expect(
      updatePublicCheckin({
        turpostId: '123',
        checkinId: 'undefined',
        description: 'Test'
      })
    ).rejects.toThrow('Ugyldig eller manglende checkinId')
  })
})


