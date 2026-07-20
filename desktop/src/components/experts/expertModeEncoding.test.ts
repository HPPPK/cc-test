import { describe, expect, it } from 'vitest'

import expertsApiSource from '../../api/experts.ts?raw'
import expertStoreSource from '../../stores/expertStore.ts?raw'
import sessionTypesSource from '../../types/session.ts?raw'
import chatInputSource from '../chat/ChatInput.tsx?raw'
import workflowStartDialogSource from '../workflow/WorkflowStartDialog.tsx?raw'
import activeSessionSource from '../../pages/ActiveSession.tsx?raw'
import chatInputTestSource from '../chat/ChatInput.test.tsx?raw'
import expertSelectionDialogSource from './ExpertSelectionDialog.tsx?raw'

const expertModeSources = {
  'src/api/experts.ts': expertsApiSource,
  'src/stores/expertStore.ts': expertStoreSource,
  'src/types/session.ts': sessionTypesSource,
  'src/components/experts/ExpertSelectionDialog.tsx': expertSelectionDialogSource,
  'src/components/chat/ChatInput.tsx': chatInputSource,
  'src/pages/ActiveSession.tsx': activeSessionSource,
  'src/components/workflow/WorkflowStartDialog.tsx': workflowStartDialogSource,
  'src/components/chat/ChatInput.test.tsx': chatInputTestSource,
}

const mojibakePatterns = [
  /\?\?\?\?/,
  /�/,
  /涓撳/,
  /鎬庝箞/,
  /銆/,
  /锛/,
  /鈥/,
]

describe('expert Mode Chinese copy encoding', () => {
  it('keeps expert Mode UI and test copy as valid UTF-8 Chinese', () => {
    const failures: string[] = []

    for (const [file, text] of Object.entries(expertModeSources)) {
      for (const pattern of mojibakePatterns) {
        if (pattern.test(text)) failures.push(`${file} matches ${pattern}`)
      }
    }

    expect(failures).toEqual([])
    expect(expertSelectionDialogSource).toContain('专家')
  })
})
