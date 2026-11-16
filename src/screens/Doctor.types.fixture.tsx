import type { ComponentProps } from 'react'
import { Doctor } from './Doctor.js'
type DoctorProps = ComponentProps<typeof Doctor>
const props: DoctorProps = { onDone: () => {} }
// @ts-expect-error the completion callback is required by the diagnostic screen
const missing: DoctorProps = {}
// @ts-expect-error diagnostic completion receives text, not numeric codes
const invalid: DoctorProps = { onDone: (_result: number) => {} }
void [props, missing, invalid]
