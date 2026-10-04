import { expect, test } from 'bun:test'
import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from './expertReportHandoffGuidance.js'

test('report guidance preserves acquisition, exact citations and bounded inference without a new gate', () => {
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Absence from SOURCE_ROWS never proves absence of evidence')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('partial evidence, not an inaccessible platform')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('every concrete page actually used')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('not conversion, profitability or paid willingness')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('does not prove commercial licensing impossible')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('its basis and falsification conditions')
  expect(REPORT_EVIDENCE_HANDOFF_GUIDANCE).toContain('Do not add browsing, agents, review rounds, word/source quotas, or a new completion gate')
})

test('absorption reuses independent review and saves cumulative substantive material with available tools', () => {
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Read the brief and independent review to EOF first')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('not a second exhaustive pass over every raw shard')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('only relevant ranges')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Save substantive chapter-ready details and their source identities')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('Use only Read and Write, never instruct this worker to Edit or shell-append')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('include the full accumulated material')
  expect(REPORT_ABSORPTION_WORK_GUIDANCE).toContain('A non-empty scaffold or a compaction summary is not a completed 07 handoff')
})
