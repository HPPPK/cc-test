import type { ReactNode } from 'react'
import type { PermissionRequestProps } from '../../components/permissions/PermissionRequest.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function WorkflowPermissionRequest(_props: PermissionRequestProps): ReactNode {
  return unsupportedFeature('workflow-permission')
}
