import { describe, expect, test } from 'bun:test'
import {
  workflowTemplateAuthoringGuide,
} from './workflowTemplateAuthoringGuide.js'
import {
  WORKFLOW_TEMPLATE_BUILTIN_ID,
  WORKFLOW_TEMPLATE_SCHEMA_VERSION,
  validateAndNormalizeWorkflowTemplate,
} from './workflowTemplateValidation.js'

const requiredGuideGroupTitles = [
  'Template identity',
  'Phase identity',
  'Phase intent',
  'Handoff contract',
  'Execution contract',
  'Output contract',
  'Completion contract',
  'Transition contract',
  'Tool/action safety',
  'Model/skills',
  'Unsupported shapes',
]

const requiredUnsupportedShapes = [
  'branching',
  'loop',
  'parallel',
  'nested',
]

const requiredRepairableIssueCodes = [
  'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
  'WORKFLOW_TEMPLATE_INVALID_PHASES',
  'WORKFLOW_PHASE_DUPLICATE_ID',
  'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
  'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT',
  'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
  'WORKFLOW_PHASE_HANDOFF_REQUIRED',
  'WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED',
  'WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED',
  'WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED',
  'WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED',
]

function validPhase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft',
    name: 'Draft',
    instructions: 'Draft the phase output.',
    requiredIntake: ['Use the user request and prior workflow context.'],
    handoffRules: ['Summarize the output and next-phase readiness.'],
    executionRules: ['Stay within the approved workflow contract.'],
    outputArtifact: {
      id: 'draft-output',
      name: 'Draft Output',
      kind: 'markdown',
      description: 'The required draft output.',
      required: true,
    },
    completionCriteria: {
      type: 'manual-checklist',
      description: 'The required output and handoff are complete.',
    },
    transition: { authority: 'user-confirmation' },
    skills: [],
    requiredArtifacts: [],
    ...overrides,
  }
}

function validTemplate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: WORKFLOW_TEMPLATE_SCHEMA_VERSION,
    id: 'custom-workflow',
    version: '1',
    name: 'Custom Workflow',
    description: 'A custom workflow template.',
    phases: [validPhase()],
    ...overrides,
  }
}

function issueCodesFor(template: Record<string, unknown>) {
  return validateAndNormalizeWorkflowTemplate(template).issues.map((issue) => issue.code)
}

describe('workflow template authoring guide', () => {
  test('returns a schema-versioned deterministic guide with every required field group', () => {
    expect(workflowTemplateAuthoringGuide.schemaVersion).toBe(WORKFLOW_TEMPLATE_SCHEMA_VERSION)
    expect(workflowTemplateAuthoringGuide.fieldGroups.map((group) => group.title)).toEqual(
      requiredGuideGroupTitles,
    )
    expect(JSON.stringify(workflowTemplateAuthoringGuide)).toBe(
      JSON.stringify(workflowTemplateAuthoringGuide),
    )
  })

  test('lists allowed completion and transition values accepted by shared validation', () => {
    for (const completionType of workflowTemplateAuthoringGuide.allowedValues.completionCriteriaTypes) {
      expect(issueCodesFor(validTemplate({
        phases: [validPhase({
          completionCriteria: {
            type: completionType,
            description: 'This completion type is accepted.',
          },
        })],
      }))).not.toContain('WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD')
    }

    for (const authority of workflowTemplateAuthoringGuide.allowedValues.transitionAuthorities) {
      expect(issueCodesFor(validTemplate({
        phases: [validPhase({
          transition: { authority },
        })],
      }))).not.toContain('WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD')
    }
  })

  test('guides agents to select recommended phase skills from the catalog without duplicating skill metadata', () => {
    const modelSkills = workflowTemplateAuthoringGuide.fieldGroups.find((group) => group.id === 'model-skills')
    const guidance = modelSkills?.guidance.join('\n') ?? ''

    expect(modelSkills?.optionalFields).toContain('phases[].skills')
    expect(guidance).toContain('workflow_template_authoring skill_catalog')
    expect(guidance).toContain('{ name, mode: "recommended" }')
    expect(guidance).toContain('Do not duplicate skill-owned descriptions')
    expect(guidance).toContain('Legacy reason fields are preserved')
    expect(guidance).not.toContain('Skills should include a name and reason')
  })

  test('lists unsupported shape names that map to shared linear-only validation codes', () => {
    expect(workflowTemplateAuthoringGuide.unsupportedShapes).toEqual(requiredUnsupportedShapes)

    const unsupportedShapeCodes = [
      ...issueCodesFor(validTemplate({
        phases: [validPhase({
          transition: {
            authority: 'user-confirmation',
            branches: [{ when: 'done', phase: 'ship' }],
            loop: { until: 'complete' },
          },
        })],
      })),
      ...issueCodesFor(validTemplate({ parallel: true })),
      ...issueCodesFor(validTemplate({ nestedWorkflows: [] })),
    ]

    expect(unsupportedShapeCodes).toEqual(expect.arrayContaining([
      'WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED',
      'WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED',
      'WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED',
      'WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED',
    ]))
  })

  test('includes repair hints for required validation issue codes produced by shared validation', () => {
    const validationCodes = new Set([
      ...issueCodesFor({}),
      ...issueCodesFor(validTemplate({ phases: [] })),
      ...issueCodesFor(validTemplate({
        phases: [
          validPhase({ id: 'draft' }),
          validPhase({ id: 'draft', name: 'Draft Again' }),
        ],
      })),
      ...issueCodesFor(validTemplate({ id: WORKFLOW_TEMPLATE_BUILTIN_ID })),
      ...issueCodesFor(validTemplate({
        phases: [validPhase({ skills: [{ name: 'bad-mode', mode: 'required' }] })],
      })),
      ...issueCodesFor(validTemplate({ phases: [validPhase({ outputArtifact: undefined })] })),
      ...issueCodesFor(validTemplate({
        phases: [
          validPhase({
            requiredIntake: undefined,
            handoffRules: undefined,
          }),
        ],
      })),
      ...issueCodesFor(validTemplate({
        phases: [validPhase({
          transition: {
            authority: 'user-confirmation',
            branches: [],
            loop: {},
          },
        })],
      })),
      ...issueCodesFor(validTemplate({ parallelPhases: [] })),
      ...issueCodesFor(validTemplate({ childWorkflows: [] })),
    ])

    for (const code of requiredRepairableIssueCodes) {
      expect(validationCodes.has(code)).toBe(true)
      expect(workflowTemplateAuthoringGuide.repairHintsByIssueCode[code]).toEqual(
        expect.arrayContaining([expect.any(String)]),
      )
    }
  })
})
