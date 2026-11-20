import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ZoomableImage from '@/components/ZoomableImage.vue'

describe('ZoomableImage', () => {
  it('rendrer bildet og oppgraderer til =s0 når brukeren zoomer inn', async () => {
    const wrapper = mount(ZoomableImage, {
      attachTo: document.body,
      props: {
        src: 'https://lh3.googleusercontent.com/d/file123',
        fallbackSrc: 'https://drive.google.com/thumbnail?id=file123&sz=w600',
        alt: 'Utsikt fra toppen',
      },
    })

    const img = wrapper.find('img.zoomable-image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://lh3.googleusercontent.com/d/file123')
    expect(wrapper.find('.btn-reset-zoom').exists()).toBe(false)

    // Dobbeltklikk for å zoome inn
    await wrapper.find('.zoomable-stage').trigger('dblclick', { clientX: 100, clientY: 100 })

    expect(img.attributes('src')).toBe('https://lh3.googleusercontent.com/d/file123=s0')
    expect(wrapper.find('.btn-reset-zoom').exists()).toBe(true)
    expect(wrapper.emitted('zoom-change')?.[0]).toEqual([true])

    // Klikk på tilbakestill-knappen
    await wrapper.find('.btn-reset-zoom').trigger('click')
    expect(wrapper.find('.btn-reset-zoom').exists()).toBe(false)
    expect(wrapper.emitted('zoom-change')?.[1]).toEqual([false])

    wrapper.unmount()
  })

  it('faller tilbake til vanlig src eller fallbackSrc dersom bilde-lasting feiler', async () => {
    const wrapper = mount(ZoomableImage, {
      props: {
        src: 'https://lh3.googleusercontent.com/d/file999',
        fallbackSrc: 'data:image/jpeg;base64,thumbdata',
        alt: 'Testbilde',
      },
    })

    const img = wrapper.find('img.zoomable-image')

    // Zoom inn -> bytter til =s0
    await wrapper.find('.zoomable-stage').trigger('dblclick', { clientX: 50, clientY: 50 })
    expect(img.attributes('src')).toBe('https://lh3.googleusercontent.com/d/file999=s0')

    // Simuler at =s0 feiler -> skal falle tilbake til opprinnelig src
    await img.trigger('error')
    expect(img.attributes('src')).toBe('https://lh3.googleusercontent.com/d/file999')

    // Simuler at også opprinnelig src feiler -> skal falle tilbake til fallbackSrc
    await img.trigger('error')
    expect(img.attributes('src')).toBe('data:image/jpeg;base64,thumbdata')
  })

  it('nullstiller zoom automatisk når src-prop endres (bytte til neste/forrige bilde)', async () => {
    const wrapper = mount(ZoomableImage, {
      props: {
        src: 'https://lh3.googleusercontent.com/d/img1',
        alt: 'Bilde 1',
      },
    })

    await wrapper.find('.zoomable-stage').trigger('dblclick', { clientX: 80, clientY: 80 })
    expect(wrapper.find('.btn-reset-zoom').exists()).toBe(true)

    await wrapper.setProps({
      src: 'https://lh3.googleusercontent.com/d/img2',
      alt: 'Bilde 2',
    })

    expect(wrapper.find('.btn-reset-zoom').exists()).toBe(false)
    expect(wrapper.find('img.zoomable-image').attributes('src')).toBe(
      'https://lh3.googleusercontent.com/d/img2',
    )
  })
})
