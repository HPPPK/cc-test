import { describe, expect, it } from 'vitest'

import css from './jiangxiaUi.css?raw'

describe('jiangxia UI polish stylesheet', () => {
  it('keeps the command deck shell and empty-state surfaces wired by stable classes', () => {
    expect(css).toContain('.jiangxia-ui-shell')
    expect(css).toContain('.jiangxia-empty-stage')
    expect(css).toContain('.jiangxia-empty-hero')
    expect(css).toContain('.jiangxia-empty-composer')
  })

  it('preserves reduced-motion behavior for decorative empty-state animation', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: none;')
  })
})
