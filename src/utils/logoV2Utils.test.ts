import { expect, test } from 'bun:test'
import { truncatePath } from './logoV2Utils.js'
import { stringWidth } from '../ink/stringWidth.js'

test('shortened workspace paths retain the project basename within terminal width', () => {
  const path = '/Users/alice/projects/very-long-parent/deep/项目'
  const shortened = truncatePath(path, 28)
  expect(shortened).toEndWith('/项目')
  expect(shortened).toContain('…')
  expect(stringWidth(shortened)).toBeLessThanOrEqual(28)
  expect(truncatePath('project/src', 30)).toBe('project/src')
})
