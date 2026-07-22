Var WorkflowPackFindHandle
Var WorkflowPackFile
Var WorkflowPackSource
Var WorkflowPackTarget

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping running Claude Code Jiangxia sidecars..."
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar-x86_64-pc-windows-msvc.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar-aarch64-pc-windows-msvc.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar.exe'
  Pop $0
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping running Claude Code Jiangxia processes..."
  nsExec::ExecToLog 'taskkill /F /T /IM cc-jiangxia-desktop.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-code-desktop.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar-x86_64-pc-windows-msvc.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar-aarch64-pc-windows-msvc.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM claude-sidecar.exe'
  Pop $0
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Workflow ZIPs are installer payload, not application state. Install them
  ; into the runtime's canonical user store and preserve any existing user edit.
  StrCpy $WorkflowPackSource "$INSTDIR\resources\binaries\packs"
  IfFileExists "$WorkflowPackSource\*.zip" workflow_packs_found workflow_packs_done

workflow_packs_found:
  StrCpy $WorkflowPackTarget "$PROFILE\.claude\cc-jiangxia\workflows\packs"
  CreateDirectory "$WorkflowPackTarget"
  FindFirst $WorkflowPackFindHandle $WorkflowPackFile "$WorkflowPackSource\*.zip"

workflow_packs_copy_loop:
  StrCmp $WorkflowPackFile "" workflow_packs_close
  IfFileExists "$WorkflowPackTarget\$WorkflowPackFile" workflow_packs_next
  DetailPrint "Installing default workflow: $WorkflowPackFile"
  CopyFiles /SILENT "$WorkflowPackSource\$WorkflowPackFile" "$WorkflowPackTarget"

workflow_packs_next:
  FindNext $WorkflowPackFindHandle $WorkflowPackFile
  Goto workflow_packs_copy_loop

workflow_packs_close:
  FindClose $WorkflowPackFindHandle
  RMDir /r "$WorkflowPackSource"

workflow_packs_done:
!macroend
