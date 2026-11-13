import '@testing-library/jest-dom'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentOverlay } from './ContentOverlay'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('content modal placement', () => {
  it('escapes transformed ancestors and tracks the actual content bounds when the sidebar changes', () => {
    let measure!: ResizeObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { measure = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const content = document.createElement('main')
    content.id = 'content-area'
    document.body.append(content)
    let rect = { left: 280, top: 0, width: 1000, height: 720 }
    vi.spyOn(content, 'getBoundingClientRect').mockImplementation(() => rect as DOMRect)
    try {
      const { container, unmount } = render(<div style={{ transform: 'translateY(0)', overflow: 'hidden' }}><ContentOverlay data-testid="overlay"><span>Visible dialog</span></ContentOverlay></div>)
      const overlay = screen.getByTestId('overlay')
      expect(container.contains(overlay)).toBe(false)
      expect(overlay).toHaveStyle({ left: '280px', width: '1000px', height: '720px', padding: '16px' })
      rect = { left: 56, top: 0, width: 1224, height: 720 }
      act(() => measure([], {} as ResizeObserver))
      expect(overlay).toHaveStyle({ left: '56px', width: '1224px' })
      rect = { left: 0, top: 0, width: 390, height: 600 }
      act(() => window.dispatchEvent(new Event('resize')))
      expect(overlay).toHaveStyle({ left: '0px', width: '390px', height: '600px' })
      unmount()
      expect(disconnect).toHaveBeenCalledOnce()
    } finally { content.remove() }
  })

  it('falls back to the viewport when there is no content area', () => {
    render(<ContentOverlay data-testid="overlay">Dialog</ContentOverlay>)
    expect(screen.getByTestId('overlay')).toHaveStyle({ left: '0px', top: '0px', width: '100%', height: '100%' })
  })
})
