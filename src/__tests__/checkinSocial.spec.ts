import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCheckinSocial } from '../composables/useCheckinSocial'
import { useAuth } from '../composables/useAuth'
import { useFriends } from '../composables/useFriends'

describe('useCheckinSocial - Likes/Reaksjoner og Kommentarer', () => {
  let fetchSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
      return {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        json: async () => ({ success: true })
      } as any
    })

    const { user, systemConfig } = useAuth()
    user.value = {
      userId: 'test_user_1',
      userName: 'Test User',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      lastLogin: new Date().toISOString()
    }
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    const { friends } = useFriends()
    friends.value = [
      {
        userId: 'friend_user_2',
        userName: 'Friend User',
        email: 'friend@example.com',
        avatarUrl: '',
        since: new Date().toISOString()
      }
    ]
  })

  it('toggleReaction legger til en like/reaksjon med PUT til Firebase', async () => {
    const { toggleReaction } = useCheckinSocial()

    const res = await toggleReaction({
      turpostId: 'tp_100',
      checkinId: 'chk_200',
      authorUserId: 'friend_user_2',
      reactionType: 'like'
    })

    expect(res.isRemoved).toBe(false)
    expect(res.newReaction).toBeDefined()
    expect(res.newReaction?.reaction).toBe('like')
    expect(res.newReaction?.emoji).toBe('👍')
    expect(res.newReaction?.userId).toBe('test_user_1')

    // Sjekk at PUT ble kalt til turposten og forfatterens checkins
    const putTurpost = fetchSpy.mock.calls.find((c: any) =>
      String(c[0]).includes('/turposter/tp_100/chk_200/likes/test_user_1.json') && c[1]?.method === 'PUT'
    )
    const putAuthor = fetchSpy.mock.calls.find((c: any) =>
      String(c[0]).includes('/brukere/friend_user_2/checkins/chk_200/likes/test_user_1.json') && c[1]?.method === 'PUT'
    )

    expect(putTurpost).toBeDefined()
    expect(putAuthor).toBeDefined()
  })

  it('toggleReaction fjerner reaksjon (DELETE) hvis bruker trykker på samme reaksjon igjen', async () => {
    const { toggleReaction } = useCheckinSocial()

    const checkinWithExistingLike = {
      id: 'chk_200',
      turpostId: 'tp_100',
      userId: 'friend_user_2',
      userName: 'Friend',
      userAvatar: '',
      timestamp: '2026-09-11T12:00:00Z',
      description: '',
      imageUrl: '',
      likes: {
        test_user_1: {
          userId: 'test_user_1',
          userName: 'Test User',
          reaction: 'like' as const,
          emoji: '👍'
        }
      }
    }

    const res = await toggleReaction({
      turpostId: 'tp_100',
      checkinId: 'chk_200',
      authorUserId: 'friend_user_2',
      reactionType: 'like',
      currentCheckin: checkinWithExistingLike
    })

    expect(res.isRemoved).toBe(true)
    expect(res.newReaction).toBeNull()

    const delTurpost = fetchSpy.mock.calls.find((c: any) =>
      String(c[0]).includes('/turposter/tp_100/chk_200/likes/test_user_1.json') && c[1]?.method === 'DELETE'
    )
    expect(delTurpost).toBeDefined()
  })

  it('hindrer bruker i å like sin egen innsjekking', async () => {
    const { toggleReaction } = useCheckinSocial()

    await expect(
      toggleReaction({
        turpostId: 'tp_100',
        checkinId: 'chk_own',
        authorUserId: 'test_user_1', // samme som innlogget bruker
        reactionType: 'like'
      })
    ).rejects.toThrow('Du kan ikke reagere på din egen innsjekking.')
  })

  it('addComment tillater kommentar fra godkjent venn og sender PUT til Firebase', async () => {
    const { addComment } = useCheckinSocial()

    const comment = await addComment({
      turpostId: 'tp_100',
      checkinId: 'chk_200',
      authorUserId: 'friend_user_2',
      text: 'Kjempefin tur! Bra jobba!'
    })

    expect(comment).toBeDefined()
    expect(comment.text).toBe('Kjempefin tur! Bra jobba!')
    expect(comment.userId).toBe('test_user_1')
    expect(comment.userName).toBe('Test User')

    const putCommentTurpost = fetchSpy.mock.calls.find((c: any) =>
      String(c[0]).includes(`/turposter/tp_100/chk_200/comments/${comment.id}.json`) && c[1]?.method === 'PUT'
    )
    expect(putCommentTurpost).toBeDefined()
  })

  it('addComment nekter kommentar hvis bruker ikke er venn med eieren', async () => {
    const { addComment } = useCheckinSocial()

    await expect(
      addComment({
        turpostId: 'tp_100',
        checkinId: 'chk_stranger',
        authorUserId: 'stranger_999', // ikke i vennelisten
        text: 'Hei fremmede!'
      })
    ).rejects.toThrow('Kun venner av innsjekkingens eier kan kommentere.')
  })

  it('deleteComment lar innsjekkingens eier slette enhver kommentar på sin innsjekking', async () => {
    const { deleteComment } = useCheckinSocial()

    // Innlogget bruker er 'test_user_1', som er forfatter av innsjekkingen
    await deleteComment({
      turpostId: 'tp_100',
      checkinId: 'chk_my_own',
      authorUserId: 'test_user_1',
      commentId: 'comm_random_456',
      commentUserId: 'friend_user_2' // skrevet av en venn
    })

    const delCall = fetchSpy.mock.calls.find((c: any) =>
      String(c[0]).includes('/turposter/tp_100/chk_my_own/comments/comm_random_456.json') && c[1]?.method === 'DELETE'
    )
    expect(delCall).toBeDefined()
  })

  it('deleteComment nekter sletting hvis bruker verken eier innsjekkingen eller skrev kommentaren', async () => {
    const { deleteComment } = useCheckinSocial()

    await expect(
      deleteComment({
        turpostId: 'tp_100',
        checkinId: 'chk_other',
        authorUserId: 'user_A', // innsjekking eid av A
        commentId: 'comm_789',
        commentUserId: 'user_B' // kommentar skrevet av B
      })
    ).rejects.toThrow('Du har ikke rettigheter til å slette denne kommentaren.')
  })

  it('CheckinSocialSection: felt for å skrive kommentar er skjult inntil Kommenter-knappen trykkes', async () => {
    const { mount } = await import('@vue/test-utils')
    const CheckinSocialSection = (await import('../components/CheckinSocialSection.vue')).default

    const sampleCheckin = {
      id: 'chk_200',
      turpostId: 'tp_100',
      userId: 'friend_user_2',
      userName: 'Friend User',
      userAvatar: '',
      timestamp: '2026-09-11T12:00:00Z',
      description: 'Fin tur!',
      imageUrl: ''
    }

    const wrapper = mount(CheckinSocialSection, {
      props: {
        checkin: sampleCheckin,
        currentUserId: 'test_user_1'
      }
    })

    // 1. Initialt skal kommentarfeltet IKKE være synlig
    expect(wrapper.find('.new-comment-box').exists()).toBe(false)

    // 2. Finn og trykk på Kommenter-knappen
    const commentBtn = wrapper.findAll('.btn-social-action').find(b => b.text().includes('Kommenter'))
    expect(commentBtn).toBeDefined()
    await commentBtn!.trigger('click')

    // 3. Nå skal kommentarfeltet være synlig og knappen ha klassen is-active
    expect(wrapper.find('.new-comment-box').exists()).toBe(true)
    expect(commentBtn!.classes()).toContain('is-active')

    // 4. Trykk på knappen igjen for å skjule
    await commentBtn!.trigger('click')
    expect(wrapper.find('.new-comment-box').exists()).toBe(false)
    expect(commentBtn!.classes()).not.toContain('is-active')
  })
})
