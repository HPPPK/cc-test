import type { ReactNode, RefAttributes } from 'react'
import type { DOMElement } from './dom.js'
import type { Styles, TextStyles } from './styles.js'
import type { EventHandlerProps } from './events/event-handlers.js'

type HostProps = RefAttributes<DOMElement> & EventHandlerProps & {
  children?: ReactNode
  style?: Styles
  textStyles?: TextStyles
  tabIndex?: number
  autoFocus?: boolean
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-root': HostProps
      'ink-box': HostProps
      'ink-text': HostProps
      'ink-virtual-text': HostProps
      'ink-link': HostProps & { href: string }
      'ink-progress': HostProps & { value?: number }
      'ink-raw-ansi': HostProps & { rawText: string; rawWidth: number; rawHeight: number }
    }
  }
}
