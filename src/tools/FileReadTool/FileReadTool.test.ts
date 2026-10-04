import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

type ImageProcessorMockState = {
  processorError?: string;
  metadata: { width?: number; height?: number; format?: string };
  resizeCalls: Array<{ width: number; height: number }>;
  outputBuffer: Buffer;
};

const mockStateKey = "__ccJiangxiaImageProcessorMock";

function getMockState(): ImageProcessorMockState {
  return (globalThis as unknown as Record<string, ImageProcessorMockState>)[
    mockStateKey
  ];
}

function setMockState(state: ImageProcessorMockState): void {
  const globals = globalThis as unknown as Record<
    string,
    ImageProcessorMockState
  >;
  globals[mockStateKey] = state;
}

mock.module("./imageProcessor.js", () => ({
  getImageProcessor: async () => {
    if (getMockState().processorError) throw new Error(getMockState().processorError);
    return () => {
      const instance = {
        metadata: async () => getMockState().metadata,
        resize: (width: number, height: number) => {
          getMockState().resizeCalls.push({ width, height });
          return instance;
        },
        jpeg: () => instance,
        png: () => instance,
        webp: () => instance,
        toBuffer: async () => getMockState().outputBuffer,
      };
      return instance;
    };
  },
}));

mock.module("../../services/tokenEstimation.js", () => ({
  bytesPerTokenForFileType: () => 1,
  countMessagesTokensWithAPI: async () => undefined,
  countTokensViaHaikuFallback: async () => undefined,
  countTokensWithAPI: async (content: string) => content.length,
  roughTokenCountEstimation: (content: string) => content.length,
  roughTokenCountEstimationForFileType: (content: string) => content.length,
  roughTokenCountEstimationForMessage: () => 0,
  roughTokenCountEstimationForMessages: () => 0,
}));

const {
  FileReadTool,
  MaxFileReadTokenExceededError,
  isExpertEvidenceResearchReadAllowed,
  isExpertEvidenceResearchSessionReadAllowed,
  readImageWithTokenBudget,
} = await import("./FileReadTool.js");

function createFileReadContext(maxTokens: number) {
  return {
    abortController: new AbortController(),
    dynamicSkillDirTriggers: new Set<string>(),
    nestedMemoryAttachmentTriggers: new Set<string>(),
    readFileState: new Map(),
    fileReadingLimits: {
      maxSizeBytes: 256 * 1024,
      maxTokens,
    },
  } as Parameters<typeof FileReadTool.call>[1];
}

function makePngLikeBuffer(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  return buffer;
}

describe("readImageWithTokenBudget", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "file-read-image-test-"));
    setMockState({
      metadata: { width: 1920, height: 1080, format: "png" },
      resizeCalls: [],
      outputBuffer: Buffer.from("encoded"),
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("does not over-compress ordinary screenshots using base64 length as token count", async () => {
    const imageBuffer = makePngLikeBuffer(24_000);
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, imageBuffer);

    const result = await readImageWithTokenBudget(filePath, 3_000);

    expect(result.file.base64).toBe(imageBuffer.toString("base64"));
    expect(result.file.dimensions).toEqual({
      originalWidth: 1920,
      originalHeight: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
    });
    expect(getMockState().resizeCalls).toEqual([]);
  });


  test("UIUX preview failure keeps the source and requests host repair, never regeneration", async () => {
    const filePath = join(tempDir, "existing-provider-image.png");
    await writeFile(filePath, makePngLikeBuffer(1_300_000));
    setMockState({ metadata: { width: 1536, height: 1024, format: "png" }, resizeCalls: [], outputBuffer: Buffer.alloc(0), processorError: "IMAGE_PROCESSOR_UNAVAILABLE: packaged Sharp missing" });
    await expect(readImageWithTokenBudget(filePath)).rejects.toThrow("Preview processing failed, not image generation");
    await expect(readImageWithTokenBudget(filePath)).rejects.toThrow("do not regenerate or change the image Provider");
  });

  test("creates a bounded preview when a modest-dimension PNG has an unsafe payload", async () => {
    const imageBuffer = makePngLikeBuffer(1_284_054);
    const filePath = join(tempDir, "provider-generated.png");
    await writeFile(filePath, imageBuffer);
    setMockState({
      metadata: { width: 1536, height: 1024, format: "png" },
      resizeCalls: [],
      outputBuffer: Buffer.alloc(96 * 1024, 7),
    });

    const result = await readImageWithTokenBudget(filePath, 3_000);

    expect(result.file.base64).not.toBe(imageBuffer.toString("base64"));
    expect(Buffer.from(result.file.base64, "base64").length).toBeLessThanOrEqual(192 * 1024);
    expect(getMockState().resizeCalls.length).toBeGreaterThan(0);
  });
});

describe("expert evidence research Read policy", () => {
  test("denies guessed workspace files when the user did not attach material", async () => {
    const context = {
      agentType: "expert-evidence-researcher",
      messages: [],
    } as never;

    const [readmeDecision, indexDecision] = await Promise.all([
      FileReadTool.checkPermissions({ file_path: "README.md" }, context),
      FileReadTool.checkPermissions({ file_path: "index.html" }, context),
    ]);

    expect(readmeDecision).toMatchObject({
      behavior: "deny",
      message: expect.stringContaining("explicitly attached by the user"),
    });
    expect(indexDecision).toMatchObject({
      behavior: "deny",
      message: expect.stringContaining("README.md or index.html"),
    });
  });

  test("allows the declared session brief and researcher report in addition to user-attached material", () => {
    const keys = [
      "CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT",
      "CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY",
    ] as const;
    const prior = new Map(keys.map((key) => [key, process.env[key]]));
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = "C:/expert-session-output";
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({
      mode: "markdown-path-only",
      directory: "commercialization-research",
      briefPath: "commercialization-research/01-research-brief.md",
      researcherPaths: ["commercialization-research/02-competitors.md"],
      reviewerPath: "commercialization-research/05-evidence-review.md",
      auditPath: "commercialization-research/06-browser-audit.md",
      maxCharacters: 90000,
    });
    try {
      expect(isExpertEvidenceResearchSessionReadAllowed(
        "commercialization-research/01-research-brief.md",
        [],
      )).toBe(true);
      expect(isExpertEvidenceResearchSessionReadAllowed(
        "commercialization-research/02-competitors.md",
        [],
      )).toBe(true);
      expect(isExpertEvidenceResearchSessionReadAllowed("README.md", [])).toBe(false);
    } finally {
      for (const key of keys) {
        const value = prior.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("allows only explicitly attached files and directories as evidence material", () => {
    const messages = [
      {
        type: "attachment",
        attachment: {
          type: "file",
          filename: "C:\\research\\user-brief.pdf",
          content: {},
          displayPath: "user-brief.pdf",
        },
      },
      {
        type: "attachment",
        attachment: {
          type: "directory",
          path: "C:\\research\\customer-interviews",
          content: "",
          displayPath: "customer-interviews",
        },
      },
    ] as never;

    expect(
      isExpertEvidenceResearchReadAllowed(
        "C:\\research\\user-brief.pdf",
        messages,
      ),
    ).toBe(true);
    expect(
      isExpertEvidenceResearchReadAllowed(
        "C:\\research\\customer-interviews\\session-01.md",
        messages,
      ),
    ).toBe(true);
    expect(
      isExpertEvidenceResearchReadAllowed("C:\\workspace\\README.md", messages),
    ).toBe(false);
  });
});

describe("text token overflow recovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "file-read-token-recovery-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("keeps ordinary explicit line reads unchanged", async () => {
    const filePath = join(tempDir, "ordinary.txt");
    await writeFile(filePath, "first line\nsecond line\n");

    const result = await FileReadTool.call(
      { file_path: filePath, limit: 1 },
      createFileReadContext(10_000),
    );

    expect(result.data).toMatchObject({
      type: "text",
      file: {
        content: "first line",
        numLines: 1,
        startLine: 1,
        totalLines: 3,
      },
    });
  });

  test("gives bounded recovery details for a compact oversized tool-result JSON", async () => {
    const toolResult = JSON.stringify({
      type: "tool_result",
      content: "é".repeat(10_000),
    });
    const filePath = join(tempDir, "tool-result.json");
    await writeFile(filePath, toolResult);

    const error = await FileReadTool.call(
      { file_path: filePath },
      createFileReadContext(50),
    ).then(
      () => {
        throw new Error("Expected the configured token cap to reject the file");
      },
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(MaxFileReadTokenExceededError);
    const message = (error as Error).message;
    const totalBytes = Buffer.byteLength(toolResult, "utf8");

    expect(message).toContain("totalLines=1");
    expect(message).toContain("totalBytes=" + totalBytes);
    expect(message).toContain("longestLineBytes=" + totalBytes);
    expect(message).toContain("limit parameter is a line count");
    expect(message).toContain("retrying with limit: 400 will not recover");
    expect(message).toContain("Bounded data preview");
    expect(message).not.toContain("�");
    expect(message).toContain("f.seek(0)");
    expect(message).toContain("f.seek(4096)");
    expect(message).not.toContain(toolResult);
    expect(message.length).toBeLessThan(5_000);
  });
});


const handoffRuntime = await import('../../services/tools/expertTemplateFillRuntime.js')

describe('Expert real Read to report Write handoff', () => {
  let dir: string
  let absorption: string
  let review: string
  let context: ReturnType<typeof createFileReadContext>
  let savedEnv: Record<string, string | undefined>
  let savedFetch: typeof fetch
  const envKeys = ['CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE', 'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT', 'CC_JIANGXIA_EXPERT_SESSION_ID', 'CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY', 'CC_JIANGXIA_DESKTOP_SERVER_URL', 'CLAUDE_CODE_SIMPLE']
  const finalWrite = (mode?: 'finalize') => ({ file_path: 'report.html', content: '', expert_output: { templateId: 'report-v1', fields: {}, ...(mode ? { mode } : {}) } })
  const readPage = (offset?: number, limit?: number, target?: string, ctx = context) => FileReadTool.call({ file_path: target ?? absorption, ...(offset !== undefined ? { offset } : {}), ...(limit !== undefined ? { limit } : {}) }, ctx)
  const rejected = () => expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).rejects.toThrow('ABSORPTION_READ_REQUIRED')

  beforeEach(async () => {
    savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
    savedFetch = globalThis.fetch
    dir = await mkdtemp(join(tmpdir(), 'expert-read-handoff-'))
    await mkdir(join(dir, 'commercialization-research'))
    absorption = join(dir, 'commercialization-research/07-report-field-absorption.md')
    review = join(dir, 'commercialization-research/08-report-completeness-review.md')
    await writeFile(absorption, Array.from({ length: 414 }, (_, i) => '证据 ' + (i + 1)).join('\n'))
    context = createFileReadContext(100_000)
    process.env.CLAUDE_CODE_SIMPLE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE = '1'
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = dir
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'handoff-session'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify({ mode: 'markdown-path-only', directory: 'commercialization-research', briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: ['commercialization-research/02-competitors.md'], reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', absorptionPath: 'commercialization-research/07-report-field-absorption.md', completionReviewPath: 'commercialization-research/08-report-completeness-review.md', maxCharacters: 90_000 })
    globalThis.fetch = (async () => new Response(JSON.stringify({ templateId: 'report-v1', content: '<html>reviewed report</html>' }))) as unknown as typeof fetch
    handoffRuntime.resetMainAgentReportFieldAbsorptionReadsForTests()
  })
  afterEach(async () => {
    for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key] }
    globalThis.fetch = savedFetch
    handoffRuntime.resetMainAgentReportFieldAbsorptionReadsForTests()
    await rm(dir, { recursive: true, force: true })
  })

  test('accepts the actual 414-line out-of-order pagination without manually recording a Read', async () => {
    await readPage(1, 60)
    await readPage(200, 120)
    await readPage(60, 140)
    await rejected()
    await readPage(320)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('accepts fully paginated UTF-8 BOM handoff files without comparing normalized text bytes to disk size', async () => {
    await writeFile(absorption, '\uFEFF第一行证据\r\n第二行证据')
    await readPage(1, 1)
    await rejected()
    await readPage(2, 1)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('duplicates and EOF alone do not cover a missing middle page', async () => {
    await readPage(1, 60)
    await readPage(1, 60)
    await readPage(200, 300)
    await rejected()
    await readPage(61, 139)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('child reads never satisfy the parent handoff, even when the read cache is shared', async () => {
    await readPage(undefined, undefined, absorption, { ...context, agentType: 'expert-evidence-absorber' })
    await rejected()
    await readPage()
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('rewritten 07 cannot reuse stale coverage or a cached unchanged Read', async () => {
    await readPage()
    await handoffRuntime.renderExpertTemplateFillForWrite({ file_path: absorption, content: '# rewritten evidence' })
    await rejected()
    await readPage()
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('does not combine pages from different file revisions', async () => {
    await readPage(1, 200)
    await writeFile(absorption, Array.from({ length: 414 }, (_, i) => '新证据 ' + (i + 1)).join('\n'))
    await readPage(201, 300)
    await rejected()
    await readPage(1, 200)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('a token-limit failure does not register a successful page', async () => {
    await expect(readPage(1, 200, absorption, createFileReadContext(1))).rejects.toThrow()
    await readPage(201, 300)
    await rejected()
  })
  test('reports the missing range and invalidates complete reads after an external edit', async () => {
    await readPage(1, 200)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).rejects.toThrow('offset=201')
    await readPage(201, 300)
    await writeFile(absorption, 'replacement evidence')
    await rejected()
    await readPage(1, 200)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('never borrows a completed Read from a different Expert session', async () => {
    await readPage()
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'another-session'
    await rejected()
    await readPage(1, 500)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
  test('uses the same paginated completion rule for 08 before finalize', async () => {
    await readPage()
    const draft = await handoffRuntime.renderExpertTemplateFillForWrite(finalWrite())
    if (draft.kind !== 'rendered-template-fill') throw new Error('draft missing')
    await writeFile(draft.filePath, draft.content)
    await draft.confirmWrite()
    await writeFile(review, '\uFEFF复核结论：无需补写\n已覆盖事实\n已覆盖边界\n可原样定稿')
    await readPage(1, 2, review)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite('finalize'))).rejects.toThrow('OUTPUT_REVIEW_READ_REQUIRED')
    await readPage(3, 2, review)
    await expect(handoffRuntime.renderExpertTemplateFillForWrite(finalWrite('finalize'))).resolves.toMatchObject({ kind: 'rendered-template-fill' })
  })
})
