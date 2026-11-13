import type { Message } from '../../types/message.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'
import type { TranscriptShareResponse } from './TranscriptSharePrompt.js'

type DisabledFrustrationDetection = {
  state: 'closed'
  handleTranscriptSelect: (response: TranscriptShareResponse) => void
}

/** Internal survey detection is unavailable; external callers retain their disabled UI guard. */
export function useFrustrationDetection(
  _messages: readonly Message[],
  _isLoading: boolean,
  _hasActivePrompt: boolean,
  _surveyIsOpen: boolean,
): DisabledFrustrationDetection {
  return unsupportedFeature('frustration-detection')
}
