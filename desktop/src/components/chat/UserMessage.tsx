import { CornerDownRight } from 'lucide-react'
import type { UIAttachment } from '../../types/chat'
import { AttachmentGallery } from './AttachmentGallery'
import { findLeadingSlashInvocation } from './composerUtils'
import { MessageActionBar } from './MessageActionBar'

type Props = {
  content: string
  attachments?: UIAttachment[]
  queued?: boolean
  onGuideQueued?: () => void
}

function renderMessageContent(content: string) {
  const invocation = findLeadingSlashInvocation(content)
  if (!invocation) return content

  return (
    <>
      <span
        data-testid="user-message-skill-invocation"
        className="mr-1 inline-flex max-w-full align-baseline rounded-[6px] border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold leading-none text-[var(--color-brand)]"
        title="Skill invocation"
      >
        {invocation.token}
      </span>
      {invocation.rest}
    </>
  )
}

export function UserMessage({ content, attachments, queued = false, onGuideQueued }: Props) {
  const hasText = content.trim().length > 0

  return (
    <div className="group mb-5 flex justify-end">
      <div
        data-message-shell="user"
        className="flex min-w-0 w-full max-w-[82%] flex-col items-end gap-2 sm:max-w-[78%] lg:max-w-[72%]"
      >
        {attachments && attachments.length > 0 && (
          <AttachmentGallery attachments={attachments} variant="message" />
        )}

        {hasText && (
          <div
            className="min-w-0 max-w-full bg-[var(--color-surface-user-msg)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words"
            style={{
              borderRadius: '18px 4px 18px 18px',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {renderMessageContent(content)}
          </div>
        )}

        {queued && (
          <div className="flex max-w-full items-center gap-2 text-[11px] font-medium text-[var(--color-text-tertiary)]">
            <span>Queued</span>
            {onGuideQueued && (
              <button
                type="button"
                aria-label="Guide queued message"
                title="Guide queued message"
                onClick={onGuideQueued}
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface-container-low)] px-2.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/35 hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
              >
                <CornerDownRight size={13} aria-hidden="true" />
                <span>Guide</span>
              </button>
            )}
          </div>
        )}

        {hasText && (
          <MessageActionBar
            copyText={content}
            copyLabel="Copy prompt"
            align="end"
          />
        )}
      </div>
    </div>
  )
}
