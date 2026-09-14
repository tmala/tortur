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
        aria-labelledby="add-turpost-modal-title"
      >
        <!-- Header -->
        <div class="admin-modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
          <h2 id="add-turpost-modal-title">
            {{ isAdmin ? '🛠️ Legg til ny turpost' : '📍 Legg til egen turpost' }}
          </h2>
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
                placeholder="F.eks. Stovefjellet"
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

            <!-- Turpost-ID (kun for admin) -->
            <div v-if="isAdmin" class="admin-form-row">
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

            <!-- Forslag til offentlig turpost (for vanlige innloggede brukere) -->
            <div v-if="!isAdmin && userId" class="admin-checkbox-row">
              <label class="custom-checkbox">
                <input v-model="suggestForPublic" type="checkbox" />
                <span class="checkbox-box"></span>
                <span class="checkbox-text">Foreslå som offentlig turpost for godkjenning hos admin</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Lagre-seksjon for innlogget bruker (både vanlige brukere og admin) -->
        <div v-if="userId && isFormValid" class="admin-save-section">
          <div v-if="saveSuccessMessage" class="save-feedback success">
            {{ saveSuccessMessage }}
          </div>
          <div v-if="saveErrorMessage" class="save-feedback error">
            {{ saveErrorMessage }}
          </div>

          <div class="save-actions">
            <button
              class="btn-save-spot"
              :disabled="isSavingSpot"
              @click="handleSaveSpot"
            >
              <span v-if="isSavingSpot">⏳ Lagrer...</span>
              <span v-else-if="!isAdmin && suggestForPublic">💾 Lagre og send inn forslag</span>
              <span v-else>💾 Lagre i Mine turposter</span>
            </button>
          </div>
        </div>

        <!-- Resultat / CSV-snipp (KUN for admin) -->
        <div v-if="isAdmin && csvLine" class="admin-result-section">
          <!-- Anbefalt plassering i mountains.csv -->
          <div v-if="csvPlacement" class="admin-placement-box">
            <div class="placement-title">📍 Anbefalt plassering i <code>data/mountains.csv</code>:</div>
            <div class="placement-detail">
              Sett inn på <strong>linje {{ csvPlacement.lineNumber }}</strong>
              <span v-if="csvPlacement.prevName">
                (etter <em>«{{ csvPlacement.prevName }}»</em> på linje {{ csvPlacement.prevLineNumber }})
              </span>
              <span v-if="csvPlacement.nextName">
                og før <em>«{{ csvPlacement.nextName }}»</em> på linje {{ csvPlacement.nextLineNumber }}
              </span>
            </div>
          </div>

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

        <!-- Veiledning (KUN for admin) -->
        <div v-if="isAdmin" class="admin-guide">
          <div class="admin-guide-title">📖 Hva du må gjøre videre som admin:</div>
          <ol class="admin-guide-list">
            <li>Kopier CSV-linjen ovenfor</li>
            <li>
              Lim den inn i <code>data/mountains.csv</code>
              <span v-if="csvPlacement">på linje {{ csvPlacement.lineNumber }}</span>
            </li>
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
import { usePrivateTurposter, type CsvPlacementResult } from '@/composables/usePrivateTurposter'
import type { TurpostItem } from '@/composables/useTurposter'

const props = defineProps<{
  isOpen: boolean
  lat: number
  lng: number
  isAdmin?: boolean
  userId?: string
  userName?: string
  userEmail?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'spot-saved', spot: TurpostItem): void
}>()

const { detectKommune } = useGeoDetect()
const { saveMySpot, calculateCsvPlacement } = usePrivateTurposter()

const geoResult = ref<GeoResult | null>(null)
const isDetecting = ref(false)
const isOutsideNorway = ref(false)
const customKommune = ref('Utlandet')
const turpostName = ref('')
const turpostAlt = ref<number | null>(null)
const turpostId = ref('')
const copied = ref(false)
const suggestForPublic = ref(false)

const isSavingSpot = ref(false)
const saveSuccessMessage = ref<string | null>(null)
const saveErrorMessage = ref<string | null>(null)
const csvPlacement = ref<CsvPlacementResult | null>(null)

function generateId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function regenId() {
  turpostId.value = generateId()
  onInputChange()
}

const isFormValid = computed(() => {
  return (
    geoResult.value !== null &&
    turpostName.value.trim().length > 0 &&
    turpostAlt.value !== null &&
    !isNaN(turpostAlt.value) &&
    turpostId.value.trim().length > 0
  )
})

async function updateCsvPlacementHint() {
  if (!props.isAdmin || !turpostName.value.trim()) {
    csvPlacement.value = null
    return
  }
  try {
    const res = await calculateCsvPlacement(turpostName.value.trim())
    csvPlacement.value = res
  } catch {
    csvPlacement.value = null
  }
}

let placementTimeout: ReturnType<typeof setTimeout> | undefined = undefined
function onInputChange() {
  copied.value = false
  saveSuccessMessage.value = null
  saveErrorMessage.value = null

  if (props.isAdmin) {
    clearTimeout(placementTimeout)
    placementTimeout = setTimeout(() => {
      updateCsvPlacementHint()
    }, 250)
  }
}

function onKommuneChange() {
  copied.value = false
  if (geoResult.value && isOutsideNorway.value) {
    geoResult.value.kommune = customKommune.value.trim() || 'Utlandet'
  }
}

const csvLine = computed(() => {
  if (!isFormValid.value || !geoResult.value) return ''

  const id = turpostId.value.trim()
  const name = turpostName.value.trim()
  const latStr = props.lat.toFixed(6)
  const lngStr = props.lng.toFixed(6)
  const alt = Math.round(turpostAlt.value!)
  const fylke = geoResult.value.fylke
  const kommune = geoResult.value.kommune

  return `${id};${name};${latStr};${lngStr};${alt};${fylke};${kommune}`
})

async function copyToClipboard() {
  if (!csvLine.value) return
  try {
    await navigator.clipboard.writeText(csvLine.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 3000)
  } catch {
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

async function handleSaveSpot() {
  if (!props.userId || !isFormValid.value || !geoResult.value) return

  isSavingSpot.value = true
  saveSuccessMessage.value = null
  saveErrorMessage.value = null

  const spot: TurpostItem = {
    id: turpostId.value.trim(),
    name: turpostName.value.trim(),
    lat: Number(props.lat.toFixed(6)),
    lng: Number(props.lng.toFixed(6)),
    alt: Math.round(turpostAlt.value!),
    fylke: geoResult.value.fylke,
    kommune: geoResult.value.kommune,
    isPrivate: true,
    ownerId: props.userId,
    ownerName: props.userName || '',
    suggestedForPublic: props.isAdmin ? false : suggestForPublic.value,
    status: props.isAdmin ? 'private' : (suggestForPublic.value ? 'pending' : 'private'),
    csvLine: csvLine.value,
    csvLineHint: csvPlacement.value ? `Linje ${csvPlacement.value.lineNumber} i mountains.csv` : ''
  }

  try {
    await saveMySpot(
      props.userId,
      spot,
      !props.isAdmin && suggestForPublic.value,
      { name: props.userName, email: props.userEmail }
    )

    saveSuccessMessage.value = !props.isAdmin && suggestForPublic.value
      ? '✅ Turposten er lagret i dine turposter og sendt inn som forslag til admin!'
      : '✅ Turposten er lagret i dine turposter!'

    emit('spot-saved', spot)

    setTimeout(() => {
      if (props.isOpen) {
        emit('close')
      }
    }, 1600)
  } catch (err: unknown) {
    saveErrorMessage.value = err instanceof Error ? err.message : 'Kunne ikke lagre turposten.'
  } finally {
    isSavingSpot.value = false
  }
}

// Kjør geo-deteksjon når modalen åpnes eller koordinater endres
watch(
  () => [props.isOpen, props.lat, props.lng] as [boolean, number, number],
  async ([open, lat, lng]) => {
    if (!open) return
    turpostName.value = ''
    turpostAlt.value = null
    turpostId.value = generateId()
    geoResult.value = null
    copied.value = false
    isOutsideNorway.value = false
    customKommune.value = 'Utlandet'
    saveSuccessMessage.value = null
    saveErrorMessage.value = null
    csvPlacement.value = null
    suggestForPublic.value = false

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
  }
)

// ---------------------------------------------------------------------------
// Dra-funksjonalitet (Pointer Events)
// ---------------------------------------------------------------------------
const modalRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragPos = ref({ x: 0, y: 0 })
const dragStart = ref({ x: 0, y: 0, initialX: 0, initialY: 0 })

const modalStyle = computed(() => {
  if (dragPos.value.x === 0 && dragPos.value.y === 0) return {}
  return {
    transform: `translate(${dragPos.value.x}px, ${dragPos.value.y}px)`
  }
})

function startDrag(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.admin-modal-close')) return
  isDragging.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    initialX: dragPos.value.x,
    initialY: dragPos.value.y
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  dragPos.value = {
    x: dragStart.value.initialX + dx,
    y: dragStart.value.initialY + dy
  }
}

function onDragEnd(e: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {}
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      dragPos.value = { x: 0, y: 0 }
    }
  }
)

onMounted(() => {
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  clearTimeout(placementTimeout)
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

.admin-checkbox-row {
  margin-top: 6px;
}

.custom-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.custom-checkbox input {
  display: none;
}

.checkbox-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid #64748b;
  background: #1e293b;
  position: relative;
  transition: all 0.2s;
}

.custom-checkbox input:checked + .checkbox-box {
  background: #10b981;
  border-color: #10b981;
}

.custom-checkbox input:checked + .checkbox-box::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
}

.checkbox-text {
  font-size: 0.85rem;
  color: #cbd5e1;
}

.admin-save-section {
  padding: 16px 24px;
  border-bottom: 1px solid #2d3748;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.save-feedback {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.4;
}

.save-feedback.success {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid #10b981;
  color: #a7f3d0;
}

.save-feedback.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  color: #fca5a5;
}

.btn-save-spot {
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 10px 22px;
  transition: transform 0.15s, opacity 0.2s;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-save-spot:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.btn-save-spot:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-placement-box {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid #d97706;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #fef3c7;
  line-height: 1.4;
}

.placement-title {
  font-weight: 600;
  color: #fde68a;
  margin-bottom: 4px;
}

.placement-detail {
  color: #fef08a;
}

.placement-detail strong {
  color: #ffffff;
}

.admin-result-section {
  padding: 16px 24px;
  border-bottom: 1px solid #2d3748;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
