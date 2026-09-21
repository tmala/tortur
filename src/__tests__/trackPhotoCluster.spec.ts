import { describe, it, expect } from 'vitest'
import { clusterTrackPhotos } from '../utils/trackPhotoCluster'
import type { TrackPhoto } from '../composables/useTrackPhotos'

describe('trackPhotoCluster', () => {
  const createMockPhoto = (
    id: string,
    lat?: number,
    lng?: number,
    timestamp: number = 1000
  ): TrackPhoto => ({
    id,
    fileId: `drive_file_${id}`,
    url: `https://drive.google.com/uc?id=${id}`,
    filename: `photo_${id}.jpg`,
    uploadedAt: timestamp,
    exifTimestamp: timestamp,
    lat,
    lng
  })

  it('returnerer en tom liste når input er tom', () => {
    const result = clusterTrackPhotos([])
    expect(result).toEqual([])
  })

  it('filtrerer bort bilder som mangler koordinater eller har NaN', () => {
    const photos: TrackPhoto[] = [
      createMockPhoto('1'),
      createMockPhoto('2', undefined, 5.32),
      createMockPhoto('3', 60.39, undefined),
      createMockPhoto('4', Number.NaN, 5.32),
      createMockPhoto('5', 60.39, 5.32)
    ]

    const result = clusterTrackPhotos(photos)
    expect(result).toHaveLength(1)
    const firstCluster = result[0]
    expect(firstCluster?.photos).toHaveLength(1)
    expect(firstCluster?.photos[0]?.id).toBe('5')
  })

  it('returnerer 1 klynge for et enkelt bilde med koordinater', () => {
    const photos: TrackPhoto[] = [createMockPhoto('1', 60.39123, 5.32456)]

    const result = clusterTrackPhotos(photos)
    expect(result).toHaveLength(1)
    const firstCluster = result[0]
    expect(firstCluster?.lat).toBeCloseTo(60.39123)
    expect(firstCluster?.lng).toBeCloseTo(5.32456)
    expect(firstCluster?.photos).toHaveLength(1)
    expect(firstCluster?.photos[0]?.id).toBe('1')
  })

  it('grupperer bilder med identiske koordinater i samme klynge', () => {
    const photos: TrackPhoto[] = [
      createMockPhoto('1', 60.391, 5.324, 2000),
      createMockPhoto('2', 60.391, 5.324, 1000),
      createMockPhoto('3', 60.391, 5.324, 3000)
    ]

    const result = clusterTrackPhotos(photos)
    expect(result).toHaveLength(1)
    const firstCluster = result[0]
    expect(firstCluster?.photos).toHaveLength(3)
    // Sortert kronologisk: 2, 1, 3
    expect(firstCluster?.photos.map((p) => p.id)).toEqual(['2', '1', '3'])
  })

  it('grupperer bilder som er innenfor terskelverdien (f.eks. 20m)', () => {
    // 60.390000, 5.320000 og 60.390050, 5.320000 er ca. 5.5 meter fra hverandre
    const photos: TrackPhoto[] = [
      createMockPhoto('close1', 60.39000, 5.32000, 1000),
      createMockPhoto('close2', 60.39005, 5.32000, 1050)
    ]

    const result = clusterTrackPhotos(photos, 20)
    expect(result).toHaveLength(1)
    const firstCluster = result[0]
    expect(firstCluster?.photos).toHaveLength(2)
  })

  it('skiller bilder i separate klynger når avstanden overstiger terskelverdien', () => {
    // 60.390000, 5.320000 og 60.391000, 5.320000 er ca. 111 meter fra hverandre
    const photos: TrackPhoto[] = [
      createMockPhoto('spotA_1', 60.39000, 5.32000, 1000),
      createMockPhoto('spotA_2', 60.39005, 5.32000, 1050),
      createMockPhoto('spotB_1', 60.39100, 5.32000, 2000)
    ]

    const result = clusterTrackPhotos(photos, 20)
    expect(result).toHaveLength(2)
    const clusterA = result[0]
    const clusterB = result[1]
    expect(clusterA?.photos).toHaveLength(2)
    expect(clusterA?.photos.map((p) => p.id)).toEqual(['spotA_1', 'spotA_2'])
    expect(clusterB?.photos).toHaveLength(1)
    expect(clusterB?.photos[0]?.id).toBe('spotB_1')
  })
})
