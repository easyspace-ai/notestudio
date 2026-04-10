/** Axios 失败时常为普通对象 `{ message?, error?, status? }`，与 `Error` 区分。 */
export function getApiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message.trim()) {
    return e.message
  }
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) {
      return o.message
    }
    const nested = o.error
    if (typeof nested === 'string' && nested.trim()) {
      return nested
    }
    if (nested && typeof nested === 'object' && 'message' in nested) {
      const m = (nested as { message?: unknown }).message
      if (typeof m === 'string' && m.trim()) {
        return m
      }
    }
  }
  return fallback
}
