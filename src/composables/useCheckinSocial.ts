import { ref } from 'vue'
import {
  useAuth,
  fetchFirebase,
  type FirebaseCheckinItem,
  type CheckinReaction,
  type CheckinReactionType,
  type CheckinComment
} from './useAuth'
import { useFriends } from './useFriends'

export const REACTION_OPTIONS: { type: CheckinReactionType; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: 'Tommel opp' },
  { type: 'love', emoji: '❤️', label: 'Hjerte' },
  { type: 'laugh', emoji: '😂', label: 'Latter' },
  { type: 'wow', emoji: '😱', label: 'Skrik' },
  { type: 'sad', emoji: '😢', label: 'Trist' },
  { type: 'angry', emoji: '😡', label: 'Sint' }
]

export function useCheckinSocial() {
  const { user, getFirebaseConfig } = useAuth()
  const { isFriend } = useFriends()
  const isSubmitting = ref(false)

  const getReactionsList = (checkin?: FirebaseCheckinItem | null): CheckinReaction[] => {
    if (!checkin || !checkin.likes) return []
    if (Array.isArray(checkin.likes)) return checkin.likes
    return Object.values(checkin.likes)
  }

  const getUserReaction = (checkin?: FirebaseCheckinItem | null, userId?: string): CheckinReaction | null => {
    const targetUid = userId || user.value?.userId
    if (!targetUid || !checkin || !checkin.likes) return null
    const list = getReactionsList(checkin)
    return list.find(r => r.userId === targetUid) || null
  }

  const getCommentsList = (checkin?: FirebaseCheckinItem | null): CheckinComment[] => {
    if (!checkin || !checkin.comments) return []
    if (Array.isArray(checkin.comments)) {
      return [...checkin.comments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }
    return Object.values(checkin.comments).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }

  /**
   * Sjekker om gjeldende innlogget bruker har tilgang til å kommentere.
   * Regel: Kun godkjente venner eller forfatteren selv kan kommentere.
   */
  const canComment = (authorUserId: string): boolean => {
    if (!user.value) return false
    if (user.value.userId === authorUserId) return true
    return isFriend(authorUserId)
  }

  /**
   * Sjekker om gjeldende innlogget bruker har tilgang til å slette en gitt kommentar.
   * Regel: Innsjekkingens eier kan slette enhver kommentar. Kommentarens forfatter kan slette sin egen.
   */
  const canDeleteComment = (checkinAuthorId: string, commentUserId: string): boolean => {
    if (!user.value) return false
    return user.value.userId === checkinAuthorId || user.value.userId === commentUserId
  }

  /**
   * Toggle eller endre reaksjon (emoji) på en innsjekking.
   * Dersom brukeren klikker på samme reaksjon fjernes den.
   * Dersom brukeren klikker på en annen reaksjon endres den.
   */
  const toggleReaction = async (params: {
    turpostId: string | number
    checkinId: string
    authorUserId: string
    reactionType: CheckinReactionType
    isPrivate?: boolean
    spotId?: string
    currentCheckin?: FirebaseCheckinItem
  }): Promise<{ newReaction: CheckinReaction | null; isRemoved: boolean }> => {
    if (!user.value) {
      throw new Error('Du må være innlogget for å reagere på en innsjekking.')
    }
    if (user.value.userId === params.authorUserId) {
      throw new Error('Du kan ikke reagere på din egen innsjekking.')
    }

    const cfg = await getFirebaseConfig()
    if (!cfg) throw new Error('Kunne ikke hente Firebase-konfigurasjon.')

    const existingReaction = getUserReaction(params.currentCheckin, user.value.userId)
    const isSame = existingReaction && existingReaction.reaction === params.reactionType

    const option = REACTION_OPTIONS.find(o => o.type === params.reactionType) ?? REACTION_OPTIONS[0]!
    const reactionData: CheckinReaction = {
      userId: user.value.userId,
      userName: user.value.userName,
      userAvatar: user.value.avatarUrl || '',
      reaction: option.type,
      emoji: option.emoji,
      timestamp: new Date().toISOString()
    }

    const uidEncoded = encodeURIComponent(user.value.userId)
    const chkIdEncoded = encodeURIComponent(params.checkinId)
    const urls: string[] = []

    if (!params.isPrivate) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${chkIdEncoded}/likes/${uidEncoded}.json`
      )
    } else if (params.spotId) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/my_spots_checkins/${encodeURIComponent(params.spotId)}/${chkIdEncoded}/likes/${uidEncoded}.json`
      )
    }

    // Speil alltid til forfatterens bruker-checkin (både friends_checkins, /checkins/ og rot for bakoverkompatibilitet)
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/friends_checkins/${chkIdEncoded}/likes/${uidEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/checkins/${chkIdEncoded}/likes/${uidEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/${chkIdEncoded}/likes/${uidEncoded}.json`
    )

    if (isSame) {
      // Fjern like
      await Promise.all(urls.map(u => fetchFirebase(u, { method: 'DELETE' }).catch(() => {})))
      return { newReaction: null, isRemoved: true }
    } else {
      // Sett/oppdater like
      await Promise.all(
        urls.map(u =>
          fetchFirebase(u, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reactionData)
          }).catch(() => {})
        )
      )
      return { newReaction: reactionData, isRemoved: false }
    }
  }

  /**
   * Legg til en kommentar på en innsjekking.
   */
  const addComment = async (params: {
    turpostId: string | number
    checkinId: string
    authorUserId: string
    text: string
    isPrivate?: boolean
    spotId?: string
  }): Promise<CheckinComment> => {
    if (!user.value) {
      throw new Error('Du må være innlogget for å skrive en kommentar.')
    }
    if (!canComment(params.authorUserId)) {
      throw new Error('Kun venner av innsjekkingens eier kan kommentere.')
    }

    const cleanText = params.text.trim()
    if (!cleanText) {
      throw new Error('Kommentaren kan ikke være tom.')
    }

    const cfg = await getFirebaseConfig()
    if (!cfg) throw new Error('Kunne ikke hente Firebase-konfigurasjon.')

    const commentId = `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const commentData: CheckinComment = {
      id: commentId,
      userId: user.value.userId,
      userName: user.value.userName,
      userAvatar: user.value.avatarUrl || '',
      text: cleanText,
      timestamp: new Date().toISOString()
    }

    const chkIdEncoded = encodeURIComponent(params.checkinId)
    const commIdEncoded = encodeURIComponent(commentId)
    const urls: string[] = []

    if (!params.isPrivate) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${chkIdEncoded}/comments/${commIdEncoded}.json`
      )
    } else if (params.spotId) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/my_spots_checkins/${encodeURIComponent(params.spotId)}/${chkIdEncoded}/comments/${commIdEncoded}.json`
      )
    }

    // Speil til forfatterens bruker-checkin (både friends_checkins, /checkins/ og rot for bakoverkompatibilitet)
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/friends_checkins/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/checkins/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )

    await Promise.all(
      urls.map(u =>
        fetchFirebase(u, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(commentData)
        }).catch(() => {})
      )
    )

    return commentData
  }

  /**
   * Slett en kommentar fra en innsjekking.
   * Eieren av innsjekkingen kan slette enhver kommentar, og forfatteren kan slette sin egen.
   */
  const deleteComment = async (params: {
    turpostId: string | number
    checkinId: string
    authorUserId: string
    commentId: string
    commentUserId: string
    isPrivate?: boolean
    spotId?: string
  }): Promise<void> => {
    if (!user.value) {
      throw new Error('Du må være innlogget for å slette en kommentar.')
    }
    if (!canDeleteComment(params.authorUserId, params.commentUserId)) {
      throw new Error('Du har ikke rettigheter til å slette denne kommentaren.')
    }

    const cfg = await getFirebaseConfig()
    if (!cfg) throw new Error('Kunne ikke hente Firebase-konfigurasjon.')

    const chkIdEncoded = encodeURIComponent(params.checkinId)
    const commIdEncoded = encodeURIComponent(params.commentId)
    const urls: string[] = []

    if (!params.isPrivate) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${chkIdEncoded}/comments/${commIdEncoded}.json`
      )
    } else if (params.spotId) {
      urls.push(
        `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/my_spots_checkins/${encodeURIComponent(params.spotId)}/${chkIdEncoded}/comments/${commIdEncoded}.json`
      )
    }

    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/friends_checkins/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/checkins/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )
    urls.push(
      `${cfg.dbUrl}/${cfg.prefix}/brukere/${encodeURIComponent(params.authorUserId)}/${chkIdEncoded}/comments/${commIdEncoded}.json`
    )

    await Promise.all(urls.map(u => fetchFirebase(u, { method: 'DELETE' }).catch(() => {})))
  }

  return {
    isSubmitting,
    REACTION_OPTIONS,
    getReactionsList,
    getUserReaction,
    getCommentsList,
    canComment,
    canDeleteComment,
    toggleReaction,
    addComment,
    deleteComment
  }
}
