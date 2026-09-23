import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePrivateTurposter } from '../composables/usePrivateTurposter'
import type { TurpostItem } from '../composables/useTurposter'

vi.mock('../composables/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    submitCheckin: vi.fn().mockResolvedValue({
      id: 'mock_checkin_id',
      imageUrl: 'https://lh3.googleusercontent.com/d/mock_img',
      timestamp: '2026-09-09T22:00:00.000Z',
      userName: 'Test Bruker'
    }),
    updatePublicCheckin: vi.fn().mockResolvedValue({
      imageUrl: 'https://lh3.googleusercontent.com/d/updated_img'
    }),
    deletePublicCheckin: vi.fn().mockResolvedValue({ success: true })
  }),
  getFirebaseConfig: vi.fn().mockResolvedValue({
    dbUrl: 'https://test-db.firebaseio.com',
    prefix: 'test_prefix'
  }),
  fetchFirebase: vi.fn((url: string, init?: RequestInit) => fetch(url, init))
}))

describe('usePrivateTurposter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('correctly calculates CSV placement order based on alphabetical sorting', async () => {
    const mockCsvContent = [
      'turpostId;turpostNavn;latitude;longitude;altitude;fylke;kommune',
      'id1;Aberdalsheia;58.10;7.91;144;Agder;Kristiansand',
      'id2;FlaktveitRunden;60.47;5.34;120;Vestland;Bergen',
      'id3;Flatafjellet;60.48;5.35;350;Vestland;Bergen',
      'id4;Stovefjellet;60.46;5.34;125;Vestland;Bergen',
      'id5;Åtinden;68.85;17.20;1008;Troms;Ibestad'
    ].join('\n')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => mockCsvContent
    } as unknown as Response)

    const { calculateCsvPlacement } = usePrivateTurposter()

    // Test plassering mellom FlaktveitRunden og Flatafjellet
    const res = await calculateCsvPlacement('FlaktveitToppen')
    expect(res.lineNumber).toBe(4) // 1-indeksert: linje 1=header, 2=Aberdalsheia, 3=FlaktveitRunden, 4=ny linje
    expect(res.prevName).toBe('FlaktveitRunden')
    expect(res.nextName).toBe('Flatafjellet')

    // Test plassering helt først (etter header) - merk: 'Aa' regnes som 'Å' på norsk, så vi tester med 'Abakk'
    const resFirst = await calculateCsvPlacement('Abakk')
    expect(resFirst.lineNumber).toBe(2)
    expect(resFirst.nextName).toBe('Aberdalsheia')

    // Test plassering helt sist
    const resLast = await calculateCsvPlacement('Åååå-toppen')
    expect(resLast.lineNumber).toBe(7) // etter siste linje
    expect(resLast.prevName).toBe('Åtinden')
  })

  it('submits an existing spot for public review', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('config.json')) {
        return {
          ok: true,
          json: async () => ({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'test_prefix' })
        } as unknown as Response
      }
      return {
        ok: true,
        json: async () => ({})
      } as unknown as Response
    })

    const { suggestExistingSpotForPublic } = usePrivateTurposter()

    const mockSpot: TurpostItem = {
      id: 'spot_123',
      name: 'Utsiktsposten',
      lat: 60.1,
      lng: 5.2,
      alt: 250,
      fylke: 'Vestland',
      kommune: 'Bergen',
      csvLine: '123;Utsiktsposten;60.1;5.2;250;Vestland;Bergen',
      isPrivate: true
    }

    await suggestExistingSpotForPublic('user_abc', mockSpot, {
      name: 'Test Bruker',
      email: 'test@example.com'
    })

    // Should have called PATCH on user spot and PUT on spot_suggestions
    const patchCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_123.json') && c[1]?.method === 'PATCH')
    expect(patchCall).toBeDefined()

    const putCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('spot_suggestions/spot_123.json') && c[1]?.method === 'PUT')
    expect(putCall).toBeDefined()
    const body = JSON.parse(putCall![1]?.body as string)
    expect(body.name).toBe('Utsiktsposten')
    expect(body.userName).toBe('Test Bruker')
  })

  it('deletes spot and cleans up its checkins', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('config.json')) {
        return {
          ok: true,
          json: async () => ({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'test_prefix' })
        } as unknown as Response
      }
      return {
        ok: true,
        json: async () => ({})
      } as unknown as Response
    })

    const { deleteMySpot } = usePrivateTurposter()
    await deleteMySpot('user_abc', 'spot_123')

    const deleteSpotCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_123.json'))
    expect(deleteSpotCall![1]?.method).toBe('DELETE')

    const deleteCheckinsCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots_checkins/spot_123.json'))
    expect(deleteCheckinsCall![1]?.method).toBe('DELETE')
  })

  it('denySpotSuggestion updates spot_suggestions with status denied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({})
      } as unknown as Response
    })

    const { denySpotSuggestion } = usePrivateTurposter()
    await denySpotSuggestion('spot_123')

    const patchCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('spot_suggestions/spot_123.json') && c[1]?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    const body = JSON.parse(patchCall![1]?.body as string)
    expect(body.status).toBe('denied')
    expect(body.deniedAt).toBeDefined()
  })

  it('fetchMySpots synchronizes denied status from spot_suggestions and deletes the suggestion', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('my_spots.json')) {
        return {
          ok: true,
          json: async () => ({
            spot_1: {
              id: 'spot_1',
              name: 'Varden',
              lat: 60.1,
              lng: 5.2,
              status: 'pending',
              suggestedForPublic: true
            }
          })
        } as unknown as Response
      }
      if (urlStr.includes('spot_suggestions/spot_1.json')) {
        return {
          ok: true,
          json: async () => ({
            id: 'spot_1',
            status: 'denied'
          })
        } as unknown as Response
      }
      return {
        ok: true,
        json: async () => ({})
      } as unknown as Response
    })

    const { fetchMySpots } = usePrivateTurposter()
    const spots = await fetchMySpots('user_abc')

    expect(spots).toHaveLength(1)
    expect(spots[0]?.status).toBe('denied')
    expect(spots[0]?.suggestedForPublic).toBe(false)

    // Verify user node was patched with denied
    const userPatchCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_1.json') && c[1]?.method === 'PATCH')
    expect(userPatchCall).toBeDefined()
    const userBody = JSON.parse(userPatchCall![1]?.body as string)
    expect(userBody.status).toBe('denied')
    expect(userBody.suggestedForPublic).toBe(false)

    // Verify spot_suggestion was deleted
    const deleteSuggestionCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('spot_suggestions/spot_1.json') && c[1]?.method === 'DELETE')
    expect(deleteSuggestionCall).toBeDefined()
  })

  it('suggestExistingSpotForPublic rejects if spot already has status denied', async () => {
    const { suggestExistingSpotForPublic } = usePrivateTurposter()
    const deniedSpot: TurpostItem = {
      id: 'spot_denied',
      name: 'Avvist turpost',
      lat: 60.1,
      lng: 5.2,
      alt: 100,
      status: 'denied',
      isPrivate: true
    }

    await expect(
      suggestExistingSpotForPublic('user_abc', deniedSpot)
    ).rejects.toThrow('tidligere avvist')
  })

  it('saveMySpot prevents suggestedForPublic if spot has status denied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({})
      } as unknown as Response
    })

    const { saveMySpot } = usePrivateTurposter()
    const deniedSpot: TurpostItem = {
      id: 'spot_denied',
      name: 'Avvist turpost',
      lat: 60.1,
      lng: 5.2,
      alt: 100,
      status: 'denied',
      isPrivate: true
    }

    await saveMySpot('user_abc', deniedSpot, true)

    // Verify user spot PUT has status: 'denied' and suggestedForPublic: false
    const putCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_denied.json') && c[1]?.method === 'PUT')
    expect(putCall).toBeDefined()
    const body = JSON.parse(putCall![1]?.body as string)
    expect(body.status).toBe('denied')
    expect(body.suggestedForPublic).toBe(false)

    // Verify NO entry was sent to spot_suggestions
    const suggestionCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('spot_suggestions/spot_denied.json'))
    expect(suggestionCall).toBeUndefined()
  })

  it('submitPrivateCheckin uploads image via Apps Script and saves Google Drive URL to Firebase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as unknown as Response)

    const { submitPrivateCheckin } = usePrivateTurposter()
    const mockPost: TurpostItem = {
      id: 'spot_123',
      name: 'Min Turpost',
      lat: 60.1,
      lng: 5.2,
      alt: 200,
      fylke: 'Vestland',
      kommune: 'Bergen',
      isPrivate: true
    }

    const mockFile = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' })

    const result = await submitPrivateCheckin({
      userId: 'user_abc',
      userName: 'Test Bruker',
      post: mockPost,
      description: 'Flott tur!',
      imageFile: mockFile
    })

    expect(result.imageUrl).toBe('https://lh3.googleusercontent.com/d/mock_img')
    expect(result.id).toBe('mock_checkin_id')

    const putCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots_checkins/spot_123/mock_checkin_id.json'))
    expect(putCall).toBeDefined()
    expect(putCall![1]?.method).toBe('PUT')
    const savedPayload = JSON.parse(putCall![1]?.body as string)
    expect(savedPayload.imageUrl).toBe('https://lh3.googleusercontent.com/d/mock_img')
    expect(savedPayload.turpostId).toBe('spot_123')

    // Verifiser at Apps Script sine automatiske offentlige noder ryddes opp
    const deleteTurpostCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('turposter/spot_123/mock_checkin_id.json'))
    expect(deleteTurpostCall).toBeDefined()
    expect(deleteTurpostCall![1]?.method).toBe('DELETE')
  })
})
