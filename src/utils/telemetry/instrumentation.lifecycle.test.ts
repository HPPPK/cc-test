import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { logs } from '@opentelemetry/api-logs'
import { trace } from '@opentelemetry/api'
import { getEventLogger, getLoggerProvider, getMeterProvider, getTracerProvider, setEventLogger, setLoggerProvider, setMeterProvider, setTracerProvider } from '../../bootstrap/state.js'

// Keep identity/config/transport inputs hermetic. Exporter SDKs and providers remain real.
const auth = await import('../auth.js')
mock.module('../auth.js', () => ({ ...auth, getSubscriptionType: () => null, is1PApiCustomer: () => false, isClaudeAISubscriber: () => false, getOtelHeadersFromHelper: () => ({}) }))
const settings = await import('../settings/settings.js')
mock.module('../settings/settings.js', () => ({ ...settings, getSettings_DEPRECATED: () => ({}) }))
const proxy = await import('../proxy.js')
mock.module('../proxy.js', () => ({ ...proxy, getProxyUrl: () => undefined }))
const mtls = await import('../mtls.js')
mock.module('../mtls.js', () => ({ ...mtls, getMTLSConfig: () => undefined }))
const certs = await import('../caCerts.js')
mock.module('../caCerts.js', () => ({ ...certs, getCACertificates: () => undefined }))
const debug = await import('../debug.js')
const debugLines: string[] = []
mock.module('../debug.js', () => ({ ...debug, getHasFormattedOutput: () => false, logForDebugging: (line: string) => { debugLines.push(line) } }))
const cleanup = await import('../cleanupRegistry.js')
const cleanups: Array<() => Promise<void>> = []
mock.module('../cleanupRegistry.js', () => ({ ...cleanup, registerCleanup: (callback: () => Promise<void>) => { cleanups.push(callback); return () => {} } }))
const beta = await import('./betaSessionTracing.js')
let betaEnabled = false
mock.module('./betaSessionTracing.js', () => ({ ...beta, isBetaTracingEnabled: () => betaEnabled }))
const telemetry = await import('./instrumentation.js')

const envNames = ['USER_TYPE', 'CLAUDE_CODE_ENABLE_TELEMETRY', 'CLAUDE_CODE_PERFETTO_TRACE', 'OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_TRACES_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL', 'OTEL_EXPORTER_OTLP_LOGS_PROTOCOL', 'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE', 'BETA_TRACING_ENDPOINT'] as const
const savedEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]))
const savedMacro = typeof MACRO === 'undefined' ? undefined : MACRO
const exitListeners = new Set(process.listeners('exit'))
const beforeExitListeners = new Set(process.listeners('beforeExit'))
function resetInputs() {
  for (const name of envNames) delete process.env[name]
  process.env.USER_TYPE = 'external'
  betaEnabled = false
  debugLines.length = 0
  Object.assign(globalThis, { MACRO: { VERSION: 'telemetry-contract-fixture' } })
}
afterEach(async () => {
  for (const callback of cleanups.splice(0)) await callback()
  setMeterProvider(null)
  setLoggerProvider(null)
  setTracerProvider(null)
  setEventLogger(null)
  logs.disable()
  trace.disable()
  for (const listener of process.listeners('exit')) if (!exitListeners.has(listener)) process.removeListener('exit', listener)
  for (const listener of process.listeners('beforeExit')) if (!beforeExitListeners.has(listener)) process.removeListener('beforeExit', listener)
  for (const name of envNames) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name] }
  if (savedMacro === undefined) Reflect.deleteProperty(globalThis, 'MACRO')
  else Object.assign(globalThis, { MACRO: savedMacro })
  mock.restore()
})

for (const signal of ['metrics', 'logs', 'trace'] as const) {
  for (const [protocol, suffix] of [['grpc', 'grpc'], ['http/json', 'http'], ['http/protobuf', 'proto']] as const) {
    test(`selected unavailable ${signal} ${protocol} transport fails explicitly at lazy import`, async () => {
      resetInputs()
      const envKey = signal === 'trace' ? 'OTEL_TRACES_EXPORTER' : signal === 'logs' ? 'OTEL_LOGS_EXPORTER' : 'OTEL_METRICS_EXPORTER'
      const packageName = `@opentelemetry/exporter-${signal === 'trace' ? 'trace' : signal}-otlp-${suffix}`
      expect(() => Bun.resolveSync(packageName, import.meta.dir)).toThrow()
      process.env[envKey] = 'otlp'
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol
      const factory = signal === 'trace' ? telemetry.getOtlpTraceExporters : signal === 'logs' ? telemetry.getOtlpLogExporters : telemetry.getOtlpReaders
      await expect(factory()).rejects.toThrow(`OPTIONAL_INTEGRATION_UNAVAILABLE: ${packageName}`)
    })
  }
}

test('unavailable prometheus selection fails without opening a listener', async () => {
  resetInputs()
  expect(() => Bun.resolveSync('@opentelemetry/exporter-prometheus', import.meta.dir)).toThrow()
  process.env.OTEL_METRICS_EXPORTER = 'prometheus'
  await expect(telemetry.getOtlpReaders()).rejects.toThrow('OPTIONAL_INTEGRATION_UNAVAILABLE: @opentelemetry/exporter-prometheus')
})

test('none initialization uses real providers without optional transports and cleans up', async () => {
  resetInputs()
  process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1'
  process.env.OTEL_METRICS_EXPORTER = process.env.OTEL_LOGS_EXPORTER = process.env.OTEL_TRACES_EXPORTER = 'none'
  const meter = await telemetry.initializeTelemetry()
  meter.createCounter('fixture.counter').add(1)
  expect(getMeterProvider()).not.toBeNull()
  expect(getLoggerProvider()).toBeNull()
  expect(cleanups).toHaveLength(1)
  await telemetry.flushTelemetry()
  expect(debugLines).toContain('Telemetry flushed successfully')
  const provider = getMeterProvider()
  if (!provider) throw new Error('Expected the real meter provider')
  const shutdown = spyOn(provider, 'shutdown')
  const cleanup = cleanups.shift()
  if (!cleanup) throw new Error('Expected a registered cleanup')
  await cleanup()
  expect(shutdown).toHaveBeenCalledTimes(1)
})

test('console initialization emits a real metric and log, flushes, and registers cleanup', async () => {
  resetInputs()
  process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1'
  process.env.OTEL_METRICS_EXPORTER = process.env.OTEL_LOGS_EXPORTER = 'console'
  process.env.OTEL_TRACES_EXPORTER = 'none'
  const output: unknown[] = []
  const consoleOutput = spyOn(console, 'dir').mockImplementation(value => { output.push(value) })
  const meter = await telemetry.initializeTelemetry()
  meter.createCounter('fixture.console.counter').add(3)
  getEventLogger()?.emit({ body: 'fixture console event' })
  await telemetry.flushTelemetry()
  expect(output.some(value => JSON.stringify(value).includes('fixture.console.counter'))).toBe(true)
  expect(output.some(value => JSON.stringify(value).includes('fixture console event'))).toBe(true)
  expect(cleanups).toHaveLength(1)
  const cleanup = cleanups.shift()
  if (!cleanup) throw new Error('Expected a registered cleanup')
  await cleanup()
  consoleOutput.mockRestore()
})

test('beta transport failure is reported while its real meter remains cleanly shut down', async () => {
  resetInputs()
  expect(() => Bun.resolveSync('@opentelemetry/exporter-trace-otlp-http', import.meta.dir)).toThrow()
  expect(() => Bun.resolveSync('@opentelemetry/exporter-logs-otlp-http', import.meta.dir)).toThrow()
  betaEnabled = true
  process.env.BETA_TRACING_ENDPOINT = 'http://127.0.0.1:1/fixture-unused'
  await telemetry.initializeTelemetry()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(debugLines.some(line => line.includes('Beta tracing init failed:') && line.includes('OPTIONAL_INTEGRATION_UNAVAILABLE'))).toBe(true)
  expect(getLoggerProvider()).toBeNull()
  expect(getTracerProvider()).toBeNull()
  expect(getMeterProvider()).not.toBeNull()
  expect(cleanups).toHaveLength(1)
})
