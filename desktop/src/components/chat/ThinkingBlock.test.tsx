import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThinkingBlock } from './ThinkingBlock'

describe('ThinkingBlock', () => {
  it('does not reveal a thinking preview until the user expands it', () => {
    render(<ThinkingBlock content="I will issue the finalize write as the single closing action." />)

    expect(screen.queryByText(/I will issue the finalize write/i)).toBeNull()

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/I will issue the finalize write/i)).not.toBeNull()
  })
})
