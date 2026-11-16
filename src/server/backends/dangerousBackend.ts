import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export class DangerousBackend {
  constructor() { unsupportedFeature('legacy-direct-connect-backend') }
}
