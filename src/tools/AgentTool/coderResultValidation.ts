/** Reuse the existing Coder receipt key; natural-language stopping is not completion. */
export function validateCoderFinalMessage(report: string): { status: 'ready' | 'not-ready' | 'invalid', readyForReview: boolean, error: string | null } {
  const values: unknown[] = []
  let supportedPositiveReceipt = false
  let hasBlockers = false
  const candidates = [report, ...Array.from(report.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), match => match[1])]
    .map(text => ({ text, allowsPositive: true }))
  // A final standalone JSON refusal is sufficient to retain unfinished work.
  // This additional report format must never grant positive completion.
  const terminalLine = report.trimEnd().split(/\r?\n/).at(-1) ?? ''
  if (/^ {0,3}\{.*\}$/.test(terminalLine)) candidates.push({ text: terminalLine, allowsPositive: false })
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.text.trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (Object.prototype.hasOwnProperty.call(parsed, 'readyForReview')) values.push(parsed.readyForReview)
        if (candidate.allowsPositive && parsed.readyForReview === true) supportedPositiveReceipt = true
        const blockers = parsed.blockers
        if (Array.isArray(blockers) ? blockers.some((blocker: unknown) =>
          typeof blocker === 'string' ? blocker.trim().length > 0 : blocker != null)
          : typeof blockers === 'string' ? blockers.trim().length > 0
            : blockers !== null && typeof blockers === 'object' && Object.keys(blockers).length > 0) hasBlockers = true
      }
    } catch {
      // Natural-language reports may use the explicit machine key below.
    }
  }
  // Outside JSON receipts (including fenced JSON), require a standalone key;
  // ordinary prose mentions and quoted standalone keys do not assert readiness.
  const prose = report.replace(/```[\s\S]*?```/g, '')
  let previousNonemptyLine = ''
  for (const line of prose.split(/\r?\n/)) {
    let standalone = line.trim().replace(/^[-*][ \t]+/, '')
    const original = standalone
    // Only paired emphasis around this entire line or this exact machine key
    // is formatting. Quotes, backticks and surrounding prose remain data.
    standalone = standalone.replace(/^(\*\*|__|\*|_)(readyForReview[\s\S]*?)\1$/, '$2')
      .replace(/^(\*\*|__|\*|_)readyForReview\1(?=\s*[:=])/, 'readyForReview')
    const formatted = original !== standalone
    const exampleLabel = /^(?:example|sample|示例|例如|格式示例|引用|格式说明)\s*[:：]$/i.test(previousNonemptyLine)
    if (line.trim()) previousNonemptyLine = line.trim()
    if (formatted && exampleLabel) continue
    const match = /^readyForReview\s*[:=]\s*([^\r\n]+)$/.exec(standalone)
    if (!match) continue
    values.push(match[1].trim() === 'true' ? true : match[1].trim() === 'false' ? false : match[1].trim())
    if (match[1].trim() === 'true') supportedPositiveReceipt = true
  }
  // A quoted negative machine key is a conservative refusal, even when its
  // explanation follows on the same line. Inline positive mentions never grant
  // readiness; a conflicting positive JSON receipt remains invalid.
  for (const _match of prose.matchAll(/`\s*readyForReview\s*[:=]\s*false\s*`/g)) values.push(false)
  if (!hasBlockers && supportedPositiveReceipt && values.length && values.every(value => value === true)) return { status: 'ready', readyForReview: true, error: null }

  const issue = hasBlockers ? values.includes(true)
    ? 'readyForReview cannot assert completion with non-empty blockers' : 'Coder report has non-empty blockers'
    : !values.length ? 'readyForReview is missing'
    : values.some(value => typeof value !== 'boolean') ? 'readyForReview must be an explicit boolean'
      : values.includes(true) ? values.includes(false)
        ? 'readyForReview has conflicting boolean values' : 'positive readyForReview requires an existing supported receipt format'
        : 'readyForReview=false'
  const excerpt = report.length > 6000 ? `${report.slice(0, 6000)}\n[Coder report truncated]` : report
  return {
    status: (hasBlockers || values.length > 0) && values.every(value => value === false) ? 'not-ready' : 'invalid',
    readyForReview: false,
    error: `WORKFLOW_CODER_INCOMPLETE: ${issue}; no successful Coder receipt was recorded. Continue the same Batch within its existing write scopes. If implementation and the promised checks are complete, retain that work and return readyForReview:true; do not repeat completed checks merely to repair the receipt. Otherwise resolve the reported blocker or identify the exact unperformed check and return readyForReview:false. Do not create new handoff files or ask the user to supply materials solely to repair this receipt.\nCoder report:\n${excerpt}`,
  }
}
