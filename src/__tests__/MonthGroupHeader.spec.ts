import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthGroupHeader from '@/components/MonthGroupHeader.vue'

describe('MonthGroupHeader.vue', () => {
  it('viser etikett og flertallsform for innsjekkinger', () => {
    const wrapper = mount(MonthGroupHeader, {
      props: {
        label: 'Oktober 2026',
        count: 5,
        isExpanded: false,
      },
    })

    expect(wrapper.text()).toContain('Oktober 2026')
    expect(wrapper.text()).toContain('5 innsjekkinger')
    expect(wrapper.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.month-chevron.rotated').exists()).toBe(false)
  })

  it('viser entallsform når antall er 1', () => {
    const wrapper = mount(MonthGroupHeader, {
      props: {
        label: 'September 2026',
        count: 1,
        isExpanded: true,
      },
    })

    expect(wrapper.text()).toContain('1 innsjekking')
    expect(wrapper.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.month-chevron.rotated').exists()).toBe(true)
  })

  it('støtter egendefinert entalls- og flertallstekst for spor (tur/turer)', () => {
    const wrapper = mount(MonthGroupHeader, {
      props: {
        label: 'August 2026',
        count: 3,
        countUnitSingle: 'tur',
        countUnitPlural: 'turer',
        isExpanded: false,
      },
    })

    expect(wrapper.text()).toContain('3 turer')
  })

  it('emitter toggle når headeren klikkes', async () => {
    const wrapper = mount(MonthGroupHeader, {
      props: {
        label: 'Oktober 2026',
        count: 2,
        isExpanded: false,
      },
    })

    await wrapper.find('button.month-group-header').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('rendrer høyre slot dersom den er oppgitt', () => {
    const wrapper = mount(MonthGroupHeader, {
      props: {
        label: 'Oktober 2026',
        count: 2,
        isExpanded: true,
      },
      slots: {
        right: '<span class="custom-dist">14.2 km</span>',
      },
    })

    expect(wrapper.find('.custom-dist').text()).toBe('14.2 km')
  })
})
