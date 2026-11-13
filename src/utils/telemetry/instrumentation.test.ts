import { afterEach, expect, test } from 'bun:test'
import { getOtlpReaders, getOtlpLogExporters, getOtlpTraceExporters, loadOptionalTelemetryModule } from './instrumentation.js'
const names = ['OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_TRACES_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL'] as const
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
afterEach(() => { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name] } })
test('none exporter selections keep every optional package unloaded', async () => {
  for (const name of names.slice(0, 3)) process.env[name] = 'none'
  expect(await getOtlpReaders()).toEqual([])
  expect(await getOtlpLogExporters()).toEqual([])
  expect(await getOtlpTraceExporters()).toEqual([])
})
test('selected unavailable OTLP exporter fails with its package name', async () => {
  await expect(loadOptionalTelemetryModule('@opentelemetry/exporter-metrics-otlp-http', async () => { throw new Error('fixture module unavailable') })).rejects.toThrow('OPTIONAL_INTEGRATION_UNAVAILABLE: @opentelemetry/exporter-metrics-otlp-http')
})

test('console factories supply the installed v2 provider constructors without optional transports', async () => {
  const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics')
  const { LoggerProvider, BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs')
  const { BasicTracerProvider, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base')
  for (const name of names.slice(0, 3)) process.env[name] = 'console'
  const readers = await getOtlpReaders()
  const logExporters = await getOtlpLogExporters()
  const traceExporters = await getOtlpTraceExporters()
  expect(readers).toHaveLength(1)
  expect(readers[0]).toBeInstanceOf(PeriodicExportingMetricReader)
  const meterProvider = new MeterProvider({ readers })
  const loggerProvider = new LoggerProvider({ processors: logExporters.map(exporter => new BatchLogRecordProcessor(exporter)) })
  const tracerProvider = new BasicTracerProvider({ spanProcessors: traceExporters.map(exporter => new BatchSpanProcessor(exporter)) })
  await Promise.all([meterProvider.shutdown(), loggerProvider.shutdown(), tracerProvider.shutdown()])
})
