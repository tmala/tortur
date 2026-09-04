<template>
  <Teleport to="body">
    <div v-if="isOpen" class="admin-modal-overlay">
      <div
        ref="modalRef"
        class="admin-modal"
        :class="{ 'is-dragging': isDragging }"
        :style="modalStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <!-- Header -->
        <div class="admin-modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
          <h2 id="admin-modal-title">🛠️ Legg til ny turpost</h2>
          <button class="admin-modal-close" @click="$emit('close')" aria-label="Lukk">✕</button>
        </div>

        <!-- Koordinater (read-only) -->
        <div class="admin-section">
          <div class="admin-coords">
            <div class="admin-coord-item">
              <label>Breddegrad (lat)</label>
              <span class="coord-value">{{ lat.toFixed(6) }}</span>
            </div>
            <div class="admin-coord-item">
              <label>Lengdegrad (lng)</label>
              <span class="coord-value">{{ lng.toFixed(6) }}</span>
            </div>
          </div>
        </div>

        <!-- Kommune-deteksjon -->
        <div class="admin-section">
          <div v-if="isDetecting" class="admin-detecting">
            <span class="spinner">⏳</span> Detekterer kommune...
          </div>
          <div v-else-if="geoResult" class="admin-geo-result">
            <div v-if="isOutsideNorway" class="admin-geo-intl-badge">
              🌍 Punktet er utenfor Norge – registreres under <strong>Utlandet</strong>.
            </div>
            <div class="admin-coords">
              <div class="admin-coord-item">
                <label>Fylke / Kategori</label>
                <span class="geo-value">{{ geoResult.fylke }}</span>
              </div>
              <div class="admin-coord-item">
                <label>{{ isOutsideNorway ? 'Land / Område (Kommune)' : 'Kommune' }}</label>
                <input
                  v-if="isOutsideNorway"
                  v-model="customKommune"
                  type="text"
                  placeholder="F.eks. Spania, Sverige eller Utlandet"
                  class="admin-input admin-input-compact"
                  @input="onKommuneChange"
                />
                <span v-else class="geo-value">{{ geoResult.kommune }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input-felter -->
        <div v-if="geoResult" class="admin-section">
          <div class="admin-form">
            <div class="admin-form-row">
              <label for="turpost-name">Navn på turpost *</label>
              <input
                id="turpost-name"
                v-model="turpostName"
                type="text"
                placeholder="F.eks. Storefjellet"
                class="admin-input"
                @input="onInputChange"
              />
            </div>
            <div class="admin-form-row">
              <label for="turpost-alt">Høyde i meter *</label>
              <input
                id="turpost-alt"
                v-model.number="turpostAlt"
                type="number"
                placeholder="F.eks. 456"
                min="0"
                max="9000"
                class="admin-input admin-input-small"
                @input="onInputChange"
              />
            </div>
            <div class="admin-form-row">
              <label for="turpost-id">Turpost-ID</label>
              <div class="admin-id-row">
                <input
                  id="turpost-id"
                  v-model="turpostId"
                  type="text"
                  class="admin-input admin-input-mono"
                  @input="onInputChange"
                />
                <button class="btn-regen-id" @click="regenId" title="Generer ny ID">🔄</button>
              </div>
              <span class="admin-hint">24-tegns hex, identisk format som eksisterende IDer</span>
            </div>
          </div>
        </div>

        <!-- Resultat / CSV-snipp -->
        <div v-if="csvLine" class="admin-result-section">
          <div class="admin-result-label">
            📋 Lim inn denne linjen i <code>data/mountains.csv</code>:
          </div>
          <div class="admin-csv-box">
            <code class="admin-csv-line">{{ csvLine }}</code>
          </div>
          <button class="btn-copy-csv" @click="copyToClipboard">
            {{ copied ? '✅ Kopiert!' : '📋 Kopier CSV-linje' }}
          </button>
        </div>

        <!-- Veiledning -->
        <div class="admin-guide">
          <div class="admin-guide-title">📖 Hva du må gjøre videre:</div>
          <ol class="admin-guide-list">
            <li>Kopier CSV-linjen ovenfor</li>
            <li>Lim den inn i <code>data/mountains.csv</code> (alfabetisk etter navn innen kommunen)</li>
            <li>Kjør: <code>npm run build</code></li>
            <li>Kjør: <code>npm run deploy</code></li>
          </ol>
          <div class="admin-guide-note">
            Etter deploy vil turposten vises i appen for alle brukere.
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useGeoDetect, type GeoResult } from '@/composables/useGeoDetect'

const props = defineProps<{
  isOpen: boolean
  lat: number
  lng: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { detectKommune } = useGeoDetect()

const geoResult  = ref<GeoResult | null>(null)
const isDetecting = ref(false)
const isOutsideNorway = ref(false)
const customKommune = ref('Utlandet')
const turpostName = ref('')
const turpostAlt  = ref<number | null>(null)
const turpostId   = ref('')
const copied      = ref(false)

function generateId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function regenId() {
  turpostId.value = generateId()
  onInputChange()
}

function onInputChange() {
  copied.value = false
}

function onKommuneChange() {
  copied.value = false
  if (geoResult.value && isOutsideNorway.value) {
    geoResult.value.kommune = customKommune.value.trim() || 'Utlandet'
  }
}

const csvLine = computed(() => {
  if (
    !geoResult.value ||
    !turpostName.value.trim() ||
    turpostAlt.value === null ||
    isNaN(turpostAlt.value) ||
    !turpostId.value.trim()
  ) return ''

  const id       = turpostId.value.trim()
  const name     = turpostName.value.trim()
  const latStr   = props.lat.toFixed(6)
  const lngStr   = props.lng.toFixed(6)
  const alt      = Math.round(turpostAlt.value)
  const fylke    = geoResult.value.fylke
  const kommune  = geoResult.value.kommune

  return `${id};${name};${latStr};${lngStr};${alt};${fylke};${kommune}`
})

async function copyToClipboard() {
  if (!csvLine.value) return
  try {
    await navigator.clipboard.writeText(csvLine.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 3000)
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = csvLine.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 3000)
  }
}

// Kjør geo-deteksjon når modalen åpnes eller koordinater endres
watch(
  () => [props.isOpen, props.lat, props.lng] as [boolean, number, number],
  async ([open, lat, lng]) => {
    if (!open) return
    turpostName.value = ''
    turpostAlt.value  = null
    turpostId.value   = generateId()
    geoResult.value   = null
    copied.value      = false
    isOutsideNorway.value = false
    customKommune.value = 'Utlandet'

    isDetecting.value = true
    try {
      const detected = await detectKommune(lat, lng)
      if (detected) {
        geoResult.value = detected
        isOutsideNorway.value = false
      } else {
        isOutsideNorway.value = true
        geoResult.value = {
          fylke: 'Utlandet',
          kommune: 'Utlandet'
        }
      }
    } catch (err) {
      console.error('Geo-deteksjon feilet:', err)
      isOutsideNorway.value = true
      geoResult.value = {
        fylke: 'Utlandet',
        kommune: 'Utlandet'
      }
    } finally {
      isDetecting.value = false
    }
  },
  { immediate: true }
)

// Dra/flytte-logikk for modalen
const modalRef = ref<HTMLElement | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPosition = { x: 0, y: 0 }

const modalStyle = computed(() => {
  if (dragPosition.value.x === 0 && dragPosition.value.y === 0) {
    return {}
  }
  return {
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`
  }
})

const startDrag = (e: PointerEvent) => {
  if (e.button !== 0) return

  const target = e.target as HTMLElement | null
  if (target?.closest('button') || target?.closest('a') || target?.closest('input') || target?.closest('textarea')) {
    return
  }

  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  initialPosition = { ...dragPosition.value }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

const onDragMove = (e: PointerEvent) => {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStart.x
  const deltaY = e.clientY - dragStart.y

  let newX = initialPosition.x + deltaX
  let newY = initialPosition.y + deltaY

  if (modalRef.value) {
    const rect = modalRef.value.getBoundingClientRect()
    const currentLeft = rect.left - initialPosition.x
    const currentTop = rect.top - initialPosition.y

    const minX = -currentLeft + 10
    const maxX = window.innerWidth - (currentLeft + 80)
    const minY = -currentTop + 10
    const maxY = window.innerHeight - (currentTop + 40)

    newX = Math.max(minX, Math.min(maxX, newX))
    newY = Math.max(minY, Math.min(maxY, newY))
  }

  dragPosition.value = { x: newX, y: newY }
}

const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      dragPosition.value = { x: 0, y: 0 }
    }
  }
)

// Lukk med Esc
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})
</script>

<style scoped>
.admin-modal-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  pointer-events: none;
}

.admin-modal {
  pointer-events: auto;
  background: rgba(30, 37, 48, 0.96);
  border: 1px solid #3a4556;
  border-radius: 16px;
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  color: #e2e8f0;
  font-family: 'Inter', system-ui, sans-serif;
  transition: box-shadow 0.2s ease;
}

.admin-modal.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 32px 72px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.admin-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #2d3748;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.admin-modal-header:active,
.admin-modal.is-dragging .admin-modal-header {
  cursor: grabbing;
}

.admin-modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #f7c948;
}

.admin-modal-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}
.admin-modal-close:hover { background: #2d3748; }

.admin-section {
  padding: 16px 24px;
  border-bottom: 1px solid #2d3748;
}

.admin-coords {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.admin-coord-item label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 4px;
}

.coord-value, .geo-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.95rem;
  color: #a0cfff;
  font-weight: 600;
}

.admin-detecting {
  color: #94a3b8;
  font-size: 0.9rem;
}

.admin-geo-intl-badge {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid #38bdf8;
  color: #bae6fd;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  line-height: 1.4;
}

.admin-input-compact {
  padding: 6px 10px;
  font-size: 13px;
  margin-top: 2px;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.admin-geo-result {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.admin-geo-miss {
  color: #f59e0b;
  font-size: 0.88rem;
}

.admin-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-form-row label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
}

.admin-input {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  color: #e2e8f0;
  padding: 8px 12px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.admin-input:focus { border-color: #f7c948; }
.admin-input-small { max-width: 140px; }
.admin-input-mono { font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; }

.admin-id-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-regen-id {
  background: #1e2d3d;
  border: 1px solid #374151;
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  padding: 8px 10px;
  font-size: 1rem;
  transition: background 0.2s;
  flex-shrink: 0;
}
.btn-regen-id:hover { background: #2d3748; color: #e2e8f0; }

.admin-hint {
  font-size: 0.72rem;
  color: #4b5563;
}

.admin-result-section {
  padding: 16px 24px;
  border-bottom: 1px solid #2d3748;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-result-label {
  font-size: 0.85rem;
  color: #94a3b8;
}

.admin-csv-box {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

.admin-csv-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #86efac;
  white-space: nowrap;
}

.btn-copy-csv {
  background: #1d4ed8;
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 10px 20px;
  transition: background 0.2s, transform 0.1s;
  align-self: flex-start;
}
.btn-copy-csv:hover { background: #2563eb; transform: translateY(-1px); }
.btn-copy-csv:active { transform: translateY(0); }

.admin-guide {
  padding: 16px 24px 20px;
  background: #151d29;
  border-radius: 0 0 16px 16px;
}

.admin-guide-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 10px;
}

.admin-guide-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-guide-list li {
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.5;
}

.admin-guide-list code {
  background: #1e2530;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.78rem;
  color: #86efac;
}

.admin-guide-note {
  margin-top: 10px;
  font-size: 0.78rem;
  color: #4b5563;
}
</style>
