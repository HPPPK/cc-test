import type { ReactNode } from 'react'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { unsupportedFeature } from '../../../utils/unsupportedFeature.js'

export function ReviewArtifactPermissionRequest(_props: PermissionRequestProps): ReactNode {
  return unsupportedFeature('private-tool-permission')
}
