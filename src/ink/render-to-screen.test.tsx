import { expect, test } from 'bun:test'
import React from 'react'
import Box from './components/Box.js'
import Text from './components/Text.js'
import { renderToScreen, scanPositions } from './render-to-screen.js'

test('React 19 host renderer renders, updates and unmounts independently across search previews', () => {
  const first = renderToScreen(<Box><Text>first report</Text></Box>, 40)
  expect(scanPositions(first.screen, 'first report')).toHaveLength(1)
  const second = renderToScreen(<Box flexDirection="column"><Text>second report</Text><Text>next row</Text></Box>, 40)
  expect(scanPositions(second.screen, 'first report')).toHaveLength(0)
  expect(scanPositions(second.screen, 'second report')).toHaveLength(1)
  expect(scanPositions(second.screen, 'next row')[0]?.row).toBe(1)
})
