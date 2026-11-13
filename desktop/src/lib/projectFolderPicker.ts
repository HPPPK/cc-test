// macOS file panels run in a separate system process: a panel-service failure
// must never unwind through the application's Rust/Objective-C event loop.
export async function pickProjectFolder(title: string): Promise<string | null> {
  if (/mac/i.test(navigator.platform || navigator.userAgent)) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string | null>('pick_project_folder', { title })
  }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title })
  return typeof selected === 'string' ? selected : null
}
