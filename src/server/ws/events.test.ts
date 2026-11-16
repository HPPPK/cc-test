import { expect, test } from 'bun:test'
import type { ClientMessage } from './events.js'

test('workflow transition wire DTO accepts precise scope amendments and legacy messages', () => {
  const legacy: ClientMessage = { type: 'workflow_transition', phaseId: 'delegate-implement', action: 'route' }
  const amended: ClientMessage = { ...legacy, routeIntent: 'rework_current_phase', scopeAmendment: { batchId: 'B3', addWriteScopes: ['config/settings.py'] } }
  expect(legacy).not.toHaveProperty('scopeAmendment')
  expect(amended.scopeAmendment).toEqual({ batchId: 'B3', addWriteScopes: ['config/settings.py'] })
})
