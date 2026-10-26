/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __APP_VERSION__: string
declare const __APP_NAME__: string

interface ImportMetaEnv {
  readonly CARTO_BASEMAP_API_KEY?: string
  readonly VITE_CARTO_BASEMAP_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Vue module shim: tells TypeScript that .vue files are valid modules.
// Volar provides richer types when available; this fallback ensures compatibility.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

interface Window {
  google?: {
    accounts?: {
      id?: {
        initialize: (options: {
          client_id?: string
          callback: (response: { credential?: string }) => void
          auto_select?: boolean
          cancel_on_tap_outside?: boolean
        }) => void
        prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void
        renderButton: (parent: HTMLElement, options: { theme?: string; size?: string }) => void
        disableAutoSelect: () => void
      }
      oauth2?: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (response: { access_token?: string; error?: string; error_description?: string; expires_in?: number }) => void
          prompt?: string
        }) => {
          requestAccessToken: (overrideConfig?: { prompt?: string }) => void
        }
      }
    }
  }
}

