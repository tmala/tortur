---
trigger: always_on
---

# Vue 3 & TypeScript – Kode- og agentinstruksjoner

Dette dokumentet definerer gjeldende beste praksis, arkitekturmønstre og kodestandarder for Vue 3 med TypeScript i dette prosjektet. Alle AI-agenter og utviklere skal følge disse reglene.

---

## 1. Komponentstruktur og `<script setup>`

Alle nye og oppdaterte komponenter skal skrives med **Vue 3 Composition API** og `<script setup lang="ts">`.

### Strukturrekkefølge i `.vue`-filer

1. `<script setup lang="ts">`
2. `<template>`
3. `<style scoped>`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ChatMessage } from '@/types'

// 1. Props & Emits
const props = withDefaults(
  defineProps<{
    channelId: string
    readOnly?: boolean
  }>(),
  {
    readOnly: false,
  },
)

const emit = defineEmits<{
  (e: 'select', message: ChatMessage): void
  (e: 'close'): void
}>()

// 2. State (refs / shallowRefs)
const isOpen = ref(false)

// 3. Computed
const canInteract = computed(() => !props.readOnly && isOpen.value)

// 4. Metoder / Actions
function handleSelect(msg: ChatMessage) {
  if (!canInteract.value) return
  emit('select', msg)
}
</script>

<template>
  <div class="component-root">
    <!-- Bruk semantisk HTML og unike nøkler i lister -->
  </div>
</template>

<style scoped>
/* Scoped styles med CSS-variabler */
</style>
```

---

## 2. Props, Emits & Two-Way Binding (`v-model`)

- **Typesikre Props**: Bruk type-basert `defineProps<{ ... }>()` kombinert med `withDefaults()` der det er valgfrie felter med standardverdier.
- **Typesikre Emits**: Bruk typed `defineEmits<{ ... }>()`.
- **Two-way binding**: Bruk `defineModel<T>()` for toveis databinding (`v-model`) i stedet for manuelle `modelValue`-props og `update:modelValue`-emits.
- **Template Refs**: Bruk `useTemplateRef<HTMLElement>('elementName')` (Vue 3.5+) eller `ref<HTMLElement | null>(null)` med samme navn som `ref="elementName"` i template.

---

## 3. Reaktivitet: `ref`, `reactive`, `computed` og `watch`

- **Bruk primært `ref()`**: `ref()` gir forutsigbarhet, fungerer for alle typer (primitiver og objekter), og beholder reaktivitet ved destrukturering.
- **Store datasett eller eksterne instanser**: Bruk `shallowRef()` eller `shallowReactive()` for uendrede store lister eller eksterne klasser (f.eks. `EventSource`, kartinstanser, Google SDK-objekter) for å unngå unødvendig dyp reaktivitets-overhead.
- **`computed()`**: Må være rene funksjoner (pure functions) uten sideeffekter.
- **`watch` vs `watchEffect`**:
  - Bruk eksplisitt kilde `watch(() => state.property, (newVal) => { ... })` for å unngå overflødige re-kjøringer.
  - Husk `{ immediate: true }` hvis du trenger initial kjøring.
  - Rydd alltid opp asynkrone lyttere eller intervaller ved hjelp av `onScopeDispose` eller `onUnmounted`.

---

## 4. Pinia State Management

- **Setup Stores eller Options Stores**: Hold en konsistent struktur.
- **Destrukturering av Store**: Bruk alltid `storeToRefs(store)` når reaktive tilstander eller getters destruktureres i komponenter:
  ```ts
  import { storeToRefs } from 'pinia'
  import { useChatStore } from '@/stores/chat'

  const store = useChatStore()
  const { messages, isLoading, currentChannelId } = storeToRefs(store)
  const { sendMessage, switchChannel } = store // Funksjoner kan destruktureres direkte
  ```
- **Separer tilstand og logikk**: Forretningslogikk, API-kall og synkronisering med `localStorage` hører hjemme i store-actions eller composables, ikke dypt i komponenter.

---

## 5. TypeScript-standarder

- **Ingen `any`**: Bruk `unknown`, generiske typer (`<T>`), eller type-guards/discriminated unions hvis typen er usikker.
- **Sentraliserte datatyper**: Felles domenemodeller skal ligge i `src/types.ts`. Komponent-spesifikke typer kan defineres i komponenten eller en lokal `.types.ts`-fil.
- **Type-imports**: Bruk eksplisitt `import type { ... } from '...'` for typer.
- **Miljøvariabler**: Aksesser alltid `import.meta.env` med definerte typer eller fallbacks.
- **Global Types**: Utvid `window` eller globale objekter i `.d.ts`-filer (som `env.d.ts`), ikke med `(window as any)`.

---

## 6. Komponentdesign og modulering

- **Single Responsibility Principle (SRP)**: Unngå massive monolittiske komponenter. Splitt store grensesnitt (f.eks. chat-vinduer) i mindre gjenbrukbare deler:
  - Input-kontroller (`ChatInput.vue`)
  - Meldingsliste (`MessageList.vue`, `MessageItem.vue`)
  - Modaler og dialoger (`ChannelSettingsModal.vue`, `OnboardingModal.vue`)
- **Composables**: Trekk ut gjenbrukbar logikk i `src/composables/useX.ts` (f.eks. `useScrollToBottom`, `useNotification`, `useFirebaseSync`).
- **HTML & Tilgjengelighet**:
  - Bruk semantiske HTML5-elementer (`<header>`, `<main>`, `<section>`, `<button>`, `<nav>`).
  - Alle interaktive elementer (knapper, ikoner) skal ha `aria-label` eller `title`.
  - Skjemaelementer skal ha tilknyttede `<label>` eller `aria-label`.

---

## 7. Styling, Tema og CSS

- **Scoped CSS**: Bruk alltid `<style scoped>` i komponenter.
- **Design Tokens & Variabler**: Benytt CSS-variabler definert i `src/assets/main.css` (f.eks. `var(--color-background)`, `var(--text-primary)`, `var(--primary-color)`).
- **Mørk modus**: Støtt mørk modus konsekvent via `:global(.dark)` eller CSS-variabler.
- **Ingen hardkodede magiske verdier**: Farger, spacing og fontstørrelser skal følge temaet.

---

## 8. Sikkerhet og Ytelse

- **XSS-beskyttelse**: Bruk aldri `v-html` på brukergenerert innhold. Hvis HTML må parses, må innholdet renses (sanitizes).
- **Listeytelse**: Bruk alltid stabile og unike `:key`-verdier i `v-for` (f.eks. `:key="message.timestamp + message.userId"` eller ID). Bruk aldri array-indeks (`:key="index"`) hvis listen kan endre rekkefølge eller filtreres.
- **Ressurshåndtering**: Avslutt `EventSource`, `WebSocket`, `setTimeout`/`setInterval` og event listeners i `onUnmounted` for å hindre minnelekkasjer.

---

## 9. Testing og Kvalitetssikring

Før kode leveres eller markeres som ferdig, må følgende kjøres og verifiseres:

1. **Typesjekk**: `npm run type-check` (skal passere uten feil)
2. **Linting**: `npm run lint` (eller `eslint . --fix`)
3. **Tester**: `npm run test` (eller `vitest run`)

### Teststruktur (Vitest + Vue Test Utils)

- Test stores med `setActivePinia(createPinia())` i `beforeEach`.
- Test komponenter med `mount` eller `shallowMount` fra `@vue/test-utils`.
- Mock eksterne avhengigheter (`localStorage`, `fetch`, `EventSource`, Google GIS).
