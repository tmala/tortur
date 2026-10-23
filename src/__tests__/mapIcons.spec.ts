import { describe, it, expect } from 'vitest'
import { createUserIcon } from '@/utils/mapIcons'

describe('createUserIcon', () => {
  it('oppretter markør uten is-live klasse og med skjult heading når isLive er false', () => {
    const icon = createUserIcon(null, false)
    const options = icon.options

    expect(options.className).toBe('custom-user-pin')
    expect(options.iconSize).toEqual([48, 48])
    expect(options.iconAnchor).toEqual([24, 24])

    const html = options.html as string
    expect(html).toContain('class="user-location-marker "')
    expect(html).not.toContain('is-live')
    expect(html).toContain('class="pulse-ring"')
    expect(html).toContain('class="marker-core"')
    expect(html).toContain('class="heading-indicator" style="display: none;"')
  })

  it('oppretter markør med is-live klasse og rotert kompassnål når isLive er true og heading er oppgitt', () => {
    const icon = createUserIcon(90, true)
    const options = icon.options

    const html = options.html as string
    expect(html).toContain('class="user-location-marker is-live"')
    expect(html).toContain('style="transform: rotate(90deg); display: block;"')
    expect(html).toContain('class="heading-indicator-svg"')
    expect(html).toContain('class="compass-pointer"')
    expect(html).toContain('id="user-compass-beam-grad"')
  })

  it('skjuler kompassnål selv om isLive er true dersom heading mangler eller er NaN', () => {
    const iconNull = createUserIcon(null, true)
    const htmlNull = iconNull.options.html as string
    expect(htmlNull).toContain('is-live')
    expect(htmlNull).toContain('style="display: none;"')

    const iconNaN = createUserIcon(NaN, true)
    const htmlNaN = iconNaN.options.html as string
    expect(htmlNaN).toContain('is-live')
    expect(htmlNaN).toContain('style="display: none;"')
  })
})
