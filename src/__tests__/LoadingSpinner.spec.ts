import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingSpinner from '../components/common/LoadingSpinner.vue'

describe('LoadingSpinner.vue', () => {
  it('renders with role="status" and aria-live="polite"', () => {
    const wrapper = mount(LoadingSpinner)
    const container = wrapper.find('.loading-spinner-container')
    expect(container.exists()).toBe(true)
    expect(container.attributes('role')).toBe('status')
    expect(container.attributes('aria-live')).toBe('polite')
  })

  it('renders default accessible sr-only text when label is empty', () => {
    const wrapper = mount(LoadingSpinner)
    const srOnly = wrapper.find('.sr-only')
    expect(srOnly.exists()).toBe(true)
    expect(srOnly.text()).toBe('Laster...')
    expect(wrapper.find('.spinner-label').exists()).toBe(false)
  })

  it('renders label text when provided', () => {
    const wrapper = mount(LoadingSpinner, {
      props: {
        label: 'Henter dine turer...',
      },
    })
    const label = wrapper.find('.spinner-label')
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('Henter dine turer...')
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })

  it('applies custom size and color to spinner element', () => {
    const wrapper = mount(LoadingSpinner, {
      props: {
        size: 32,
        color: '#fb923c',
      },
    })
    const spinner = wrapper.find('.spinner')
    expect(spinner.exists()).toBe(true)
    const style = spinner.attributes('style') || ''
    expect(style).toContain('width: 32px')
    expect(style).toContain('height: 32px')
    expect(style).toContain('border-top-color: rgb(251, 146, 60)')
  })

  it('supports inline mode class', () => {
    const wrapper = mount(LoadingSpinner, {
      props: {
        inline: true,
      },
    })
    expect(wrapper.find('.loading-spinner-container').classes()).toContain('inline')
  })
})
