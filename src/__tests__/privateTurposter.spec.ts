import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePrivateTurposter } from '../composables/usePrivateTurposter'

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
  })
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
    } as any)

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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('config.json')) {
        return {
          ok: true,
          json: async () => ({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'test_prefix' })
        } as any
      }
      return {
        ok: true,
        json: async () => ({})
      } as any
    })

    const { suggestExistingSpotForPublic } = usePrivateTurposter()

    const mockSpot = {
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

    await suggestExistingSpotForPublic('user_abc', mockSpot as any, {
      name: 'Test Bruker',
      email: 'test@example.com'
    })

    // Should have called PATCH on user spot and PUT on spot_suggestions
    const patchCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_123.json'))
    expect(patchCall).toBeDefined()
    expect(patchCall![1]?.method).toBe('PATCH')

    const putCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('spot_suggestions/spot_123.json'))
    expect(putCall).toBeDefined()
    expect(putCall![1]?.method).toBe('PUT')
    const body = JSON.parse(putCall![1]?.body as string)
    expect(body.name).toBe('Utsiktsposten')
    expect(body.userName).toBe('Test Bruker')
  })

  it('deletes spot and cleans up its checkins', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('config.json')) {
        return {
          ok: true,
          json: async () => ({ dbUrl: 'https://test-db.firebaseio.com', prefix: 'test_prefix' })
        } as any
      }
      return {
        ok: true,
        json: async () => ({})
      } as any
    })

    const { deleteMySpot } = usePrivateTurposter()
    await deleteMySpot('user_abc', 'spot_123')

    const deleteSpotCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots/spot_123.json'))
    expect(deleteSpotCall![1]?.method).toBe('DELETE')

    const deleteCheckinsCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('my_spots_checkins/spot_123.json'))
    expect(deleteCheckinsCall![1]?.method).toBe('DELETE')
  })

  it('submitPrivateCheckin uploads image via Apps Script and saves Google Drive URL to Firebase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as any)

    const { submitPrivateCheckin } = usePrivateTurposter()
    const mockPost = {
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
      post: mockPost as any,
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
  })
})
