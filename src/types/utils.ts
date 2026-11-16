/** Immutable snapshots preserve callable values and recursively protect collections. */
export type DeepImmutable<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>> :
  T extends ReadonlySet<infer V> ? ReadonlySet<DeepImmutable<V>> :
  T extends object ? { readonly [K in keyof T]: DeepImmutable<T[K]> } : T

/** Every member of a finite union appears exactly once, in any order. */
export type Permutations<T, Remaining = T> = [T] extends [never]
  ? []
  : T extends Remaining ? [T, ...Permutations<Exclude<Remaining, T>>] : never
