import { useEffect } from 'react'
import { useUpdateStore } from '../../stores/updateStore'

export function UpdateChecker() {
  const initialize = useUpdateStore((s) => s.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return null
}
