import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

export interface MonthGroup<T> {
  key: string
  label: string
  items: T[]
}

export interface UseMonthGroupsOptions<T> {
  /**
   * Henter dato eller tidsstempel for et element (ms, ISO-streng eller Date).
   */
  getDate: (item: T) => number | string | Date
  /**
   * Valgfri reaktiv verdi eller funksjon. Hvis sann, ekspanderes alle månedsgrupper automatisk (f.eks. ved søk/filtrering).
   */
  autoExpandAll?: Ref<boolean> | ComputedRef<boolean> | (() => boolean)
}

function parseTimestamp(val: number | string | Date | undefined | null): number {
  if (val === undefined || val === null) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime()
  if (typeof val === 'string') {
    const t = new Date(val).getTime()
    return isNaN(t) ? 0 : t
  }
  return 0
}

/**
 * Grupperer en liste med elementer etter kalendermåned (nyeste måned først).
 */
export function useMonthGroups<T>(
  items: Ref<T[]> | ComputedRef<T[]>,
  options: UseMonthGroupsOptions<T>,
) {
  const expandedMonthKeys = ref<Set<string>>(new Set())
  const hasInitializedDefaultMonth = ref(false)

  const isMonthExpanded = (key: string): boolean => {
    return expandedMonthKeys.value.has(key)
  }

  const toggleMonth = (key: string) => {
    const next = new Set(expandedMonthKeys.value)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    expandedMonthKeys.value = next
  }

  const expandMonth = (key: string) => {
    const next = new Set(expandedMonthKeys.value)
    next.add(key)
    expandedMonthKeys.value = next
  }

  const collapseMonth = (key: string) => {
    const next = new Set(expandedMonthKeys.value)
    next.delete(key)
    expandedMonthKeys.value = next
  }

  const expandAll = () => {
    expandedMonthKeys.value = new Set(monthGroups.value.map((g) => g.key))
  }

  const collapseAll = () => {
    expandedMonthKeys.value = new Set()
  }

  const resetToLatest = () => {
    if (monthGroups.value.length > 0) {
      expandedMonthKeys.value = new Set([monthGroups.value[0]!.key])
    } else {
      expandedMonthKeys.value = new Set()
    }
  }

  const monthGroups = computed<MonthGroup<T>[]>(() => {
    const list = items.value || []
    if (list.length === 0) return []

    // Sorter elementer nyeste først
    const sorted = [...list].sort((a, b) => {
      const timeA = parseTimestamp(options.getDate(a))
      const timeB = parseTimestamp(options.getDate(b))
      return timeB - timeA
    })

    const groupsMap = new Map<string, { label: string; items: T[] }>()

    for (const item of sorted) {
      const time = parseTimestamp(options.getDate(item))
      const d = new Date(time)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const key = `${year}-${month}`

      if (!groupsMap.has(key)) {
        const monthName = d.toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })
        const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
        groupsMap.set(key, {
          label: capitalized,
          items: [],
        })
      }

      groupsMap.get(key)!.items.push(item)
    }

    return Array.from(groupsMap.entries()).map(([key, data]) => ({
      key,
      label: data.label,
      items: data.items,
    }))
  })

  // Automatisk ekspandering ved oppstart og ved endringer
  watch(
    monthGroups,
    (groups) => {
      if (groups.length === 0) return

      const shouldExpandAll =
        typeof options.autoExpandAll === 'function'
          ? options.autoExpandAll()
          : options.autoExpandAll?.value

      if (shouldExpandAll) {
        expandedMonthKeys.value = new Set(groups.map((g) => g.key))
      } else if (!hasInitializedDefaultMonth.value) {
        hasInitializedDefaultMonth.value = true
        expandedMonthKeys.value = new Set([groups[0]!.key])
      }
    },
    { immediate: true, flush: 'sync' },
  )

  if (options.autoExpandAll) {
    watch(
      () =>
        typeof options.autoExpandAll === 'function'
          ? options.autoExpandAll()
          : options.autoExpandAll?.value,
      (shouldExpandAll) => {
        if (shouldExpandAll) {
          expandedMonthKeys.value = new Set(monthGroups.value.map((g) => g.key))
        }
      },
      { flush: 'sync' },
    )
  }

  return {
    monthGroups,
    expandedMonthKeys,
    isMonthExpanded,
    toggleMonth,
    expandMonth,
    collapseMonth,
    expandAll,
    collapseAll,
    resetToLatest,
  }
}
