import { deriveExpertTemplateFillSchema, EXPERT_TEMPLATE_FILL_FORMAT, renderExpertTemplateFill } from '../../utils/expertTemplateFill.js'
import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from '../../services/tools/expertReportHandoffGuidance.js'
import { describe, expect, test } from 'bun:test'
import {
  buildExpertPostReviewEvidenceAbsorptionInstruction,
  deriveExpertResearchEvidenceAbsorptionDispositions,
  evaluateExpertResearchEvidenceAbsorption,
  mergeAuditedOpenedSourcesIntoSourceRows,
  recordExpertResearchEvidenceReviewer,
  resolveExpertResearchAuditSourceReferences,
  resolveExpertResearchEvidenceAbsorptionPolicy,
  validateExpertResearchArtifactAuditTruth,
} from './expertResearchEvidenceAbsorptionService.js'

const protocol = JSON.stringify({
  postReviewEvidenceAbsorption: {
    required: true,
    userInteraction: 'none',
    before: 'template-fill',
    reviewerAgentType: 'expert-evidence-reviewer',
    sourceAgentTypes: ['expert-evidence-researcher'],
    sourceFieldId: 'SOURCE_ROWS',
    requireAllOpenedSourcesDisposition: true,
    requireSourceFieldMapping: true,
    requireReviewerDispositionAbsorption: true,
    fieldGranularityGuidance: [{
      fieldId: 'COMPETITOR_NOTES',
      instruction: 'Keep concrete product/page observations rather than collapsing them into a generic source category.',
    }],
  },
})

function policy() {
  const resolved = resolveExpertResearchEvidenceAbsorptionPolicy(protocol)
  if (!resolved) throw new Error('expected policy')
  return resolved
}

const templateFields = [
  { id: 'COMPETITOR_NOTES', kind: 'paragraphs' as const },
  {
    id: 'SOURCE_ROWS',
    kind: 'table-rows' as const,
    columns: ['ID', 'Source type', 'Summary', 'Captured', 'URL'],
    urlColumnIndex: 4,
  },
]

const researchEvidence = {
  records: [{
    agentId: 'competitor-researcher',
    agentType: 'expert-evidence-researcher',
    recordedAt: '2026-08-18T04:00:00.000Z',
    content: 'Opened the product and support pages.',
    entries: [
      { auditId: 'product', target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url' as const, status: 'opened' as const },
      { auditId: 'support', target: 'https://typora.io/support', finalUrl: 'https://typora.io/support', kind: 'url' as const, status: 'opened' as const },
    ],
  }],
  updatedAt: '2026-08-18T04:00:00.000Z',
}

describe('expertResearchEvidenceAbsorptionService', () => {
  test('parses the opt-in post-review policy', () => {
    expect(policy()).toMatchObject({
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireReviewerDispositionAbsorption: true,
      fieldGranularityGuidance: [{
        fieldId: 'COMPETITOR_NOTES',
        instruction: 'Keep concrete product/page observations rather than collapsing them into a generic source category.',
      }],
    })
  })



  test('appends only report-used audited sources with their actual supporting context', () => {
    const result = mergeAuditedOpenedSourcesIntoSourceRows({
      policy: policy(),
      templateFields,
      fields: {
        COMPETITOR_NOTES: 'Support instructions on https://typora.io/support explain license activation. Google snapshot https://www.google.com/search?q=typora shows the queried product, not stable traffic.',
        SOURCE_ROWS: [{ value: ['[1]', '官网', '正文已使用', '访问于 2026-08-27', 'https://typora.io/'] }],
      },
      researchEvidence: {
        updatedAt: '2026-08-27T04:00:00.000Z',
        records: [{
          agentId: 'researcher-a',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-27T04:00:00.000Z',
          content: '# ledger',
          entries: [
            { auditId: 'existing', target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url', status: 'opened' },
            { auditId: 'support', target: 'https://typora.io/support', finalUrl: 'https://typora.io/support', kind: 'url', status: 'opened' },
            { auditId: 'unused', target: 'https://unused-catalog.example.com/', kind: 'url', status: 'opened' },
            { auditId: 'limited', target: 'https://www.reddit.com/r/typora', finalUrl: 'https://www.reddit.com/login', kind: 'url', status: 'access_limited' },
            { auditId: 'failed', target: 'https://failed.example.com/', kind: 'url', status: 'failed' },
            { auditId: 'pending', target: 'https://pending.example.com/', kind: 'url', status: 'pending' },
            { auditId: 'redirected', target: 'https://producthunt.com/products/typora', finalUrl: 'https://accounts.google.com/signin', kind: 'url', status: 'opened' },
            { auditId: 'serp', target: 'https://www.google.com/search?q=typora', finalUrl: 'https://www.google.com/search?q=typora', kind: 'search', searchEngine: 'Google', searchResultStatus: 'results_observed', status: 'opened' },
          ],
        }],
      },
    })

    expect(result.appended).toBe(2)
    const rows = result.fields.SOURCE_ROWS as Array<{ value: string[]; auditId?: string }>
    expect(rows).toHaveLength(3)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ auditId: 'support', value: expect.arrayContaining(['https://typora.io/support']) }),
      expect.objectContaining({ auditId: 'serp', value: expect.arrayContaining(['audit:serp']) }),
    ]))
    expect(rows.map((row) => row.value.join(' ')).join('\n')).toContain('license activation')
    expect(rows.map((row) => row.auditId)).not.toEqual(expect.arrayContaining(['limited', 'failed', 'pending', 'redirected', 'unused']))
  })

  test('allows new packages to retain source-field mapping without manual per-page dispositions', () => {
    const resolved = resolveExpertResearchEvidenceAbsorptionPolicy(JSON.stringify({
      postReviewEvidenceAbsorption: {
        required: true,
        userInteraction: 'none',
        before: 'template-fill',
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        sourceFieldId: 'SOURCE_ROWS',
        requireSourceFieldMapping: true,
      },
    }))

    expect(resolved).toMatchObject({ requireSourceFieldMapping: true })
    expect(resolved).not.toHaveProperty('requireAllOpenedSourcesDisposition')
  })
  test('repairs audit references to the canonical browser-ledger URL', () => {
    const result = resolveExpertResearchAuditSourceReferences({
      policy: policy(),
      researchEvidence,
      fields: { SOURCE_ROWS: [['[1]', 'Official', 'Product page', '2026-08-18', 'audit://product']] },
      templateFields,
    })

    expect(result.errors).toEqual([])
    expect(result.repairedSourceRows).toBe(1)
    expect(result.fields.SOURCE_ROWS).toEqual([{
      value: ['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/'],
      auditId: 'product',
    }])
  })

  test('binds one stable search URL to its audited final URL without requiring volatile parameters', () => {
    const auditedSearchUrl = 'https://www.google.com/search?q=mouse+middle+button&sei=ephemeral&ved=volatile'
    const searchEvidence = {
      records: [{
        agentId: 'channel-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Search result observed.',
        entries: [{
          auditId: 'google-middle-button',
          target: 'https://www.google.com/search?q=mouse+middle+button',
          finalUrl: auditedSearchUrl,
          kind: 'search' as const,
          searchEngine: 'Google' as const,
          searchResultStatus: 'results_observed' as const,
          status: 'opened' as const,
        }],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const result = resolveExpertResearchAuditSourceReferences({
      policy: { ...policy(), requireSearchAuditBindings: true as const },
      researchEvidence: searchEvidence,
      fields: { SOURCE_ROWS: [{
        'ID': '[1]',
        'Source type': 'Google',
        'Summary': 'Bounded snapshot',
        'Captured': '2026-08-18',
        'URL': 'https://www.google.com/search?q=mouse+middle+button',
      }] },
      templateFields,
    })

    expect(result.errors).toEqual([])
    expect(result.fields.SOURCE_ROWS).toEqual([{
      value: ['[1]', 'Google', 'Bounded snapshot', '2026-08-18', auditedSearchUrl],
      auditId: 'google-middle-button',
    }])
  })

  test('keeps each reviewer include URL when Markdown separates URLs with backticks and Chinese punctuation', () => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | product and support details are report-relevant: \`https://typora.io/\`；\`https://typora.io/support\`（2026-08-18，see audit）',
      entries: [],
    })
    const fields = {
      COMPETITOR_NOTES: 'The public product and support pages describe the product boundary and available support information.',
      SOURCE_ROWS: [
        ['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/'],
        ['[2]', 'Official support', 'Support page', '2026-08-18', 'https://typora.io/support'],
      ],
    }

    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence,
      reviewerState,
      fields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
  })

  test('reconciles an opened redirect target to the browser final URL before source retention', () => {
    const redirectedEvidence = {
      records: [{
        agentId: 'competitor-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Feature page redirected to product home.',
        entries: [{
          auditId: 'fotor-feature',
          target: 'https://www.fotor.com/features/old-photo-restoration.html',
          finalUrl: 'https://www.fotor.com/',
          kind: 'url' as const,
          status: 'opened' as const,
        }],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | The opened Fotor target is report-relevant: https://www.fotor.com/features/old-photo-restoration.html',
      entries: [],
    })
    const repaired = resolveExpertResearchAuditSourceReferences({
      policy: policy(),
      researchEvidence: redirectedEvidence,
      fields: { SOURCE_ROWS: [['[1]', 'Official', 'Fotor final page', '2026-08-18', 'https://www.fotor.com/features/old-photo-restoration.html']] },
      templateFields,
    })

    expect(repaired.errors).toEqual([])
    expect(repaired.fields.SOURCE_ROWS).toEqual([
      ['[1]', 'Official', 'Fotor final page', '2026-08-18', 'https://www.fotor.com/'],
    ])
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence: redirectedEvidence,
      reviewerState,
      fields: { COMPETITOR_NOTES: 'Fotor final page was opened after the requested feature URL redirected.', SOURCE_ROWS: repaired.fields.SOURCE_ROWS },
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
  })

  test('isolates a cross-site browser mismatch instead of rewriting a source row to an unrelated page', () => {
    const mismatchedEvidence = {
      records: [{
        agentId: 'channel-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-25T04:00:00.000Z',
        content: 'A B站 target was followed by an unrelated sibling tab.',
        entries: [{
          auditId: 'bilibili-mismatch',
          target: 'https://search.bilibili.com/all?keyword=Quicker',
          finalUrl: 'https://www.u-tools.cn/docs/guide/faq.html',
          kind: 'url' as const,
          status: 'opened' as const,
        }],
      }],
      updatedAt: '2026-08-25T04:00:00.000Z',
    }

    const resolved = resolveExpertResearchAuditSourceReferences({
      policy: policy(),
      researchEvidence: mismatchedEvidence,
      fields: { SOURCE_ROWS: [['[1]', 'B站', 'Quicker 内容线索', '2026-08-25', 'https://search.bilibili.com/all?keyword=Quicker']] },
      templateFields,
    })

    expect(resolved.repairedSourceRows).toBe(0)
    expect(resolved.fields.SOURCE_ROWS).toEqual([['[1]', 'B站', 'Quicker 内容线索', '2026-08-25', 'https://search.bilibili.com/all?keyword=Quicker']])
    expect(resolved.errors).toEqual([expect.stringContaining('unrelated site')])
  })

  test('does not turn a reviewer display-truncated URL into an impossible source requirement', () => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'merge | A pricing SERP was observed: https://www.bing.com/search?q=old+photo+restoration+pricing...',
      entries: [],
    })
    const instruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: policy(),
      researchEvidence,
      reviewerState,
      templateFields,
    })

    expect(instruction).toContain('Field-specific report quality contract:')
    expect(instruction).toContain('COMPETITOR_NOTES: Keep concrete product/page observations rather than collapsing them into a generic source category.')
    expect(instruction).not.toContain('https://www.bing.com/search?q=old+photo+restoration+pricing...')
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence,
      reviewerState,
      fields: { COMPETITOR_NOTES: 'The audited product page is used as an example.', SOURCE_ROWS: [['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/']] },
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
  })

  test('keeps field-specific guidance in the file-first research handoff instruction', () => {
    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      maxCharacters: 90_000,
    }
    const fileFirstResearchEvidence = {
      records: [
        { ...researchEvidence.records[0], artifactPath: artifactPolicy.researcherPaths[0] },
        {
          agentId: 'demand-researcher',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-18T04:01:00.000Z',
          content: 'Opened public demand evidence.',
          artifactPath: artifactPolicy.researcherPaths[1],
          entries: [],
        },
        {
          agentId: 'channel-researcher',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-18T04:02:00.000Z',
          content: 'Opened public channel evidence.',
          artifactPath: artifactPolicy.researcherPaths[2],
          entries: [],
        },
      ],
      updatedAt: '2026-08-18T04:02:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product details are report-relevant: https://typora.io/',
      artifactPath: artifactPolicy.reviewerPath,
      entries: [],
    })

    const instruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: policy(),
      researchEvidence: fileFirstResearchEvidence,
      reviewerState,
      artifactPolicy,
      templateFields,
    })

    expect(instruction).toContain('Field-specific report quality contract:')
    expect(instruction).toContain('COMPETITOR_NOTES: Keep concrete product/page observations rather than collapsing them into a generic source category.')
    expect(instruction).toContain('commercialization-research/05-evidence-review.md')
    const dispatch = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: { ...policy(), absorberAgentType: 'expert-evidence-absorber' },
      researchEvidence: fileFirstResearchEvidence, reviewerState, templateFields,
      artifactPolicy: { ...artifactPolicy, absorptionPath: 'commercialization-research/07-report-field-absorption.md' },
    })
    expect(dispatch).toContain('path plus a brief save/read-back status')
    expect(dispatch).not.toContain('only that relative Markdown path')
    expect(dispatch).toContain('complete paginated Reads are equivalent')
    expect(dispatch).toContain('[S1]: audit:<exact-audit-id>')
  })

  test('keeps failed direct-page attempts in the audit instead of making them mandatory citations', () => {
    const failedDirectEvidence = {
      records: [{
        agentId: 'competitor-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Opened a product page and reached a failed purchase candidate.',
        entries: [
          { auditId: 'product', target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url' as const, status: 'opened' as const },
          { auditId: 'purchase-404', target: 'https://typora.io/buy', finalUrl: 'https://typora.io/errors/404', kind: 'url' as const, status: 'failed' as const },
        ],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'merge | Keep the failed purchase candidate as an internal access note: https://typora.io/errors/404',
      entries: [],
    })
    const fields = {
      COMPETITOR_NOTES: 'The opened product page is used for product information; the failed purchase candidate is not used as a factual source.',
      SOURCE_ROWS: [['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/']],
    }

    const referenceResult = resolveExpertResearchAuditSourceReferences({
      policy: policy(),
      researchEvidence: failedDirectEvidence,
      fields: { SOURCE_ROWS: [['[1]', 'Audit', 'Failed candidate', '2026-08-18', 'audit://purchase-404']] },
      templateFields,
    })
    expect(referenceResult.errors).toEqual(['SOURCE_ROWS references audit ID with no usable final URL: purchase-404'])
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence: failedDirectEvidence,
      reviewerState,
      fields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()

    const instruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: policy(),
      researchEvidence: failedDirectEvidence,
      reviewerState,
      templateFields,
    })
    expect(instruction).not.toContain('https://typora.io/errors/404')
  })

  test('keeps an explicitly limited search audit eligible for a bounded source note', () => {
    const limitedSearchEvidence = {
      records: [{
        agentId: 'demand-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Search entry reached an access-limited page.',
        entries: [{
          auditId: 'google-limited',
          target: 'https://www.google.com/search?q=typora+pricing',
          finalUrl: 'https://www.google.com/search?q=typora+pricing',
          kind: 'search' as const,
          searchEngine: 'Google',
          searchResultStatus: 'access_limited' as const,
          status: 'access_limited' as const,
        }],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'merge | The access-limited search route can be retained only as a limitation: https://www.google.com/search?q=typora+pricing',
      entries: [],
    })
    const fields = {
      COMPETITOR_NOTES: 'Google search access was limited in this round; this does not support a search-result conclusion.',
      SOURCE_ROWS: [['[1]', 'Google search route', 'Access limitation only', '2026-08-18', 'https://www.google.com/search?q=typora+pricing']],
    }

    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence: limitedSearchEvidence,
      reviewerState,
      fields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
    expect(deriveExpertResearchEvidenceAbsorptionDispositions({
      policy: policy(),
      researchEvidence: limitedSearchEvidence,
      sourceUrls: new Set(['https://www.google.com/search?q=typora+pricing']),
    })).toEqual([{ sourceUrl: 'https://www.google.com/search?q=typora+pricing', disposition: 'limited' }])
  })

  test('does not promote an unnamed search navigation into an impossible source requirement', () => {
    const unnamedSearchEvidence = {
      records: [{
        agentId: 'channel-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Reached a search URL without a traceable engine classification.',
        entries: [{
          auditId: 'unnamed-search',
          target: 'https://search.example.com/?q=typora',
          finalUrl: 'https://search.example.com/?q=typora',
          kind: 'search' as const,
          status: 'opened' as const,
        }],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | This raw navigation should remain audit-only: https://search.example.com/?q=typora',
      entries: [],
    })

    expect(resolveExpertResearchAuditSourceReferences({
      policy: policy(),
      researchEvidence: unnamedSearchEvidence,
      fields: { SOURCE_ROWS: [['[1]', 'Search', 'Raw navigation', '2026-08-18', 'audit://unnamed-search']] },
      templateFields,
    }).errors).toEqual(['SOURCE_ROWS references audit ID with no usable final URL: unnamed-search'])
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: policy(),
      researchEvidence: unnamedSearchEvidence,
      reviewerState,
      fields: {
        COMPETITOR_NOTES: 'No traceable search-engine conclusion is made from the raw navigation.',
        SOURCE_ROWS: [],
      },
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
  })

  test('keeps old protocols compatible when no field guidance is declared', () => {
    const legacyDocument = JSON.parse(protocol)
    delete legacyDocument.postReviewEvidenceAbsorption.fieldGranularityGuidance

    const resolvedLegacyPolicy = resolveExpertResearchEvidenceAbsorptionPolicy(JSON.stringify(legacyDocument))
    expect(resolvedLegacyPolicy).toMatchObject({ reviewerAgentType: 'expert-evidence-reviewer' })
    expect(resolvedLegacyPolicy).not.toHaveProperty('fieldGranularityGuidance')
  })

  test('rejects field guidance that references a field absent from the fixed template', () => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product details are report-relevant: https://typora.io/',
      entries: [],
    })
    const invalidGuidancePolicy = {
      ...policy(),
      fieldGranularityGuidance: [{ fieldId: 'MISSING_TEMPLATE_FIELD', instruction: 'Must never silently disappear.' }],
    }

    expect(() => buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: invalidGuidancePolicy,
      researchEvidence,
      reviewerState,
      templateFields,
    })).toThrow('postReviewEvidenceAbsorption.fieldGranularityGuidance references unknown template field(s): MISSING_TEMPLATE_FIELD.')
  })

  test('derives used and not-applicable dispositions from the final source table instead of model-authored records', () => {
    const sourceUrls = new Set(['https://typora.io/'])
    expect(deriveExpertResearchEvidenceAbsorptionDispositions({
      policy: policy(),
      researchEvidence,
      sourceUrls,
    })).toEqual([
      { sourceUrl: 'https://typora.io/', disposition: 'used' },
      { sourceUrl: 'https://typora.io/support', disposition: 'not-applicable' },
    ])
  })

  test('rejects a compressed initial field when 07 declares an audited detail cluster', () => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product detail is report-ready: https://typora.io/',
      entries: [],
    })
    const strictPolicy = { ...policy(), requireAuditedDetailClusters: true as const }
    const artifact = [
      '# Field material',
      '',
      '- Concrete product detail.',
      '',
      '<!-- CC_REPORT_DETAIL_CLUSTERS',
      '{',
      '  "version": "cc-jiangxia-report-detail-clusters/v1",',
      '  "clusters": [{',
      '    "id": "product-detail",',
      '    "fieldId": "COMPETITOR_NOTES",',
      '    "reportText": "The audited product page exposes the concrete product detail and its stated boundary.",',
      '    "state": "verified",',
      '    "auditIds": ["product"]',
      '  }]',
      '}',
      '-->',
    ].join('\n')
    const sourceRows = [['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/']]

    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence,
      reviewerState,
      fields: { COMPETITOR_NOTES: 'The product is relevant to the market.', SOURCE_ROWS: sourceRows },
      templateFields,
      evidenceAbsorption: undefined,
      absorptionArtifactContent: artifact,
    })).toContain('omitted detail cluster product-detail')

    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence,
      reviewerState,
      fields: {
        COMPETITOR_NOTES: 'The audited product page exposes the concrete product detail and its stated boundary.',
        SOURCE_ROWS: sourceRows,
      },
      templateFields,
      evidenceAbsorption: undefined,
      absorptionArtifactContent: artifact,
    })).toBeNull()
  })

  test.each(['AI推断：', '（AI推断）', '(AI 推断)'])('accepts equivalent inference labels in audited detail clusters: %s', (label) => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product detail supports a bounded inference: https://typora.io/',
      entries: [],
    })
    const check = (reportText: string) => evaluateExpertResearchEvidenceAbsorption({
      policy: { ...policy(), requireAuditedDetailClusters: true },
      researchEvidence,
      reviewerState,
      fields: {
        COMPETITOR_NOTES: reportText,
        SOURCE_ROWS: [['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/']],
      },
      templateFields,
      evidenceAbsorption: undefined,
      absorptionArtifactContent: '<!-- CC_REPORT_DETAIL_CLUSTERS\n' + JSON.stringify({
        version: 'cc-jiangxia-report-detail-clusters/v1',
        clusters: [{ id: 'product-inference', fieldId: 'COMPETITOR_NOTES', reportText, state: 'inference', auditIds: ['product'] }],
      }) + '\n-->',
    })
    const inference = '依据官网展示的编辑能力，推测可减少部分写作切换；若实际任务未减少切换则不成立。'
    expect(check(label + inference)).toBeNull()
    expect(check(inference)).toContain('Inference detail cluster product-inference')
  })

  test('allows natural 07 Markdown when optional detail-cluster JSON is absent', () => {
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product detail is report-ready: https://typora.io/',
      entries: [],
    })
    const strictPolicy = { ...policy(), requireAuditedDetailClusters: true as const }

    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence,
      reviewerState,
      fields: {
        COMPETITOR_NOTES: 'The audited product page exposes the concrete product detail and its stated boundary.',
        SOURCE_ROWS: [['[1]', 'Official', 'Product page', '2026-08-18', 'https://typora.io/']],
      },
      templateFields,
      evidenceAbsorption: undefined,
      absorptionArtifactContent: '# Field material\n\n- Concrete product detail with its evidence boundary.',
    })).toBeNull()
  })

  test('keeps a results-observed Bing audit from being reported as access-limited', () => {
    const bingEvidence = {
      records: [{
        agentId: 'channel-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Bing result page opened.',
        entries: [{
          auditId: 'bing-serp-cn',
          target: 'https://www.bing.com/search?q=quicker',
          finalUrl: 'https://www.bing.com/search?q=quicker',
          kind: 'search' as const,
          searchEngine: 'Bing' as const,
          searchResultStatus: 'results_observed' as const,
          status: 'opened' as const,
        }],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Bing SERP snapshot: https://www.bing.com/search?q=quicker',
      entries: [],
    })
    const strictPolicy = { ...policy(), requireSearchAuditBindings: true as const }
    const rawFields = {
      COMPETITOR_NOTES: 'No result-ranking conclusion is made from the single Bing snapshot.',
      SOURCE_ROWS: [['[1]', 'Bing', 'Search entry status', '2026-08-18', 'audit://bing-serp-cn']],
    }
    const resolved = resolveExpertResearchAuditSourceReferences({
      policy: strictPolicy,
      researchEvidence: bingEvidence,
      fields: rawFields,
      templateFields,
    })
    expect(resolved.errors).toEqual([])
    expect(resolved.fields.SOURCE_ROWS).toEqual([{
      value: ['[1]', 'Bing', 'Search entry status', '2026-08-18', 'https://www.bing.com/search?q=quicker'],
      auditId: 'bing-serp-cn',
    }])

    const falseRestrictionFields = {
      ...resolved.fields,
      SOURCE_ROWS: [{
        value: ['[1]', 'Bing', 'Bing access limited / security verification; no complete result.', '2026-08-18', 'https://www.bing.com/search?q=quicker'],
        auditId: 'bing-serp-cn',
      }],
    }
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence: bingEvidence,
      reviewerState,
      fields: falseRestrictionFields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toContain('results-observed Bing SERP as access-limited')
  })


  test('uses the bound audit ID when the same Bing URL has both observed and limited attempts', () => {
    const repeatedSearchEvidence = {
      records: [{
        agentId: 'channel-researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-18T04:00:00.000Z',
        content: 'Repeated Bing attempts.',
        entries: [
          {
            auditId: 'bing-observed',
            target: 'https://www.bing.com/search?q=quicker',
            finalUrl: 'https://www.bing.com/search?q=quicker',
            kind: 'search' as const,
            searchEngine: 'Bing' as const,
            searchResultStatus: 'results_observed' as const,
            status: 'opened' as const,
          },
          {
            auditId: 'bing-limited-later',
            target: 'https://www.bing.com/search?q=quicker',
            finalUrl: 'https://www.bing.com/search?q=quicker',
            kind: 'search' as const,
            searchEngine: 'Bing' as const,
            searchResultStatus: 'access_limited' as const,
            status: 'access_limited' as const,
          },
        ],
      }],
      updatedAt: '2026-08-18T04:00:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Bing snapshot: https://www.bing.com/search?q=quicker',
      entries: [],
    })
    const strictPolicy = { ...policy(), requireSearchAuditBindings: true as const }
    const bareFields = {
      COMPETITOR_NOTES: 'The single Bing snapshot does not establish ranking.',
      SOURCE_ROWS: [['[1]', 'Bing', 'Search result snapshot', '2026-08-18', 'https://www.bing.com/search?q=quicker']],
    }
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence: repeatedSearchEvidence,
      reviewerState,
      fields: bareFields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toContain('must retain its exact audit:// ID')

    const observedFields = {
      ...bareFields,
      SOURCE_ROWS: [{
        value: ['[1]', 'Bing', 'One observed Bing search-results snapshot; no ranking conclusion.', '2026-08-18', 'https://www.bing.com/search?q=quicker'],
        auditId: 'bing-observed',
      }],
    }
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence: repeatedSearchEvidence,
      reviewerState,
      fields: observedFields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()

    const limitedFields = {
      ...bareFields,
      SOURCE_ROWS: [{
        value: ['[1]', 'Bing', 'Bing access limited; no complete result was used.', '2026-08-18', 'https://www.bing.com/search?q=quicker'],
        auditId: 'bing-limited-later',
      }],
    }
    expect(evaluateExpertResearchEvidenceAbsorption({
      policy: strictPolicy,
      researchEvidence: repeatedSearchEvidence,
      reviewerState,
      fields: limitedFields,
      templateFields,
      evidenceAbsorption: undefined,
    })).toBeNull()
  })


  test('accepts one legacy bare JSON audit assertion comment while preserving exact audit checks', () => {
    const strictPolicy = { ...policy(), requireResearchArtifactAuditAssertions: true as const }
    const entries = [{
      auditId: 'bing-cn',
      target: 'https://www.bing.com/search?q=quicker',
      finalUrl: 'https://www.bing.com/search?q=quicker',
      kind: 'search' as const,
      searchEngine: 'Bing' as const,
      searchResultStatus: 'results_observed' as const,
      status: 'opened' as const,
    }]
    const legacyBareComment = [
      '# Research ledger',
      '- Bing search results observed [audit:bing-cn].',
      '',
      '<!-- {"version":"cc-jiangxia-research-audit-assertions/v1","assertions":[{"auditId":"bing-cn","status":"opened","kind":"search","searchResultStatus":"results_observed","finalUrl":"https://www.bing.com/search?q=quicker"}]} -->',
    ].join('\n')

    expect(validateExpertResearchArtifactAuditTruth({
      policy: strictPolicy,
      content: legacyBareComment,
      entries,
    })).toEqual([])
  })

  test('rejects researcher Markdown that changes or omits an exact browser audit status', () => {
    const strictPolicy = { ...policy(), requireResearchArtifactAuditAssertions: true as const }
    const entries = [{
      auditId: 'bing-cn',
      target: 'https://www.bing.com/search?q=quicker',
      finalUrl: 'https://www.bing.com/search?q=quicker',
      kind: 'search' as const,
      searchEngine: 'Bing' as const,
      searchResultStatus: 'results_observed' as const,
      status: 'opened' as const,
    }]
    const contradictory = [
      '# Research ledger',
      '- Bing access limited [audit:bing-cn].',
      '',
      '<!-- CC_RESEARCH_AUDIT_ASSERTIONS',
      '{',
      '  "version": "cc-jiangxia-research-audit-assertions/v1",',
      '  "assertions": [{',
      '    "auditId": "bing-cn",',
      '    "status": "access_limited",',
      '    "kind": "search",',
      '    "searchResultStatus": "access_limited",',
      '    "finalUrl": "https://www.bing.com/search?q=quicker"',
      '  }]',
      '}',
      '-->',
    ].join('\n')
    const missing = '# Research ledger\n- Bing search route.'

    expect(validateExpertResearchArtifactAuditTruth({
      policy: strictPolicy,
      content: contradictory,
      entries,
    }).join('\n')).toContain('changes the recorded status for audit bing-cn')
    expect(validateExpertResearchArtifactAuditTruth({
      policy: strictPolicy,
      content: missing,
      entries,
    }).join('\n')).toContain('CC_RESEARCH_AUDIT_ASSERTIONS')
  })


  test('resolves one readable assertion alias to exactly one recorded browser audit', () => {
    const strictPolicy = { ...policy(), requireResearchArtifactAuditAssertions: true as const }
    const entries = [{
      auditId: 'playwright:call_014',
      target: 'https://www.u-tools.cn/',
      finalUrl: 'https://www.u-tools.cn/',
      kind: 'url' as const,
      status: 'opened' as const,
    }]
    const content = [
      '# Research ledger',
      '- 官网具体页已实际打开 [audit:utools-home].',
      '',
      '<!-- CC_RESEARCH_AUDIT_ASSERTIONS',
      '{',
      '  "version": "cc-jiangxia-research-audit-assertions/v1",',
      '  "assertions": [{',
      '    "auditId": "utools-home",',
      '    "status": "opened",',
      '    "kind": "url",',
      '    "finalUrl": "https://www.u-tools.cn/"',
      '  }]',
      '}',
      '-->',
    ].join('\n')

    expect(validateExpertResearchArtifactAuditTruth({
      policy: strictPolicy,
      content,
      entries,
    })).toEqual([])
  })

  test('rejects a readable assertion alias that could map to multiple browser audits', () => {
    const strictPolicy = { ...policy(), requireResearchArtifactAuditAssertions: true as const }
    const entries = ['playwright:call_001', 'playwright:call_002'].map((auditId) => ({
      auditId,
      target: 'https://www.u-tools.cn/',
      finalUrl: 'https://www.u-tools.cn/',
      kind: 'url' as const,
      status: 'opened' as const,
    }))
    const content = [
      '# Research ledger',
      '',
      '<!-- CC_RESEARCH_AUDIT_ASSERTIONS',
      '{',
      '  "version": "cc-jiangxia-research-audit-assertions/v1",',
      '  "assertions": [{',
      '    "auditId": "utools-home",',
      '    "status": "opened",',
      '    "kind": "url",',
      '    "finalUrl": "https://www.u-tools.cn/"',
      '  }]',
      '}',
      '-->',
    ].join('\n')

    expect(validateExpertResearchArtifactAuditTruth({
      policy: strictPolicy,
      content,
      entries,
    }).join('\n')).toContain('ambiguous browser audit URL alias')
  })

})


test('an engine limitation or a channel suggestion does not require an unrelated SERP source', () => {
  const p = { ...policy(), searchEvidenceFieldIds: ['COMPETITOR_NOTES'], requireReviewerDispositionAbsorption: undefined }
  const reviewerState = recordExpertResearchEvidenceReviewer(undefined, p, { agentId: 'reviewer', agentType: p.reviewerAgentType, recordedAt: '2026-09-09T00:00:00Z', content: 'Reviewed', entries: [] })
  for (const notes of ['Google 本轮未取证，不能判断排名。百度贴吧只是社区入口。', '建议未来测试 Google SEO；尚未验证，不是本轮观察。', 'Google 的缺失不得由其它引擎结果替代。', '不得评估；不得用百度 / Bing / 360 结果冒充 Google 结果。', 'Google 查询结果本轮没有获取，不能据此判断热度。']) {
    expect(evaluateExpertResearchEvidenceAbsorption({ policy: p, researchEvidence, reviewerState,
      fields: { COMPETITOR_NOTES: notes, SOURCE_ROWS: [['[1]', '官网', '产品', '2026-08-18', 'https://typora.io/']] }, templateFields, evidenceAbsorption: undefined })).toBeNull()
  }
})


test('source restoration matches actual full URLs, never URL prefixes or plain search queries', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields,
    fields: { COMPETITOR_NOTES: ['Quicker 定价见 https://example.com/pricing'], SOURCE_ROWS: [] },
    researchEvidence: { records: [{ agentId: 'a', agentType: 'expert-evidence-researcher', artifactPath: '02.md', recordedAt: '2026-09-09T00:00:00Z', content: '', entries: [
      { kind: 'url', target: 'https://example.com/', status: 'opened' },
      { kind: 'url', target: 'https://example.com/pricing', status: 'opened' },
      { kind: 'search', target: 'Quicker', query: 'Quicker', finalUrl: 'https://www.google.com/search?q=Quicker', status: 'opened', searchResultStatus: 'results_observed' },
    ] }] },
  })
  expect(result.appended).toBe(1)
  expect(JSON.stringify(result.fields.SOURCE_ROWS)).toContain('https://example.com/pricing')
  expect(JSON.stringify(result.fields.SOURCE_ROWS)).not.toContain('google.com')
})


test('recovers report-used Markdown reference bindings from absorption without promoting unused visits', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence, templateFields,
    absorptionArtifactContent: '[S1]: https://typora.io/support\n[S2]: https://typora.io/\n[bogus]: https://not-audited.example/',
    fields: { COMPETITOR_NOTES: 'License activation has these concrete steps [S1]. An unverified claim stays a gap [bogus].', SOURCE_ROWS: [] },
  })
  expect(result.appended).toBe(1)
  const rows = result.fields.SOURCE_ROWS as Array<{ value: string[] }>
  expect(rows[0]?.value[0]).toBe('[S1]')
  expect(rows[0]?.value[4]).toBe('https://typora.io/support')
  expect(JSON.stringify(rows)).not.toContain('not-audited')
})

test('restores an explicit audited reference binding over a wrong copied URL without guessing a platform name', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence, templateFields,
    absorptionArtifactContent: '[S1]: https://typora.io/support',
    fields: { COMPETITOR_NOTES: 'Support [S1]', SOURCE_ROWS: [['[S1]', 'Support', 'License activation', '2026-09-09', 'https://typora.io/']] },
  })
  expect(JSON.stringify(result.fields.SOURCE_ROWS)).toContain('https://typora.io/support')
})

test('does not guess conflicting or unused absorption reference definitions', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence, templateFields,
    absorptionArtifactContent: '[S1]: https://typora.io/support\n[S1]: https://typora.io/',
    fields: { COMPETITOR_NOTES: 'Support [S1]', SOURCE_ROWS: [] },
  })
  expect(result.appended).toBe(0)
})


test('keeps reference aliases when an already-listed audited URL is used under another ID', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence, templateFields, absorptionArtifactContent: '[S1]: https://typora.io/support',
    fields: { COMPETITOR_NOTES: 'Concrete support steps [S1].', SOURCE_ROWS: [['[3]', 'Support', 'Existing detail', '2026-09-09', 'https://typora.io/support']] },
  })
  const rows = result.fields.SOURCE_ROWS as unknown[]
  expect(rows).toHaveLength(1)
  expect(JSON.stringify(rows)).toContain('[3]')
  expect(JSON.stringify(rows)).toContain('[S1]')
  expect(JSON.stringify(rows)).toContain('Existing detail')
})

test('consolidates duplicate direct URLs without losing citation IDs or distinct source descriptions', () => {
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence, templateFields,
    fields: { COMPETITOR_NOTES: 'Evidence [3] and [11].', SOURCE_ROWS: [
      ['[3]', 'Support', 'Activation', '2026-09-09', 'https://typora.io/support'],
      ['[11]', 'Official', 'Recovery', '2026-09-09', 'https://typora.io/support'],
    ] },
  })
  expect(result.fields.SOURCE_ROWS).toHaveLength(1)
  for (const text of ['[3]', '[11]', 'Activation', 'Recovery']) expect(JSON.stringify(result.fields.SOURCE_ROWS)).toContain(text)
})

test('accepts equivalent evidence labels without exact wording or required parentheses', () => {
  const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), { agentId: 'reviewer', agentType: 'expert-evidence-reviewer', recordedAt: '2026-09-09T10:00:00.000Z', content: 'Reviewed.', entries: [] })
  const result = evaluateExpertResearchEvidenceAbsorption({
    policy: { ...policy(), requireEvidenceStatusSummary: true, evidenceStatusSummaryFieldId: 'STATUS' }, researchEvidence, reviewerState,
    templateFields: [...templateFields, { id: 'STATUS', kind: 'paragraphs' }],
    fields: { COMPETITOR_NOTES: 'A bounded product observation.', SOURCE_ROWS: [['[1]', 'Official', 'Product capability', '2026-09-09', 'https://typora.io/']],
      STATUS: '已核事实：官网公开的产品能力。\n有限公开观察：小样本讨论不能外推市场。\nAI推断：由已公开能力推演，需实测验证。\n证据缺口：尚无付费意愿数据。' },
    evidenceAbsorption: undefined,
  })
  expect(result).toBeNull()
})


test.each([false, true])('keeps an explicit search audit binding when restoring 07 labels (metadata=%s)', (metadata) => {
  const url = 'https://www.bing.com/search?q=typora'
  const evidence = {
    ...researchEvidence,
    records: [{ ...researchEvidence.records[0]!, entries: ['first-search', 'chosen-search'].map(auditId => ({
      auditId, target: url, finalUrl: url, kind: 'search' as const, status: 'opened' as const,
      searchEngine: 'Bing' as const, searchResultStatus: 'results_observed' as const,
    })) }],
  }
  const cells = ['[S1]', 'Bing', 'The chosen query snapshot', '2026-08-18', metadata ? url : 'audit:chosen-search']
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), templateFields, researchEvidence: evidence,
    fields: { COMPETITOR_NOTES: 'The query snapshot showed the product [S1].', SOURCE_ROWS: [metadata ? { value: cells, auditId: 'chosen-search' } : cells] },
    absorptionArtifactContent: '[S1]: ' + url,
  })
  expect(result.appended).toBe(0)
  expect(result.fields.SOURCE_ROWS).toHaveLength(1)
  const resolved = resolveExpertResearchAuditSourceReferences({ policy: policy(), templateFields, researchEvidence: evidence, fields: result.fields })
  expect(resolved.errors).toEqual([])
  expect(resolved.fields.SOURCE_ROWS).toEqual([{ value: ['[S1]', 'Bing', 'The chosen query snapshot', '2026-08-18', url], auditId: 'chosen-search' }])
})

  test('lists every saved part for absorption instead of nonexistent lane roots', () => {
    const artifactPolicy = {
      mode: 'markdown-path-only' as const,
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      researcherParts: true,
      maxCharacters: 90_000,
    }
    const fileFirstResearchEvidence = {
      records: [
        { ...researchEvidence.records[0], artifactPath: artifactPolicy.researcherPaths[0].replace('.md', '.parts/worker-a.md') },
        {
          agentId: 'demand-researcher',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-18T04:01:00.000Z',
          content: 'Opened public demand evidence.',
          artifactPath: artifactPolicy.researcherPaths[1].replace('.md', '.parts/worker-b.md'),
          entries: [],
        },
        {
          agentId: 'channel-researcher',
          agentType: 'expert-evidence-researcher',
          recordedAt: '2026-08-18T04:02:00.000Z',
          content: 'Opened public channel evidence.',
          artifactPath: artifactPolicy.researcherPaths[2].replace('.md', '.parts/worker-c.md'),
          entries: [],
        },
      ],
      updatedAt: '2026-08-18T04:02:00.000Z',
    }
    const reviewerState = recordExpertResearchEvidenceReviewer(undefined, policy(), {
      agentId: 'independent-reviewer',
      agentType: 'expert-evidence-reviewer',
      recordedAt: '2026-08-18T04:05:00.000Z',
      content: 'include | Product details are report-relevant: https://typora.io/',
      artifactPath: artifactPolicy.reviewerPath,
      entries: [],
    })

    const instruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: policy(),
      researchEvidence: fileFirstResearchEvidence,
      reviewerState,
      artifactPolicy,
      templateFields,
    })

    expect(instruction).toContain('Field-specific report quality contract:')
    expect(instruction).toContain('COMPETITOR_NOTES: Keep concrete product/page observations rather than collapsing them into a generic source category.')
    for (const record of fileFirstResearchEvidence.records) expect(instruction).toContain(record.artifactPath)
    expect(instruction).not.toContain('- commercialization-research/02-competitors.md')
    expect(instruction).toContain('continue to EOF')

    const workerInstruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy: { ...policy(), absorberAgentType: 'expert-evidence-absorber' },
      researchEvidence: fileFirstResearchEvidence,
      reviewerState,
      artifactPolicy: { ...artifactPolicy, absorptionPath: 'commercialization-research/07-report-field-absorption.md' },
      templateFields,
    })
    expect(workerInstruction).toContain(REPORT_ABSORPTION_WORK_GUIDANCE)
    expect(workerInstruction).toContain(REPORT_EVIDENCE_HANDOFF_GUIDANCE)
    expect(workerInstruction).toContain('Pass the shared reading, writing, source-selection and inference guidance above to E unchanged')
    expect(workerInstruction).toContain('the parent must Read commercialization-research/01-research-brief.md')
    expect(workerInstruction).not.toContain('Read every registered researcher Markdown')
  })


describe('lossless 07 source handoff', () => {
  test('restores a full article URL from the exact audit ID, not a guessed /s URL', () => {
    const url = 'https://mp.weixin.qq.com/s?__biz=MzA&mid=123&idx=1&sn=full-signature'
    const evidence = { ...researchEvidence, records: [{ ...researchEvidence.records[0]!, entries: [{ auditId: 'article-21', kind: 'url' as const, status: 'opened' as const, target: url, finalUrl: url }] }] }
    const merged = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: '[S21]: audit:article-21',
      fields: { COMPETITOR_NOTES: '文章正文中的具体用户任务 [S21]。', SOURCE_ROWS: [['[S21]', '文章', '具体用户任务', '2026-09-11', 'https://mp.weixin.qq.com/s']] } })
    const resolved = resolveExpertResearchAuditSourceReferences({ policy: policy(), templateFields, researchEvidence: evidence, fields: merged.fields })
    expect(resolved.errors).toEqual([])
    expect(resolved.fields.SOURCE_ROWS).toHaveLength(1)
    const row = (resolved.fields.SOURCE_ROWS as Array<{ value: string[] }>)[0]!
    expect(new URL(row.value[4]!).pathname).toBe('/s')
    expect(Object.fromEntries(new URL(row.value[4]!).searchParams)).toEqual(Object.fromEntries(new URL(url).searchParams))
    expect(JSON.stringify(resolved.fields.SOURCE_ROWS)).toContain('article-21')
  })
  test('keeps two cited audit identities even when the same query URL was visited twice', () => {
    const url = 'https://www.bing.com/search?q=tool'
    const evidence = { ...researchEvidence, records: [{ ...researchEvidence.records[0]!, entries: ['search-old', 'search-new'].map(auditId => ({ auditId, kind: 'search' as const, status: 'opened' as const, searchEngine: 'Bing' as const, searchResultStatus: 'results_observed' as const, target: url, finalUrl: url })) }] }
    const merged = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: `[S1]: audit:search-old
[S2]: audit:search-new`,
      fields: { COMPETITOR_NOTES: '第一次快照 [S1]。第二次快照 [S2]。', SOURCE_ROWS: [] } })
    const resolved = resolveExpertResearchAuditSourceReferences({ policy: policy(), templateFields, researchEvidence: evidence, fields: merged.fields })
    expect(resolved.errors).toEqual([])
    expect(resolved.fields.SOURCE_ROWS).toHaveLength(2)
    expect(JSON.stringify(resolved.fields.SOURCE_ROWS)).toContain('search-old')
    expect(JSON.stringify(resolved.fields.SOURCE_ROWS)).toContain('search-new')
  })
  test('preserves every audited page instead of silently taking the first grouped URL', () => {
    const merged = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence,
      absorptionArtifactContent: '[S1]: https://typora.io/ 、https://typora.io/support',
      fields: { COMPETITOR_NOTES: '具体页面观察 [S1]。', SOURCE_ROWS: [] } })
    expect(merged.appended).toBe(2)
    expect(JSON.stringify(merged.fields.SOURCE_ROWS)).toContain('https://typora.io/support')
    expect(JSON.stringify(merged.fields.SOURCE_ROWS)).toContain('https://typora.io/')
  })
  test('does not turn a failed audit into evidence just because another visit to its URL succeeded', () => {
    const evidence = { ...researchEvidence, records: [{ ...researchEvidence.records[0]!, entries: [...researchEvidence.records[0]!.entries, { auditId: 'failed-visit', target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url' as const, status: 'failed' as const }] }] }
    const merged = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: `[S1]: audit:failed-visit
[S2]: audit:does-not-exist`,
      fields: { COMPETITOR_NOTES: '不可升级的记录 [S1][S2]。', SOURCE_ROWS: [] } })
    expect(merged.appended).toBe(0)
  })
})

test('a limited engine does not suppress a different engine affirmative claim', () => {
  const p = { ...policy(), searchEvidenceFieldIds: ['COMPETITOR_NOTES'], requireReviewerDispositionAbsorption: undefined }
  const reviewerState = recordExpertResearchEvidenceReviewer(undefined, p, { agentId: 'reviewer', agentType: p.reviewerAgentType, recordedAt: '2026-09-11T00:00:00Z', content: 'Reviewed', entries: [] })
  const result = evaluateExpertResearchEvidenceAbsorption({ policy: p, researchEvidence, reviewerState, templateFields,
    fields: { COMPETITOR_NOTES: 'Google 未取得；Bing 的搜索结果首位为官网。', SOURCE_ROWS: [] }, evidenceAbsorption: undefined })
  expect(result).toContain('对 Bing 的实际结果观察')
  expect(result).not.toContain('对 Google 的实际结果观察')
})


describe('report handoff preserves concrete page citations', () => {
  const urls = [1, 2, 3, 4, 5].map((id) => 'https://news.ycombinator.com/item?id=' + id)
  const evidence = { updatedAt: '2026-09-16T08:00:00Z', records: [{ agentId: 'researcher', agentType: 'expert-evidence-researcher', recordedAt: '2026-09-16T08:00:00Z', content: '', entries: [
    ...urls.map((url, index) => ({ auditId: 'comment-' + index, kind: 'url' as const, target: url, finalUrl: url, status: 'opened' as const })),
    { kind: 'url' as const, target: 'https://unused.example/', status: 'opened' as const },
    { kind: 'url' as const, target: 'https://blocked.example/', status: 'access_limited' as const },
  ] }] }

  test('restores every explicitly grouped page from a used Markdown source-table row', () => {
    const result = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: '| 编号 | 支持内容 | 具体页面 |\n| [HN] | 五条独立评论，仅支持个人观察 | ' + urls.join(' ; ') + ' |\n| [unused] | 未采用 | https://unused.example/ |',
      fields: { COMPETITOR_NOTES: '五条历史评论的有限观察 [HN]，不能外推当前需求规模。', SOURCE_ROWS: [['[HN]', '评论', '第一条', '2026-09-16', urls[0]]] },
    })
    expect(result.appended).toBe(4)
    const serialized = JSON.stringify(result.fields.SOURCE_ROWS)
    for (const url of urls) expect(serialized).toContain(url)
    expect(serialized).not.toContain('unused.example')
    expect(result.fields.SOURCE_ROWS).toHaveLength(5)
    expect(mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: '| [HN] | 五条评论 | ' + urls.join(' ; ') + ' |', fields: result.fields,
    }).appended).toBe(0)
  })

  test('accepts ordinary inline Markdown identities in 07 without requiring reference-definition syntax', () => {
    const result = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence,
      absorptionArtifactContent: '具体激活步骤来自 [S1](https://typora.io/support)。未采用 [S2](https://typora.io/)。',
      fields: { COMPETITOR_NOTES: '具体激活步骤 [S1]', SOURCE_ROWS: [] },
    })
    expect(result.appended).toBe(1)
    expect(JSON.stringify(result.fields.SOURCE_ROWS)).toContain('https://typora.io/support')
  })

  test('grouped references do not promote failed, unaudited, unused, or contradictory definitions', () => {
    const result = mergeAuditedOpenedSourcesIntoSourceRows({ policy: policy(), templateFields, researchEvidence: evidence,
      absorptionArtifactContent: '[HN]: ' + urls[0] + ' https://blocked.example/ https://invented.example/\n[S1]: ' + urls[1] + '\n[S1]: ' + urls[2] + '\n[unused]: https://unused.example/',
      fields: { COMPETITOR_NOTES: '有界观察 [HN]；不明确的引用 [S1]。', SOURCE_ROWS: [] },
    })
    expect(result.appended).toBe(1)
    const serialized = JSON.stringify(result.fields.SOURCE_ROWS)
    for (const excluded of ['blocked.example', 'invented.example', 'unused.example', urls[1], urls[2]]) expect(serialized).not.toContain(excluded)
  })
})


test('source-row repair never chooses one label when another label is unresolved', () => {
  const existing = ['[S1] [unknown]', 'source', 'mixed labels', '2026-09-16', 'https://copied.example/']
  const result = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), templateFields, researchEvidence,
    absorptionArtifactContent: '[S1]: https://typora.io/support',
    fields: { COMPETITOR_NOTES: 'Activation [S1] and unclear material [unknown]', SOURCE_ROWS: [existing] },
  })
  expect((result.fields.SOURCE_ROWS as unknown[])[0]).toEqual(existing)
  expect(result.appended).toBe(1)
})


test('renders every used concrete page into final HTML while preserving partial evidence and inference wording', () => {
  const template = '<html data-template-id="handoff-test"><body><!-- SLOT: COMPETITOR_NOTES --><table><thead><tr><th>ID</th><th>Source type</th><th>Summary</th><th>Captured</th><th>URL</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>'
  const schema = deriveExpertTemplateFillSchema(template)
  const urls = [
    'https://news.ycombinator.com/item?id=1',
    'https://news.ycombinator.com/item?id=2',
    'https://www.youtube.com/watch?v=video-evidence',
    'https://weixin.sogou.com/weixin?type=2&query=product',
  ]
  const evidence = { updatedAt: '2026-09-16T08:00:00Z', records: [{
    agentId: 'researcher', agentType: 'expert-evidence-researcher', recordedAt: '2026-09-16T08:00:00Z', content: '',
    entries: [
      ...urls.map((url, index) => ({ auditId: 'page-' + index, kind: 'url' as const, target: url, finalUrl: url, status: 'opened' as const })),
      { kind: 'url' as const, target: 'https://not-selected.example/', status: 'opened' as const },
    ],
  }] }
  const note = '两条评论各有边界 [HN]。视频仅取得简介，未取得评论 [YT]。检索观察 [WX]。AI推断：商业化仍需验证，公开标价不等于付费意愿。'
  const merged = mergeAuditedOpenedSourcesIntoSourceRows({
    policy: policy(), researchEvidence: evidence, templateFields: schema.fields,
    fields: { COMPETITOR_NOTES: [note], SOURCE_ROWS: [] },
    absorptionArtifactContent: [
      '| [HN] | 独立评论 | ' + urls[0] + ' ; ' + urls[1] + ' |',
      '[YT](audit:page-2)',
      '[WX]: audit:page-3',
      '[unused]: https://not-selected.example/',
    ].join('\n'),
  })
  expect(merged.appended).toBe(4)
  const resolved = resolveExpertResearchAuditSourceReferences({
    policy: policy(), researchEvidence: evidence, templateFields: schema.fields, fields: merged.fields,
  })
  expect(resolved.errors).toEqual([])
  const { content } = renderExpertTemplateFill(template, {
    format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: schema.templateId, fields: resolved.fields,
  })
  const renderedLinks = [...content.matchAll(/href="([^"]+)"/g)].map((match) => new URL(match[1]!.replaceAll('&amp;', '&')))
  for (const url of urls) {
    const expected = new URL(url)
    const actual = renderedLinks.find((link) => link.origin === expected.origin && link.pathname === expected.pathname
      && JSON.stringify([...link.searchParams].sort()) === JSON.stringify([...expected.searchParams].sort()))
    expect(actual).toBeDefined()
  }
  expect(content).toContain('视频仅取得简介，未取得评论')
  expect(content).toContain('公开标价不等于付费意愿')
  expect(content).not.toContain('not-selected.example')
  expect(content).not.toContain('audit:page-')
})
