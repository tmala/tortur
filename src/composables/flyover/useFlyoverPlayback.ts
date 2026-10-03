import { ref, computed } from 'vue'
import {
  type FlyoverPath,
  type FlyoverSamplePoint,
  samplePathAtProgress
} from '@/utils/flyoverPath'

export function useFlyoverPlayback(
  getPath: () => FlyoverPath | null,
  onFrame?: (point: FlyoverSamplePoint, dtSeconds: number) => void
) {
  const isPlaying = ref(false)
  const progress = ref(0)
  const targetDurationSeconds = ref(60) // Standard 60 sekunder filmlengde
  const speedMultiplier = ref(1.0)

  let lastFrameTime: number | null = null
  let animFrameId: number | null = null

  const currentPoint = computed<FlyoverSamplePoint | null>(() => {
    const path = getPath()
    if (!path || path.points.length === 0) return null
    return samplePathAtProgress(path, progress.value)
  })

  const elapsedSeconds = computed(() => {
    return progress.value * targetDurationSeconds.value
  })

  const remainingSeconds = computed(() => {
    return Math.max(0, (1 - progress.value) * targetDurationSeconds.value)
  })

  const onTick = (now: number) => {
    if (!isPlaying.value) return

    if (lastFrameTime === null) {
      lastFrameTime = now
    }

    const dtMs = now - lastFrameTime
    lastFrameTime = now

    // Begrens dt for å unngå store hopp ved faneskifte
    const clampedDtMs = Math.min(100, dtMs)
    const dtSeconds = (clampedDtMs / 1000) * speedMultiplier.value

    const path = getPath()
    if (!path || path.points.length < 2) {
      pause()
      return
    }

    const progressDelta = dtSeconds / Math.max(5, targetDurationSeconds.value)
    let newProgress = progress.value + progressDelta

    if (newProgress >= 1.0) {
      newProgress = 1.0
      progress.value = 1.0
      isPlaying.value = false
      lastFrameTime = null
      animFrameId = null

      const pt = samplePathAtProgress(path, 1.0)
      if (onFrame) onFrame(pt, dtSeconds)
      return
    }

    progress.value = newProgress
    const pt = samplePathAtProgress(path, newProgress)
    if (onFrame) {
      onFrame(pt, dtSeconds)
    }

    animFrameId = requestAnimationFrame(onTick)
  }

  const play = () => {
    const path = getPath()
    if (!path || path.points.length < 2) return

    if (progress.value >= 0.999) {
      progress.value = 0
    }

    isPlaying.value = true
    lastFrameTime = null
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
    }
    animFrameId = requestAnimationFrame(onTick)
  }

  const pause = () => {
    isPlaying.value = false
    lastFrameTime = null
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
  }

  const toggle = () => {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  const seek = (targetProgress: number) => {
    const clamped = Math.max(0, Math.min(1, targetProgress))
    progress.value = clamped
    lastFrameTime = null

    const path = getPath()
    if (path && path.points.length >= 2) {
      const pt = samplePathAtProgress(path, clamped)
      if (onFrame) {
        onFrame(pt, 0)
      }
    }
  }

  const restart = () => {
    seek(0)
    play()
  }

  const setTargetDuration = (seconds: number) => {
    if (seconds >= 10 && seconds <= 600) {
      targetDurationSeconds.value = seconds
    }
  }

  const setSpeed = (multiplier: number) => {
    if (multiplier > 0) {
      speedMultiplier.value = multiplier
    }
  }

  const cleanup = () => {
    pause()
  }

  return {
    isPlaying,
    progress,
    targetDurationSeconds,
    speedMultiplier,
    currentPoint,
    elapsedSeconds,
    remainingSeconds,
    play,
    pause,
    toggle,
    seek,
    restart,
    setTargetDuration,
    setSpeed,
    cleanup
  }
}
