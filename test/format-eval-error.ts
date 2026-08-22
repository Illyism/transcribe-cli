export function formatEvalError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err

  const errorObj = err as any
  const status = errorObj.status || errorObj.statusCode || errorObj.response?.status
  const provider = errorObj.error?.provider || errorObj.provider
  const message =
    errorObj.error?.message ||
    errorObj.response?.data?.error?.message ||
    errorObj.message ||
    String(err)

  const parts: string[] = []
  if (status) parts.push(`HTTP ${status}`)
  if (provider) parts.push(`Provider: ${provider}`)
  parts.push(message)

  return parts.join(' - ')
}
