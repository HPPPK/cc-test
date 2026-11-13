import { useLayoutEffect, useState, type HTMLAttributes, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/** Escape page stacking/transform contexts and center inside the usable content area. */
export function ContentOverlay({ children, className = '', style, ...props }: HTMLAttributes<HTMLDivElement>) {
  const [bounds, setBounds] = useState<CSSProperties>({ left: 0, top: 0, width: '100%', height: '100%' })

  useLayoutEffect(() => {
    const content = document.getElementById('content-area')
    const measure = () => {
      const rect = content?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setBounds({ left: 0, top: 0, width: '100%', height: '100%' })
        return
      }
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (content) observer?.observe(content)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return createPortal(
    <div {...props} data-content-overlay="true" className={`fixed flex items-center justify-center ${className}`} style={{ ...bounds, padding: 16, zIndex: 90, ...style }}>
      {children}
    </div>,
    document.body,
  )
}
