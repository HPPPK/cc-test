import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProviderStore } from '../stores/providerStore'
import { useSettingsStore } from '../stores/settingsStore'

const imageApiMocks = vi.hoisted(() => ({
  preflight: vi.fn(),
}))

vi.mock('../api/images', () => ({
  imagesApi: { preflight: imageApiMocks.preflight },
}))

import { ImageGenerationSettings } from './ImageGenerationSettings'

describe('ImageGenerationSettings', () => {
  const setImageGeneration = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({
      locale: 'en',
      imageGeneration: { enabled: false },
      setImageGeneration: setImageGeneration.mockResolvedValue(undefined),
    })
    useProviderStore.setState({
      providers: [{
        id: 'image-relay',
        presetId: 'custom',
        name: 'Company Image Relay',
        apiKey: '',
        baseUrl: 'https://images.example.test',
        apiFormat: 'openai_chat',
        models: { main: 'gpt-5.6-terra', haiku: 'gpt-5.6-terra', sonnet: 'gpt-5.6-terra', opus: 'gpt-5.6-terra' },
      }],
      activeId: 'chat-provider-that-must-not-be-selected',
      hasLoadedProviders: true,
      fetchProviders: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('does not infer image configuration from the active chat Provider', () => {
    render(<ImageGenerationSettings />)

    expect(screen.getByLabelText('Image Provider')).toHaveValue('')
    expect(screen.getByLabelText('Image model')).toHaveValue('')
    expect(screen.getByText(/independent from the chat model/i)).toBeInTheDocument()
  })

  it('saves only an explicit image Provider and model selection', async () => {
    render(<ImageGenerationSettings />)

    fireEvent.click(screen.getByLabelText('Enable real image generation'))
    fireEvent.change(screen.getByLabelText('Image Provider'), { target: { value: 'image-relay' } })
    fireEvent.change(screen.getByLabelText('Image model'), { target: { value: 'gpt-image-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save image settings' }))

    await waitFor(() => expect(setImageGeneration).toHaveBeenCalledWith({
      enabled: true,
      providerId: 'image-relay',
      model: 'gpt-image-2',
    }))
  })

  it('saves the explicit selection before testing and makes that behavior clear', async () => {
    setImageGeneration.mockImplementation(async (settings) => {
      useSettingsStore.setState({ imageGeneration: settings })
    })
    imageApiMocks.preflight.mockResolvedValue({
      status: 'available',
      availability: 'available',
      model: 'gpt-image-2',
      message: 'Provider accepted the image model.',
    })
    render(<ImageGenerationSettings />)

    expect(screen.getByText(/Testing saves the current configuration first/i)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Enable real image generation'))
    fireEvent.change(screen.getByLabelText('Image Provider'), { target: { value: 'image-relay' } })
    fireEvent.change(screen.getByLabelText('Image model'), { target: { value: 'gpt-image-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))

    await waitFor(() => expect(imageApiMocks.preflight).toHaveBeenCalledTimes(1))
    expect(setImageGeneration).toHaveBeenCalledWith({
      enabled: true,
      providerId: 'image-relay',
      model: 'gpt-image-2',
    })
    expect(screen.getByText('Settings saved, connection preflight completed')).toBeInTheDocument()
    expect(screen.getByText(/Current image settings are saved/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save image settings' })).toBeDisabled()
  })
})
