function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(String(key)) ?? null
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key) {
      values.delete(String(key))
    },
    setItem(key, value) {
      values.set(String(key), String(value))
    },
  }
}

const storage = createMemoryStorage()

// Node 22 can expose an unavailable process-level localStorage while Vitest's
// jsdom worker has no usable Storage instance. Keep browser-storage tests
// deterministic without changing production storage behavior.
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: storage,
})
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
})
