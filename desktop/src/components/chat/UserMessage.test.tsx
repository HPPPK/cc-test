import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { UserMessage } from './UserMessage'

describe('UserMessage', () => {
  it('keeps long URLs inside the message bubble', () => {
    const longUrl = `https://cn.bing.com/search?q=${'encoded'.repeat(60)}`

    const { container } = render(<UserMessage content={longUrl} />)

    const shell = container.querySelector('[data-message-shell="user"]')
    const bubble = screen.getByText(longUrl)

    expect(shell?.className).toContain('min-w-0')
    expect(bubble.className).toContain('min-w-0')
    expect(bubble.className).toContain('max-w-full')
    expect(bubble.className).toContain('whitespace-pre-wrap')
    expect(bubble.style.overflowWrap).toBe('anywhere')
    expect(bubble.style.wordBreak).toBe('break-word')
  })

  it('shows a non-interrupting queued state and guide action', () => {
    render(<UserMessage content="follow up after tools" queued onGuideQueued={() => {}} />)

    expect(screen.getByText('Queued')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guide queued message' })).toBeTruthy()
  })

  it('highlights a leading skill invocation in the message bubble', () => {
    render(<UserMessage content="/update-config adjust the session composer" />)

    const invocation = screen.getByTestId('user-message-skill-invocation')

    expect(invocation).toHaveTextContent('/update-config')
    expect(invocation).toHaveClass('font-mono')
    expect(screen.getByText('adjust the session composer')).toBeInTheDocument()
  })
})
