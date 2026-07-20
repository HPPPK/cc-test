const XML_TAG_BLOCK_PATTERN = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractXmlTag(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  const value = match?.[1]?.trim()
  return value ? decodeXmlText(value) : undefined
}

function normalizeTitleWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stripInternalWorkflowPrompt(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').trimStart()
  if (!normalized.startsWith('Workflow mode\n\n') || !normalized.includes('\n\nActive phase:')) {
    return raw
  }

  const marker = '\n\nWorkflow model provenance'
  const beforeModelProvenance = normalized.includes(marker)
    ? normalized.slice(0, normalized.indexOf(marker))
    : normalized
  const sections = beforeModelProvenance.split(/\n{2,}/)
  return sections.at(-1)?.trim() ?? ''
}

/**
 * Convert system-injected XML wrappers into user-facing text before using a
 * message as a session title source. Slash commands are stored in transcripts
 * as command-name/command-args breadcrumbs; titles should show the command the
 * user typed, not the internal XML transport.
 */
export function cleanSessionTitleSource(raw: string): string {
  const workflowStripped = stripInternalWorkflowPrompt(raw)
  const commandName = extractXmlTag(raw, 'command-name')
  const commandArgs = extractXmlTag(raw, 'command-args')
  if (commandName) {
    return normalizeTitleWhitespace([commandName, commandArgs].filter(Boolean).join(' '))
  }

  const stripped = workflowStripped.replace(XML_TAG_BLOCK_PATTERN, ' ')
  return normalizeTitleWhitespace(stripped)
}

export function hasSessionTitleMarkup(raw: string): boolean {
  return /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/.test(raw)
}
