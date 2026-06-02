import {
  WORKFLOW_TEMPLATE_BUILTIN_ID,
  WORKFLOW_TEMPLATE_SCHEMA_VERSION,
} from './workflowTemplateValidation.js'

export type WorkflowTemplateAuthoringGuideFieldGroup = {
  id: string
  title: string
  requiredFields: string[]
  optionalFields: string[]
  guidance: string[]
  examples?: Record<string, unknown>[]
}

export type WorkflowTemplateAuthoringGuide = {
  schemaVersion: 1
  fieldGroups: WorkflowTemplateAuthoringGuideFieldGroup[]
  allowedValues: {
    completionCriteriaTypes: string[]
    transitionAuthorities: string[]
  }
  unsupportedShapes: string[]
  repairHintsByIssueCode: Record<string, string[]>
}

export const workflowTemplateAuthoringGuide: WorkflowTemplateAuthoringGuide = {
  schemaVersion: WORKFLOW_TEMPLATE_SCHEMA_VERSION,
  fieldGroups: [
    {
      id: 'template-identity',
      title: 'Template identity',
      requiredFields: ['schemaVersion', 'id', 'version', 'name', 'phases'],
      optionalFields: ['description', 'source'],
      guidance: [
        `Use schemaVersion ${WORKFLOW_TEMPLATE_SCHEMA_VERSION}; authored templates are saved with source user.`,
        'Use stable slug ids without slash or backslash path separators.',
        `Do not use ${WORKFLOW_TEMPLATE_BUILTIN_ID}; user templates must not shadow builtin ids.`,
        'Names and descriptions should make the workflow easy to choose from a template list.',
      ],
      examples: [
        {
          schemaVersion: WORKFLOW_TEMPLATE_SCHEMA_VERSION,
          id: 'release-readiness',
          version: '1',
          name: 'Release Readiness',
          description: 'Prepare release evidence and handoff.',
        },
      ],
    },
    {
      id: 'phase-identity',
      title: 'Phase identity',
      requiredFields: ['phases[]', 'phases[].id', 'phases[].name'],
      optionalFields: ['phases[].role'],
      guidance: [
        'Phases must be a non-empty ordered linear array.',
        'Each phase id must be unique within the template.',
        'Use short readable phase names that match the phase intent.',
      ],
    },
    {
      id: 'phase-intent',
      title: 'Phase intent',
      requiredFields: ['phases[].instructions'],
      optionalFields: ['phases[].objective'],
      guidance: [
        'Instructions describe what the agent should do, avoid, and prove in this phase.',
        'Use objective for a compact goal when the phase needs a clearer target.',
      ],
    },
    {
      id: 'handoff-contract',
      title: 'Handoff contract',
      requiredFields: ['phases[].requiredIntake', 'phases[].handoffRules'],
      optionalFields: [],
      guidance: [
        'Every phase needs first-class requiredIntake and handoffRules arrays.',
        'requiredIntake describes prerequisite context before phase work starts.',
        'handoffRules describe what moves to the user, next phase, or final report.',
      ],
    },
    {
      id: 'execution-contract',
      title: 'Execution contract',
      requiredFields: ['phases[].executionRules'],
      optionalFields: ['phases[].phasePrompt'],
      guidance: [
        'Execution rules constrain behavior, evidence, permissions, and stopping points.',
        'phasePrompt can add richer runtime guidance but does not replace required first-class contracts.',
      ],
    },
    {
      id: 'output-contract',
      title: 'Output contract',
      requiredFields: [
        'phases[].outputArtifact.id',
        'phases[].outputArtifact.name',
        'phases[].outputArtifact.kind',
        'phases[].outputArtifact.description',
        'phases[].outputArtifact.required',
      ],
      optionalFields: ['phases[].requiredArtifacts', 'phases[].outputArtifact.sections'],
      guidance: [
        'Every phase needs a first-class outputArtifact object.',
        'Set outputArtifact.required to true.',
        'Required artifacts should match the handoff and downstream phase needs.',
      ],
    },
    {
      id: 'completion-contract',
      title: 'Completion contract',
      requiredFields: ['phases[].completionCriteria.type', 'phases[].completionCriteria.description'],
      optionalFields: [],
      guidance: [
        'Use a supported completionCriteria.type and a concrete completion description.',
        'Completion criteria should be checkable from the output artifact and handoff evidence.',
      ],
    },
    {
      id: 'transition-contract',
      title: 'Transition contract',
      requiredFields: ['phases[].transition.authority'],
      optionalFields: [],
      guidance: [
        'Use user-confirmation when phase advancement should be reviewed.',
        'Use auto only when the next phase can safely begin without manual review.',
      ],
    },
    {
      id: 'tool-action-safety',
      title: 'Tool/action safety',
      requiredFields: [],
      optionalFields: [
        'phases[].actionPolicy.allowedActions',
        'phases[].actionPolicy.forbiddenActions',
      ],
      guidance: [
        'Action policies express allowed or forbidden action categories for a phase.',
        'Phase policy guidance cannot bypass global tool safety, permissions, or destructive-operation rules.',
      ],
    },
    {
      id: 'model-skills',
      title: 'Model/skills',
      requiredFields: [],
      optionalFields: ['phases[].requestedModel', 'phases[].skills'],
      guidance: [
        'requestedModel is optional and should only be set when the phase has a concrete model need.',
        'Use workflow_template_authoring skill_catalog before create or update when assigning recommended phase skills.',
        'phases[].skills should contain references to existing skills such as { name, mode: "recommended" }; add source, pluginName, namespace, version, contentHash, or referenceId only when needed for provenance or ambiguity.',
        'Do not duplicate skill-owned descriptions, applicability, reason, appliesWhen, assets, scripts, tools, model, or effort settings into workflow templates.',
        'Legacy reason fields are preserved if already present, but new workflow templates should rely on the skill catalog and the skill package itself for applicability.',
      ],
    },
    {
      id: 'unsupported-shapes',
      title: 'Unsupported shapes',
      requiredFields: [],
      optionalFields: [],
      guidance: [
        'First scope is linear-only: ordered phases advance by transition authority.',
        'Branching, loop, parallel, and nested workflow shapes are rejected.',
        'Represent alternatives as instructions or split them into separate linear templates.',
      ],
    },
  ],
  allowedValues: {
    completionCriteriaTypes: [
      'manual-checklist',
      'artifact-required',
      'agent-reported',
    ],
    transitionAuthorities: [
      'auto',
      'user-confirmation',
    ],
  },
  unsupportedShapes: [
    'branching',
    'loop',
    'parallel',
    'nested',
  ],
  repairHintsByIssueCode: {
    WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD: [
      'Add the missing template or phase field named by the diagnostic path.',
      'Templates require id, version, name, and a non-empty phases array; phases require id, name, instructions, completionCriteria, transition, outputArtifact, requiredIntake, and handoffRules.',
    ],
    WORKFLOW_TEMPLATE_INVALID: [
      'Submit a workflow template object rather than a primitive, array, or malformed payload.',
    ],
    WORKFLOW_TEMPLATE_INVALID_ID: [
      'Replace the template id with a stable slug that does not contain slash or backslash path separators.',
    ],
    WORKFLOW_TEMPLATE_INVALID_PHASES: [
      'Provide phases as a non-empty ordered linear array of phase objects.',
    ],
    WORKFLOW_PHASE_DUPLICATE_ID: [
      'Rename duplicate phase ids so every phase id is unique within the template.',
    ],
    WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT: [
      `Choose a user template id other than ${WORKFLOW_TEMPLATE_BUILTIN_ID}.`,
      'To modify builtin behavior, duplicate the builtin template to a non-conflicting user id first.',
    ],
    WORKFLOW_TEMPLATE_CONFLICT: [
      'Choose a unique user template id or inspect the existing user template before updating it.',
    ],
    WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED: [
      'Add phases[].outputArtifact with id, name, kind, description, and required: true.',
      'Do not rely on phasePrompt output metadata as a replacement for the first-class outputArtifact contract.',
    ],
    WORKFLOW_PHASE_HANDOFF_REQUIRED: [
      'Add non-empty requiredIntake and handoffRules arrays to the phase.',
      'Describe both prerequisite context and what the phase must hand off when complete.',
    ],
    WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED: [
      'Remove transition branches, branch, next, or edges fields; first scope supports linear-only phase order.',
    ],
    WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED: [
      'Remove transition loop, repeat, or until fields; model repeated work inside phase instructions instead.',
    ],
    WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED: [
      'Remove parallel or parallelPhases fields; split parallel work into ordered linear phases.',
    ],
    WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED: [
      'Remove workflows, nestedWorkflows, or childWorkflows fields; use a separate linear template for nested work.',
    ],
    WORKFLOW_PHASE_SKILL_INVALID_REFERENCE: [
      'Set phases[].skills to an array of recommended skill references from workflow_template_authoring skill_catalog.',
      'Each phase skill reference needs a non-empty name and mode "recommended"; omit duplicated reason or appliesWhen text in new templates.',
    ],
  },
}
