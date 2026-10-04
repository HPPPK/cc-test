import { describe, expect, test } from 'bun:test'
import { validateUiuxImageReview, UIUX_REVIEW_EXAMPLE, UIUX_IMAGE_REVIEW_METHODS } from './uiuxImageContract.js'
const receipt = (v: unknown) => '<generated-image-review-receipt>' + JSON.stringify(v) + '</generated-image-review-receipt>'
import fixture from './fixtures/uiux-image-review.json'
const valid = () => ({ ...structuredClone(fixture), remainingIssues: [] as string[] })
describe('UIUX image review structure', () => {
  test('accepts a specific latest-image receipt, not keyword-only prose', () => {
    const r = valid()
    expect(validateUiuxImageReview(receipt(UIUX_REVIEW_EXAMPLE), UIUX_REVIEW_EXAMPLE.imagePath).valid).toBe(false)
    expect(validateUiuxImageReview(receipt(r), r.imagePath).valid).toBe(true)
    expect(validateUiuxImageReview('<generated-image-review-receipt>' + UIUX_IMAGE_REVIEW_METHODS.join(';') + ' visual-register removed source-fidelity duplicate scan image_generation</generated-image-review-receipt>', r.imagePath).valid).toBe(false)
  })
  test('requires exact latest path, two distinct observations, all fact categories and method evidence', () => {
    for (const mutate of [
      (r: any) => r.imagePath += '.old',
      (r: any) => r.observations.pop(),
      (r: any) => r.observations[1] = r.observations[0],
      (r: any) => r.facts.pop(),
      (r: any) => r.methods[0].evidence = '',
      (r: any) => r.duplicates.observations = [],
    ]) { const r = valid(); mutate(r); expect(validateUiuxImageReview(receipt(r), fixture.imagePath).valid).toBe(false) }
  })
  test('accepts honest NEEDS_WORK, rejects PASS over known defects and does not require a fake revision', () => {
    const r = valid(); r.facts[0].status = 'mismatch'; r.facts[0].observed = 'Brand differs from source'
    expect(validateUiuxImageReview(receipt(r), r.imagePath).valid).toBe(false)
    r.status = 'NEEDS_WORK'; r.remainingIssues = ['Brand label differs from source; not accepted as faithful']
    expect(validateUiuxImageReview(receipt(r), r.imagePath)).toMatchObject({ valid: true, status: 'NEEDS_WORK' })
  })
  test('normalizes Windows paths only and rejects malformed or missing receipt', () => {
    const r = valid(); r.imagePath = 'C:\\UI\\Final.webp'
    expect(validateUiuxImageReview(receipt(r), 'c:/ui/final.webp').valid).toBe(true)
    for (const s of ['', '<generated-image-review-receipt>{bad}</generated-image-review-receipt>']) expect(validateUiuxImageReview(s, r.imagePath).valid).toBe(false)
  })
})
