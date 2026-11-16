import { expect, test } from 'bun:test'
import { getVoiceDependencyStatus, loadOptionalAudioNapi } from './voice.js'

test('missing and malformed native audio modules remain unavailable without recording', async () => {
  expect(await loadOptionalAudioNapi(async () => { throw new Error('missing module') })).toBeNull()
  expect(await loadOptionalAudioNapi(async () => ({ isNativeAudioAvailable: () => true }))).toBeNull()
  expect(await loadOptionalAudioNapi(async () => ({ isNativeAudioAvailable: () => 'yes', isNativeRecordingActive: () => false, startNativeRecording: () => { throw new Error('must not record') }, stopNativeRecording() {} }))).toBeNull()
})
test('voice dependency fallback reports real command availability and no Windows recorder', () => {
  expect(getVoiceDependencyStatus(false, 'linux', command => command === 'arecord', () => null)).toEqual({ available: true, missing: [], installCommand: null })
  expect(getVoiceDependencyStatus(false, 'darwin', command => command === 'rec', () => null)).toEqual({ available: true, missing: [], installCommand: null })
  expect(getVoiceDependencyStatus(false, 'win32', () => true, () => null)).toEqual({ available: false, missing: ['Voice mode requires the native audio module (not loaded)'], installCommand: null })
  expect(getVoiceDependencyStatus(false, 'linux', () => false, () => null)).toEqual({ available: false, missing: ['sox (rec command)'], installCommand: null })
})
