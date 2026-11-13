import 'react/compiler-runtime'

/**
 * The installed React 19 runtime exports c, but @types/react intentionally hides it.
 * This is ONLY the compiler-owned heterogeneous memo slot API, not an application
 * message/tool payload. Its dynamic slots match React's actual MemoCache contract:
 * https://github.com/facebook/react/blob/v19.2.4/packages/react-reconciler/src/ReactInternalTypes.js#L77-L80
 */
declare module 'react/compiler-runtime' {
  // React's compiler controls the type and index of each heterogeneous cache slot.
  export function c(size: number): any[]
}
