import type { DeepImmutable } from './utils.js'
const snapshot: DeepImmutable<{ nested: { items: string[] }; callback: (value: string) => number; lookup: Map<string, { count: number }> }> = { nested: { items: ['one'] }, callback: value => value.length, lookup: new Map() }
const result: number = snapshot.callback('x')
// @ts-expect-error snapshots cannot mutate nested collections
snapshot.nested.items.push('two')
// @ts-expect-error snapshots cannot mutate nested objects
snapshot.nested.items = []
// @ts-expect-error snapshots cannot mutate maps
snapshot.lookup.set('x', { count: result })
void result

import type { Permutations } from './utils.js'
const ordered: Permutations<'read' | 'write'> = ['read', 'write']
const reordered: Permutations<'read' | 'write'> = ['write', 'read']
// @ts-expect-error every union member must appear
const omitted: Permutations<'read' | 'write'> = ['read']
// @ts-expect-error repeated members are not a permutation
const duplicate: Permutations<'read' | 'write'> = ['read', 'read']
// @ts-expect-error foreign members are not a permutation
const foreign: Permutations<'read' | 'write'> = ['read', 'other']
void [ordered, reordered, omitted, duplicate, foreign]
