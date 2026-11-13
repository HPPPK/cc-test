/** Transcript queue audit events emitted by messageQueueManager. */
export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll'
export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  sessionId: string
  timestamp: string
  content?: string
}
