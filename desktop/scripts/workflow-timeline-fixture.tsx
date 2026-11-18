// Entrypoint used only by the isolated browser smoke build.
import { createRoot } from 'react-dom/client'
import { WorkflowTimeline } from '../src/components/workflow/WorkflowTimeline'
import '../src/theme/globals.css'

createRoot(document.getElementById('timeline-root')!).render(
  <WorkflowTimeline sessionId="smoke-session" chatState="tool_executing" />,
)
