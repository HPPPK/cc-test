import { c } from 'react/compiler-runtime'
// Compiler-owned slots are heterogeneous; the runtime still requires a numeric size.
const slots = c(2)
slots[0] = 'memo dependency'
slots[1] = { render: 'memo result' }
// @ts-expect-error the compiler cache size is not a string
c('two')
