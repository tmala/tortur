import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImage, compressImageWithExif } from '../utils/imageCompression'
import piexif from 'piexifjs'

describe('imageCompression', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock createImageBitmap
    globalThis.createImageBitmap = vi.fn().mockImplementation(async () => {
      return {
        width: 3024,
        height: 4032,
        close: vi.fn(),
      } as unknown as ImageBitmap
    })

    // Mock canvas context
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D
    })

    // Mock canvas toBlob
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback, type?: string) => {
        const dummyBlob = new Blob(['compressed-jpeg-data'], { type: type || 'image/jpeg' })
        callback(dummyBlob)
      },
    )
  })

  it('compressImage kaller createImageBitmap med from-image orientering', async () => {
    const file = new File(['mock content'], 'test.jpg', { type: 'image/jpeg' })
    const result = await compressImage(file, 1024, 0.8)

    expect(result).toBeInstanceOf(File)
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(file, {
      imageOrientation: 'from-image',
    })
  })

  it('compressImageWithExif nullstiller Orientation til 1 for portrettbilde med Orientation 6', async () => {
    const mockExifObj = {
      '0th': {
        [piexif.ImageIFD.Orientation]: 6, // 90 grader rotert portrettbilde
        [piexif.ImageIFD.Make]: 'Apple',
      },
      Exif: {
        [piexif.ExifIFD.DateTimeOriginal]: '2026:10:19 12:00:00',
      },
      GPS: {
        [piexif.GPSIFD.GPSLatitude]: [
          [59, 1],
          [54, 1],
          [0, 1],
        ],
      },
      '1st': {},
      thumbnail: 'thumbdata',
    }

    vi.spyOn(piexif, 'load').mockReturnValue(mockExifObj as unknown as ReturnType<typeof piexif.load>)
    const dumpSpy = vi.spyOn(piexif, 'dump').mockReturnValue('binaryExif')
    vi.spyOn(piexif, 'insert').mockReturnValue('data:image/jpeg;base64,bW9jay1kYXRh')

    // Mock FileReader for å returnere data-url
    const originalFileReader = globalThis.FileReader
    class MockFileReader {
      result: string | ArrayBuffer | null = 'data:image/jpeg;base64,bW9jay1vcmlnaW5hbA=='
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        if (this.onload) this.onload()
      }
    }
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader

    try {
      const file = new File(['portrait photo content'], 'turpost_portrett.jpg', {
        type: 'image/jpeg',
      })
      const result = await compressImageWithExif(file, 1024, 0.8)

      expect(result).toBeInstanceOf(File)
      expect(dumpSpy).toHaveBeenCalled()

      // Verifiser at dump ble kalt med Orientation satt til 1 og thumbnail fjernet
      const dumpedObj = dumpSpy.mock.calls[0]?.[0] as ReturnType<typeof piexif.load>
      expect(dumpedObj['0th']?.[piexif.ImageIFD.Orientation]).toBe(1)
      expect(dumpedObj['0th']?.[piexif.ImageIFD.Make]).toBe('Apple')
      expect(dumpedObj.thumbnail).toBeUndefined()
      expect(dumpedObj.GPS).toBeDefined()
    } finally {
      globalThis.FileReader = originalFileReader
    }
  })

  it('compressImageWithExif returnerer komprimert fil direkte dersom filen ikke er JPEG', async () => {
    const file = new File(['png content'], 'bilde.png', { type: 'image/png' })
    const result = await compressImageWithExif(file, 1024, 0.8)

    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/jpeg')
  })
})
