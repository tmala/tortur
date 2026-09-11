<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import {
  ThumbsUp,
  MessageSquare,
  Send,
  Trash2,
  User,
  Loader2,
  Smile
} from 'lucide-vue-next'
import type { FirebaseCheckinItem, CheckinReactionType, CheckinReaction, CheckinComment } from '@/composables/useAuth'
import { useCheckinSocial, REACTION_OPTIONS } from '@/composables/useCheckinSocial'

const props = defineProps<{
  checkin: FirebaseCheckinItem
  currentUserId?: string
  isPrivate?: boolean
  spotId?: string
}>()

const emit = defineEmits<{
  (e: 'updated', updatedCheckin: FirebaseCheckinItem): void
}>()

const {
  isSubmitting,
  getReactionsList,
  getUserReaction,
  getCommentsList,
  canComment,
  canDeleteComment,
  toggleReaction,
  addComment,
  deleteComment
} = useCheckinSocial()

const commentText = ref('')
const isPostingComment = ref(false)
const deletingCommentId = ref<string | null>(null)
const showPicker = ref(false)
const isCommentsExpanded = ref(true)
const isCommentInputVisible = ref(false)
const commentInputRef = ref<HTMLInputElement | null>(null)
const pickerTimeout = ref<any>(null)
const actionError = ref<string | null>(null)

function handleToggleCommentInput() {
  if (!props.currentUserId) return
  isCommentInputVisible.value = !isCommentInputVisible.value
  if (isCommentInputVisible.value) {
    isCommentsExpanded.value = true
    nextTick(() => {
      commentInputRef.value?.focus()
    })
  }
}

// Reaksjoner
const reactions = computed(() => getReactionsList(props.checkin))
const myReaction = computed(() => getUserReaction(props.checkin, props.currentUserId))
const isOwnCheckin = computed(() => Boolean(props.currentUserId && props.checkin.userId === props.currentUserId))

// Grupper reaksjoner for oppsummering (f.eks. 👍 2, ❤️ 1)
const reactionSummary = computed(() => {
  const map = new Map<string, { emoji: string; count: number; users: string[] }>()
  for (const r of reactions.value) {
    const existing = map.get(r.reaction)
    if (existing) {
      existing.count++
      existing.users.push(r.userName || 'Ukjent')
    } else {
      map.set(r.reaction, {
        emoji: r.emoji || '👍',
        count: 1,
        users: [r.userName || 'Ukjent']
      })
    }
  }
  return Array.from(map.values())
})

// Tooltip med navn på alle som har reagert
const reactionsTooltip = computed(() => {
  if (reactions.value.length === 0) return ''
  return reactions.value.map(r => `${r.userName} (${r.emoji})`).join(', ')
})

// Kommentarer
const comments = computed(() => getCommentsList(props.checkin))
const canWriteComment = computed(() => canComment(props.checkin.userId))

function formatDate(isoString?: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

// Vis/skjul reaksjonsvelger
function handleMouseEnterPicker() {
  if (isOwnCheckin.value || !props.currentUserId) return
  if (pickerTimeout.value) clearTimeout(pickerTimeout.value)
  showPicker.value = true
}

function handleMouseLeavePicker() {
  pickerTimeout.value = setTimeout(() => {
    showPicker.value = false
  }, 350)
}

function togglePicker() {
  if (isOwnCheckin.value || !props.currentUserId) return
  showPicker.value = !showPicker.value
}

// Hovedknapp for reaksjon
async function handleMainReactionClick() {
  if (isOwnCheckin.value || !props.currentUserId) return
  // Hvis brukeren allerede har reagert, trykk fjerner den. Ellers gi 'like' som standard.
  const targetType: CheckinReactionType = myReaction.value ? myReaction.value.reaction : 'like'
  await applyReaction(targetType)
}

async function applyReaction(type: CheckinReactionType) {
  if (isOwnCheckin.value || !props.currentUserId) return
  showPicker.value = false
  actionError.value = null

  try {
    const res = await toggleReaction({
      turpostId: props.checkin.turpostId,
      checkinId: props.checkin.id,
      authorUserId: props.checkin.userId,
      reactionType: type,
      isPrivate: props.isPrivate,
      spotId: props.spotId || props.checkin.spotId,
      currentCheckin: props.checkin
    })

    // Lokal oppdatering av props.checkin for umiddelbar responsivitet
    const newLikes: Record<string, CheckinReaction> = { ...(props.checkin.likes || {}) }
    if (res.isRemoved) {
      delete newLikes[props.currentUserId]
    } else if (res.newReaction) {
      newLikes[props.currentUserId] = res.newReaction
    }

    const updated: FirebaseCheckinItem = {
      ...props.checkin,
      likes: newLikes
    }
    emit('updated', updated)
  } catch (err: any) {
    actionError.value = err.message || 'Kunne ikke oppdatere reaksjon.'
  }
}

async function handleSendComment() {
  const text = commentText.value.trim()
  if (!text || isPostingComment.value || !props.currentUserId) return

  isPostingComment.value = true
  actionError.value = null

  try {
    const newComment = await addComment({
      turpostId: props.checkin.turpostId,
      checkinId: props.checkin.id,
      authorUserId: props.checkin.userId,
      text,
      isPrivate: props.isPrivate,
      spotId: props.spotId || props.checkin.spotId
    })

    commentText.value = ''
    isCommentsExpanded.value = true
    isCommentInputVisible.value = false

    const newComments: Record<string, CheckinComment> = {
      ...(props.checkin.comments || {}),
      [newComment.id]: newComment
    }

    const updated: FirebaseCheckinItem = {
      ...props.checkin,
      comments: newComments
    }
    emit('updated', updated)
  } catch (err: any) {
    actionError.value = err.message || 'Kunne ikke sende kommentar.'
  } finally {
    isPostingComment.value = false
  }
}

async function handleDeleteComment(comment: CheckinComment) {
  if (deletingCommentId.value || !props.currentUserId) return
  actionError.value = null
  deletingCommentId.value = comment.id

  try {
    await deleteComment({
      turpostId: props.checkin.turpostId,
      checkinId: props.checkin.id,
      authorUserId: props.checkin.userId,
      commentId: comment.id,
      commentUserId: comment.userId,
      isPrivate: props.isPrivate,
      spotId: props.spotId || props.checkin.spotId
    })

    const newComments: Record<string, CheckinComment> = { ...(props.checkin.comments || {}) }
    delete newComments[comment.id]

    const updated: FirebaseCheckinItem = {
      ...props.checkin,
      comments: newComments
    }
    emit('updated', updated)
  } catch (err: any) {
    actionError.value = err.message || 'Kunne ikke slette kommentar.'
  } finally {
    deletingCommentId.value = null
  }
}

onUnmounted(() => {
  if (pickerTimeout.value) clearTimeout(pickerTimeout.value)
})
</script>

<template>
  <div class="checkin-social-section">
    <!-- Feilmelding -->
    <div v-if="actionError" class="social-error">
      {{ actionError }}
    </div>

    <!-- Oppsummeringslinje (vises hvis det er reaksjoner eller kommentarer) -->
    <div v-if="reactions.length > 0 || comments.length > 0" class="social-summary-bar">
      <!-- Reaksjoner -->
      <div
        v-if="reactions.length > 0"
        class="reactions-summary"
        :title="reactionsTooltip"
      >
        <span class="emoji-cluster">
          <span
            v-for="s in reactionSummary"
            :key="s.emoji"
            class="summary-emoji"
          >
            {{ s.emoji }}
          </span>
        </span>
        <span class="reactions-count">{{ reactions.length }}</span>
      </div>
      <div v-else class="summary-spacer"></div>

      <!-- Kommentar-teller -->
      <button
        v-if="comments.length > 0"
        type="button"
        class="btn-toggle-comments"
        @click="isCommentsExpanded = !isCommentsExpanded"
      >
        <MessageSquare :size="12" />
        <span>{{ comments.length }} {{ comments.length === 1 ? 'kommentar' : 'kommentarer' }}</span>
      </button>
    </div>

    <!-- Handlingsknapper (Like & Kommenter) -->
    <div class="social-action-bar">
      <!-- Reaksjonsknapp med svevende emoji-picker -->
      <div
        class="reaction-button-wrapper"
        @mouseenter="handleMouseEnterPicker"
        @mouseleave="handleMouseLeavePicker"
      >
        <!-- Emoji picker (Facebook stil) -->
        <transition name="popover-fade">
          <div v-if="showPicker" class="reactions-picker">
            <button
              v-for="opt in REACTION_OPTIONS"
              :key="opt.type"
              type="button"
              class="emoji-btn"
              :title="opt.label"
              @click.stop="applyReaction(opt.type)"
            >
              {{ opt.emoji }}
            </button>
          </div>
        </transition>

        <button
          type="button"
          class="btn-social-action btn-reaction"
          :class="{
            'is-reacted': !!myReaction,
            'is-disabled': isOwnCheckin || !currentUserId
          }"
          :disabled="isOwnCheckin || !currentUserId"
          :title="
            isOwnCheckin
              ? 'Du kan ikke like din egen innsjekking'
              : !currentUserId
              ? 'Logg inn for å like'
              : myReaction
              ? 'Fjern reaksjon'
              : 'Trykk for tommel opp, eller hold over for flere reaksjoner'
          "
          @click="handleMainReactionClick"
        >
          <span v-if="myReaction" class="active-emoji">{{ myReaction.emoji }}</span>
          <ThumbsUp v-else :size="13" />
          <span>{{ myReaction ? 'Likt' : 'Lik' }}</span>
        </button>
      </div>

      <!-- Kommenter knapp -->
      <button
        type="button"
        class="btn-social-action"
        :class="{ 'is-active': isCommentInputVisible }"
        :disabled="!currentUserId"
        :title="!currentUserId ? 'Logg inn for å kommentere' : (isCommentInputVisible ? 'Skjul kommentarfelt' : 'Skriv en kommentar')"
        @click="handleToggleCommentInput"
      >
        <MessageSquare :size="13" />
        <span>Kommenter</span>
      </button>
    </div>

    <!-- Kommentarseksjon -->
    <div v-if="(isCommentsExpanded && comments.length > 0) || isCommentInputVisible" class="comments-section">
      <!-- Kommentarliste -->
      <div v-if="isCommentsExpanded && comments.length > 0" class="comments-list">
        <div
          v-for="c in comments"
          :key="c.id"
          class="comment-row"
          :class="{ 'is-own-comment': c.userId === currentUserId }"
        >
          <!-- Forfatter-avatar -->
          <img
            v-if="c.userAvatar"
            :src="c.userAvatar"
            :alt="c.userName"
            class="comment-avatar"
          />
          <div v-else class="comment-avatar-fallback">
            <User :size="12" />
          </div>

          <!-- Kommentar-innhold -->
          <div class="comment-bubble">
            <div class="comment-header">
              <span class="comment-author">{{ c.userName || 'Ukjent' }}</span>
              <span class="comment-date">{{ formatDate(c.timestamp) }}</span>

              <!-- Slett-knapp hvis tillatt -->
              <button
                v-if="canDeleteComment(checkin.userId, c.userId)"
                type="button"
                class="btn-delete-comment"
                :disabled="deletingCommentId === c.id"
                title="Fjern denne kommentaren"
                @click="handleDeleteComment(c)"
              >
                <Loader2 v-if="deletingCommentId === c.id" :size="11" class="spin" />
                <Trash2 v-else :size="11" />
              </button>
            </div>
            <p class="comment-text">{{ c.text }}</p>
          </div>
        </div>
      </div>

      <!-- Ny kommentar inndatafelt -->
      <div v-if="isCommentInputVisible && canWriteComment" class="new-comment-box">
        <input
          ref="commentInputRef"
          v-model="commentText"
          type="text"
          class="comment-input"
          placeholder="Skriv en kommentar..."
          :disabled="isPostingComment"
          maxlength="400"
          @keydown.enter.prevent="handleSendComment"
        />
        <button
          type="button"
          class="btn-send-comment"
          :disabled="!commentText.trim() || isPostingComment"
          title="Send kommentar"
          @click="handleSendComment"
        >
          <Loader2 v-if="isPostingComment" :size="13" class="spin" />
          <Send v-else :size="13" />
        </button>
      </div>

      <!-- Informasjon hvis bruker ikke kan kommentere -->
      <div v-else-if="isCommentInputVisible && currentUserId && !canWriteComment" class="comment-restricted-hint">
        🔒 Kun venner av innsjekkingens eier kan kommentere.
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkin-social-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.social-error {
  font-size: 11px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
  padding: 4px 8px;
}

/* Oppsummering */
.social-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
  padding: 0 2px;
}

.reactions-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: default;
}

.emoji-cluster {
  display: inline-flex;
  align-items: center;
  margin-right: 2px;
}

.summary-emoji {
  font-size: 13px;
  margin-right: -4px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

.reactions-count {
  font-weight: 600;
  color: #cbd5e1;
}

.btn-toggle-comments {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
}

.btn-toggle-comments:hover {
  color: #f1f5f9;
}

/* Handlingslinje */
.social-action-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.reaction-button-wrapper {
  position: relative;
  display: inline-flex;
}

/* Svevende reaksjonsvelger (Facebook-stil) */
.reactions-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.2);
  border-radius: 30px;
  padding: 4px 8px;
  z-index: 50;
  animation: pickerPop 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes pickerPop {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.85);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.emoji-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 50%;
  transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  line-height: 1;
}

.emoji-btn:hover {
  transform: scale(1.4) translateY(-3px);
}

.btn-social-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-social-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.18);
}

.btn-social-action.is-reacted,
.btn-social-action.is-active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-weight: 600;
}

.btn-social-action.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.active-emoji {
  font-size: 13px;
  line-height: 1;
}

/* Kommentarer */
.comments-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.comment-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin-top: 2px;
}

.comment-avatar-fallback {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  flex-shrink: 0;
  margin-top: 2px;
}

.comment-bubble {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 5px 8px;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.comment-author {
  font-size: 11px;
  font-weight: 600;
  color: #f1f5f9;
}

.comment-date {
  font-size: 10px;
  color: #64748b;
  margin-right: auto;
}

.btn-delete-comment {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-delete-comment:hover:not(:disabled) {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.comment-text {
  margin: 0;
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.4;
  word-break: break-word;
}

/* Ny kommentar inndata */
.new-comment-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.comment-input {
  flex: 1;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  color: #ffffff;
  font-size: 11px;
  outline: none;
  transition: all 0.15s ease;
}

.comment-input:focus {
  background: rgba(255, 255, 255, 0.1);
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.comment-input::placeholder {
  color: #64748b;
}

.btn-send-comment {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0284c7;
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.btn-send-comment:hover:not(:disabled) {
  background: #0369a1;
  transform: scale(1.05);
}

.btn-send-comment:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.comment-restricted-hint {
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  padding: 2px 4px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.9);
}
</style>
