import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUIStore } from '../../stores/uiStore'
import { ToastContainer } from './Toast'

describe('ToastContainer', () => {
  beforeEach(() => {
    useUIStore.setState({ toasts: [] })
  })

  it('renders toasts as a right-bottom overlay that does not participate in chat layout', () => {
    render(<ToastContainer />)

    act(() => {
      useUIStore.getState().addToast({
        type: 'warning',
        message: '当前模型缺少能力',
        duration: 0,
      })
    })

    const toastText = screen.getByText('当前模型缺少能力')
    const toastItem = toastText.parentElement?.parentElement
    const toastContainer = toastItem?.parentElement

    expect(toastContainer).toHaveClass('fixed')
    expect(toastContainer).toHaveClass('inset-x-0')
    expect(toastContainer).toHaveClass('bottom-4')
    expect(toastContainer).toHaveClass('z-[1000]')
    expect(toastContainer).toHaveClass('pointer-events-none')
    expect(toastContainer).toHaveClass('items-end')
    expect(toastItem).toHaveClass('pointer-events-auto')
  })
})

