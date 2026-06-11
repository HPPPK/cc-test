import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { EnvironmentSettings } from './EnvironmentSettings'
import { useSettingsStore } from '../stores/settingsStore'

describe('EnvironmentSettings', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    useSettingsStore.setState({
      locale: 'en',
      agentEnvironmentVariables: {
        EXISTING_TOKEN: 'current-value',
      },
    })
  })

  it('edits and saves agent environment variables through settings.env state', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ setAgentEnvironmentVariables: save })

    render(<EnvironmentSettings />)

    expect(screen.getByRole('heading', { name: 'Environment Variables' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('EXISTING_TOKEN')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    const keyInputs = screen.getAllByPlaceholderText('AGENT_API_KEY')
    const valueInputs = screen.getAllByPlaceholderText('Value')
    expect(keyInputs[1]).toBeDefined()
    expect(valueInputs[1]).toBeDefined()
    fireEvent.change(keyInputs[1]!, {
      target: { value: 'NEW_TOKEN' },
    })
    fireEvent.change(valueInputs[1]!, {
      target: { value: 'runtime-value' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save environment' }))
    })

    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        EXISTING_TOKEN: 'current-value',
        NEW_TOKEN: 'runtime-value',
      })
    })
  })
})
