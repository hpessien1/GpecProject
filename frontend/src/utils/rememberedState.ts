import { useCallback, useState } from 'react'

// Where staff were in an admin list (page, filter, search), so opening an order and coming back
// returns to the same place. Kept in memory only: a reload starts afresh, and so does logging in.
const remembered = new Map<string, unknown>()

export function useRememberedState<Value>(key: string, initial: Value) {
  // Only this hook writes under `key`, always a Value.
  const [value, setValue] = useState<Value>(() => (remembered.has(key) ? remembered.get(key) as Value : initial))
  const update = useCallback((next: Value) => {
    remembered.set(key, next)
    setValue(next)
  }, [key])
  return [value, update] as const
}

export function forgetRememberedState() {
  remembered.clear()
}
