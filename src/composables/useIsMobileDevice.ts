import { computed } from 'vue'

export function useIsMobileDevice() {
  const isMobileDevice = computed(() => {
    if (typeof navigator === 'undefined') return false
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 2) &&
        /Macintosh/i.test(navigator.userAgent))
    )
  })

  return {
    isMobileDevice,
  }
}
