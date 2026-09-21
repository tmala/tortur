import { calculateDistanceMeters } from '@/composables/useGeolocation'
import type { TrackPhoto } from '@/composables/useTrackPhotos'

export interface TrackPhotoCluster {
  id: string
  lat: number
  lng: number
  photos: TrackPhoto[]
}

/**
 * Grupperer turbilder som er tatt på samme eller nesten samme posisjon.
 * Standard terskelverdi er 20 meter, som fanger opp naturlig GPS-avvik
 * når flere bilder tas på samme utsiktspunkt eller rastestopp.
 */
export function clusterTrackPhotos(
  photos: TrackPhoto[],
  distanceThresholdMeters: number = 20
): TrackPhotoCluster[] {
  const validPhotos = photos.filter(
    (p): p is TrackPhoto & { lat: number; lng: number } =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      !Number.isNaN(p.lat) &&
      !Number.isNaN(p.lng)
  )

  if (validPhotos.length === 0) return []

  // Sorter kronologisk etter bildets tidspunkt
  const sorted = [...validPhotos].sort((a, b) => {
    const timeA = a.exifTimestamp || a.uploadedAt || 0
    const timeB = b.exifTimestamp || b.uploadedAt || 0
    return timeA - timeB
  })

  const clusters: TrackPhotoCluster[] = []

  for (const photo of sorted) {
    let matchedCluster: TrackPhotoCluster | null = null

    for (const cluster of clusters) {
      const dist = calculateDistanceMeters(photo.lat, photo.lng, cluster.lat, cluster.lng)
      if (dist <= distanceThresholdMeters) {
        matchedCluster = cluster
        break
      }
    }

    if (matchedCluster) {
      matchedCluster.photos.push(photo)
    } else {
      clusters.push({
        id: photo.id || photo.fileId || `cluster_${clusters.length}_${photo.lat}_${photo.lng}`,
        lat: photo.lat,
        lng: photo.lng,
        photos: [photo]
      })
    }
  }

  return clusters
}
