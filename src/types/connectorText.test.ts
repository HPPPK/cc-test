import { expect, test } from 'bun:test'
import { isConnectorTextBlock, type ConnectorTextBlock, type ConnectorTextDelta } from './connectorText.js'

test('connector wire blocks and deltas retain their actual text and signature fields', () => {
  const block: ConnectorTextBlock = { type: 'connector_text', connector_text: 'first', signature: 'signed' }
  const delta: ConnectorTextDelta = { type: 'connector_text_delta', connector_text: ' second' }
  block.connector_text += delta.connector_text
  expect(block.connector_text).toBe('first second')
  expect(isConnectorTextBlock(block)).toBe(true)
})
