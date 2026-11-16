import type { ReactNode } from 'react'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { unsupportedFeature } from '../../../utils/unsupportedFeature.js'

export function MonitorPermissionRequest(_props: PermissionRequestProps): ReactNode {
  return unsupportedFeature('private-tool-permission')
}
