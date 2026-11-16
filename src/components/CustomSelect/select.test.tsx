import React from 'react'
import { expect, test } from 'bun:test'
import { Select, type SelectProps } from './select.js'

const numericProps: SelectProps<number> = {
  options: [{ label: 'Seven', value: 7 }, { label: 'Nine', value: 9 }],
}
const textProps: SelectProps<string> = { options: [{ label: 'Seven', value: 'seven' }] }
// A numeric selector must retain its value contract at consumer boundaries.
// @ts-expect-error A string option cannot be used for a numeric selector.
const invalidNumericProps: SelectProps<number> = textProps
void invalidNumericProps

test('numeric and text selectors preserve the supplied value types and callback values', () => {
  let selected = 0
  const numeric = <Select<number> {...numericProps} onChange={value => { selected = value }} />
  const text = <Select<string> {...textProps} />
  numeric.props.onChange(9)
  expect(selected).toBe(9)
  expect(numeric.props.options[0].value).toBe(7)
  expect(text.props.options[0].value).toBe('seven')
})
