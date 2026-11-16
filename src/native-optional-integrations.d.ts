/** Private optional binaries are absent from this checkout. Consumers validate exports before use. */
declare module 'audio-capture-napi' {
  export function isNativeAudioAvailable(): boolean
  export function isNativeRecordingActive(): boolean
  export function startNativeRecording(onData: (data: import('node:buffer').Buffer) => void, onEnd: () => void): boolean
  export function stopNativeRecording(): void
}

declare module 'image-processor-napi' {
  export const sharp: import('./tools/FileReadTool/imageProcessor.js').SharpFunction | undefined
  const defaultProcessor: import('./tools/FileReadTool/imageProcessor.js').SharpFunction | undefined
  export default defaultProcessor
  export type NativeClipboardImage = {
    png: import('node:buffer').Buffer
    width: number
    height: number
    originalWidth: number
    originalHeight: number
  }
  export type NativeClipboardModule = {
    hasClipboardImage?: () => boolean
    readClipboardImage?: (maxWidth: number, maxHeight: number) => NativeClipboardImage | null
  }
  export function getNativeModule(): NativeClipboardModule | null
}

declare module 'url-handler-napi' {
  export function waitForUrlEvent(timeoutMs: number): string | null
}
