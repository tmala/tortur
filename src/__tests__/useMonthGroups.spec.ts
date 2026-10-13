import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useMonthGroups } from '@/composables/useMonthGroups'

interface TestItem {
  id: string
  timestamp: string | number
}

describe('useMonthGroups', () => {
  it('grupperer elementer etter måned og år med nyeste først', () => {
    const items = ref<TestItem[]>([
      { id: '1', timestamp: '2026-08-15T10:00:00Z' },
      { id: '2', timestamp: '2026-10-12T15:37:00Z' },
      { id: '3', timestamp: '2026-10-01T11:18:00Z' },
      { id: '4', timestamp: '2026-09-28T08:35:00Z' },
    ])

    const { monthGroups } = useMonthGroups(items, {
      getDate: (item) => item.timestamp,
    })

    expect(monthGroups.value).toHaveLength(3)

    // Første gruppe skal være oktober 2026
    expect(monthGroups.value[0]?.key).toBe('2026-10')
    expect(monthGroups.value[0]?.items).toHaveLength(2)
    expect(monthGroups.value[0]?.items[0]?.id).toBe('2') // Nyeste først
    expect(monthGroups.value[0]?.items[1]?.id).toBe('3')

    // Andre gruppe: september 2026
    expect(monthGroups.value[1]?.key).toBe('2026-09')
    expect(monthGroups.value[1]?.items).toHaveLength(1)
    expect(monthGroups.value[1]?.items[0]?.id).toBe('4')

    // Tredje gruppe: august 2026
    expect(monthGroups.value[2]?.key).toBe('2026-08')
    expect(monthGroups.value[2]?.items).toHaveLength(1)
    expect(monthGroups.value[2]?.items[0]?.id).toBe('1')
  })

  it('ekspanderer automatisk kun den nyeste måneden ved initialisering', () => {
    const items = ref<TestItem[]>([
      { id: '1', timestamp: '2026-09-01T10:00:00Z' },
      { id: '2', timestamp: '2026-10-01T10:00:00Z' },
    ])

    const { isMonthExpanded } = useMonthGroups(items, {
      getDate: (item) => item.timestamp,
    })

    expect(isMonthExpanded('2026-10')).toBe(true)
    expect(isMonthExpanded('2026-09')).toBe(false)
  })

  it('toggleMonth åpner og lukker en spesifikk måned', () => {
    const items = ref<TestItem[]>([
      { id: '1', timestamp: '2026-09-01T10:00:00Z' },
      { id: '2', timestamp: '2026-10-01T10:00:00Z' },
    ])

    const { isMonthExpanded, toggleMonth } = useMonthGroups(items, {
      getDate: (item) => item.timestamp,
    })

    expect(isMonthExpanded('2026-10')).toBe(true)
    toggleMonth('2026-10')
    expect(isMonthExpanded('2026-10')).toBe(false)

    expect(isMonthExpanded('2026-09')).toBe(false)
    toggleMonth('2026-09')
    expect(isMonthExpanded('2026-09')).toBe(true)
  })

  it('autoExpandAll ekspanderer alle måneder når filter/søk er aktivt', () => {
    const isSearching = ref(false)
    const items = ref<TestItem[]>([
      { id: '1', timestamp: '2026-08-01T10:00:00Z' },
      { id: '2', timestamp: '2026-09-01T10:00:00Z' },
      { id: '3', timestamp: '2026-10-01T10:00:00Z' },
    ])

    const { isMonthExpanded } = useMonthGroups(items, {
      getDate: (item) => item.timestamp,
      autoExpandAll: () => isSearching.value,
    })

    expect(isMonthExpanded('2026-10')).toBe(true)
    expect(isMonthExpanded('2026-09')).toBe(false)
    expect(isMonthExpanded('2026-08')).toBe(false)

    isSearching.value = true

    expect(isMonthExpanded('2026-10')).toBe(true)
    expect(isMonthExpanded('2026-09')).toBe(true)
    expect(isMonthExpanded('2026-08')).toBe(true)
  })

  it('håndterer tom liste og tall-tidsstempler (epoch ms)', () => {
    const items = ref<TestItem[]>([])

    const { monthGroups, resetToLatest } = useMonthGroups(items, {
      getDate: (item) => item.timestamp,
    })

    expect(monthGroups.value).toHaveLength(0)
    resetToLatest()
    expect(monthGroups.value).toHaveLength(0)

    const now = Date.now()
    items.value = [{ id: '10', timestamp: now }]
    expect(monthGroups.value).toHaveLength(1)
  })
})
